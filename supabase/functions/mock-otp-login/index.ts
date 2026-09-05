// Dev/test-only OTP login. PhoneOtpForm's mock flow used to finish by calling
// supabase.auth.signInWithPassword() directly from the browser against the
// synthetic dev.<phone>@doctylia.com account created by get_or_create_dev_user.
// That endpoint requires CAPTCHA on this project and GoTrue 500s instead of
// gracefully rejecting the (already-consumed, dev-only) Turnstile token handed
// to it — so this mints the session server-side via the admin API instead,
// which isn't behind the public CAPTCHA gate at all.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const DEV_OTP_CODE = "123456";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

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

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // get_or_create_dev_user always derives a synthetic dev.<digits>@doctylia.com
  // address from `phone` itself — it never takes a client-supplied email — so
  // this can't be used to mint a session for a real user's account.
  const { data: rpcData, error: rpcError } = await admin.rpc("get_or_create_dev_user", {
    _phone: phone,
    _full_name: fullName || (isSignup ? "Dev Doctor" : "Test User"),
    _is_signup: !!isSignup,
  });
  if (rpcError) return json(500, { error: rpcError.message });

  // Login attempts don't auto-create an account — no rows means this phone
  // number has never signed up.
  const devUser = Array.isArray(rpcData) ? rpcData[0] : rpcData;
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
