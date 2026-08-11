// Super Admin-only: permanently delete one or more doctor accounts.
// profiles.id is 1:1 with auth.users.id, and nearly every doctor-owned table
// (patients, appointments, staff_members, invoices, payments, payouts,
// services, reviews, support_tickets, etc.) has doctor_id REFERENCES
// profiles(id) ON DELETE CASCADE, so deleting the auth user cascades almost
// everything. The one known exception: prescriptions.doctor_id has no
// foreign key at all, so it's cleaned up explicitly afterward — deleting the
// auth user first means a doctor is always fully gone even if that cleanup
// step has a hiccup, rather than risking wiping their prescriptions while
// leaving the account and dashboard intact.
//
// Accepts a batch (doctor_ids: string[]) since the Super Admin UI is a
// bulk-select-and-delete flow, not one action per doctor. Each id is
// processed independently so one failure doesn't abort the rest of the
// batch — the response reports exactly which ids succeeded and which
// failed (and why) so the frontend can show an accurate summary.
//
// "Database error loading user": some accounts (confirmed: this project's
// E2E/test-seeded doctors) fail admin.auth.admin.deleteUser() with this
// GoTrue error because the Admin API's own internal read of auth.users
// (joined with auth.identities etc.) fails for that row — nothing in this
// project's RLS/triggers/grants causes it (verified: the only trigger on
// auth.users is AFTER INSERT, structurally incapable of firing on delete).
// When that happens we fall back to admin_delete_auth_user(), a
// SECURITY DEFINER SQL function (see its migration for the full writeup)
// that deletes the auth.users row directly — a real, complete deletion via
// the same ON DELETE CASCADE chain, not a suppressed error or fake success.
// That function is reachable only by the service_role, so this fallback
// never weakens the admin gate above.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/paymentMode.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Missing authorization" });
  const scoped = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: claims } = await scoped.auth.getClaims(authHeader.slice(7));
  const callerId = claims?.claims?.sub as string | undefined;
  if (!callerId) return json(401, { error: "Invalid token" });
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: callerId, _role: "admin" });
  if (!isAdmin) return json(403, { error: "Admin only" });

  let doctor_ids: unknown;
  let password: unknown;
  try {
    ({ doctor_ids, password } = await req.json());
  } catch {
    return json(400, { error: "Bad request" });
  }
  if (!Array.isArray(doctor_ids) || doctor_ids.length === 0 || !doctor_ids.every((id) => typeof id === "string")) {
    return json(400, { error: "doctor_ids must be a non-empty array of strings" });
  }
  if (typeof password !== "string" || password.length === 0) {
    return json(400, { error: "password is required" });
  }

  // Step-up re-authentication: checking the password only in the browser
  // dialog would be cosmetic, since this function is reachable directly
  // with just a valid session token (no password needed) — verifying here,
  // before any doctor data is read or touched, is what makes it a real
  // control. One check covers the whole batch, not one per doctor.
  const callerEmail = claims?.claims?.email as string | undefined;
  if (!callerEmail) return json(401, { error: "Invalid token" });
  const { error: passwordError } = await scoped.auth.signInWithPassword({ email: callerEmail, password });
  if (passwordError) return json(401, { error: "Incorrect password" });

  const deleted: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const doctorId of doctor_ids as string[]) {
    const { data: target } = await admin.from("profiles").select("id").eq("id", doctorId).maybeSingle();
    if (!target) {
      failed.push({ id: doctorId, error: "Doctor not found" });
      continue;
    }

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(doctorId);
    if (deleteUserError) {
      console.error("delete-doctor-account: auth.deleteUser failed, trying SQL fallback", { doctorId, message: deleteUserError.message });
      const { error: fallbackError } = await admin.rpc("admin_delete_auth_user", { _user_id: doctorId });
      if (fallbackError) {
        console.error("delete-doctor-account: SQL fallback also failed", { doctorId, message: fallbackError.message });
        failed.push({ id: doctorId, error: `${deleteUserError.message}; fallback also failed: ${fallbackError.message}` });
        continue;
      }
      console.log("delete-doctor-account: SQL fallback succeeded", { doctorId });
    }

    const { error: prescriptionsError } = await admin.from("prescriptions").delete().eq("doctor_id", doctorId);
    if (prescriptionsError) {
      // Account is already gone (the important part); log and continue
      // rather than reporting failure for a step that's just cleaning up
      // leftovers on an account that's otherwise fully deleted.
      console.error("delete-doctor-account: prescriptions cleanup failed", { doctorId, message: prescriptionsError.message });
    }

    deleted.push(doctorId);
  }

  return json(200, { ok: true, deleted, failed });
});
