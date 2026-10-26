// Superadmin Team — change a team member's login phone (owner-only).
// The phone is the member's login identity (phone + OTP) and lives in
// auth.users.phone, which only the service-role admin API can change. Sessions
// created for the old number are revoked.
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
  const { data: isOwner } = await admin.rpc("has_role", { _user_id: callerId, _role: "admin" });
  if (!isOwner) return json(403, { error: "Only owners can manage the team" });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Bad request" });
  }
  const memberId = String(body?.member_id || "");
  const phone = normalizeStaffPhone(body?.phone);
  if (!memberId) return json(400, { error: "member_id is required" });
  if (!phone) return json(400, { error: "Enter a valid phone number, e.g. +919876543210" });

  const { data: target } = await admin.from("superadmin_team_members").select("id, phone").eq("id", memberId).maybeSingle();
  if (!target) return json(404, { error: "Team member not found" });
  if (target.phone === phone) return json(200, { ok: true });

  const { data: dupe } = await admin.from("superadmin_team_members").select("id").eq("phone", phone).neq("id", memberId).maybeSingle();
  if (dupe) return json(409, { error: PHONE_IN_USE });

  const { error } = await admin.auth.admin.updateUserById(memberId, { phone, phone_confirm: true });
  if (error) {
    console.error("update-team-member-phone: updateUserById failed", { code: (error as { code?: string }).code, message: error.message });
    if ((error as { code?: string }).code === "phone_exists") return json(409, { error: PHONE_IN_USE });
    return json(400, { error: "Could not change phone number" });
  }

  const { error: rowErr } = await admin.from("superadmin_team_members").update({ phone }).eq("id", memberId);
  if (rowErr) {
    await admin.auth.admin.updateUserById(memberId, { phone: target.phone, phone_confirm: true });
    console.error("update-team-member-phone: row update failed", { code: rowErr.code, message: rowErr.message });
    return json(500, { error: "Could not change phone number" });
  }

  const { error: revokeErr } = await admin.rpc("revoke_user_sessions", { _user_id: memberId });
  if (revokeErr) console.error("update-team-member-phone: revoke_user_sessions failed", { message: revokeErr.message });

  await admin.from("admin_audit_log").insert({
    admin_user_id: callerId,
    action: "change_team_member_phone",
    target_table: "superadmin_team_members",
    target_id: memberId,
    details: null,
  });

  return json(200, { ok: true });
});
