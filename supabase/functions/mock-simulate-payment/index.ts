// Stands in for Razorpay's hosted Checkout in mock mode (mock-payment-mode-
// testing-prompt.md, Part 2/3). Exactly like the real Checkout popup, this
// function's ONLY job is to hand back a payment id + signature to the
// client — it never touches the appointments/payments tables itself.
// verify-razorpay-payment is what actually verifies the signature and
// creates the appointment, using the exact same code path as a real payment.
import { createClient } from "npm:@supabase/supabase-js@2";
import { hmacHex, MOCK_SIGNING_SECRET, mockId, corsHeaders, json } from "../_shared/paymentMode.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Bad request" });
  }
  const { payment_id, result } = body || {};
  if (!payment_id || (result !== "success" && result !== "signature_mismatch")) {
    return json(400, { error: 'payment_id and result ("success" | "signature_mismatch") are required' });
  }

  const { data: payment, error: payErr } = await admin
    .from("payments").select("id, razorpay_order_id, status, is_mock").eq("id", payment_id).maybeSingle();
  if (payErr) return json(500, { error: payErr.message });
  if (!payment) return json(404, { error: "No matching mock order found" });
  if (!payment.is_mock) return json(400, { error: "This payment was not created in mock mode" });
  // A retry after a failed signature check is expected (payments.status was
  // set to "failed" by verify-razorpay-payment) — matches how a retry works
  // against a real Razorpay order, which doesn't care about our internal
  // status either. Only block re-simulating an order that's already gone
  // through to a real outcome.
  if (payment.status === "captured" || payment.status === "refunded") {
    return json(400, { error: `This payment is already ${payment.status}` });
  }

  const razorpay_payment_id = mockId("pay");
  const correctSignature = await hmacHex(MOCK_SIGNING_SECRET, `${payment.razorpay_order_id}|${razorpay_payment_id}`);
  // A deliberately wrong signature for the "Simulate Signature Mismatch" test
  // scenario — verify-razorpay-payment must reject this exactly like a
  // tampered real signature.
  const razorpay_signature = result === "success" ? correctSignature : `mismatch_${correctSignature.slice(8)}`;

  return json(200, {
    razorpay_order_id: payment.razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  });
});
