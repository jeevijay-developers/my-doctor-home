// doctylia-razorpay-design.md §2 — Super Admin clicks "Approve & Pay" on a
// pending payout; this triggers the actual RazorpayX transfer to the doctor's
// linked fund account (bank or UPI). RazorpayX requires separate account
// activation/KYC beyond regular Razorpay — until RAZORPAYX_* secrets are set
// this answers 501. Mock payouts (which mark money as paid without moving any) are
// honoured ONLY when PAYMENT_MODE=mock is set explicitly — a missing/misnamed secret
// in production must never turn into "processed" payouts.
import { createClient } from "npm:@supabase/supabase-js@2";
import { isExplicitMockMode, mockId, beginPaymentRequest, json } from "../_shared/paymentMode.ts";
import { hasSuperadminPermission } from "../_shared/superadminPermissions.ts";

const RAZORPAYX_KEY_ID = Deno.env.get("RAZORPAYX_KEY_ID");
const RAZORPAYX_KEY_SECRET = Deno.env.get("RAZORPAYX_KEY_SECRET");
const RAZORPAYX_ACCOUNT_NUMBER = Deno.env.get("RAZORPAYX_ACCOUNT_NUMBER"); // platform's RazorpayX current account
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
  const isAdmin = await hasSuperadminPermission(admin, uid, "payments.payout");
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

  const hasLiveKeys = Boolean(RAZORPAYX_KEY_ID && RAZORPAYX_KEY_SECRET && RAZORPAYX_ACCOUNT_NUMBER);

  if (isExplicitMockMode()) {
    // Simulated payout — settles immediately. The conditional UPDATE is also the claim:
    // only the request that flips pending -> processed continues.
    const razorpayPayoutId = mockId("payout");
    const { data: claimedMock } = await admin.from("payouts").update({
      status: "processed",
      razorpay_payout_id: razorpayPayoutId,
      razorpay_fund_account_id: bank.razorpay_fund_account_id,
      initiated_by: uid,
      is_mock: true,
    }).eq("id", payout_id).eq("status", "pending").select("id");
    if (!claimedMock || claimedMock.length === 0) return json(409, { error: "Payout is already being processed" });
    await admin.from("doctor_ledger").update({ paid: true }).eq("payout_id", payout_id);
    await admin.from("admin_audit_log").insert({
      admin_user_id: uid,
      action: "create_doctor_payout",
      target_table: "payouts",
      target_id: payout.id,
      details: {
        doctor_id: payout.doctor_id,
        month: payout.month,
        total_amount: payout.total_amount,
        razorpay_payout_id: razorpayPayoutId,
        is_mock: true,
      },
    });

    return json(200, { ok: true, payout_id, razorpay_payout_id: razorpayPayoutId, status: "processed", is_mock: true });
  }

  if (!hasLiveKeys) {
    return json(501, { error: "RazorpayX payouts pending — platform payout account not configured yet", payout_id });
  }

  // Atomic claim BEFORE any money moves: conditional UPDATE ... WHERE status='pending' RETURNING.
  // Two admins / a double click can no longer both send the payout.
  const { data: claimed, error: claimErr } = await admin.from("payouts").update({
    status: "processing",
    razorpay_fund_account_id: bank.razorpay_fund_account_id,
    initiated_by: uid,
    is_mock: false,
  }).eq("id", payout_id).eq("status", "pending").select("id");
  if (claimErr) return json(500, { error: "Could not start the payout" });
  if (!claimed || claimed.length === 0) return json(409, { error: "Payout is already being processed" });

  try {
    const basicAuth = btoa(`${RAZORPAYX_KEY_ID}:${RAZORPAYX_KEY_SECRET}`);
    const res = await fetch("https://api.razorpay.com/v1/payouts", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
        // RazorpayX de-duplicates on this header: a retry of the same payout can never pay twice.
        "X-Payout-Idempotency": `doctylia-payout-${payout.id}`,
      },
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
      if (res.status >= 500) {
        // Ambiguous: RazorpayX may or may not have created the payout. Keep the row claimed.
        await admin.from("payouts").update({ notes: "NEEDS_REVIEW: RazorpayX answered " + res.status + " — verify in the RazorpayX dashboard before retrying" }).eq("id", payout_id);
        return json(502, { error: "Payout status is uncertain — check RazorpayX before retrying" });
      }
      await admin.from("payouts").update({ status: "failed", failure_reason: result?.error?.description || "RazorpayX rejected the payout" }).eq("id", payout_id);
      return json(502, { error: result?.error?.description || "Payout creation failed" });
    }

    await admin.from("payouts").update({
      status: "processing",
      razorpay_payout_id: result.id,
    }).eq("id", payout_id);

    await admin.from("admin_audit_log").insert({
      admin_user_id: uid,
      action: "create_doctor_payout",
      target_table: "payouts",
      target_id: payout.id,
      details: {
        doctor_id: payout.doctor_id,
        month: payout.month,
        total_amount: payout.total_amount,
        razorpay_payout_id: result.id,
        is_mock: false,
      },
    });

    return json(200, { ok: true, payout_id, razorpay_payout_id: result.id, status: "processing" });
  } catch (e) {
    // The request may have reached RazorpayX. The row stays 'processing' (so it is not
    // retryable as 'pending') and is flagged for manual reconciliation instead.
    console.error("create-doctor-payout error:", e);
    await admin.from("payouts").update({ notes: "NEEDS_REVIEW: payout request outcome unknown (network error) — verify in RazorpayX before retrying" }).eq("id", payout_id);
    return json(500, { error: "Payout status is uncertain — check RazorpayX before retrying" });
  }
});
