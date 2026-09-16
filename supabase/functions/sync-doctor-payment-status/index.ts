// Syncs a doctor's Razorpay linked account activation status from the
// Razorpay API into the profiles table. Call this after onboarding or
// periodically to catch accounts that became active/suspended server-side.
//
// Can be called by the doctor themselves or a superadmin.
// Also callable with no doctor_id to sync ALL doctors (superadmin only).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/paymentMode.ts";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID")?.trim();
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")?.trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function fetchAccountStatus(accountId: string) {
  const basicAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
  const res = await fetch(`https://api.razorpay.com/v2/accounts/${accountId}`, {
    headers: { Authorization: `Basic ${basicAuth}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.description || `Razorpay GET /accounts/${accountId} failed`);
  return data;
}

function mapActivationStatus(rzStatus: string | undefined): string {
  // Razorpay statuses: activated, needs_clarification, suspended, pending, rejected
  const map: Record<string, string> = {
    activated: "active",
    needs_clarification: "needs_clarification",
    suspended: "suspended",
    pending: "processing",
    rejected: "failed",
  };
  return map[rzStatus ?? ""] ?? "processing";
}

async function syncOne(doctorId: string, accountId: string, isMock: boolean) {
  // Mock accounts skip API call — they're always considered active
  if (isMock || !RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    await admin.from("profiles").update({
      razorpay_account_status: "active",
      razorpay_payment_enabled: true,
      razorpay_onboarding_error: null,
      razorpay_last_synced_at: new Date().toISOString(),
    }).eq("id", doctorId);
    return { doctorId, status: "active", payment_enabled: true };
  }

  const account = await fetchAccountStatus(accountId);
  const rzStatus = account?.activation_status;
  const status = mapActivationStatus(rzStatus);
  const paymentEnabled = status === "active";

  // Collect any requirements/clarification messages
  let errorMsg: string | null = null;
  if (status === "needs_clarification" && account?.requirements?.length) {
    errorMsg = account.requirements
      .map((r: any) => r.description || r.reason || JSON.stringify(r))
      .join("; ");
  }

  await admin.from("profiles").update({
    razorpay_account_status: status,
    razorpay_payment_enabled: paymentEnabled,
    razorpay_onboarding_error: errorMsg,
    razorpay_last_synced_at: new Date().toISOString(),
  }).eq("id", doctorId);

  return { doctorId, status, payment_enabled: paymentEnabled, requirements: account?.requirements };
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

  let body: { doctor_id?: string } = {};
  try { body = await req.json().catch(() => ({})); } catch { /* ok */ }

  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: uid, _role: "admin" });

  // Sync a specific doctor
  const doctorId = body.doctor_id || uid;
  if (doctorId !== uid && !isAdmin) {
    return json(403, { error: "Can only sync your own payment account" });
  }

  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("id, razorpay_account_id, razorpay_account_status")
    .eq("id", doctorId)
    .maybeSingle();
  if (profErr) return json(500, { error: profErr.message });
  if (!profile) return json(404, { error: "Doctor not found" });
  if (!profile.razorpay_account_id) {
    return json(400, { error: "Doctor does not have a Razorpay linked account yet" });
  }

  try {
    const isMock = profile.razorpay_account_id.includes("mock");
    const result = await syncOne(doctorId, profile.razorpay_account_id, isMock);
    return json(200, { ok: true, ...result });
  } catch (e) {
    console.error("sync-doctor-payment-status error:", (e as Error).message);
    return json(502, { error: (e as Error).message });
  }
});
