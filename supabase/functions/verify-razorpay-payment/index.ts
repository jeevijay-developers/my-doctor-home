// Step 2 of the pay-first patient booking flow — signature verification and
// appointment creation. Updates the Route transfer record, records the exact
// commission split in doctor_ledger, and guarantees a server-side invoice row
// with the platform charge breakdown.
//
// Mock mode: same as live — real HMAC check against mock secret, then
// creates appointment + updates transfer + ledger + invoice identically.
import { createClient } from "npm:@supabase/supabase-js@2";
import { hmacHex, timingSafeEqualHex, MOCK_SIGNING_SECRET, isExplicitMockMode, beginPaymentRequest, json } from "../_shared/paymentMode.ts";

const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")?.trim();
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
    .from("payments")
    .select("id, doctor_id, service_id, amount, commission_percent, commission_amount, doctor_share, status, razorpay_order_id, appointment_id, pending_booking, is_mock")
    .eq("id", payment_id)
    .eq("razorpay_order_id", razorpay_order_id)
    .maybeSingle();
  if (payErr) return json(500, { error: payErr.message });
  if (!payment) return json(404, { error: "No matching order found" });

  // Idempotent: already verified
  if (payment.status === "captured" && payment.appointment_id) {
    const { data: appt } = await admin
      .from("appointments")
      .select("id, token_number, status, payment_status, created_at")
      .eq("id", payment.appointment_id)
      .maybeSingle();
    return json(200, {
      ok: true,
      already_verified: true,
      appointment: appt,
      payment: {
        id: payment.id,
        razorpay_payment_id,
        amount: payment.amount,
        commission_percent: payment.commission_percent,
        commission_amount: payment.commission_amount,
        doctor_share: payment.doctor_share,
      },
    });
  }

  // Signature verification — real secret for live, mock secret for mock
  if (payment.is_mock) {
    // A mock order confirms a real booking, so it is honoured only while mock
    // mode was switched on deliberately (PAYMENT_MODE=mock).
    if (!isExplicitMockMode()) return json(400, { error: "Mock payments are disabled" });
    const expectedMockSignature = await hmacHex(MOCK_SIGNING_SECRET, `${razorpay_order_id}|${razorpay_payment_id}`);
    if (!timingSafeEqualHex(expectedMockSignature, razorpay_signature)) {
      await admin.from("payments").update({ status: "failed", razorpay_payment_id, transfer_status: null }).eq("id", payment.id);
      await admin.from("transfers").update({ status: "failed", error: "Payment signature invalid" }).eq("payment_id", payment.id);
      return json(400, { error: "Signature verification failed" });
    }
  } else {
    if (!RAZORPAY_KEY_SECRET) return json(501, { error: "Razorpay integration pending — platform API keys not configured" });
    const expectedSignature = await hmacHex(RAZORPAY_KEY_SECRET, `${razorpay_order_id}|${razorpay_payment_id}`);
    if (!timingSafeEqualHex(expectedSignature, razorpay_signature)) {
      await admin.from("payments").update({ status: "failed", razorpay_payment_id, transfer_status: null }).eq("id", payment.id);
      await admin.from("transfers").update({ status: "failed", error: "Payment signature invalid" }).eq("payment_id", payment.id);
      return json(400, { error: "Signature verification failed" });
    }
  }

  const booking = payment.pending_booking as {
    doctor_id: string; patient_name: string; patient_phone: string;
    patient_age?: number | null; patient_gender?: string | null;
    patient_email?: string | null; service_id?: string | null; service_name: string;
    appointment_type: "clinic" | "online"; date: string;
    time_slot: string; amount: number; chief_complaint?: string | null;
  } | null;

  if (!booking) {
    await admin.from("payments").update({ status: "captured", razorpay_payment_id, razorpay_signature, needs_refund: true }).eq("id", payment.id);
    await admin.from("transfers").update({ status: "failed", error: "Booking details lost" }).eq("payment_id", payment.id);
    console.error("verify-razorpay-payment: payment captured but pending_booking missing for", payment.id);
    return json(500, { error: "Payment captured but booking details were lost — please contact support with your payment ID." });
  }

  const tkn = `T${Math.floor(Math.random() * 900) + 100}`;
  const gross = Number(payment.amount ?? booking.amount ?? 0);
  const commissionPercent = Number(payment.commission_percent ?? 0);
  const commissionAmount = Number(payment.commission_amount ?? 0);
  const doctorShare =
    payment.doctor_share != null && Number(payment.doctor_share) > 0
      ? Number(payment.doctor_share)
      : Math.max(0, +(gross - commissionAmount).toFixed(2));

  const { data: appt, error: apptErr } = await admin
    .from("appointments")
    .insert({
      doctor_id: booking.doctor_id,
      patient_name: booking.patient_name,
      patient_phone: booking.patient_phone,
      patient_age: booking.patient_age ?? null,
      patient_gender: booking.patient_gender ?? null,
      patient_email: booking.patient_email ?? null,
      service_name: booking.service_name,
      appointment_type: booking.appointment_type,
      date: booking.date,
      time_slot: booking.time_slot,
      amount: gross,
      token_number: tkn,
      chief_complaint: booking.chief_complaint ?? null,
      status: "confirmed",
      payment_status: "paid",
      payment_gateway: payment.is_mock ? "razorpay_mock" : "razorpay_route",
      gateway_order_id: razorpay_order_id,
      gateway_payment_id: razorpay_payment_id,
      gateway_signature: razorpay_signature,
    })
    .select("id, token_number, status, payment_status, created_at")
    .single();

  if (apptErr) {
    await admin.from("payments").update({ status: "captured", razorpay_payment_id, razorpay_signature, needs_refund: true }).eq("id", payment.id);
    await admin.from("transfers").update({ status: "failed", error: "Appointment create failed: " + apptErr.message }).eq("payment_id", payment.id);
    const code = apptErr.message?.includes("SLOT_FULL") ? "SLOT_FULL"
      : apptErr.message?.includes("SLOT_IN_PAST") ? "SLOT_IN_PAST"
      : "APPOINTMENT_CREATE_FAILED";
    console.error("verify-razorpay-payment appointment insert failed:", code, apptErr.message);
    return json(409, { error: code, message: "Your payment was received, but this slot is no longer available. Our team will contact you to reschedule or refund." });
  }

  // Update payment record with capture + appointment link
  await admin
    .from("payments")
    .update({
      status: "captured",
      transfer_status: payment.is_mock ? "processed" : "pending",
      razorpay_payment_id,
      razorpay_signature,
      appointment_id: appt.id,
    })
    .eq("id", payment.id);

  // Update transfer record with appointment link (and mark processed in mock mode)
  await admin
    .from("transfers")
    .update({
      appointment_id: appt.id,
      ...(payment.is_mock
        ? { status: "processed", processed_at: new Date().toISOString() }
        : {}),
    })
    .eq("payment_id", payment.id);

  // Insert doctor_ledger row with real commission split from payments
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
    paid: payment.is_mock ? true : false,
    refunded: false,
  });
  if (ledgerErr && !ledgerErr.message?.includes("duplicate")) {
    console.error("verify-razorpay-payment ledger error:", ledgerErr.message);
  }

  // Auto-create or upsert the invoices row server-side so commission snapshots
  // and patient receipt totals are guaranteed immediately upon payment verification.
  try {
    const { data: docProfile } = await admin
      .from("profiles")
      .select("gst_registered, gstin")
      .eq("id", booking.doctor_id)
      .maybeSingle();

    const gstRegistered = Boolean(docProfile?.gst_registered);
    const gstin = docProfile?.gstin || null;
    const gst_rate = gstRegistered ? 18 : 0;
    const gst_amount = +(gross * gst_rate / 100).toFixed(2);
    const total_amount = +(gross + gst_amount).toFixed(2);

    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const { data: existingInvoices } = await admin
      .from("invoices")
      .select("invoice_number")
      .eq("doctor_id", booking.doctor_id)
      .like("invoice_number", `${prefix}%`);

    const existingNums = (existingInvoices || [])
      .map((i: { invoice_number: string }) => parseInt(i.invoice_number.slice(prefix.length), 10))
      .filter((n: number) => !isNaN(n));
    const nextSeq = (existingNums.length ? Math.max(...existingNums) : 0) + 1;
    const invoice_number = `${prefix}${String(nextSeq).padStart(4, "0")}`;

    const { error: invErr } = await admin
      .from("invoices")
      .upsert(
        {
          doctor_id: booking.doctor_id,
          appointment_id: appt.id,
          invoice_number,
          patient_name: booking.patient_name,
          service_name: booking.service_name,
          amount: gross,
          gst_rate,
          gst_amount,
          total_amount,
          clinic_gstin: gstin,
          commission_percent: commissionPercent,
          commission_amount: commissionAmount,
          net_amount: doctorShare,
          status: "generated",
        },
        { onConflict: "appointment_id" },
      );

    if (invErr) {
      console.error("verify-razorpay-payment invoice upsert error:", invErr.message);
    }
  } catch (invEx) {
    console.error("verify-razorpay-payment invoice generation error:", invEx);
  }

  return json(200, {
    ok: true,
    appointment: appt,
    payment: {
      id: payment.id,
      service_id: payment.service_id ?? booking.service_id ?? null,
      razorpay_payment_id,
      razorpay_order_id,
      amount: gross,
      commission_percent: commissionPercent,
      commission_amount: commissionAmount,
      doctor_share: doctorShare,
      is_mock: payment.is_mock,
      route_transfer: payment.is_mock ? "processed" : "pending", // Confirmed via webhook in live mode
    },
  });
});
