// Doctor-owned clinic staff RBAC — permanently delete a staff account.
// Doctor-only: the Staff Management checkboxes only ever offer
// view/create/edit/disable, never delete, so no staff permission can grant
// this. Deletes both the staff_members row and the underlying auth.users
// row (a plain client-side `.delete()` on staff_members alone would leave an
// orphaned, unusable but undeleted auth user behind).
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

  // Delete the row first; only remove the login once that succeeded. If the auth
  // delete then fails, put the row back so the account is not half-deleted (row gone
  // but a live login that can still receive OTPs) and tell the caller to retry.
  const { error: rowErr } = await admin.from("staff_members").delete().eq("id", staffId);
  if (rowErr) {
    console.error("delete-staff-account: staff_members delete failed", { staffId, code: rowErr.code, message: rowErr.message });
    return json(500, { error: "Could not delete the staff account. Please try again." });
  }

  const { error: authErr } = await admin.auth.admin.deleteUser(staffId);
  if (authErr) {
    console.error("delete-staff-account: auth deleteUser failed, restoring staff row", { staffId, message: authErr.message });
    const { error: restoreErr } = await admin.from("staff_members").insert(target);
    if (restoreErr) {
      console.error("delete-staff-account: RESTORE FAILED - orphaned auth user", { staffId, code: restoreErr.code, message: restoreErr.message });
    }
    return json(500, { error: "Could not delete the staff login. Please try again." });
  }

  return json(200, { ok: true });
});
