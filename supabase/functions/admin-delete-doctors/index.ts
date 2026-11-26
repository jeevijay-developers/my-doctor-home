// Super Admin-only: permanently delete one or more doctor accounts.
//
// This is NOT `delete-doctor-account`, which is a doctor deleting their OWN
// account after a phone-OTP check. Both used to share that name; when the OTP
// flow replaced the superadmin one, the superadmin "Delete Selected" button
// started getting "Deletion was not confirmed." on every call. They are separate
// functions so neither can break the other again.
//
// profiles.id is 1:1 with auth.users.id, and nearly every doctor-owned table
// (patients, appointments, staff_members, invoices, payments, payouts,
// services, reviews, support_tickets, etc.) has doctor_id REFERENCES
// profiles(id) ON DELETE CASCADE, so deleting the auth user cascades almost
// everything. The one known exception: prescriptions.doctor_id has no
// foreign key at all, so it's cleaned up explicitly afterward. Deleting the
// auth user first means a doctor is always fully gone even if that cleanup
// step has a hiccup, rather than wiping prescriptions while leaving the
// account intact.
//
// Accepts a batch (doctor_ids: string[]) since the Super Admin UI is a
// bulk-select-and-delete flow. Each id is processed independently so one
// failure doesn't abort the rest; the response reports exactly which ids
// succeeded and which failed (and why).
//
// "Database error loading user": some accounts (this project's E2E/test-seeded
// doctors) fail admin.auth.admin.deleteUser() with this GoTrue error. When that
// happens we fall back to admin_delete_auth_user(), a SECURITY DEFINER SQL
// function reachable only by the service_role, which deletes the auth.users row
// directly through the same ON DELETE CASCADE chain.
import { createClient } from "npm:@supabase/supabase-js@2";
import { bindCorsRequest, corsHeaders, handleCors, type CorsOptions } from "../_shared/cors.ts";
import { hasSuperadminPermission } from "../_shared/superadminPermissions.ts";

const CORS: CorsOptions = {
  allowHeaders: "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const BUCKETS = ["doctor-uploads", "patient-documents"] as const;
const MAX_BATCH = 200;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// deno-lint-ignore no-explicit-any
async function removeFolder(client: any, bucket: string, prefix: string): Promise<void> {
  const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return;
  const files: string[] = [];
  for (const item of data) {
    // Folders come back without an id; recurse into them.
    if (item.id) files.push(`${prefix}/${item.name}`);
    else await removeFolder(client, bucket, `${prefix}/${item.name}`);
  }
  if (files.length) await client.storage.from(bucket).remove(files);
}

Deno.serve(async (req) => {
  bindCorsRequest(req, CORS);
  const preflight = handleCors(req, CORS);
  if (preflight) return preflight;
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Missing authorization" });
  const scoped = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: claims } = await scoped.auth.getClaims(authHeader.slice(7));
  const callerId = claims?.claims?.sub as string | undefined;
  if (!callerId) return json(401, { error: "Invalid token" });
  const allowed = await hasSuperadminPermission(admin, callerId, "doctors.delete");
  if (!allowed) return json(403, { error: "Admin only" });

  let doctor_ids: unknown;
  try {
    ({ doctor_ids } = await req.json());
  } catch {
    return json(400, { error: "Bad request" });
  }
  if (!Array.isArray(doctor_ids) || doctor_ids.length === 0 || !doctor_ids.every((id) => typeof id === "string")) {
    return json(400, { error: "doctor_ids must be a non-empty array of strings" });
  }
  if (doctor_ids.length > MAX_BATCH) {
    return json(400, { error: `Select at most ${MAX_BATCH} doctors at a time` });
  }

  const deleted: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const doctorId of [...new Set(doctor_ids as string[])]) {
    // Never delete the caller, an owner (admin role) or a superadmin-team member through
    // this endpoint: bootstrap-admin gives the owner a profiles row, so "has a profile"
    // alone would let a doctors.delete delegate wipe the platform owner.
    if (doctorId === callerId) {
      failed.push({ id: doctorId, error: "You cannot delete your own account" });
      continue;
    }
    const { data: targetIsAdmin, error: roleErr } = await admin.rpc("has_role", { _user_id: doctorId, _role: "admin" });
    if (roleErr || (targetIsAdmin !== false && targetIsAdmin != null)) {
      failed.push({ id: doctorId, error: "Owner/admin accounts cannot be deleted here" });
      continue;
    }
    const { data: teamRow, error: teamErr } = await admin.from("superadmin_team_members").select("id").eq("id", doctorId).maybeSingle();
    if (teamErr || teamRow) {
      failed.push({ id: doctorId, error: "Superadmin team accounts cannot be deleted here" });
      continue;
    }

    const { data: target } = await admin.from("profiles").select("id").eq("id", doctorId).maybeSingle();
    if (!target) {
      failed.push({ id: doctorId, error: "Doctor not found" });
      continue;
    }

    // Read the clinic's staff logins first: deleting the doctor cascades their
    // staff_members rows, after which the auth users would be orphaned.
    const { data: staffRows } = await admin.from("staff_members").select("id").eq("doctor_id", doctorId);

    // Storage objects have no FK, so they are removed explicitly (best effort).
    for (const bucket of BUCKETS) {
      try {
        await removeFolder(admin, bucket, doctorId);
      } catch (err) {
        console.error("admin-delete-doctors: storage cleanup failed", { doctorId, bucket, message: err instanceof Error ? err.message : err });
      }
    }

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(doctorId);
    if (deleteUserError) {
      console.error("admin-delete-doctors: auth.deleteUser failed, trying SQL fallback", { doctorId, message: deleteUserError.message });
      const { error: fallbackError } = await admin.rpc("admin_delete_auth_user", { _user_id: doctorId });
      if (fallbackError) {
        console.error("admin-delete-doctors: SQL fallback also failed", { doctorId, message: fallbackError.message });
        failed.push({ id: doctorId, error: `${deleteUserError.message}; fallback also failed: ${fallbackError.message}` });
        continue;
      }
      console.log("admin-delete-doctors: SQL fallback succeeded", { doctorId });
    }

    // Account is already gone (the important part); log and continue on cleanup hiccups.
    const { error: prescriptionsError } = await admin.from("prescriptions").delete().eq("doctor_id", doctorId);
    if (prescriptionsError) {
      console.error("admin-delete-doctors: prescriptions cleanup failed", { doctorId, message: prescriptionsError.message });
    }
    for (const row of staffRows ?? []) {
      const { error } = await admin.auth.admin.deleteUser(row.id);
      if (error) console.error("admin-delete-doctors: staff login cleanup failed", { doctorId, staffId: row.id, message: error.message });
    }

    deleted.push(doctorId);
  }

  return json(200, { ok: true, deleted, failed });
});
