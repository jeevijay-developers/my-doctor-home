// Doctor-owned clinic staff RBAC — staff login.
//
// Public/unauthenticated (the staff member has no session yet). Looks up the
// staff_members row by username (case-insensitive), resolves it to the
// underlying Supabase Auth user's real (synthetic, never-shown) email, then
// performs the actual password check via a normal signInWithPassword call —
// so Supabase's own auth stack verifies the password, this function never
// sees or compares a hash itself. On success it hands back the resulting
// session tokens for the frontend to adopt via supabase.auth.setSession(),
// exactly the same session mechanism a doctor's own login already produces.
//
// Deliberately returns the SAME generic error for "no such username",
// "wrong password" and "account disabled" — never reveal which case it was.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/staffPermissions.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const INVALID = "Invalid login ID or password";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Bad request" });
  }
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");
  if (!username || !password) return json(400, { error: INVALID });

  const { data: staffRows } = await admin.from("staff_members").select("id, doctor_id, staff_name, username, status, permissions").order("created_at");
  const staff = (staffRows || []).find((r) => r.username.toLowerCase() === username.toLowerCase());
  if (!staff || staff.status !== "active") return json(401, { error: INVALID });

  const { data: authUser, error: userErr } = await admin.auth.admin.getUserById(staff.id);
  if (userErr || !authUser?.user?.email) return json(401, { error: INVALID });

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
    email: authUser.user.email,
    password,
  });
  if (signInErr || !signIn?.session) return json(401, { error: INVALID });

  await admin.from("staff_members").update({ last_login_at: new Date().toISOString() }).eq("id", staff.id);

  return json(200, {
    ok: true,
    session: {
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
      expires_in: signIn.session.expires_in,
      expires_at: signIn.session.expires_at,
      token_type: signIn.session.token_type,
    },
    staff: {
      staff_name: staff.staff_name,
      username: staff.username,
      doctor_id: staff.doctor_id,
      permissions: staff.permissions,
    },
  });
});
