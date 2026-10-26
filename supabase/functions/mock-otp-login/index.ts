// Dev/test-only OTP login. PhoneOtpForm's mock flow used to finish by calling
// supabase.auth.signInWithPassword() directly from the browser against the
// synthetic dev.<phone>@doctylia.com account created by get_or_create_dev_user.
// That endpoint requires CAPTCHA on this project and GoTrue 500s instead of
// gracefully rejecting the (already-consumed, dev-only) Turnstile token handed
// to it — so this mints the session server-side via the admin API instead,
// which isn't behind the public CAPTCHA gate at all.
import { createClient } from "npm:@supabase/supabase-js@2";
import { bindCorsRequest, corsHeaders, handleCors, type CorsOptions } from "../_shared/cors.ts";
import { clientIp, enforceRateLimit } from "../_shared/rateLimit.ts";

const OTP_CORS: CorsOptions = {
  allowHeaders: "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const DEV_OTP_CODE = "123456";

Deno.serve(async (req) => {
  bindCorsRequest(req, OTP_CORS);
  const preflight = handleCors(req, OTP_CORS);
  if (preflight) return preflight;
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const limited = await enforceRateLimit(admin, {
    key: `mock-otp-login:ip:${clientIp(req)}`,
    limit: 5,
    windowSeconds: 10 * 60,
  });
  if (limited) return limited;

  if (Deno.env.get("ENABLE_TEST_OTP") !== "true") {
    return json(403, { error: "Test OTP login is disabled." });
  }

  let body: { phone?: string; otp?: string; fullName?: string; isSignup?: boolean };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request body" });
  }

  const { phone, otp, fullName, isSignup } = body;
  if (!phone || typeof phone !== "string") return json(400, { error: "Missing phone" });
  if (otp !== DEV_OTP_CODE) return json(400, { error: "Invalid OTP" });

  // Clinic staff are real phone users (auth.users.phone), not dev.<phone>
  // accounts — on login, match them by phone first so the dev OTP flow can
  // sign them in like the production SMS flow does.
  let devUser: { email?: string } | null = null;
  if (!isSignup) {
    const e164 = /^\+/.test(phone) ? phone : `+${phone}`;
    const { data: staff } = await admin.from("staff_members").select("id, status").eq("phone", e164).maybeSingle();
    if (staff) {
      if (staff.status !== "active") return json(403, { error: "Your staff account is inactive. Please contact your clinic." });
      const { data: staffUser } = await admin.auth.admin.getUserById(staff.id);
      if (staffUser?.user?.email) devUser = { email: staffUser.user.email };
    }
  }

  // get_or_create_dev_user always derives a synthetic dev.<digits>@doctylia.com
  // address from `phone` itself — it never takes a client-supplied email — so
  // this can't be used to mint a session for a real user's account.
  if (!devUser) {
    const { data: rpcData, error: rpcError } = await admin.rpc("get_or_create_dev_user", {
      _phone: phone,
      _full_name: fullName || (isSignup ? "Dev Doctor" : "Test User"),
      _is_signup: !!isSignup,
    });
    if (rpcError) return json(500, { error: rpcError.message });
    // Login attempts don't auto-create an account — no rows means this phone
    // number has never signed up.
    devUser = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  }
  if (!devUser?.email) {
    if (!isSignup) {
      return json(404, { error: "No account found with this phone number.", showSignupLink: true });
    }
    return json(500, { error: "Failed to provision dev user" });
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: devUser.email,
  });
  if (linkErr) return json(500, { error: linkErr.message });

  const emailOtp = linkData.properties?.email_otp;
  if (!emailOtp) return json(500, { error: "Failed to generate session token" });

  const { data: sessionData, error: sessionErr } = await admin.auth.verifyOtp({
    email: devUser.email,
    token: emailOtp,
    type: "magiclink",
  });
  if (sessionErr || !sessionData.session) {
    return json(500, { error: sessionErr?.message || "Failed to establish session" });
  }

  return json(200, { session: sessionData.session });
});
