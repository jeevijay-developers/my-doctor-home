// Doctor-owned clinic staff RBAC — reset a staff member's password.
// Changing another user's Supabase Auth password requires the service-role
// admin API, which isn't reachable from the browser client — hence a
// dedicated function rather than a direct table update (staff_members
// itself is edited directly from the client under RLS; only auth.users
// password changes need this).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/staffPermissions.ts";

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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Bad request" });
  }
  const staffId = String(body?.staff_id || "");
  const newPassword = String(body?.new_password || "");
  if (!staffId) return json(400, { error: "staff_id is required" });
  if (newPassword.length < 8) return json(400, { error: "Password must be at least 8 characters" });
  if (staffId === callerId) return json(403, { error: "Staff cannot reset their own password" });

  const { data: target } = await admin.from("staff_members").select("id, doctor_id").eq("id", staffId).maybeSingle();
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
  if (!authorized) return json(403, { error: "Not authorized to reset this staff member's password" });

  const { error } = await admin.auth.admin.updateUserById(staffId, { password: newPassword });
  if (error) return json(400, { error: "Could not reset password" });

  return json(200, { ok: true });
});
