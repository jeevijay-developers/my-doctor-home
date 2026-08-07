// Backup confirmation channel (doctylia-razorpay-design.md §1 & §5 #3).
// Razorpay calls this server-to-server for payment.captured / payment.failed /
// payout.processed / payout.failed so state stays correct even if the
// patient's browser never returns from Checkout (closed tab, network drop,
// etc.) or the payout webhook fires long after create-doctor-payout returned.
// Configure this URL + a webhook secret in the Razorpay dashboard once the
// platform account is live.
//
// Mock mode (mock-payment-mode-testing-prompt.md, Part 4): this also accepts
// a simulated webhook call signed with the local mock secret, so the
// webhook-confirms path can be exercised without a real Razorpay webhook
// secret. Which secret applies is decided from OUR OWN `is_mock` flag on the
// referenced payments/payouts row (set at order-creation time), never from
// anything in the incoming payload — a caller can't just claim "mock" to
// bypass real signature verification for a real transaction.
import { createClient } from "npm:@supabase/supabase-js@2";
import { hmacHex, MOCK_SIGNING_SECRET } from "../_shared/paymentMode.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-razorpay-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RAZORPAY_WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") || "";

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const event = payload?.event as string;
  const paymentEntity = payload.payload?.payment?.entity;
  const payoutEntity = payload.payload?.payout?.entity;

  // Figure out which secret this specific event should be checked against,
  // based on OUR record of whether the referenced order/payout is mock.
  let isMock = false;
  if (paymentEntity?.order_id) {
    const { data } = await admin.from("payments").select("is_mock").eq("razorpay_order_id", paymentEntity.order_id).maybeSingle();
    isMock = Boolean(data?.is_mock);
  } else if (payoutEntity?.id) {
    const { data } = await admin.from("payouts").select("is_mock").eq("razorpay_payout_id", payoutEntity.id).maybeSingle();
    isMock = Boolean(data?.is_mock);
  }

  const secret = isMock ? MOCK_SIGNING_SECRET : RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return json(501, { error: "Webhook secret not configured" });

  const expected = await hmacHex(secret, rawBody);
  if (expected !== signature) return json(400, { error: "Invalid webhook signature" });

  try {
    if (event === "payment.captured" || event === "payment.failed") {
      const orderId = paymentEntity?.order_id;
      const paymentId = paymentEntity?.id;
      if (orderId) {
        const status = event === "payment.captured" ? "captured" : "failed";
        await admin
          .from("payments")
          .update({ status, razorpay_payment_id: paymentId })
          .eq("razorpay_order_id", orderId)
          .neq("status", "captured"); // don't clobber an already-verified capture
      }
    } else if (event === "payout.processed" || event === "payout.failed") {
      const payoutId = payoutEntity?.id;
      if (payoutId) {
        const status = event === "payout.processed" ? "processed" : "failed";
        const { data: payout } = await admin
          .from("payouts")
          .update({ status, failure_reason: event === "payout.failed" ? payoutEntity?.failure_reason || "Payout failed" : null })
          .eq("razorpay_payout_id", payoutId)
          .select("id")
          .maybeSingle();
        if (payout && status === "processed") {
          await admin.from("doctor_ledger").update({ paid: true }).eq("payout_id", payout.id);
        }
      }
    }
    return json(200, { received: true });
  } catch (e) {
    console.error("razorpay-webhook error:", e);
    // Still 200 so Razorpay doesn't hammer retries for a transient internal issue;
    // the periodic reconciliation (manual review in Super Admin) catches drift.
    return json(200, { received: true, warning: "processing_error" });
  }
});
