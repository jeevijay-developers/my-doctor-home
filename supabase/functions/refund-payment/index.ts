// Super Admin-triggered refund (mock-payment-mode-testing-prompt.md, Part 5).
// No real Razorpay refund integration has been built yet, so live mode
// reports 501 (same "not configured" pattern used elsewhere in this
// project) rather than pretending to call an API that isn't wired up. Mock
// mode just flips the payment + appointment to refunded, matching what a
// real refund would eventually update, so the rest of the app (Payments
// dashboard, doctor ledger visibility) can be tested against a refunded row
// today.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/paymentMode.ts";

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
  try {
    ({ payment_id } = await req.json());
  } catch {
    return json(400, { error: "Bad request" });
  }
  if (!payment_id) return json(400, { error: "payment_id is required" });

  const { data: payment, error: payErr } = await admin
    .from("payments").select("id, status, appointment_id, is_mock").eq("id", payment_id).maybeSingle();
  if (payErr) return json(500, { error: payErr.message });
  if (!payment) return json(404, { error: "Payment not found" });
  if (payment.status !== "captured") return json(400, { error: `Only captured payments can be refunded (this one is ${payment.status})` });

  if (!payment.is_mock) {
    return json(501, { error: "Real Razorpay refunds aren't wired up yet. Contact the Doctylia team to process this refund manually." });
  }

  await admin.from("payments").update({ status: "refunded", needs_refund: false }).eq("id", payment.id);
  if (payment.appointment_id) {
    await admin.from("appointments").update({ payment_status: "refunded" }).eq("id", payment.appointment_id);
  }

  return json(200, { ok: true, payment_id: payment.id, status: "refunded" });
});
