// E2E-only session minting. Triple-gated:
//   1. ENABLE_E2E_AUTH === "true"
//   2. x-e2e-session-secret header equals env E2E_SESSION_SECRET (constant-time)
//   3. the email must end with env E2E_ALLOWED_EMAIL_SUFFIX (must start with "@";
//      default none = nothing allowed)
// and it never mints for a user holding the admin role or on the superadmin team.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { bindCorsRequest, corsHeaders, handleCors, type CorsOptions } from "../_shared/cors.ts";
import { secretsMatch } from "../_shared/constantTime.ts";

const E2E_CORS: CorsOptions = {
  allowHeaders: "authorization, x-client-info, apikey, content-type, x-e2e-session-secret",
};

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  bindCorsRequest(req, E2E_CORS);
  const preflight = handleCors(req, E2E_CORS);
  if (preflight) return preflight;

  if (Deno.env.get("ENABLE_E2E_AUTH") !== "true") {
    return reply(403, { error: "E2E session creation is disabled in production" });
  }

  const configuredSecret = Deno.env.get("E2E_SESSION_SECRET")?.trim() || "";
  if (!configuredSecret) return reply(403, { error: "E2E session creation is not configured" });
  if (!(await secretsMatch(req.headers.get("x-e2e-session-secret")?.trim(), configuredSecret))) {
    return reply(403, { error: "Forbidden" });
  }

  let rawEmail: unknown;
  try {
    ({ email: rawEmail } = await req.json());
  } catch {
    return reply(400, { error: "Invalid request body" });
  }
  if (typeof rawEmail !== "string" || rawEmail.length > 254 || !EMAIL_RE.test(rawEmail.trim())) {
    return reply(400, { error: "A valid email is required" });
  }
  const email = rawEmail.trim().toLowerCase();

  const suffix = (Deno.env.get("E2E_ALLOWED_EMAIL_SUFFIX")?.trim() || "").toLowerCase();
  if (!suffix.startsWith("@") || !email.endsWith(suffix)) {
    return reply(403, { error: "Email is not allowed for E2E sessions" });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr) throw linkErr;

    // Fail closed: refuse unless we can identify the user and prove it is not privileged.
    const userId = linkData?.user?.id;
    if (!userId) return reply(403, { error: "Unknown user" });
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (roleErr || isAdmin !== false) {
      return reply(403, { error: "E2E sessions cannot be minted for privileged users" });
    }
    const { data: teamRow, error: teamErr } = await supabase.from("superadmin_team_members").select("id").eq("id", userId).maybeSingle();
    if (teamErr || teamRow) return reply(403, { error: "E2E sessions cannot be minted for privileged users" });

    const otp = linkData.properties.email_otp;
    const { data: sessionData, error: sessionErr } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "magiclink",
    });
    if (sessionErr) throw sessionErr;

    return new Response(JSON.stringify(sessionData.session), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return reply(400, { error: err.message });
  }
});
