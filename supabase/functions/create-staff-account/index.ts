// Doctor-owned clinic staff RBAC — staff creation.
//
// Staff are provisioned as real Supabase Auth users so their password is
// hashed and verified by Supabase's own auth stack, never by hand-rolled
// crypto here. Login is by username (never shown/known email), so we mint a
// synthetic, never-displayed email per account. handle_new_user() (see the
// staff_management_core migration) is taught to skip the normal doctor
// bootstrap (no profiles row, no 'doctor' role) whenever
// raw_user_meta_data.account_type === 'staff'.
//
// Callable by the owning doctor OR by another staff member who was
// themselves granted "Create Staff" (staff.create) — never by anyone else,
// and a staff caller can only ever create staff under their OWN doctor.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, sanitizePermissions } from "../_shared/staffPermissions.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,32}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Bad request" });
  }
  const staff_name = String(body?.staff_name || "").trim();
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");
  const status = body?.status === "inactive" ? "inactive" : "active";
  const permissions = sanitizePermissions(body?.permissions);

  if (!staff_name) return json(400, { error: "Staff name is required" });
  if (!USERNAME_REGEX.test(username)) return json(400, { error: "Username must be 3-32 characters (letters, numbers, dot, underscore, hyphen)" });
  if (password.length < 8) return json(400, { error: "Password must be at least 8 characters" });

  const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
    email: `staff-${crypto.randomUUID()}@staff.doctylia.internal`,
    password,
    email_confirm: true,
    user_metadata: { account_type: "staff", full_name: staff_name },
  });
  if (createErr || !newUser?.user) {
    return json(400, { error: createErr?.message || "Could not create staff account" });
  }

  const { error: insertErr } = await admin.from("staff_members").insert({
    id: newUser.user.id,
    doctor_id: doctorId,
    staff_name,
    username,
    status,
    permissions,
    created_by: callerId,
  });
  if (insertErr) {
    await admin.auth.admin.deleteUser(newUser.user.id);
    if (insertErr.code === "23505") return json(409, { error: "That username is already taken" });
    return json(400, { error: "Could not save staff account" });
  }

  return json(200, { ok: true, staff: { id: newUser.user.id, staff_name, username, status, permissions } });
});
