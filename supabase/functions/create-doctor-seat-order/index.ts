// Buy extra doctor seats for the rest of the current Premium period. Mirrors
// create-plan-upgrade-order (same auth, payment-mode and row lifecycle) and
// writes to plan_upgrade_payments with kind='seats'. The amount comes ONLY from
// the seat_order_quote SQL function; the client sends just a quantity.
// verify-plan-upgrade-payment / razorpay-webhook then apply it through
// apply_plan_upgrade_payment, which handles kind='seats'.
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolvePaymentMode, isExplicitMockMode, mockId, beginPaymentRequest, json } from "../_shared/paymentMode.ts";
import { parseSeatQty, quoteErrorResponse } from "../_shared/seatOrder.ts";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  const preflight = beginPaymentRequest(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Missing authorization" });
  const scoped = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: claims } = await scoped.auth.getClaims(authHeader.slice(7));
  const uid = claims?.claims?.sub as string | undefined;
  if (!uid) return json(401, { error: "Invalid token" });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Bad request" });
  }
  const qty = parseSeatQty(body?.qty);
  if (qty == null) return json(400, { error: "INVALID_QTY" });

  // Resolve the caller to a doctor: the clinic owner, or active staff with
  // billing.manage acting for them (same rule as create-plan-upgrade-order).
  const { data: ownProfile } = await admin.from("profiles").select("id, plan_status").eq("id", uid).maybeSingle();
  let doctorId: string;
  let planStatus: string | null;
  if (ownProfile) {
    doctorId = ownProfile.id;
    planStatus = ownProfile.plan_status ?? null;
  } else {
    const { data: staffRow } = await admin
      .from("staff_members").select("doctor_id, status, permissions").eq("id", uid).maybeSingle();
    if (!staffRow || staffRow.status !== "active") return json(403, { error: "Not authorized" });
    if ((staffRow.permissions as Record<string, boolean> | null)?.["billing.manage"] !== true) {
      return json(403, { error: "You don't have permission to manage billing" });
    }
    const { data: doctorProfile } = await admin.from("profiles").select("id, plan_status").eq("id", staffRow.doctor_id).maybeSingle();
    if (!doctorProfile) return json(404, { error: "Doctor not found" });
    doctorId = doctorProfile.id;
    planStatus = doctorProfile.plan_status ?? null;
  }

  // 'cancelled' is how Superadmin suspends an account; paying must not lift it.
  if (planStatus === "cancelled") {
    return json(403, { error: "This account is suspended. Please contact support." });
  }

  // Seats are independent of a scheduled renewal, but not of a scheduled
  // downgrade to Pro (the seats would end up on a plan that cannot use them).
  const { data: pendingRows, error: pendErr } = await admin.from("pending_plans").select("target_tier").eq("doctor_id", doctorId);
  if (pendErr) return json(500, { error: "Could not check your scheduled plan. Please try again." });
  if ((pendingRows ?? []).some((p: { target_tier: string }) => p.target_tier === "pro")) {
    return json(409, { error: "PLAN_NOT_ELIGIBLE" });
  }

  // The only source of the amount. A failure here is never papered over.
  const { data: quote, error: quoteErr } = await admin.rpc("seat_order_quote", { _doctor_id: doctorId, _qty: qty });
  if (quoteErr || !quote || typeof quote !== "object") {
    console.error("create-doctor-seat-order: seat_order_quote failed", { doctorId, message: quoteErr?.message });
    return json(500, { error: "Could not price your seats. Please try again." });
  }
  const q = quote as { ok?: boolean; error?: string; amount_paise?: number; unit_price?: number; period_end?: string };
  if (q.ok !== true) {
    const r = quoteErrorResponse(q.error);
    return json(r.status, { error: r.error });
  }
  const amountPaise = Number(q.amount_paise);
  const unitPrice = Number(q.unit_price);
  if (!Number.isInteger(amountPaise) || amountPaise < 100 || !Number.isFinite(unitPrice) || unitPrice <= 0 || !q.period_end) {
    console.error("create-doctor-seat-order: malformed quote", { doctorId, quote });
    return json(500, { error: "Could not price your seats. Please try again." });
  }
  const amountRupees = amountPaise / 100;
  const periodStart = new Date().toISOString();

  const rowBase = {
    doctor_id: doctorId,
    from_tier: "premium",
    target_tier: "premium",
    amount: amountRupees,
    kind: "seats",
    seats_quantity: qty,
    unit_price: unitPrice,
    period_start: periodStart,
    period_end: q.period_end,
    status: "created",
  };

  const hasLiveKeys = Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
  const mode = resolvePaymentMode(hasLiveKeys);

  if (mode === "mock") {
    // Mock purchases are free seats: require PAYMENT_MODE=mock to be set on
    // purpose rather than falling into mock because a secret went missing.
    if (!isExplicitMockMode()) {
      return json(501, { error: "Online payment isn't active yet. Please try again shortly." });
    }
    const orderId = mockId("order");
    const { data: paymentRow, error: insErr } = await admin.from("plan_upgrade_payments").insert({
      ...rowBase,
      currency: "INR",
      razorpay_order_id: orderId,
      raw_response: { mock: true, order_id: orderId, amount: amountPaise },
      is_mock: true,
    }).select("id").single();
    if (insErr) {
      console.error("create-doctor-seat-order: mock insert failed", { doctorId, order_id: orderId, message: insErr.message });
      return json(500, { error: "Could not create your order. Please try again." });
    }

    return json(200, {
      order_id: orderId,
      key_id: "mock_key",
      amount: amountPaise,
      currency: "INR",
      payment_id: paymentRow.id,
      mode: "mock",
    });
  }

  if (!hasLiveKeys) {
    return json(501, { error: "Online payment isn't active yet. Please try again shortly." });
  }

  try {
    const basicAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        notes: { doctor_id: doctorId, kind: "seats", qty: String(qty) },
      }),
    });
    const order = await res.json();
    if (!res.ok) {
      console.error("create-doctor-seat-order: razorpay order failed", { doctorId, detail: order?.error?.description });
      return json(502, { error: "Could not start the payment. Please try again." });
    }

    const { data: paymentRow, error: insErr } = await admin.from("plan_upgrade_payments").insert({
      ...rowBase,
      currency: order.currency || "INR",
      razorpay_order_id: order.id,
      raw_response: order,
      is_mock: false,
    }).select("id").single();
    if (insErr) {
      // The Razorpay order exists but has no row; log what is needed to reconcile.
      console.error("create-doctor-seat-order: insert failed after razorpay order", { doctorId, razorpay_order_id: order.id, message: insErr.message });
      return json(500, { error: "Could not create your order. Please try again." });
    }

    return json(200, {
      order_id: order.id,
      key_id: RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency,
      payment_id: paymentRow.id,
      mode: "live",
    });
  } catch (e) {
    console.error("create-doctor-seat-order error:", { doctorId }, e);
    return json(500, { error: "Could not create your order. Please try again." });
  }
});
