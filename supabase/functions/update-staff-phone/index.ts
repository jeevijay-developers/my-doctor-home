// Doctor-owned clinic staff RBAC — change a staff member's login phone.
// The phone is the staff member's login identity (phone + OTP), so it lives in
// auth.users.phone, which only the service-role admin API can change — hence a
// dedicated function rather than a direct staff_members update. Authorization
// mirrors the old reset-staff-password: the owning doctor, or a staff member of
// the same doctor holding staff.edit (never themselves).
import { createClient } from "npm:@supabase/supabase-js@2";
import { beginStaffRequest, json, normalizeStaffPhone } from "../_shared/staffPermissions.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const PHONE_IN_USE = "This phone number is already registered on Doctylia. Use a different number.";

Deno.serve(async (req) => {
  const preflight = beginStaffRequest(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Missing authorization" });
  const scoped = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: claims } = await scoped.auth.getClaims(authHeader.slice(7));
  const callerId = claims?.claims?.sub as string | undefined;
  if (!callerId) return json(401, { error: "Invalid token" });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Bad request" });
  }
  const staffId = String(body?.staff_id || "");
  const phone = normalizeStaffPhone(body?.phone);
  if (!staffId) return json(400, { error: "staff_id is required" });
  if (!phone) return json(400, { error: "Enter a valid phone number, e.g. +919876543210" });
  if (staffId === callerId) return json(403, { error: "Staff cannot change their own phone number" });

  const { data: target } = await admin.from("staff_members").select("id, doctor_id, phone").eq("id", staffId).maybeSingle();
  if (!target) return json(404, { error: "Staff account not found" });

  const { data: callerProfile } = await admin.from("profiles").select("id").eq("id", callerId).maybeSingle();
  let authorized = false;
  if (callerProfile && callerProfile.id === target.doctor_id) {
    authorized = true;
  } else {
    const { data: callerStaff } = await admin.from("staff_members").select("doctor_id, status, permissions").eq("id", callerId).maybeSingle();
    if (
      callerStaff && callerStaff.status === "active" &&
      callerStaff.doctor_id === target.doctor_id &&
      (callerStaff.permissions as Record<string, boolean>)?.["staff.edit"] === true
    ) {
      authorized = true;
    }
  }
  if (!authorized) return json(403, { error: "Not authorized to change this staff member's phone number" });

  if (target.phone === phone) return json(200, { ok: true });

  const { data: dupe } = await admin.from("staff_members").select("id").eq("phone", phone).neq("id", staffId).maybeSingle();
  if (dupe) return json(409, { error: PHONE_IN_USE });

  const { error } = await admin.auth.admin.updateUserById(staffId, { phone, phone_confirm: true });
  if (error) {
    console.error("update-staff-phone: updateUserById failed", { code: (error as { code?: string }).code, message: error.message });
    if ((error as { code?: string }).code === "phone_exists") return json(409, { error: PHONE_IN_USE });
    return json(400, { error: "Could not change phone number" });
  }

  const { error: rowErr } = await admin.from("staff_members").update({ phone }).eq("id", staffId);
  if (rowErr) {
    // Roll the auth user back so auth.users.phone and staff_members.phone never diverge.
    await admin.auth.admin.updateUserById(staffId, { phone: target.phone, phone_confirm: true });
    console.error("update-staff-phone: staff_members update failed", { code: rowErr.code, message: rowErr.message });
    return json(500, { error: "Could not change phone number" });
  }

  // The old number's holder must not keep an active session.
  const { error: revokeErr } = await admin.rpc("revoke_user_sessions", { _user_id: staffId });
  if (revokeErr) console.error("update-staff-phone: revoke_user_sessions failed", { message: revokeErr.message });

  return json(200, { ok: true });
});
