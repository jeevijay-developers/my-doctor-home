// Step 1 of the pay-first patient booking flow — using Razorpay Route.
// Patient selects doctor/service/slot → this function validates everything server-side,
// resolves the authoritative service/consultation price from Postgres, computes
// the platform commission split in integer paise, and creates a Razorpay order
// WITH a Route transfer[] embedded so the doctor's net share goes directly to
// their linked account on payment capture while Doctylia retains the platform charge.
//
// Key security rules enforced here:
// - Amount is NEVER trusted from the frontend — resolved from DB (`services` / `website_settings` / `profiles`)
// - Doctor's razorpay_account_id and commission_percent are read from DB — never from client
// - Doctor must have razorpay_payment_enabled = true to proceed in live mode
//
// Mock mode: no real Razorpay call; generates fake IDs; same response shape.
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolvePaymentMode, isExplicitMockMode, mockId, beginPaymentRequest, json } from "../_shared/paymentMode.ts";
import { clientIp, enforceRateLimit } from "../_shared/rateLimit.ts";
import { turnstileError } from "../_shared/turnstile.ts";
import {
  calculateCommissionSplit,
  isAmountMatchingServerPrice,
  resolveAuthoritativePrice,
  type ServiceRecordForPricing,
} from "../_shared/commissionSplit.ts";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID")?.trim();
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")?.trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Public booking clients must include `captchaToken` (Cloudflare Turnstile)
// on this JSON body. The frontend widget must use exactly the field name
// `captchaToken`.
type BookingPayload = {
  doctor_id: string;
  captchaToken?: string;
  patient_name: string;
  patient_phone: string;
  patient_age?: number | null;
  patient_gender?: string | null;
  patient_email?: string | null;
  service_id?: string | null;
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
  const preflight = beginPaymentRequest(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const ip = clientIp(req);
  const limited = await enforceRateLimit(admin, {
    key: `create-razorpay-order:ip:${ip}`,
    limit: 10,
    windowSeconds: 10 * 60,
  });
  if (limited) return limited;

  let booking: Partial<BookingPayload>;
  try {
    booking = await req.json();
  } catch {
    return json(400, { error: "Bad request" });
  }

  const captcha = await turnstileError(booking.captchaToken, ip, "booking");
  if (captcha) return json(400, captcha);

  if (!isValidBooking(booking)) return json(400, { error: "Missing or invalid booking details" });

  // Fetch doctor profile — including Route payment & fee/commission fields
  const { data: doctor, error: doctorErr } = await admin
    .from("profiles")
    .select("id, plan_status, consultation_fee, commission_percent, razorpay_account_id, razorpay_payment_enabled, razorpay_account_status")
    .eq("id", booking.doctor_id)
    .maybeSingle();
  if (doctorErr) return json(500, { error: doctorErr.message });
  if (!doctor) return json(404, { error: "Doctor not found" });
  if (doctor.plan_status === "cancelled") return json(400, { error: "This clinic is temporarily unavailable" });

  const hasLiveKeys = Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
  const mode = resolvePaymentMode(hasLiveKeys);
  // Missing keys must not silently turn real bookings into free mock ones.
  if (mode === "mock" && !isExplicitMockMode()) {
    return json(501, { error: "Payments are not configured" });
  }

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

  // ---- AUTHORITATIVE SERVER-SIDE PRICE LOOKUP ----
  let serviceRow: ServiceRecordForPricing | null = null;
  if (booking.service_id) {
    const { data: svc, error: svcErr } = await admin
      .from("services")
      .select("id, name, price, type, active")
      .eq("id", booking.service_id)
      .eq("doctor_id", booking.doctor_id)
      .eq("active", true)
      .maybeSingle();
    if (svcErr) return json(500, { error: svcErr.message });
    if (!svc) {
      return json(400, {
        error: "INVALID_SERVICE",
        message: "The selected service is not available. Please refresh and try again.",
      });
    }
    serviceRow = svc;
  }

  let onlineFee: number | null = null;
  if (!booking.service_id && booking.appointment_type === "online") {
    const { data: ws } = await admin
      .from("website_settings")
      .select("online_fee")
      .eq("doctor_id", booking.doctor_id)
      .maybeSingle();
    onlineFee = ws?.online_fee != null ? Number(ws.online_fee) : null;
  }

  const priceResolution = resolveAuthoritativePrice({
    appointmentType: booking.appointment_type,
    consultationFee: doctor.consultation_fee,
    onlineFee,
    service: serviceRow,
  });

  if (!priceResolution.ok) {
    return json(400, { error: priceResolution.error, message: priceResolution.message });
  }

  const serverPrice = priceResolution.serverPrice;
  if (!isAmountMatchingServerPrice(booking.amount, serverPrice)) {
    return json(400, {
      error: "PAYMENT_AMOUNT_MISMATCH",
      message: "Service price has changed. Please refresh and try again.",
    });
  }

  // Ensure pending_booking stores the authoritative server price & canonical service_name
  const resolvedServiceName = serviceRow?.name || booking.service_name;
  const authoritativeBooking: BookingPayload = {
    ...booking,
    service_id: serviceRow?.id ?? null,
    service_name: resolvedServiceName,
    amount: serverPrice,
  };

  // ---- COMMISSION RESOLUTION & INTEGER PAISE MATH ----
  const { data: defaultCommSetting } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "default_commission_percent")
    .maybeSingle();

  const split = calculateCommissionSplit(
    serverPrice,
    doctor.commission_percent,
    defaultCommSetting?.value as number | string | null | undefined,
  );

  const {
    commissionPercent: pct,
    grossPaise,
    commissionPaise,
    doctorNetPaise,
    grossAmount,
    commissionAmount,
    doctorShare,
  } = split;

  // ---- MOCK MODE ----
  if (mode === "mock") {
    const orderId = mockId("order");
    const mockAccountId = doctor.razorpay_account_id || mockId("acc");

    const { data: paymentRow, error: insErr } = await admin.from("payments").insert({
      doctor_id: booking.doctor_id,
      appointment_id: null,
      service_id: serviceRow?.id ?? null,
      razorpay_order_id: orderId,
      amount: grossAmount,
      commission_percent: pct,
      commission_amount: commissionAmount,
      doctor_share: doctorShare,
      currency: "INR",
      status: "created",
      transfer_status: "pending",
      raw_response: {
        mock: true,
        order_id: orderId,
        amount: grossPaise,
        commission_percent: pct,
        commission_paise: commissionPaise,
        doctor_net_paise: doctorNetPaise,
      },
      pending_booking: authoritativeBooking,
      is_mock: true,
    }).select("id").single();
    if (insErr) return json(500, { error: insErr.message });

    // Create a pending transfer record for tracking
    await admin.from("transfers").insert({
      payment_id: paymentRow.id,
      doctor_id: booking.doctor_id,
      razorpay_transfer_id: mockId("trf"),
      razorpay_account_id: mockAccountId,
      amount: doctorShare,
      gross_amount: grossAmount,
      commission_percent: pct,
      commission_amount: commissionAmount,
      currency: "INR",
      status: "pending",
      is_mock: true,
    });

    return json(200, {
      order_id: orderId,
      key_id: "mock_key",
      amount: grossPaise,
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

    // Create order with Route transfer[] — doctor net share auto-routes to doctor on capture
    const orderPayload: Record<string, unknown> = {
      amount: grossPaise,
      currency: "INR",
      receipt: `appt_${booking.doctor_id.slice(0, 8)}_${Date.now()}`,
      notes: {
        doctor_id: booking.doctor_id,
        patient_phone: booking.patient_phone,
        service_id: serviceRow?.id ?? "",
        service_name: resolvedServiceName,
        date: booking.date,
        time_slot: booking.time_slot,
        gross_paise: String(grossPaise),
        commission_pct: String(pct),
        commission_paise: String(commissionPaise),
        doctor_net_paise: String(doctorNetPaise),
      },
    };

    if (doctorNetPaise > 0) {
      orderPayload.transfers = [
        {
          account: doctor.razorpay_account_id,
          amount: doctorNetPaise,
          currency: "INR",
          notes: {
            doctor_id: booking.doctor_id,
            service_name: resolvedServiceName,
            appointment_date: booking.date,
            appointment_time: booking.time_slot,
            gross_paise: String(grossPaise),
            commission_pct: String(pct),
            commission_paise: String(commissionPaise),
          },
          on_hold: 0, // Settle immediately — no hold
        },
      ];
    }

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
      service_id: serviceRow?.id ?? null,
      razorpay_order_id: order.id,
      amount: grossAmount,
      commission_percent: pct,
      commission_amount: commissionAmount,
      doctor_share: doctorShare,
      currency: order.currency || "INR",
      status: "created",
      transfer_status: doctorNetPaise > 0 ? "pending" : "processed",
      raw_response: order,
      pending_booking: authoritativeBooking,
      is_mock: false,
    }).select("id").single();
    if (insErr) return json(500, { error: insErr.message });

    // Record the pending transfer
    await admin.from("transfers").insert({
      payment_id: paymentRow.id,
      doctor_id: booking.doctor_id,
      razorpay_transfer_id: rzTransferId,
      razorpay_account_id: doctor.razorpay_account_id!,
      amount: doctorShare,
      gross_amount: grossAmount,
      commission_percent: pct,
      commission_amount: commissionAmount,
      currency: "INR",
      status: doctorNetPaise > 0 ? "pending" : "processed",
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
