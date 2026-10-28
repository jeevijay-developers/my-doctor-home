// Step 2 of the self-service plan-upgrade flow. Verifies the payment
// ourselves (never trust the client) using the real Razorpay secret for a
// live order or the local mock secret for a mock order (is_mock, set once
// at order-creation time and never re-derived from client input) — and
// ONLY on a verified signature do we apply the plan change.
//
// The plan change itself lives in the SQL function apply_plan_upgrade_payment
// (shared with razorpay-webhook): it locks the payment row, only accepts
// 'created'/'failed' rows, and flips the status and the plan in one
// transaction, so a double submit, a retry, or webhook + verify racing each
// other can never apply one payment twice.
import { createClient } from "npm:@supabase/supabase-js@2";
import { hmacHex, timingSafeEqualHex, isExplicitMockMode, MOCK_SIGNING_SECRET, beginPaymentRequest, json } from "../_shared/paymentMode.ts";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  const preflight = beginPaymentRequest(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Bad request" });
  }
  const { payment_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body || {};
  if (!payment_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return json(400, { error: "payment_id, razorpay_order_id, razorpay_payment_id and razorpay_signature are required" });
  }

  const { data: payment, error: payErr } = await admin
    .from("plan_upgrade_payments")
    .select("id, doctor_id, target_tier, status, razorpay_order_id, is_mock, amount")
    .eq("id", payment_id)
    .eq("razorpay_order_id", razorpay_order_id)
    .maybeSingle();
  if (payErr) return json(500, { error: payErr.message });
  if (!payment) return json(404, { error: "No matching order found" });

  // Idempotent: a retry after we already applied this upgrade.
  if (payment.status === "captured") {
    const { data: profile } = await admin.from("profiles").select("plan_tier").eq("id", payment.doctor_id).maybeSingle();
    return json(200, { ok: true, already_verified: true, plan_tier: profile?.plan_tier ?? payment.target_tier });
  }
  // A refunded (e.g. cancelled scheduled plan) or otherwise settled order can
  // never be re-verified with its old signature.
  if (payment.status !== "created" && payment.status !== "failed" && payment.status !== "abandoned") {
    return json(409, { error: "This payment can no longer be verified" });
  }

  // Mock rows are only honoured while the platform is explicitly in mock mode;
  // a stale mock order left over from testing must not upgrade anyone in production.
  if (payment.is_mock && !isExplicitMockMode()) {
    return json(400, { error: "Mock payments are disabled" });
  }

  if (!payment.is_mock && !RAZORPAY_KEY_SECRET) {
    return json(501, { error: "Razorpay integration pending — platform API keys not configured" });
  }
  const expectedSecret = payment.is_mock ? MOCK_SIGNING_SECRET : RAZORPAY_KEY_SECRET;
  const expectedSignature = await hmacHex(expectedSecret!, `${razorpay_order_id}|${razorpay_payment_id}`);
  if (!timingSafeEqualHex(expectedSignature, razorpay_signature)) {
    // Do not write to the row here: this endpoint is unauthenticated and the
    // ids are not secret, so a bad signature must not be able to alter another
    // doctor's order.
    console.warn("verify-plan-upgrade-payment: signature mismatch", { payment_id });
    return json(400, { error: "Signature verification failed" });
  }

  // The checkout signature only proves the checkout completed. For live
  // payments also confirm with Razorpay that the money is actually captured,
  // for this order and this amount.
  if (!payment.is_mock) {
    const auth = "Basic " + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    let rp: any;
    try {
      const r = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpay_payment_id)}`, {
        headers: { Authorization: auth },
      });
      rp = await r.json();
      if (!r.ok) return json(502, { error: "Could not confirm the payment with Razorpay. Please retry in a moment." });
    } catch {
      return json(502, { error: "Could not confirm the payment with Razorpay. Please retry in a moment." });
    }
    if (rp.order_id !== razorpay_order_id || Number(rp.amount) !== Math.round(Number(payment.amount) * 100)) {
      console.error("verify-plan-upgrade-payment: payment does not match order", { payment_id });
      return json(400, { error: "Payment does not match this order" });
    }
    if (rp.status !== "captured") {
      // Authorized-but-not-yet-captured: the webhook applies the plan when it is captured.
      return json(409, { error: "Your payment is still being confirmed. Your plan will update automatically in a few minutes." });
    }
  }

  const { data: result, error: applyErr } = await admin.rpc("apply_plan_upgrade_payment", {
    _payment_id: payment.id,
    _razorpay_payment_id: razorpay_payment_id,
    _signature: razorpay_signature,
  });
  if (applyErr) {
    console.error("apply_plan_upgrade_payment failed", applyErr);
    return json(500, { error: "We could not apply your plan. Your payment is recorded; please contact support." });
  }

  const r = result as any;
  if (!r?.ok) {
    if (r?.code === "suspended") {
      return json(403, { error: "Your account is suspended. Your payment has been recorded; please contact support." });
    }
    if (r?.code === "payment_reused") return json(409, { error: "This payment was already used for another order" });
    return json(409, { error: "This payment can no longer be verified" });
  }

  return json(200, {
    ok: true,
    plan_tier: r.plan_tier,
    scheduled: Boolean(r.scheduled),
    ...(r.activation_date ? { activation_date: r.activation_date } : {}),
    ...(r.already_verified ? { already_verified: true } : {}),
  });
});
