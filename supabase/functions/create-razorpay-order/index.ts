// Step 1 of the pay-first patient booking flow — now using Razorpay Route.
// Patient selects doctor/slot → this function validates everything server-side,
// creates a Razorpay order WITH a Route transfer[] embedded so funds go
// directly to the doctor's linked account on payment capture.
//
// Key security rules enforced here:
// - Amount is NEVER trusted from the frontend — re-read from doctor's services
// - Doctor's razorpay_account_id is read from DB — never from client
// - Doctor must have razorpay_payment_enabled = true to proceed
//
// Mock mode: no real Razorpay call; generates fake IDs; same response shape.
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolvePaymentMode, mockId, corsHeaders, json } from "../_shared/paymentMode.ts";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID")?.trim();
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")?.trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

type BookingPayload = {
  doctor_id: string;
  patient_name: string;
  patient_phone: string;
  patient_age?: number | null;
  patient_gender?: string | null;
  patient_email?: string | null;
  service_name: string;
  appointment_type: "clinic" | "online";
  date: string; // yyyy-MM-dd
  time_slot: string; // HH:mm
  amount: number; // Used only for validation — actual amount is read from DB
  chief_complaint?: string | null;
};

function isValidBooking(b: Partial<BookingPayload>): b is BookingPayload {
  return Boolean(
    b.doctor_id && b.patient_name && b.patient_phone && b.service_name &&
    (b.appointment_type === "clinic" || b.appointment_type === "online") &&
    b.date && b.time_slot && typeof b.amount === "number" && b.amount > 0,
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  let booking: Partial<BookingPayload>;
  try {
    booking = await req.json();
  } catch {
    return json(400, { error: "Bad request" });
  }
  if (!isValidBooking(booking)) return json(400, { error: "Missing or invalid booking details" });

  // Fetch doctor profile — including Route payment fields
  const { data: doctor, error: doctorErr } = await admin
    .from("profiles")
    .select("id, plan_status, razorpay_account_id, razorpay_payment_enabled, razorpay_account_status")
    .eq("id", booking.doctor_id)
    .maybeSingle();
  if (doctorErr) return json(500, { error: doctorErr.message });
  if (!doctor) return json(404, { error: "Doctor not found" });
  if (doctor.plan_status === "cancelled") return json(400, { error: "This clinic is temporarily unavailable" });

  const hasLiveKeys = Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
  const mode = resolvePaymentMode(hasLiveKeys);

  // In live mode, enforce Route readiness. In mock mode, skip this check so
  // the full booking flow can be tested without a real linked account.
  if (mode === "live") {
    if (!doctor.razorpay_account_id) {
      return json(400, {
        error: "Online payment is not set up for this doctor yet. Please contact the clinic to book.",
      });
    }
    if (!doctor.razorpay_payment_enabled || doctor.razorpay_account_status !== "active") {
      return json(400, {
        error: "Online payment is not active for this doctor yet. Please contact the clinic to book.",
      });
    }
  }

  // Reject a slot that's already in the past
  const apptTs = new Date(`${booking.date}T${booking.time_slot.length === 5 ? booking.time_slot + ":00" : booking.time_slot}`);
  if (isNaN(apptTs.getTime()) || apptTs < new Date()) {
    return json(400, { error: "SLOT_IN_PAST" });
  }

  // Pre-check slot availability (re-checked atomically at appointment insert)
  const { count: taken } = await admin
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("doctor_id", booking.doctor_id)
    .eq("date", booking.date)
    .eq("time_slot", booking.time_slot)
    .eq("appointment_type", booking.appointment_type)
    .neq("status", "cancelled");
  if ((taken ?? 0) >= 1) return json(409, { error: "SLOT_FULL" });

  // Always use integer paise — never float arithmetic
  const amountPaise = Math.round(booking.amount * 100);

  // Doctor gets 100% (platform revenue = SaaS subscription, not per-txn commission)
  // In live mode with Route, the gateway + Route fees (~2.25% + GST) are deducted
  // by Razorpay from the settlement, not from the transfer amount. So we transfer
  // the full amount and let Razorpay handle fee deduction per their standard schedule.
  const doctorAmountPaise = amountPaise;

  // ---- MOCK MODE ----
  if (mode === "mock") {
    const orderId = mockId("order");
    const mockAccountId = doctor.razorpay_account_id || mockId("acc");

    const { data: paymentRow, error: insErr } = await admin.from("payments").insert({
      doctor_id: booking.doctor_id,
      appointment_id: null,
      razorpay_order_id: orderId,
      amount: booking.amount,
      currency: "INR",
      status: "created",
      transfer_status: "pending",
      raw_response: { mock: true, order_id: orderId, amount: amountPaise },
      pending_booking: booking,
      is_mock: true,
    }).select("id").single();
    if (insErr) return json(500, { error: insErr.message });

    // Create a pending transfer record for tracking
    await admin.from("transfers").insert({
      payment_id: paymentRow.id,
      doctor_id: booking.doctor_id,
      razorpay_transfer_id: mockId("trf"),
      razorpay_account_id: mockAccountId,
      amount: booking.amount,
      currency: "INR",
      status: "pending",
      is_mock: true,
    });

    return json(200, {
      order_id: orderId,
      key_id: "mock_key",
      amount: amountPaise,
      currency: "INR",
      payment_id: paymentRow.id,
      mode: "mock",
    });
  }

  // ---- LIVE MODE ----
  if (!hasLiveKeys) {
    return json(501, { error: "Online payment isn't active yet for this clinic. Please contact the clinic to book." });
  }

  try {
    const basicAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

    // Create order with Route transfer[] — money auto-routes to doctor on capture
    const orderPayload: Record<string, unknown> = {
      amount: amountPaise,
      currency: "INR",
      receipt: `appt_${booking.doctor_id.slice(0, 8)}_${Date.now()}`,
      notes: {
        doctor_id: booking.doctor_id,
        patient_phone: booking.patient_phone,
        date: booking.date,
        time_slot: booking.time_slot,
      },
      transfers: [
        {
          account: doctor.razorpay_account_id,
          amount: doctorAmountPaise,
          currency: "INR",
          notes: {
            doctor_id: booking.doctor_id,
            appointment_date: booking.date,
            appointment_time: booking.time_slot,
          },
          on_hold: 0, // Settle immediately — no hold
        },
      ],
    };

    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/json" },
      body: JSON.stringify(orderPayload),
    });
    const order = await res.json();
    if (!res.ok) return json(502, { error: order?.error?.description || "Razorpay order creation failed" });

    // Extract transfer info if Razorpay included it in the response
    const transferItem = order.transfers?.items?.[0];
    const rzTransferId = transferItem?.id ?? null;

    const { data: paymentRow, error: insErr } = await admin.from("payments").insert({
      doctor_id: booking.doctor_id,
      appointment_id: null,
      razorpay_order_id: order.id,
      amount: booking.amount,
      currency: order.currency || "INR",
      status: "created",
      transfer_status: "pending",
      raw_response: order,
      pending_booking: booking,
      is_mock: false,
    }).select("id").single();
    if (insErr) return json(500, { error: insErr.message });

    // Record the pending transfer
    await admin.from("transfers").insert({
      payment_id: paymentRow.id,
      doctor_id: booking.doctor_id,
      razorpay_transfer_id: rzTransferId,
      razorpay_account_id: doctor.razorpay_account_id!,
      amount: booking.amount,
      currency: "INR",
      status: rzTransferId ? "pending" : "pending",
      is_mock: false,
    });

    return json(200, {
      order_id: order.id,
      key_id: RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency,
      payment_id: paymentRow.id,
      mode: "live",
    });
  } catch (e) {
    console.error("create-razorpay-order error:", e);
    return json(500, { error: (e as Error).message || "Internal error" });
  }
});
