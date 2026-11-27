// Super Admin-triggered refund — with real Razorpay refund API support.
// For Route payments, Razorpay automatically reverses the linked account
// transfer when a refund is issued (`reverse_all: 1`).
// Also synchronizes `doctor_ledger` (`refunded = true, refunded_at = now(), paid = false`)
// and `invoices` (`status = 'refunded', refunded_at = now()`) so neither Doctor Net
// Earnings nor Platform Commission are overstated after a refund.
//
// Mock mode: flips payment + transfer + ledger + invoice + appointment to
// refunded state for UI testing.
import { createClient } from "npm:@supabase/supabase-js@2";
import { beginPaymentRequest, json } from "../_shared/paymentMode.ts";
import { hasSuperadminPermission } from "../_shared/superadminPermissions.ts";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID")?.trim();
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")?.trim();
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
  const isAdmin = await hasSuperadminPermission(admin, uid, "payments.refund");
  if (!isAdmin) return json(403, { error: "Admin only" });

  let payment_id: string | undefined;
  let partial_amount: unknown; // optional partial refund in rupees
  try {
    const parsed = await req.json();
    ({ payment_id, partial_amount } = parsed ?? {});
  } catch {
    return json(400, { error: "Bad request" });
  }
  if (!payment_id) return json(400, { error: "payment_id is required" });

  const { data: payment, error: payErr } = await admin
    .from("payments")
    .select("id, status, appointment_id, razorpay_payment_id, amount, is_mock, transfer_status, raw_response")
    .eq("id", payment_id)
    .maybeSingle();
  if (payErr) return json(500, { error: payErr.message });
  if (!payment) return json(404, { error: "Payment not found" });
  if (payment.status !== "captured") {
    return json(400, { error: `Only captured payments can be refunded (this one is ${payment.status})` });
  }

  // Amounts are tracked in integer paise. `raw_response.refunded_paise_total` is the running
  // total of partial refunds already issued through this function.
  const totalPaise = Math.round(Number(payment.amount) * 100);
  const alreadyPaise = Math.max(0, Number((payment.raw_response as any)?.refunded_paise_total) || 0);
  const remainingPaise = totalPaise - alreadyPaise;
  let refundAmountPaise = remainingPaise; // default: refund whatever is left
  if (partial_amount !== undefined && partial_amount !== null) {
    if (typeof partial_amount !== "number" || !Number.isFinite(partial_amount) || partial_amount <= 0) {
      return json(400, { error: "partial_amount must be a positive number" });
    }
    refundAmountPaise = Math.round(partial_amount * 100);
    if (refundAmountPaise < 1 || refundAmountPaise > remainingPaise) {
      return json(400, { error: `partial_amount exceeds the refundable balance (${remainingPaise / 100})` });
    }
  }
  if (!Number.isFinite(remainingPaise) || remainingPaise <= 0) {
    return json(400, { error: "Nothing left to refund on this payment" });
  }
  const isFull = refundAmountPaise === remainingPaise;
  const refundedTotal = alreadyPaise + refundAmountPaise;

  const nowIso = new Date().toISOString();
  let bookkeepingWarning: string | null = null;

  // ---- MOCK MODE ----
  if (payment.is_mock && !isFull) {
    await admin.from("payments").update({ raw_response: { refunded_paise_total: refundedTotal } }).eq("id", payment.id);
    await admin.from("admin_audit_log").insert({
      admin_user_id: uid,
      action: "refund_payment_partial",
      target_table: "payments",
      target_id: payment.id,
      details: { amount_refunded: refundAmountPaise / 100, total_refunded: refundedTotal / 100, appointment_id: payment.appointment_id, is_mock: true },
    });
    return json(200, { ok: true, payment_id: payment.id, status: "captured", partial: true, is_mock: true });
  }
  if (payment.is_mock) {
    await admin.from("payments").update({ status: "refunded", needs_refund: false, transfer_status: "reversed" }).eq("id", payment.id);
    await admin.from("transfers").update({ status: "reversed", reversed_at: nowIso }).eq("payment_id", payment.id);
    await admin.from("doctor_ledger").update({ refunded: true, refunded_at: nowIso, paid: false }).eq("payment_id", payment.id);
    if (payment.appointment_id) {
      await admin.from("appointments").update({ status: "cancelled", payment_status: "refunded" }).eq("id", payment.appointment_id);
      const { error: invErr } = await admin.from("invoices").update({ status: "refunded", refunded_at: nowIso }).eq("appointment_id", payment.appointment_id);
      if (invErr) {
        console.error("refund-payment: invoice update failed", { payment_id: payment.id, appointment_id: payment.appointment_id, message: invErr.message });
        bookkeepingWarning = "The refund succeeded but the invoice could not be marked refunded.";
      }
    }
    await admin.from("admin_audit_log").insert({
      admin_user_id: uid,
      action: "refund_payment",
      target_table: "payments",
      target_id: payment.id,
      details: {
        amount: payment.amount,
        appointment_id: payment.appointment_id,
        is_mock: true,
      },
    });
    return json(200, { ok: true, payment_id: payment.id, status: "refunded", is_mock: true, ...(bookkeepingWarning ? { bookkeeping_warning: bookkeepingWarning } : {}) });
  }

  // ---- LIVE MODE ----
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return json(501, { error: "Real Razorpay refunds aren't wired up yet — platform API keys not configured." });
  }
  if (!payment.razorpay_payment_id) {
    return json(400, { error: "No Razorpay payment ID on this record — cannot issue refund." });
  }

  try {
    const basicAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const res = await fetch(`https://api.razorpay.com/v1/payments/${payment.razorpay_payment_id}/refund`, {
      method: "POST",
      headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: refundAmountPaise,
        notes: { refunded_by: uid, payment_id: payment.id },
        // reverse_all: 1 tells Razorpay to also reverse Route transfers
        // This is the key flag for Route-based refunds
        reverse_all: 1,
      }),
    });

    const rzRefund = await res.json();
    if (!res.ok) {
      return json(502, { error: rzRefund?.error?.description || "Razorpay refund API failed" });
    }

    if (!isFull) {
      // Partial refund: the payment stays captured (the remainder can still be refunded),
      // the appointment stays as it is, and only the running total is recorded.
      await admin.from("payments").update({ raw_response: { ...rzRefund, refunded_paise_total: refundedTotal } }).eq("id", payment.id);
      await admin.from("admin_audit_log").insert({
        admin_user_id: uid,
        action: "refund_payment_partial",
        target_table: "payments",
        target_id: payment.id,
        details: {
          razorpay_refund_id: rzRefund.id,
          amount_refunded: rzRefund.amount / 100,
          total_refunded: refundedTotal / 100,
          appointment_id: payment.appointment_id,
          is_mock: false,
        },
      });
      return json(200, {
        ok: true,
        payment_id: payment.id,
        razorpay_refund_id: rzRefund.id,
        amount_refunded: rzRefund.amount / 100,
        status: rzRefund.status,
        partial: true,
        remaining: (totalPaise - refundedTotal) / 100,
      });
    }

    await admin.from("payments").update({
      status: "refunded",
      needs_refund: false,
      transfer_status: "reversed",
      raw_response: { ...rzRefund, refunded_paise_total: refundedTotal },
    }).eq("id", payment.id);

    await admin.from("transfers").update({ status: "reversed", reversed_at: nowIso }).eq("payment_id", payment.id);
    await admin.from("doctor_ledger").update({ refunded: true, refunded_at: nowIso, paid: false }).eq("payment_id", payment.id);

    if (payment.appointment_id) {
      await admin.from("appointments").update({ status: "cancelled", payment_status: "refunded" }).eq("id", payment.appointment_id);
      const { error: invErr } = await admin.from("invoices").update({ status: "refunded", refunded_at: nowIso }).eq("appointment_id", payment.appointment_id);
      if (invErr) {
        console.error("refund-payment: invoice update failed", { payment_id: payment.id, appointment_id: payment.appointment_id, message: invErr.message });
        bookkeepingWarning = "The refund succeeded but the invoice could not be marked refunded.";
      }
    }

    await admin.from("admin_audit_log").insert({
      admin_user_id: uid,
      action: "refund_payment",
      target_table: "payments",
      target_id: payment.id,
      details: {
        razorpay_refund_id: rzRefund.id,
        amount_refunded: rzRefund.amount / 100,
        appointment_id: payment.appointment_id,
        is_mock: false,
      },
    });

    return json(200, {
      ok: true,
      payment_id: payment.id,
      razorpay_refund_id: rzRefund.id,
      amount_refunded: rzRefund.amount / 100,
      status: rzRefund.status,
      note: "Route transfer reversal is handled automatically by Razorpay.",
      ...(bookkeepingWarning ? { bookkeeping_warning: bookkeepingWarning } : {}),
    });
  } catch (e) {
    console.error("refund-payment error:", e);
    return json(500, { error: (e as Error).message || "Refund failed" });
  }
});
