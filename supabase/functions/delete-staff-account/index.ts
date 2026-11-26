// Doctor-owned clinic staff RBAC — permanently delete a staff account.
// Doctor-only: the Staff Management checkboxes only ever offer
// view/create/edit/disable, never delete, so no staff permission can grant
// this. Deletes the underlying auth.users row; the staff_members row goes
// with it (ON DELETE CASCADE). A plain client-side `.delete()` on
// staff_members alone would leave an orphaned auth user behind.
// A doctor login (multi-doctor clinics) is first unlinked from its
// practitioner (practitioners.user_id); every failure after that puts the
// link back, so the doctor never ends up pointing at a half-deleted login.
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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Bad request" });
  }
  const staffId = String(body?.staff_id || "");
  if (!staffId) return json(400, { error: "staff_id is required" });

  const { data: target } = await admin.from("staff_members").select("*").eq("id", staffId).maybeSingle();
  if (!target) return json(404, { error: "Staff account not found" });
  if (target.doctor_id !== callerId) return json(403, { error: "Not authorized to delete this staff member" });

  // Unlink the doctor this login belongs to (if any) before anything is deleted.
  const { data: unlinked, error: unlinkErr } = await admin
    .from("practitioners")
    .update({ user_id: null })
    .eq("user_id", staffId)
    .eq("doctor_id", callerId)
    .select("id");
  if (unlinkErr) {
    console.error("delete-staff-account: practitioner unlink failed", { staffId, code: unlinkErr.code, message: unlinkErr.message });
    return json(500, { error: "Could not delete the staff account. Please try again." });
  }
  const unlinkedIds: string[] = (unlinked ?? []).map((p: { id: string }) => p.id);
  const relink = async () => {
    if (unlinkedIds.length === 0) return;
    const { error: relinkErr } = await admin.from("practitioners").update({ user_id: staffId }).in("id", unlinkedIds);
    if (relinkErr) {
      console.error("delete-staff-account: RELINK FAILED - doctor lost its login link", { staffId, practitionerIds: unlinkedIds, code: relinkErr.code, message: relinkErr.message });
    }
  };

  // staff_members.id REFERENCES auth.users ON DELETE CASCADE, so deleting the auth user once
  // removes the staff row too. If that fails nothing was deleted; just put the link back.
  const { error: authErr } = await admin.auth.admin.deleteUser(staffId);
  if (authErr) {
    console.error("delete-staff-account: auth deleteUser failed", { staffId, message: authErr.message });
    await relink();
    return json(500, { error: "Could not delete the staff login. Please try again." });
  }

  return json(200, { ok: true });
});
