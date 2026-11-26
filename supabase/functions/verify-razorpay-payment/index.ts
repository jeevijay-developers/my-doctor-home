// Step 2 of the pay-first patient booking flow — signature verification and
// appointment creation. Updates the Route transfer record and records the exact
// commission split in doctor_ledger. (Invoices are created by the DB trigger once
// the visit is completed and paid.)
//
// Mock mode: same as live — real HMAC check against mock secret, then
// creates appointment + updates transfer + ledger identically.
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
    .select("id, doctor_id, service_id, amount, commission_percent, commission_amount, doctor_share, status, razorpay_order_id, razorpay_signature, appointment_id, pending_booking, is_mock")
    .eq("id", payment_id)
    .eq("razorpay_order_id", razorpay_order_id)
    .maybeSingle();
  if (payErr) return json(500, { error: payErr.message });
  if (!payment) return json(404, { error: "No matching order found" });

  // Only a fresh (created), retryable (failed) or webhook-captured-but-not-yet-claimed
  // order can be processed. Anything else — refunded, abandoned, a captured order that
  // this endpoint already claimed (razorpay_signature set) — is never re-confirmed.
  // (The webhook may flip created -> captured before the buyer's browser calls us; that
  // row has no appointment and no signature yet.)
  const settled = payment.status === "captured" && payment.appointment_id;
  const claimable =
    payment.status === "created" || payment.status === "failed" ||
    (payment.status === "captured" && !payment.appointment_id && !payment.razorpay_signature);
  if (!settled && !claimable) {
    return json(409, { error: "This payment can no longer be verified" });
  }

  // Signature verification — real secret for live, mock secret for mock. This
  // endpoint is unauthenticated and the ids are not secret, so a bad signature is
  // rejected read-only (it must never alter, or reveal, another patient's order).
  let expectedSecret: string;
  if (payment.is_mock) {
    // A mock order confirms a real booking, so it is honoured only while mock
    // mode was switched on deliberately (PAYMENT_MODE=mock).
    if (!isExplicitMockMode()) return json(400, { error: "Mock payments are disabled" });
    expectedSecret = MOCK_SIGNING_SECRET;
  } else {
    if (!RAZORPAY_KEY_SECRET) return json(501, { error: "Razorpay integration pending — platform API keys not configured" });
    expectedSecret = RAZORPAY_KEY_SECRET;
  }
  const expectedSignature = await hmacHex(expectedSecret, `${razorpay_order_id}|${razorpay_payment_id}`);
  if (!timingSafeEqualHex(expectedSignature, razorpay_signature)) {
    console.warn("verify-razorpay-payment: signature mismatch", { payment_id });
    return json(400, { error: "Signature verification failed" });
  }

  // Idempotent: already verified (signature is valid, so the token may be returned).
  if (settled) {
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

  const booking = payment.pending_booking as {
    doctor_id: string; patient_name: string; patient_phone: string;
    patient_age?: number | null; patient_gender?: string | null;
    patient_email?: string | null; service_id?: string | null; service_name: string;
    appointment_type: "clinic" | "online"; date: string;
    time_slot: string; amount: number; chief_complaint?: string | null;
    practitioner_id?: string | null;
  } | null;

  if (!booking) {
    await admin.from("payments").update({ status: "captured", razorpay_payment_id, razorpay_signature, needs_refund: true }).eq("id", payment.id).in("status", ["created", "failed", "captured"]).is("razorpay_signature", null);
    await admin.from("transfers").update({ status: "failed", error: "Booking details lost" }).eq("payment_id", payment.id);
    console.error("verify-razorpay-payment: payment captured but pending_booking missing for", payment.id);
    return json(500, { error: "Payment captured but booking details were lost — please contact support with your payment ID." });
  }

  // Atomic claim: a conditional UPDATE ... WHERE status IN (created, failed, captured-by-webhook) AND razorpay_signature IS NULL
  // RETURNING.
  // Only the request that flips the row proceeds to insert the appointment, so a double
  // click, a client retry or a racing webhook can never create two appointments.
  const { data: claimed, error: claimErr } = await admin
    .from("payments")
    .update({ status: "captured", razorpay_payment_id, razorpay_signature })
    .eq("id", payment.id)
    .in("status", ["created", "failed", "captured"])
    .is("razorpay_signature", null)
    .select("id");
  if (claimErr) return json(500, { error: "Could not process the payment. Please retry." });
  if (!claimed || claimed.length === 0) {
    return json(409, { error: "This payment is already being processed" });
  }

  // Unguessable booking token (same alphabet/length as src/lib/bookingToken.ts): it is the only
  // secret behind the patient's manage-appointment link.
  const TOKEN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const tkn = "T" + Array.from(crypto.getRandomValues(new Uint8Array(7)), (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join("");
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
      // Chosen at order time. Older pending payments have none: the DB fills it then.
      practitioner_id: booking.practitioner_id ?? undefined,
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
    const { error: refundFlagErr } = await admin.from("payments").update({ status: "captured", razorpay_payment_id, razorpay_signature, needs_refund: true }).eq("id", payment.id);
    if (refundFlagErr) {
      console.error("verify-razorpay-payment: needs_refund update failed", { paymentId: payment.id, code: refundFlagErr.code, message: refundFlagErr.message });
    }
    const { error: transferFailErr } = await admin.from("transfers").update({ status: "failed", error: "Appointment create failed: " + apptErr.message }).eq("payment_id", payment.id);
    if (transferFailErr) {
      console.error("verify-razorpay-payment: transfers update failed", { paymentId: payment.id, code: transferFailErr.code, message: transferFailErr.message });
    }
    const msg = apptErr.message ?? "";
    const doctorUnavailable = ["SEAT_LIMIT", "PRACTITIONER_NOT_BOOKABLE", "PRACTITIONER_REQUIRED", "PRACTITIONER_MISMATCH"].some((c) => msg.includes(c));
    const code = doctorUnavailable ? "DOCTOR_UNAVAILABLE"
      : msg.includes("SLOT_FULL") ? "SLOT_FULL"
      : msg.includes("SLOT_IN_PAST") ? "SLOT_IN_PAST"
      : "APPOINTMENT_CREATE_FAILED";
    console.error("verify-razorpay-payment appointment insert failed:", code, msg, { paymentId: payment.id });

    // Tell the clinic owner a paid booking needs a refund or a rebooking. Best effort: this must
    // never throw or alter the response (the 'booking_refund' type may not be allowed by the
    // table's CHECK yet, in which case the insert fails and is only logged).
    try {
      const { error: notifyErr } = await admin.from("notifications").insert({
        doctor_id: booking.doctor_id,
        recipient_user_id: booking.doctor_id,
        source_type: "booking_refund",
        title: "A paid booking needs attention",
        message: "A patient paid but the booking could not be confirmed. Open Billing to refund or rebook.",
      });
      if (notifyErr) {
        console.error("verify-razorpay-payment: refund notification failed", { paymentId: payment.id, code: notifyErr.code, message: notifyErr.message });
      }
    } catch (e) {
      console.error("verify-razorpay-payment: refund notification threw", { paymentId: payment.id, error: String(e) });
    }

    return json(409, {
      error: code,
      message: doctorUnavailable
        ? "Your payment was received, but this doctor is no longer available for online booking. Our team will contact you to rebook or refund."
        : "Your payment was received, but this slot is no longer available. Our team will contact you to reschedule or refund.",
      refund_pending: true,
      payment_id: payment.id,
    });
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

  // No invoice here: an invoice exists only once the visit is completed AND paid, and the
  // appointments trigger (invoice_on_appointment_billable -> ensure_invoice_for_appointment)
  // creates it then. Inserting one at payment time would break that rule.

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
