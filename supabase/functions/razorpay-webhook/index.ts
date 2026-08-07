// Backup confirmation channel (doctylia-razorpay-design.md §1 & §5 #3).
// Razorpay calls this server-to-server for payment.captured / payment.failed /
// payout.processed / payout.failed so state stays correct even if the
// patient's browser never returns from Checkout (closed tab, network drop,
// etc.) or the payout webhook fires long after create-doctor-payout returned.
// Configure this URL + a webhook secret in the Razorpay dashboard once the
// platform account is live.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-razorpay-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RAZORPAY_WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function hmacHex(secret: string, message: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  if (!RAZORPAY_WEBHOOK_SECRET) return json(501, { error: "Webhook secret not configured" });

  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") || "";
  const expected = await hmacHex(RAZORPAY_WEBHOOK_SECRET, rawBody);
  if (expected !== signature) return json(400, { error: "Invalid webhook signature" });

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const event = payload?.event as string;
  try {
    if (event === "payment.captured" || event === "payment.failed") {
      const entity = payload.payload?.payment?.entity;
      const orderId = entity?.order_id;
      const paymentId = entity?.id;
      if (orderId) {
        const status = event === "payment.captured" ? "captured" : "failed";
        await admin
          .from("payments")
          .update({ status, razorpay_payment_id: paymentId })
          .eq("razorpay_order_id", orderId)
          .neq("status", "captured"); // don't clobber an already-verified capture
      }
    } else if (event === "payout.processed" || event === "payout.failed") {
      const entity = payload.payload?.payout?.entity;
      const payoutId = entity?.id;
      if (payoutId) {
        const status = event === "payout.processed" ? "processed" : "failed";
        const { data: payout } = await admin
          .from("payouts")
          .update({ status, failure_reason: event === "payout.failed" ? entity?.failure_reason || "Payout failed" : null })
          .eq("razorpay_payout_id", payoutId)
          .select("id")
          .maybeSingle();
        if (payout && status === "processed") {
          await admin.from("doctor_ledger").update({ paid: true }).eq("payout_id", payout.id);
        }
      }
    }
    return json(200, { received: true });
  } catch (e) {
    console.error("razorpay-webhook error:", e);
    // Still 200 so Razorpay doesn't hammer retries for a transient internal issue;
    // the periodic reconciliation (manual review in Super Admin) catches drift.
    return json(200, { received: true, warning: "processing_error" });
  }
});
