// Step 1 of the pay-first patient booking flow: Review Summary -> Pay Now ->
// create-order -> Razorpay Checkout (or the mock checkout — see
// mock-payment-mode-testing-prompt.md) -> verify-razorpay-payment. Per the
// explicit "do not create the appointment before successful payment" rule,
// this function does NOT touch the appointments table — it validates the
// booking + slot availability, opens an order (real or mock — same response
// shape either way), and stashes the booking payload on the `payments` row
// so verify-razorpay-payment can turn it into a real appointment once (and
// only once) the payment is verified.
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolvePaymentMode, mockId, corsHeaders, json } from "../_shared/paymentMode.ts";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
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
  amount: number;
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

  const { data: doctor, error: doctorErr } = await admin
    .from("profiles").select("id, plan_status").eq("id", booking.doctor_id).maybeSingle();
  if (doctorErr) return json(500, { error: doctorErr.message });
  if (!doctor) return json(404, { error: "Doctor not found" });
  if (doctor.plan_status === "cancelled") return json(400, { error: "This clinic is temporarily unavailable" });

  // Reject a slot that's already in the past — mirrors the DB trigger's own check.
  const apptTs = new Date(`${booking.date}T${booking.time_slot.length === 5 ? booking.time_slot + ":00" : booking.time_slot}`);
  if (isNaN(apptTs.getTime()) || apptTs < new Date()) {
    return json(400, { error: "SLOT_IN_PAST" });
  }

  // Reject an already-full slot up front so we don't waste an order on it.
  // (The DB trigger re-checks this atomically at insert time in verify-razorpay-payment.)
  const { data: ws } = await admin
    .from("website_settings").select("max_per_slot").eq("doctor_id", booking.doctor_id).maybeSingle();
  const cap = ws?.max_per_slot || 1;
  const { count: taken } = await admin
    .from("appointments").select("id", { count: "exact", head: true })
    .eq("doctor_id", booking.doctor_id).eq("date", booking.date).eq("time_slot", booking.time_slot)
    .neq("status", "cancelled");
  if ((taken ?? 0) >= cap) return json(409, { error: "SLOT_FULL" });

  const hasLiveKeys = Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
  const mode = resolvePaymentMode(hasLiveKeys);
  const amountPaise = Math.round(booking.amount * 100);

  // ---- MOCK MODE: no Razorpay call at all, fake order id, same response shape ----
  if (mode === "mock") {
    const orderId = mockId("order");
    const { data: paymentRow, error: insErr } = await admin.from("payments").insert({
      doctor_id: booking.doctor_id,
      appointment_id: null,
      razorpay_order_id: orderId,
      amount: booking.amount,
      currency: "INR",
      status: "created",
      raw_response: { mock: true, order_id: orderId, amount: amountPaise },
      pending_booking: booking,
      is_mock: true,
    }).select("id").single();
    if (insErr) return json(500, { error: insErr.message });

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
    // PAYMENT_MODE=live was explicitly requested (or defaulted there) but the
    // platform keys aren't configured yet — same fallback message as before.
    return json(501, { error: "Online payment isn't active yet for this clinic. Please contact the clinic to book." });
  }

  try {
    const basicAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        notes: { doctor_id: booking.doctor_id, patient_phone: booking.patient_phone, date: booking.date, time_slot: booking.time_slot },
      }),
    });
    const order = await res.json();
    if (!res.ok) return json(502, { error: order?.error?.description || "Razorpay order creation failed" });

    const { data: paymentRow, error: insErr } = await admin.from("payments").insert({
      doctor_id: booking.doctor_id,
      appointment_id: null,
      razorpay_order_id: order.id,
      amount: booking.amount,
      currency: order.currency || "INR",
      status: "created",
      raw_response: order,
      pending_booking: booking,
      is_mock: false,
    }).select("id").single();
    if (insErr) return json(500, { error: insErr.message });

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
