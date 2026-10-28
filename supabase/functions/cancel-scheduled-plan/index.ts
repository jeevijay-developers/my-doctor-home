import { createClient } from "npm:@supabase/supabase-js@2";
import { beginPaymentRequest, json } from "../_shared/paymentMode.ts";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  const preflight = beginPaymentRequest(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "Missing authorization header" });

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !user) return json(401, { error: "Unauthorized" });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Bad request" });
  }

  const { pending_plan_id } = body || {};
  if (!pending_plan_id) {
    return json(400, { error: "pending_plan_id is required" });
  }

  // Claim the pending plan first (delete returns the row), so two concurrent
  // cancels can't both refund, and the cron can't activate it mid-cancel.
  const { data: claimed, error: claimErr } = await admin
    .from("pending_plans")
    .delete()
    .eq("id", pending_plan_id)
    .eq("doctor_id", user.id)
    .select("id, doctor_id, payment_id, target_tier, activation_date");
  if (claimErr) return json(500, { error: claimErr.message });
  const pendingPlan = claimed?.[0];
  if (!pendingPlan) return json(404, { error: "Pending plan not found or already processed" });

  // Put the scheduled plan back if the refund can't be completed, so the doctor
  // never ends up with a refunded payment AND a plan that still activates.
  const restore = async () => {
    await admin.from("pending_plans").insert({
      id: pendingPlan.id,
      doctor_id: pendingPlan.doctor_id,
      target_tier: pendingPlan.target_tier,
      activation_date: pendingPlan.activation_date,
      payment_id: pendingPlan.payment_id,
    });
  };

  let refunded = false;
  if (pendingPlan.payment_id) {
    const { data: payment } = await admin
      .from("plan_upgrade_payments")
      .select("id, status, is_mock, amount, razorpay_payment_id")
      .eq("id", pendingPlan.payment_id)
      .maybeSingle();

    if (payment && payment.status === "captured") {
      if (!payment.is_mock) {
        if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET || !payment.razorpay_payment_id) {
          await restore();
          return json(501, { error: "Refunds are unavailable right now. Please contact support." });
        }
        try {
          const r = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(payment.razorpay_payment_id)}/refund`, {
            method: "POST",
            headers: {
              Authorization: "Basic " + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`),
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              amount: Math.round(Number(payment.amount) * 100),
              notes: { reason: "Scheduled plan cancelled by doctor", pending_plan_id: pendingPlan.id },
            }),
          });
          const out = await r.json().catch(() => ({}));
          if (!r.ok) {
            console.error("cancel-scheduled-plan: razorpay refund failed", out);
            await restore();
            return json(502, { error: out?.error?.description || "The refund could not be processed. Your plan was not cancelled." });
          }
        } catch (e) {
          console.error("cancel-scheduled-plan: razorpay refund error", e);
          await restore();
          return json(502, { error: "The refund could not be processed. Your plan was not cancelled." });
        }
        refunded = true;
      }
      await admin
        .from("plan_upgrade_payments")
        .update({ status: "refunded", updated_at: new Date().toISOString() })
        .eq("id", payment.id);
    }
  }

  // Audit log (admin_audit_log has admin_user_id / target_table / target_id)
  const { error: auditErr } = await admin.from("admin_audit_log").insert({
    admin_user_id: user.id,
    action: "cancelled_scheduled_plan",
    target_table: "pending_plans",
    target_id: pendingPlan.id,
    details: {
      doctor_id: user.id,
      target_tier: pendingPlan.target_tier,
      payment_id: pendingPlan.payment_id,
      refunded,
      cancelled_at: new Date().toISOString(),
    },
  });
  if (auditErr) console.error("cancel-scheduled-plan: audit insert failed", auditErr);

  return json(200, {
    ok: true,
    refunded,
    message: refunded
      ? "Scheduled plan cancelled. Your refund has been initiated and usually reaches you in 5-7 working days."
      : "Scheduled plan cancelled.",
  });
});
