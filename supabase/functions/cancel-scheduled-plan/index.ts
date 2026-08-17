import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/paymentMode.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
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

  // Find the pending plan for this doctor
  const { data: pendingPlan, error: findErr } = await admin
    .from("pending_plans")
    .select("id, doctor_id, payment_id, target_tier")
    .eq("id", pending_plan_id)
    .eq("doctor_id", user.id)
    .maybeSingle();

  if (findErr) return json(500, { error: findErr.message });
  if (!pendingPlan) return json(404, { error: "Pending plan not found or already processed" });

  // Update payment status to refunded
  if (pendingPlan.payment_id) {
    await admin
      .from("plan_upgrade_payments")
      .update({ status: "refunded", updated_at: new Date().toISOString() })
      .eq("id", pendingPlan.payment_id);
  }

  // Delete pending plan row
  const { error: delErr } = await admin
    .from("pending_plans")
    .delete()
    .eq("id", pendingPlan.id);

  if (delErr) return json(500, { error: delErr.message });

  // Audit log
  await admin.from("admin_audit_log").insert({
    doctor_id: user.id,
    action: "cancelled_scheduled_plan",
    details: {
      target_tier: pendingPlan.target_tier,
      payment_id: pendingPlan.payment_id,
      cancelled_at: new Date().toISOString(),
    },
    actor_id: user.id,
  });

  return json(200, { ok: true, message: "Scheduled plan cancelled successfully and payment marked for refund." });
});
