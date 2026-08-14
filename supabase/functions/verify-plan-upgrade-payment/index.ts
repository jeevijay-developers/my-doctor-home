// Step 2 of the self-service plan-upgrade flow. Verifies the payment
// ourselves (never trust the client) using the real Razorpay secret for a
// live order or the local mock secret for a mock order (is_mock, set once
// at order-creation time and never re-derived from client input) — and
// ONLY on a verified signature do we flip profiles.plan_tier. Mirrors
// verify-razorpay-payment's structure and idempotency guard exactly.
import { createClient } from "npm:@supabase/supabase-js@2";
import { hmacHex, MOCK_SIGNING_SECRET, corsHeaders, json } from "../_shared/paymentMode.ts";

const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
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
  const { payment_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body || {};
  if (!payment_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return json(400, { error: "payment_id, razorpay_order_id, razorpay_payment_id and razorpay_signature are required" });
  }

  const { data: payment, error: payErr } = await admin
    .from("plan_upgrade_payments")
    .select("id, doctor_id, target_tier, status, razorpay_order_id, is_mock")
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

  const expectedSecret = payment.is_mock ? MOCK_SIGNING_SECRET : RAZORPAY_KEY_SECRET;
  if (!payment.is_mock && !RAZORPAY_KEY_SECRET) {
    return json(501, { error: "Razorpay integration pending — platform API keys not configured" });
  }
  const expectedSignature = await hmacHex(expectedSecret!, `${razorpay_order_id}|${razorpay_payment_id}`);
  if (expectedSignature !== razorpay_signature) {
    await admin.from("plan_upgrade_payments").update({ status: "failed", razorpay_payment_id }).eq("id", payment.id);
    return json(400, { error: "Signature verification failed" });
  }

  await admin
    .from("plan_upgrade_payments")
    .update({ status: "captured", razorpay_payment_id, razorpay_signature })
    .eq("id", payment.id);

  // Set plan_end to 30 days from now (monthly subscription model)
  const planEnd = new Date();
  planEnd.setDate(planEnd.getDate() + 30);

  // Check if doctor has an active plan
  const { data: currentProfile } = await admin
    .from("profiles")
    .select("plan_status, plan_end")
    .eq("id", payment.doctor_id)
    .maybeSingle();

  // If plan is active, create a pending plan to activate after current plan expires
  if (currentProfile?.plan_status === "active" && currentProfile?.plan_end) {
    const activationDate = new Date(currentProfile.plan_end);
    const { error: pendingErr } = await admin
      .from("pending_plans")
      .insert({
        doctor_id: payment.doctor_id,
        target_tier: payment.target_tier,
        activation_date: activationDate.toISOString(),
        payment_id: payment.id,
      });

    if (pendingErr) {
      console.error("Failed to create pending plan:", pendingErr);
    }

    return json(200, { 
      ok: true, 
      plan_tier: payment.target_tier,
      scheduled: true,
      activation_date: activationDate.toISOString()
    });
  }

  // No active plan, upgrade immediately
  await admin
    .from("profiles")
    .update({ 
      plan_tier: payment.target_tier, 
      plan_status: "active", 
      trial_end: null,
      plan_end: planEnd.toISOString()
    })
    .eq("id", payment.doctor_id);

  return json(200, { ok: true, plan_tier: payment.target_tier, scheduled: false });
});
