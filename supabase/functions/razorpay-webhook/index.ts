// Razorpay webhook handler — extended for Route transfer events.
// Handles: payment.captured, payment.failed, transfer.processed,
// transfer.failed, transfer.reversed — all idempotently via webhook_events.
//
// Mock mode: accepts simulated webhook calls signed with the local mock
// secret. Which secret applies is always derived from OUR own is_mock flag
// on the referenced payments/transfers row — never from the incoming payload.
import { createClient } from "npm:@supabase/supabase-js@2";
import { hmacHex, MOCK_SIGNING_SECRET } from "../_shared/paymentMode.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-razorpay-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RAZORPAY_WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET")?.trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") || "";

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const event = payload?.event as string;
  const eventId = payload?.id as string;

  // --- Idempotency check via webhook_events table ---
  if (eventId) {
    const { data: existing } = await admin
      .from("webhook_events")
      .select("id, status")
      .eq("razorpay_event_id", eventId)
      .maybeSingle();

    if (existing?.status === "processed") {
      return json(200, { received: true, note: "already_processed" });
    }

    // Insert or skip if duplicate (race condition safety)
    await admin.from("webhook_events").upsert({
      razorpay_event_id: eventId,
      event_type: event,
      payload,
      status: "received",
    }, { onConflict: "razorpay_event_id", ignoreDuplicates: true });
  }

  const paymentEntity = payload.payload?.payment?.entity;
  const transferEntity = payload.payload?.transfer?.entity;
  const payoutEntity = payload.payload?.payout?.entity;

  // Determine which secret to use based on OUR own record — never trust client
  let isMock = false;
  if (paymentEntity?.order_id) {
    const { data } = await admin.from("payments").select("is_mock").eq("razorpay_order_id", paymentEntity.order_id).maybeSingle();
    isMock = Boolean(data?.is_mock);
  } else if (transferEntity?.id) {
    const { data } = await admin.from("transfers").select("is_mock").eq("razorpay_transfer_id", transferEntity.id).maybeSingle();
    isMock = Boolean(data?.is_mock);
  } else if (payoutEntity?.id) {
    const { data } = await admin.from("payouts").select("is_mock").eq("razorpay_payout_id", payoutEntity.id).maybeSingle();
    isMock = Boolean(data?.is_mock);
  }

  const secret = isMock ? MOCK_SIGNING_SECRET : RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return json(501, { error: "Webhook secret not configured" });

  const expected = await hmacHex(secret, rawBody);
  if (expected !== signature) return json(400, { error: "Invalid webhook signature" });

  try {
    // ── payment.captured ──────────────────────────────────────────────────────
    if (event === "payment.captured") {
      const orderId = paymentEntity?.order_id;
      const paymentId = paymentEntity?.id;
      if (orderId) {
        await admin
          .from("payments")
          .update({ status: "captured", razorpay_payment_id: paymentId })
          .eq("razorpay_order_id", orderId)
          .neq("status", "captured");
      }
    }

    // ── payment.failed ────────────────────────────────────────────────────────
    else if (event === "payment.failed") {
      const orderId = paymentEntity?.order_id;
      const paymentId = paymentEntity?.id;
      if (orderId) {
        await admin
          .from("payments")
          .update({ status: "failed", razorpay_payment_id: paymentId, transfer_status: null })
          .eq("razorpay_order_id", orderId)
          .eq("status", "created");
        // Mark any pending transfers for this order as failed too
        const { data: payRow } = await admin.from("payments").select("id").eq("razorpay_order_id", orderId).maybeSingle();
        if (payRow) {
          await admin.from("transfers").update({ status: "failed", error: "Payment failed" }).eq("payment_id", payRow.id).eq("status", "pending");
        }
      }
    }

    // ── transfer.processed ────────────────────────────────────────────────────
    // Funds have been successfully routed to the doctor's linked account
    else if (event === "transfer.processed") {
      const transferId = transferEntity?.id;
      const transferAccountId = transferEntity?.recipient; // linked account id
      if (transferId) {
        const { data: transfer } = await admin
          .from("transfers")
          .update({
            status: "processed",
            processed_at: new Date().toISOString(),
          })
          .eq("razorpay_transfer_id", transferId)
          .neq("status", "processed") // idempotent
          .select("id, payment_id, doctor_id, appointment_id")
          .maybeSingle();

        if (transfer) {
          // Mirror on payments table for quick reads
          await admin.from("payments").update({ transfer_status: "processed" }).eq("id", transfer.payment_id);

          // Safety invariant: verify the linked account matches the doctor's account
          const { data: doctorProfile } = await admin
            .from("profiles")
            .select("razorpay_account_id")
            .eq("id", transfer.doctor_id)
            .maybeSingle();

          if (doctorProfile?.razorpay_account_id && transferAccountId &&
              doctorProfile.razorpay_account_id !== transferAccountId) {
            console.error("ROUTING INVARIANT VIOLATED: transfer account mismatch!", {
              transfer_id: transferId,
              expected: doctorProfile.razorpay_account_id,
              got: transferAccountId,
            });
            // Alert logged — do NOT silently continue
          }
        }
      }
    }

    // ── transfer.failed ───────────────────────────────────────────────────────
    // Payment was captured but Route transfer to doctor failed
    else if (event === "transfer.failed") {
      const transferId = transferEntity?.id;
      if (transferId) {
        const { data: transfer } = await admin
          .from("transfers")
          .update({
            status: "failed",
            error: transferEntity?.error_description || "Transfer failed",
          })
          .eq("razorpay_transfer_id", transferId)
          .select("id, payment_id, appointment_id")
          .maybeSingle();

        if (transfer) {
          await admin.from("payments").update({ transfer_status: "failed" }).eq("id", transfer.payment_id);
          // Log for superadmin reconciliation — appointment stays confirmed
          // (patient paid; admin must retry transfer or refund manually)
          console.error("TRANSFER FAILED — needs superadmin review:", {
            transfer_id: transferId,
            payment_id: transfer.payment_id,
            appointment_id: transfer.appointment_id,
          });
        }
      }
    }

    // ── transfer.reversed ─────────────────────────────────────────────────────
    // Transfer was reversed (e.g. due to refund)
    else if (event === "transfer.reversed") {
      const transferId = transferEntity?.id;
      if (transferId) {
        const { data: transfer } = await admin
          .from("transfers")
          .update({
            status: "reversed",
            reversed_at: new Date().toISOString(),
          })
          .eq("razorpay_transfer_id", transferId)
          .select("id, payment_id")
          .maybeSingle();

        if (transfer) {
          await admin.from("payments").update({ transfer_status: "reversed" }).eq("id", transfer.payment_id);
        }
      }
    }

    // ── payout.processed / payout.failed (legacy RazorpayX payouts) ──────────
    else if (event === "payout.processed" || event === "payout.failed") {
      const payoutId = payoutEntity?.id;
      if (payoutId) {
        const status = event === "payout.processed" ? "processed" : "failed";
        const { data: payout } = await admin
          .from("payouts")
          .update({ status, failure_reason: event === "payout.failed" ? payoutEntity?.failure_reason || "Payout failed" : null })
          .eq("razorpay_payout_id", payoutId)
          .select("id")
          .maybeSingle();
        if (payout && status === "processed") {
          await admin.from("doctor_ledger").update({ paid: true }).eq("payout_id", payout.id);
        }
      }
    }

    // Mark webhook as processed
    if (eventId) {
      await admin.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString() })
        .eq("razorpay_event_id", eventId);
    }

    return json(200, { received: true });
  } catch (e) {
    console.error("razorpay-webhook error:", e);
    if (eventId) {
      await admin.from("webhook_events").update({ status: "failed", error: (e as Error).message })
        .eq("razorpay_event_id", eventId);
    }
    // Return 200 so Razorpay doesn't hammer retries for transient internal issues
    return json(200, { received: true, warning: "processing_error" });
  }
});
