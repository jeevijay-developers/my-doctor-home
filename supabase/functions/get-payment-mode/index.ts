// Public, read-only: lets the frontend show a "TEST MODE" badge proactively
// (booking widget, Bank/UPI Setup, Super Admin Payments) without needing to
// first create an order. Mode is resolved the same way create-razorpay-order
// resolves it for patient payments — see _shared/paymentMode.ts.
import { resolvePaymentMode, beginPaymentRequest, corsHeaders, json } from "../_shared/paymentMode.ts";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID")?.trim();
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")?.trim();

Deno.serve((req) => {
  const preflight = beginPaymentRequest(req);
  if (preflight) return preflight;
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "Method not allowed" });

  const hasLiveKeys = Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
  const mode = resolvePaymentMode(hasLiveKeys);
  return new Response(JSON.stringify({ mode }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60, s-maxage=300",
    },
  });
});
