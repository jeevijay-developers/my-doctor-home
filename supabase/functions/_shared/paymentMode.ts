// Shared by every payment-related edge function (mock-payment-mode-testing-
// prompt.md). One place decides mock vs live so the branch is never
// duplicated ad-hoc, and one place holds the mock signing "secret" so the
// mock signature check is a REAL check (not a rubber stamp) without ever
// touching Razorpay's real secret.
//
// PAYMENT_MODE=mock  -> always mock, even if real keys are present.
// PAYMENT_MODE=live  -> always live (still 501s per-function if real keys
//                       for that function aren't configured — unchanged
//                       behavior from before this feature existed).
// unset               -> auto: mock if this function's real key(s) aren't
//                        configured, live if they are. This is what makes
//                        "no keys yet" work with zero configuration today.
export type PaymentMode = "mock" | "live";

export function resolvePaymentMode(hasLiveCredentials: boolean): PaymentMode {
  const raw = (Deno.env.get("PAYMENT_MODE") || "").trim().toLowerCase();
  if (raw === "mock" || raw === "live") return raw;
  return hasLiveCredentials ? "live" : "mock";
}

// Never used for anything real — mock orders/payments only ever move fake
// money between mock records, so this does not need to be kept secret the
// way RAZORPAY_KEY_SECRET does. It exists purely so the mock signature check
// in verify-razorpay-payment is a genuine HMAC comparison (testable —
// "Simulate Signature Mismatch" actually exercises the rejection path)
// instead of an unconditional bypass.
export const MOCK_SIGNING_SECRET = "doctylia-mock-payment-secret-not-real";

export async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function mockId(prefix: string): string {
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 14);
  return `${prefix}_mock_${rand}`;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
