// Supabase Auth "Send SMS" hook → MSG91. Supabase has no built-in MSG91
// provider, so when the hook is enabled (Dashboard → Authentication → Hooks)
// GoTrue generates/stores the OTP itself and POSTs it here instead of to
// Twilio etc. The browser side is unchanged: ProductionOtpService still calls
// supabase.auth.signInWithOtp() / verifyOtp().
//
// Required secrets:
//   SEND_SMS_HOOK_SECRET   – "v1,whsec_..." shown when the hook is created
//   MSG91_AUTH_KEY         – MSG91 → API → Auth key
//   MSG91_OTP_TEMPLATE_ID  – DLT-approved flow template (Login_OTP_DOC)
// Optional:
//   MSG91_OTP_VAR          – template variable holding the code (default "number" for ##number##)
import { Webhook } from "npm:standardwebhooks@1.0.0";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// GoTrue surfaces hook failures to the client only in this shape.
function hookError(status: number, message: string) {
  return json(status, { error: { http_code: status, message } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return hookError(405, "Method not allowed");

  const hookSecret = Deno.env.get("SEND_SMS_HOOK_SECRET");
  const authKey = Deno.env.get("MSG91_AUTH_KEY");
  const templateId = Deno.env.get("MSG91_OTP_TEMPLATE_ID");
  const otpVar = Deno.env.get("MSG91_OTP_VAR") || "number";
  if (!hookSecret || !authKey || !templateId) {
    console.error("send-sms-hook: missing SEND_SMS_HOOK_SECRET / MSG91_AUTH_KEY / MSG91_OTP_TEMPLATE_ID");
    return hookError(500, "SMS service is not configured.");
  }

  const payload = await req.text();
  let user: { phone?: string };
  let sms: { otp?: string };
  try {
    const wh = new Webhook(hookSecret.replace("v1,whsec_", ""));
    ({ user, sms } = wh.verify(payload, Object.fromEntries(req.headers)) as {
      user: { phone?: string };
      sms: { otp?: string };
    });
  } catch {
    return hookError(401, "Invalid hook signature");
  }

  // GoTrue stores phones as digits without "+", which is also what MSG91 wants.
  const mobile = String(user?.phone || "").replace(/\D/g, "");
  const otp = sms?.otp;
  if (!mobile || !otp) return hookError(400, "Missing phone or OTP");

  try {
    const res = await fetch("https://control.msg91.com/api/v5/flow", {
      method: "POST",
      headers: { authkey: authKey, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        template_id: templateId,
        short_url: "0",
        recipients: [{ mobiles: mobile, [otpVar]: otp }],
      }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || result?.type === "error") {
      console.error("send-sms-hook: MSG91 rejected", { status: res.status, message: result?.message });
      return hookError(502, "Could not send OTP. Please try again.");
    }
  } catch (err) {
    console.error("send-sms-hook: MSG91 request failed", err);
    return hookError(502, "Could not send OTP. Please try again.");
  }

  return json(200, {});
});
