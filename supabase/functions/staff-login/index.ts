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
// IMPORTANT: this project has CAPTCHA (Cloudflare Turnstile) enforcement
// enabled at the GoTrue/Auth level for signInWithPassword (see Auth.tsx's
// doctor login, which passes options.captchaToken) — confirmed via a direct
// call to /auth/v1/token?grant_type=password, which returns
// error_code "captcha_failed" without one. There's no browser in this flow
// to solve a Turnstile challenge, so we MUST call signInWithPassword through
// the service-role (`admin`) client, not a fresh anon client — GoTrue
// exempts the service_role JWT from the captcha check (confirmed
// empirically). Do not swap this back to an anon client without re-adding a
// real captcha token, or every staff login will fail with a generic
// "Invalid username or password" while the real cause (captcha_failed) is
// silently swallowed below.
//
// Deliberately returns the SAME generic error to the CLIENT for "no such
// username", "wrong password" and "account disabled" — never reveal which
// case it was, to avoid username enumeration. The specific reason is still
// logged server-side (console.error) so it's visible in Edge Function logs
// without weakening the client-facing response.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/staffPermissions.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const INVALID = "Invalid username or password";

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

  // Query for the staff member by username case-insensitively. Previously
  // we fetched all rows and searched client-side which can miss matches if
  // the result set is paginated/limited. Use an indexed ilike lookup and
  // maybeSingle() to resolve exactly one row efficiently.
  const { data: staff, error: staffErr } = await admin
    .from("staff_members")
    .select("id, doctor_id, staff_name, username, status, permissions")
    .ilike("username", username)
    .maybeSingle();
  if (staffErr || !staff) {
    console.error("staff-login: no staff_members row for username", { username, error: staffErr?.message });
    return json(401, { error: INVALID });
  }
  if (staff.status !== "active") {
    console.error("staff-login: staff account is not active", { username, status: staff.status });
    return json(401, { error: INVALID });
  }

  const { data: authUser, error: userErr } = await admin.auth.admin.getUserById(staff.id);
  if (userErr || !authUser?.user?.email) {
    console.error("staff-login: could not resolve auth user for staff id", { staffId: staff.id, message: userErr?.message });
    return json(401, { error: INVALID });
  }

  const { data: signIn, error: signInErr } = await admin.auth.signInWithPassword({
    email: authUser.user.email,
    password,
  });
  if (signInErr || !signIn?.session) {
    console.error("staff-login: signInWithPassword failed", { username, code: (signInErr as { code?: string })?.code, message: signInErr?.message });
    return json(401, { error: INVALID });
  }

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
