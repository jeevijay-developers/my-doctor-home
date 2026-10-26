// Superadmin Team — create a team member (owner-only).
//
// Team members are real Supabase Auth users that sign in from the main login
// page with phone + OTP (same as doctors), so the auth user gets a confirmed
// `phone`. A synthetic email and a random, never-disclosed password satisfy
// auth.users; nobody logs in with them. account_type 'superadmin_team' makes
// handle_new_user() skip the doctor bootstrap (no profile, no 'doctor' role).
// They are deliberately NOT given user_roles 'admin' (that means full access);
// their access is exactly the flags stored in superadmin_team_members.
import { createClient } from "npm:@supabase/supabase-js@2";
import { beginStaffRequest, json, normalizeStaffPhone } from "../_shared/staffPermissions.ts";
import { sanitizeSaPermissions } from "../_shared/superadminPermissions.ts";

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
  const name = String(body?.name || "").trim();
  const phone = normalizeStaffPhone(body?.phone);
  const status = body?.status === "inactive" ? "inactive" : "active";
  const permissions = sanitizeSaPermissions(body?.permissions);

  if (!name) return json(400, { error: "Name is required" });
  if (!phone) return json(400, { error: "Enter a valid phone number, e.g. +919876543210" });

  const { data: dupe } = await admin.from("superadmin_team_members").select("id").eq("phone", phone).maybeSingle();
  if (dupe) return json(409, { error: PHONE_IN_USE });

  const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
    email: `team-${crypto.randomUUID()}@team.doctylia.internal`,
    password: `${crypto.randomUUID()}${crypto.randomUUID()}`,
    phone,
    phone_confirm: true,
    email_confirm: true,
    user_metadata: { account_type: "superadmin_team", full_name: name },
  });
  if (createErr || !newUser?.user) {
    console.error("create-team-member: createUser failed", { code: (createErr as { code?: string })?.code, message: createErr?.message });
    if ((createErr as { code?: string })?.code === "phone_exists") return json(409, { error: PHONE_IN_USE });
    return json(400, { error: createErr?.message || "Could not create the team login. Please try again." });
  }

  const { error: insertErr } = await admin.from("superadmin_team_members").insert({
    id: newUser.user.id,
    name,
    phone,
    status,
    permissions,
    created_by: callerId,
  });
  if (insertErr) {
    console.error("create-team-member: insert failed", { code: insertErr.code, message: insertErr.message });
    await admin.auth.admin.deleteUser(newUser.user.id);
    if (insertErr.code === "23505") return json(409, { error: PHONE_IN_USE });
    return json(500, { error: "Could not save the team member. Please try again." });
  }

  await admin.from("admin_audit_log").insert({
    admin_user_id: callerId,
    action: "create_team_member",
    target_table: "superadmin_team_members",
    target_id: newUser.user.id,
    details: { name, status, permissions },
  });

  return json(200, { ok: true, member: { id: newUser.user.id, name, phone, status, permissions } });
});
