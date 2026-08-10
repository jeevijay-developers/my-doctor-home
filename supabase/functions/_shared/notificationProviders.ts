// Mock/live provider abstraction for WhatsApp + SMS delivery, mirroring the
// exact resolvePaymentMode() pattern already used for Razorpay
// (_shared/paymentMode.ts) so this codebase has one consistent mock/live
// convention rather than two different ones.
//
// NOTIFICATION_MODE=mock  -> always mock, even if provider keys are present.
// NOTIFICATION_MODE=live  -> always live (still fails per-channel if that
//                            channel's real keys aren't configured).
// unset                    -> auto: mock if a channel's real key(s) aren't
//                             configured, live if they are. This is what
//                             makes "no keys yet" work with zero config.
export type NotificationMode = "mock" | "live";

export function resolveNotificationMode(hasLiveCredentials: boolean): NotificationMode {
  const raw = (Deno.env.get("NOTIFICATION_MODE") || "").trim().toLowerCase();
  if (raw === "mock" || raw === "live") return raw;
  return hasLiveCredentials ? "live" : "mock";
}

export type SendResult = {
  status: "sent" | "simulated" | "failed";
  provider: string;
  provider_message_id: string | null;
  error_message: string | null;
};

const WHATSAPP_API_KEY = Deno.env.get("WHATSAPP_API_KEY");
const WHATSAPP_API_URL = Deno.env.get("WHATSAPP_API_URL");
const SMS_API_KEY = Deno.env.get("SMS_API_KEY");
const SMS_API_URL = Deno.env.get("SMS_API_URL");

function mockMessageId(prefix: string): string {
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 14);
  return `${prefix}_mock_${rand}`;
}

// WhatsApp send. In live mode this posts to whatever WHATSAPP_API_URL points
// at (e.g. the WhatsApp Cloud API, or a BSP like Gupshup/Twilio) — the exact
// request/response shape is provider-specific, so this generic
// {to, message} POST is a placeholder to adapt once a real provider is
// chosen; only this one function needs to change, nothing upstream of it.
export async function sendWhatsApp(to: string, message: string): Promise<SendResult> {
  const mode = resolveNotificationMode(Boolean(WHATSAPP_API_KEY && WHATSAPP_API_URL));
  if (mode === "mock") {
    return { status: "simulated", provider: "mock", provider_message_id: mockMessageId("wa"), error_message: null };
  }
  if (!WHATSAPP_API_KEY || !WHATSAPP_API_URL) {
    return { status: "failed", provider: "whatsapp", provider_message_id: null, error_message: "WHATSAPP_API_KEY / WHATSAPP_API_URL not configured" };
  }
  try {
    const res = await fetch(WHATSAPP_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${WHATSAPP_API_KEY}` },
      body: JSON.stringify({ to, message }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { status: "failed", provider: "whatsapp", provider_message_id: null, error_message: data?.error?.message || `WhatsApp API returned ${res.status}` };
    }
    return { status: "sent", provider: "whatsapp", provider_message_id: data?.id || data?.message_id || null, error_message: null };
  } catch (e) {
    return { status: "failed", provider: "whatsapp", provider_message_id: null, error_message: e instanceof Error ? e.message : "WhatsApp send failed" };
  }
}

// SMS send — same generic-POST placeholder shape as sendWhatsApp above,
// swap the request/response mapping for whichever SMS provider is chosen.
export async function sendSms(to: string, message: string): Promise<SendResult> {
  const mode = resolveNotificationMode(Boolean(SMS_API_KEY && SMS_API_URL));
  if (mode === "mock") {
    return { status: "simulated", provider: "mock", provider_message_id: mockMessageId("sms"), error_message: null };
  }
  if (!SMS_API_KEY || !SMS_API_URL) {
    return { status: "failed", provider: "sms", provider_message_id: null, error_message: "SMS_API_KEY / SMS_API_URL not configured" };
  }
  try {
    const res = await fetch(SMS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SMS_API_KEY}` },
      body: JSON.stringify({ to, message }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { status: "failed", provider: "sms", provider_message_id: null, error_message: data?.error?.message || `SMS API returned ${res.status}` };
    }
    return { status: "sent", provider: "sms", provider_message_id: data?.id || data?.message_id || null, error_message: null };
  } catch (e) {
    return { status: "failed", provider: "sms", provider_message_id: null, error_message: e instanceof Error ? e.message : "SMS send failed" };
  }
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
