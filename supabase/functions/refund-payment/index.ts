// Super Admin-triggered refund — now with real Razorpay refund API support.
// For Route payments, Razorpay automatically reverses the linked account
// transfer when a refund is issued (no separate reversal call needed).
//
// Mock mode: same as before — flips payment + transfer + appointment to
// refunded state for UI testing.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/paymentMode.ts";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID")?.trim();
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")?.trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Missing authorization" });
  const scoped = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: claims } = await scoped.auth.getClaims(authHeader.slice(7));
  const uid = claims?.claims?.sub as string | undefined;
  if (!uid) return json(401, { error: "Invalid token" });
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: uid, _role: "admin" });
  if (!isAdmin) return json(403, { error: "Admin only" });

  let payment_id: string | undefined;
  let partial_amount: number | undefined; // optional partial refund in rupees
  try {
    ({ payment_id, partial_amount } = await req.json());
  } catch {
    return json(400, { error: "Bad request" });
  }
  if (!payment_id) return json(400, { error: "payment_id is required" });

  const { data: payment, error: payErr } = await admin
    .from("payments")
    .select("id, status, appointment_id, razorpay_payment_id, amount, is_mock, transfer_status")
    .eq("id", payment_id)
    .maybeSingle();
  if (payErr) return json(500, { error: payErr.message });
  if (!payment) return json(404, { error: "Payment not found" });
  if (payment.status !== "captured") {
    return json(400, { error: `Only captured payments can be refunded (this one is ${payment.status})` });
  }

  // ---- MOCK MODE ----
  if (payment.is_mock) {
    await admin.from("payments").update({ status: "refunded", needs_refund: false, transfer_status: "reversed" }).eq("id", payment.id);
    await admin.from("transfers").update({ status: "reversed", reversed_at: new Date().toISOString() }).eq("payment_id", payment.id);
    if (payment.appointment_id) {
      await admin.from("appointments").update({ status: "cancelled", payment_status: "refunded" }).eq("id", payment.appointment_id);
    }
    return json(200, { ok: true, payment_id: payment.id, status: "refunded", is_mock: true });
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
    // Amount in paise — if partial, use that; else full amount
    const refundAmountPaise = partial_amount
      ? Math.round(partial_amount * 100)
      : Math.round(Number(payment.amount) * 100);

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

    const isFullRefund = refundAmountPaise >= Math.round(Number(payment.amount) * 100);
    await admin.from("payments").update({
      status: isFullRefund ? "refunded" : "captured", // partial refund leaves status as captured
      needs_refund: false,
      transfer_status: isFullRefund ? "reversed" : payment.transfer_status,
      raw_response: rzRefund,
    }).eq("id", payment.id);

    if (isFullRefund) {
      await admin.from("transfers").update({ status: "reversed", reversed_at: new Date().toISOString() }).eq("payment_id", payment.id);
      if (payment.appointment_id) {
        await admin.from("appointments").update({ status: "cancelled", payment_status: "refunded" }).eq("id", payment.appointment_id);
      }
    }

    return json(200, {
      ok: true,
      payment_id: payment.id,
      razorpay_refund_id: rzRefund.id,
      amount_refunded: rzRefund.amount / 100,
      status: rzRefund.status,
      note: "Route transfer reversal is handled automatically by Razorpay.",
    });
  } catch (e) {
    console.error("refund-payment error:", e);
    return json(500, { error: (e as Error).message || "Refund failed" });
  }
});
