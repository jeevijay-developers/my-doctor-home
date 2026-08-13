// Step 2 of the pay-first patient booking flow: Checkout success handler
// (real Razorpay, or the mock checkout — see mock-payment-mode-testing-
// prompt.md) calls this with a payment id + signature. We verify it
// ourselves (never trust the client) — using Razorpay's real secret for a
// real order, or the local mock secret for a mock order (payments.is_mock,
// set once at order-creation time and never re-derived from client input) —
// and ONLY on a verified signature do we create the appointment, from the
// booking payload stashed on the payments row by create-razorpay-order,
// never before. Every step after signature verification (appointment
// creation, commission split, ledger) is 100% identical for mock and live —
// only the money-movement / signature material is faked in mock mode.
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
    .from("payments")
    .select("id, doctor_id, amount, status, razorpay_order_id, appointment_id, pending_booking, is_mock")
    .eq("id", payment_id)
    .eq("razorpay_order_id", razorpay_order_id)
    .maybeSingle();
  if (payErr) return json(500, { error: payErr.message });
  if (!payment) return json(404, { error: "No matching order found" });

  // Idempotent: a retry / duplicate webhook after we already created the appointment.
  if (payment.status === "captured" && payment.appointment_id) {
    const { data: appt } = await admin
      .from("appointments").select("id, token_number, status, payment_status, created_at")
      .eq("id", payment.appointment_id).maybeSingle();
    return json(200, { ok: true, already_verified: true, appointment: appt, payment: { id: payment.id, razorpay_payment_id, amount: payment.amount } });
  }

  // Real orders are verified against Razorpay's actual secret; mock orders
  // (payments.is_mock, set at order-creation time — never trusted from this
  // request) are verified the same way against the local mock secret. This
  // is a real HMAC comparison either way, not a bypass — a mismatched mock
  // signature ("Simulate Signature Mismatch") is rejected exactly like a
  // real one would be.
  if (payment.is_mock) {
    const expectedMockSignature = await hmacHex(MOCK_SIGNING_SECRET, `${razorpay_order_id}|${razorpay_payment_id}`);
    if (expectedMockSignature !== razorpay_signature) {
      await admin.from("payments").update({ status: "failed", razorpay_payment_id }).eq("id", payment.id);
      return json(400, { error: "Signature verification failed" });
    }
  } else {
    if (!RAZORPAY_KEY_SECRET) return json(501, { error: "Razorpay integration pending — platform API keys not configured" });
    const expectedSignature = await hmacHex(RAZORPAY_KEY_SECRET, `${razorpay_order_id}|${razorpay_payment_id}`);
    if (expectedSignature !== razorpay_signature) {
      await admin.from("payments").update({ status: "failed", razorpay_payment_id }).eq("id", payment.id);
      return json(400, { error: "Signature verification failed" });
    }
  }

  const booking = payment.pending_booking as {
    doctor_id: string; patient_name: string; patient_phone: string; patient_age?: number | null;
    patient_gender?: string | null; service_name: string; appointment_type: "clinic" | "online";
    date: string; time_slot: string; amount: number; chief_complaint?: string | null;
  } | null;
  if (!booking) {
    await admin.from("payments").update({ status: "captured", razorpay_payment_id, razorpay_signature, needs_refund: true }).eq("id", payment.id);
    console.error("verify-razorpay-payment: payment captured but pending_booking missing for", payment.id);
    return json(500, { error: "Payment captured but booking details were lost — please contact support with your payment ID." });
  }

  const tkn = `T${Math.floor(Math.random() * 900) + 100}`;

  const { data: appt, error: apptErr } = await admin
    .from("appointments")
    .insert({
      doctor_id: booking.doctor_id,
      patient_name: booking.patient_name,
      patient_phone: booking.patient_phone,
      patient_age: booking.patient_age ?? null,
      patient_gender: booking.patient_gender ?? null,
      service_name: booking.service_name,
      appointment_type: booking.appointment_type,
      date: booking.date,
      time_slot: booking.time_slot,
      amount: booking.amount,
      token_number: tkn,
      chief_complaint: booking.chief_complaint ?? null,
      status: "confirmed",
      payment_status: "paid",
      payment_gateway: payment.is_mock ? "razorpay_mock" : "razorpay",
      gateway_order_id: razorpay_order_id,
      gateway_payment_id: razorpay_payment_id,
      gateway_signature: razorpay_signature,
    })
    .select("id, token_number, status, payment_status, created_at")
    .single();

  if (apptErr) {
    // Payment succeeded but the slot is gone (race) or another DB error occurred.
    // The money is real — flag for manual refund rather than losing the trail.
    // (Mock payments get the same flag for parity, even though there's no real
    // money to refund — so the mock flow exercises this path identically too.)
    await admin.from("payments").update({ status: "captured", razorpay_payment_id, razorpay_signature, needs_refund: true }).eq("id", payment.id);
    const code = apptErr.message?.includes("SLOT_FULL") ? "SLOT_FULL"
      : apptErr.message?.includes("SLOT_IN_PAST") ? "SLOT_IN_PAST"
      : "APPOINTMENT_CREATE_FAILED";
    console.error("verify-razorpay-payment appointment insert failed:", code, apptErr.message);
    return json(409, { error: code, message: "Your payment was received, but this slot is no longer available. Our team will contact you to reschedule or refund." });
  }

  await admin
    .from("payments")
    .update({ status: "captured", razorpay_payment_id, razorpay_signature, appointment_id: appt.id })
    .eq("id", payment.id);

  // Platform takes no cut of consultation payments — doctors keep the full
  // amount a patient pays. Platform revenue comes from subscription fees
  // (plan_upgrade_payments) only, not a per-transaction commission. The
  // ledger row is still written (doctor_ledger drives the monthly payout
  // rollup — see calculate-monthly-earnings), just with commission fixed
  // at 0 instead of read from profiles.commission_percent /
  // platform_settings.default_commission_percent.
  const gross = Number(booking.amount);
  const commissionPercent = 0;
  const commissionAmount = 0;
  const doctorShare = gross;
  const month = new Date().toISOString().slice(0, 7);

  const { error: ledgerErr } = await admin.from("doctor_ledger").insert({
    doctor_id: booking.doctor_id,
    payment_id: payment.id,
    appointment_id: appt.id,
    gross_amount: gross,
    commission_percent: commissionPercent,
    commission_amount: commissionAmount,
    doctor_share: doctorShare,
    month,
  });
  if (ledgerErr && !ledgerErr.message?.includes("duplicate")) {
    console.error("verify-razorpay-payment ledger error:", ledgerErr.message);
  }

  return json(200, {
    ok: true,
    appointment: appt,
    payment: { id: payment.id, razorpay_payment_id, razorpay_order_id, amount: gross, is_mock: payment.is_mock },
  });
});
