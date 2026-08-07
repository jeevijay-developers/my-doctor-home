// doctylia-razorpay-design.md §2 — Super Admin clicks "Approve & Pay" on a
// pending payout; this triggers the actual RazorpayX transfer to the doctor's
// linked fund account (bank or UPI). RazorpayX requires separate account
// activation/KYC beyond regular Razorpay — until RAZORPAYX_* secrets are set
// this returns 501 and the payout stays "pending" for the admin to retry later.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RAZORPAYX_KEY_ID = Deno.env.get("RAZORPAYX_KEY_ID");
const RAZORPAYX_KEY_SECRET = Deno.env.get("RAZORPAYX_KEY_SECRET");
const RAZORPAYX_ACCOUNT_NUMBER = Deno.env.get("RAZORPAYX_ACCOUNT_NUMBER"); // platform's RazorpayX current account
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

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

  let payout_id: string | undefined;
  try {
    ({ payout_id } = await req.json());
  } catch {
    return json(400, { error: "Bad request" });
  }
  if (!payout_id) return json(400, { error: "payout_id is required" });

  const { data: payout, error: payoutErr } = await admin
    .from("payouts").select("id, doctor_id, month, total_amount, status").eq("id", payout_id).maybeSingle();
  if (payoutErr) return json(500, { error: payoutErr.message });
  if (!payout) return json(404, { error: "Payout not found" });
  if (payout.status !== "pending") return json(400, { error: `Payout is already ${payout.status}` });

  const { data: bank, error: bankErr } = await admin
    .from("doctor_bank_accounts").select("razorpay_fund_account_id, verified").eq("doctor_id", payout.doctor_id).maybeSingle();
  if (bankErr) return json(500, { error: bankErr.message });
  if (!bank?.razorpay_fund_account_id) {
    return json(400, { error: "Doctor has not completed bank/UPI setup (or it isn't linked to Razorpay yet)" });
  }

  if (!RAZORPAYX_KEY_ID || !RAZORPAYX_KEY_SECRET || !RAZORPAYX_ACCOUNT_NUMBER) {
    return json(501, { error: "RazorpayX payouts pending — platform payout account not configured yet", payout_id });
  }

  try {
    const basicAuth = btoa(`${RAZORPAYX_KEY_ID}:${RAZORPAYX_KEY_SECRET}`);
    const res = await fetch("https://api.razorpay.com/v1/payouts", {
      method: "POST",
      headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        account_number: RAZORPAYX_ACCOUNT_NUMBER,
        fund_account_id: bank.razorpay_fund_account_id,
        amount: Math.round(Number(payout.total_amount) * 100),
        currency: "INR",
        mode: "IMPS",
        purpose: "payout",
        queue_if_low_balance: true,
        reference_id: payout.id,
        narration: `Doctylia payout ${payout.month}`,
      }),
    });
    const result = await res.json();
    if (!res.ok) {
      await admin.from("payouts").update({ status: "failed", failure_reason: result?.error?.description || "RazorpayX rejected the payout" }).eq("id", payout_id);
      return json(502, { error: result?.error?.description || "Payout creation failed" });
    }

    await admin.from("payouts").update({
      status: "processing",
      razorpay_payout_id: result.id,
      razorpay_fund_account_id: bank.razorpay_fund_account_id,
      initiated_by: uid,
    }).eq("id", payout_id);

    return json(200, { ok: true, payout_id, razorpay_payout_id: result.id, status: "processing" });
  } catch (e) {
    console.error("create-doctor-payout error:", e);
    return json(500, { error: (e as Error).message || "Internal error" });
  }
});
