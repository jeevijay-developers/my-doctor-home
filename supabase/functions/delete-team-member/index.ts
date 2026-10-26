// Superadmin Team — permanently delete a team member (owner-only). Removes the
// underlying auth.users row (which cascades to superadmin_team_members) so no
// orphaned login is left behind.
import { createClient } from "npm:@supabase/supabase-js@2";
import { beginStaffRequest, json } from "../_shared/staffPermissions.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

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
  if (!memberId) return json(400, { error: "member_id is required" });

  const { data: target } = await admin.from("superadmin_team_members").select("id, name").eq("id", memberId).maybeSingle();
  if (!target) return json(404, { error: "Team member not found" });

  const { error } = await admin.auth.admin.deleteUser(memberId);
  if (error) {
    console.error("delete-team-member: deleteUser failed", { message: error.message });
    return json(500, { error: "Could not delete team member" });
  }

  await admin.from("admin_audit_log").insert({
    admin_user_id: callerId,
    action: "delete_team_member",
    target_table: "superadmin_team_members",
    target_id: memberId,
    details: { name: target.name },
  });

  return json(200, { ok: true });
});
