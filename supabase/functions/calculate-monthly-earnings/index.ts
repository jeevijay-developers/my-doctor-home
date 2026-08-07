// doctylia-razorpay-design.md §2 — Super Admin triggers this (manually from the
// Payments & Payouts screen for now; wire to a real cron once the platform
// Razorpay account is live) to roll up last month's captured-but-unpaid ledger
// entries into one pending payout per doctor.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function previousMonth() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
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

  let month: string;
  try {
    const body = await req.json().catch(() => ({}));
    month = body?.month || previousMonth();
  } catch {
    month = previousMonth();
  }

  const { data: rows, error } = await admin
    .from("doctor_ledger")
    .select("id, doctor_id, doctor_share")
    .eq("month", month)
    .eq("paid", false)
    .is("payout_id", null);
  if (error) return json(500, { error: error.message });

  const byDoctor = new Map<string, number>();
  for (const r of rows || []) {
    byDoctor.set(r.doctor_id, (byDoctor.get(r.doctor_id) || 0) + Number(r.doctor_share));
  }

  const results: { doctor_id: string; payout_id: string; total_amount: number }[] = [];
  for (const [doctor_id, newAmount] of byDoctor.entries()) {
    const { data: existing } = await admin
      .from("payouts")
      .select("id, status, total_amount")
      .eq("doctor_id", doctor_id)
      .eq("month", month)
      .maybeSingle();

    // A payout already exists for this doctor/month. Only fold new ledger
    // entries into it while it's still "pending" — never touch one that's
    // already processing/processed/failed; leave those for manual review.
    if (existing && existing.status !== "pending") {
      console.warn(`Skipping ${doctor_id}/${month}: payout already ${existing.status}`);
      continue;
    }

    const total_amount = +((existing?.total_amount ? Number(existing.total_amount) : 0) + newAmount).toFixed(2);
    const { data: payout, error: upErr } = await admin
      .from("payouts")
      .upsert({ id: existing?.id, doctor_id, month, total_amount, status: "pending" }, { onConflict: "doctor_id,month" })
      .select("id, total_amount")
      .single();
    if (upErr) {
      console.error("payout upsert failed for", doctor_id, upErr.message);
      continue;
    }
    await admin
      .from("doctor_ledger")
      .update({ payout_id: payout.id })
      .eq("doctor_id", doctor_id)
      .eq("month", month)
      .is("payout_id", null);
    results.push({ doctor_id, payout_id: payout.id, total_amount: Number(payout.total_amount) });
  }

  return json(200, { month, doctors: results.length, payouts: results });
});
