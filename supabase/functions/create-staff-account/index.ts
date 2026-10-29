// Doctor-owned clinic staff RBAC — staff creation.
//
// Staff are provisioned as real Supabase Auth users and sign in from the main
// login page with phone + OTP, exactly like doctors: the auth user gets a
// confirmed `phone`, so signInWithOtp/verifyOtp (MSG91 via send-sms-hook)
// works unchanged. A synthetic, never-displayed email and a random, never-
// disclosed password are minted because auth.users still wants an identity
// and nobody logs in with a password. handle_new_user() (see the
// staff_management_core migration) is taught to skip the normal doctor
// bootstrap (no profiles row, no 'doctor' role) whenever
// raw_user_meta_data.account_type === 'staff'.
//
// Callable by the owning doctor OR by another staff member who was
// themselves granted "Create Staff" (staff.create) — never by anyone else,
// and a staff caller can only ever create staff under their OWN doctor.
import { createClient } from "npm:@supabase/supabase-js@2";
import { beginStaffRequest, json, normalizeStaffPhone, sanitizePermissions } from "../_shared/staffPermissions.ts";

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

  // Determine the doctor tenant this call is allowed to act on behalf of.
  let doctorId: string | null = null;
  const { data: callerProfile } = await admin.from("profiles").select("id").eq("id", callerId).maybeSingle();
  if (callerProfile) {
    doctorId = callerProfile.id;
  } else {
    const { data: callerStaff } = await admin.from("staff_members").select("doctor_id, status, permissions").eq("id", callerId).maybeSingle();
    if (callerStaff && callerStaff.status === "active" && (callerStaff.permissions as Record<string, boolean>)?.["staff.create"] === true) {
      doctorId = callerStaff.doctor_id;
    }
  }
  if (!doctorId) return json(403, { error: "Not authorized to create staff accounts" });

  // Staff management is a plan feature; the page hides it, so the server must too.
  const { data: hasStaffFeature } = await admin.rpc("doctor_has_feature", { _doctor_id: doctorId, _feature_key: "staff_management" });
  if (!hasStaffFeature) return json(403, { error: "Staff management is not included in this plan" });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Bad request" });
  }
  const staff_name = String(body?.staff_name || "").trim();
  const phone = normalizeStaffPhone(body?.phone);
  const status = body?.status === "inactive" ? "inactive" : "active";
  const permissions = sanitizePermissions(body?.permissions);

  if (!staff_name) return json(400, { error: "Staff name is required" });
  if (!phone) return json(400, { error: "Enter a valid phone number, e.g. +919876543210" });
  // staff_members.username is still NOT NULL + unique; it is no longer a login
  // credential, so derive a stable one from the (unique) phone.
  const username = `staff_${phone.slice(1)}`;

  // Fail fast on a duplicate phone before touching auth.users at all (the DB
  // unique index and GoTrue's own phone uniqueness remain the authoritative,
  // race-safe checks). GoTrue also rejects numbers already used by a doctor.
  const { data: dupe, error: dupeErr } = await admin
    .from("staff_members")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (dupeErr) {
    console.error("create-staff-account: phone lookup failed", { code: dupeErr.code, message: dupeErr.message });
    if (dupeErr.code === "42P01") return json(500, { error: "Staff Management hasn't finished setting up on the server yet. Please try again shortly, or contact support." });
    return json(500, { error: "Could not verify phone number availability. Please try again." });
  }
  if (dupe) return json(409, { error: PHONE_IN_USE });

  console.log("create-staff-account: creating auth user", { staff_name, status, permissionCount: Object.values(permissions).filter(Boolean).length });

  const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
    email: `staff-${crypto.randomUUID()}@staff.doctylia.internal`,
    password: `${crypto.randomUUID()}${crypto.randomUUID()}`,
    phone,
    phone_confirm: true,
    email_confirm: true,
    user_metadata: { account_type: "staff", full_name: staff_name },
  });
  if (createErr || !newUser?.user) {
    console.error("create-staff-account: auth.admin.createUser failed", { code: (createErr as { code?: string })?.code, status: (createErr as { status?: number })?.status, message: createErr?.message });
    if ((createErr as { code?: string })?.code === "phone_exists") return json(409, { error: PHONE_IN_USE });
    return json(400, { error: createErr?.message || "Could not create the staff login. Please try again." });
  }

  const { error: insertErr } = await admin.from("staff_members").insert({
    id: newUser.user.id,
    doctor_id: doctorId,
    staff_name,
    username,
    phone,
    status,
    permissions,
    created_by: callerId,
  });
  if (insertErr) {
    console.error("create-staff-account: staff_members insert failed", { code: insertErr.code, message: insertErr.message, details: insertErr.details, hint: insertErr.hint, doctorId, staffAuthId: newUser.user.id });
    await admin.auth.admin.deleteUser(newUser.user.id);
    if (insertErr.code === "23505") return json(409, { error: PHONE_IN_USE });
    if (insertErr.code === "23503") return json(400, { error: "Could not link this staff account to your doctor profile. Please refresh and try again." });
    if (insertErr.code === "23514" || insertErr.code === "22P02") return json(400, { error: "One of the submitted values isn't valid. Please check the form and try again." });
    if (insertErr.code === "42P01") return json(500, { error: "Staff Management hasn't finished setting up on the server yet. Please try again shortly, or contact support." });
    return json(500, { error: `Could not save the staff account (${insertErr.code || "unknown error"}). Please try again or contact support.` });
  }

  console.log("create-staff-account: success", { staffId: newUser.user.id, doctorId });
  return json(200, { ok: true, staff: { id: newUser.user.id, staff_name, phone, status, permissions } });
});
