// Razorpay Route — Onboard a doctor as a Linked Account so they can receive
// direct patient payments via Route transfers. Creates: Linked Account →
// Stakeholder → Route Product → updates settlement (bank) config.
//
// Auth: the doctor themselves (onboarding their own account) or a superadmin
// (onboarding on behalf of a doctor).
//
// Mock mode: if RAZORPAY_KEY_ID/SECRET aren't set, generates mock IDs and
// sets status to 'active' immediately so the rest of the flow can be tested.
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolvePaymentMode, mockId, corsHeaders, json } from "../_shared/paymentMode.ts";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID")?.trim();
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")?.trim();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function razorpayFetch(path: string, method: string, body?: unknown) {
  const basicAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
  const res = await fetch(`https://api.razorpay.com/v2${path}`, {
    method,
    headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.description || `Razorpay ${path} failed (${res.status})`);
  return data;
}

type OnboardPayload = {
  doctor_id?: string; // superadmin can onboard on behalf
  business_name: string;
  legal_business_name?: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  pan?: string;
  gst?: string;
  // Bank details for settlement
  account_number: string;
  ifsc: string;
  beneficiary_name: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Missing authorization" });
  const scoped = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: claims } = await scoped.auth.getClaims(authHeader.slice(7));
  const uid = claims?.claims?.sub as string | undefined;
  if (!uid) return json(401, { error: "Invalid token" });

  let body: Partial<OnboardPayload>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Bad request" });
  }

  // Determine the doctor to onboard — own account, or superadmin onboarding
  // on behalf of a doctor.
  let doctorId = uid;
  if (body.doctor_id && body.doctor_id !== uid) {
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: uid, _role: "admin" });
    if (!isAdmin) return json(403, { error: "Only the doctor or a superadmin can onboard a payment account" });
    doctorId = body.doctor_id;
  }

  // Validate required fields
  if (!body.business_name || !body.contact_name || !body.contact_email || !body.contact_phone) {
    return json(400, { error: "business_name, contact_name, contact_email, and contact_phone are required" });
  }
  if (!body.account_number || !body.ifsc || !body.beneficiary_name) {
    return json(400, { error: "Bank details (account_number, ifsc, beneficiary_name) are required" });
  }

  // Check doctor exists and isn't already onboarded
  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("id, razorpay_account_id, razorpay_account_status")
    .eq("id", doctorId)
    .maybeSingle();
  if (profErr) return json(500, { error: profErr.message });
  if (!profile) return json(404, { error: "Doctor profile not found" });
  if (profile.razorpay_account_id && profile.razorpay_account_status === "active") {
    return json(400, { error: "Doctor already has an active Razorpay linked account" });
  }

  const hasLiveKeys = Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
  const mode = resolvePaymentMode(hasLiveKeys);

  // ---- MOCK MODE ----
  if (mode === "mock") {
    const accountId = mockId("acc");
    const stakeholderId = mockId("sth");
    const productId = mockId("prod");

    await admin.from("profiles").update({
      razorpay_account_id: accountId,
      razorpay_stakeholder_id: stakeholderId,
      razorpay_product_id: productId,
      razorpay_account_status: "active",
      razorpay_payment_enabled: true,
      razorpay_onboarding_error: null,
      razorpay_last_synced_at: new Date().toISOString(),
    }).eq("id", doctorId);

    return json(200, {
      ok: true,
      account_id: accountId,
      status: "active",
      payment_enabled: true,
      is_mock: true,
      note: "Linked account created in TEST MODE. No real Razorpay onboarding happened.",
    });
  }

  // ---- LIVE MODE ----
  if (!hasLiveKeys) {
    return json(501, { error: "Razorpay Route integration pending — platform API keys not configured" });
  }

  try {
    // Step 1: Create Linked Account
    const account = await razorpayFetch("/accounts", "POST", {
      email: body.contact_email,
      phone: body.contact_phone,
      type: "route",
      legal_business_name: body.legal_business_name || body.business_name,
      business_type: "individual",
      legal_info: body.pan ? { pan: body.pan, gst: body.gst || undefined } : undefined,
      profile: {
        category: "healthcare",
        subcategory: "clinic",
        addresses: {
          registered: {
            street1: "As per KYC",
            city: "As per KYC",
            state: "As per KYC",
            postal_code: 110001,
            country: "IN",
          },
        },
      },
      contact_name: body.contact_name,
      notes: { doctor_id: doctorId, platform: "doctylia" },
    });

    const accountId = account.id;

    // Step 2: Create Stakeholder
    const stakeholder = await razorpayFetch(`/accounts/${accountId}/stakeholders`, "POST", {
      name: body.contact_name,
      phone: { primary: body.contact_phone },
      email: body.contact_email,
      ...(body.pan ? { kyc: { pan: body.pan } } : {}),
      notes: { doctor_id: doctorId },
    });

    // Step 3: Request Route product
    const product = await razorpayFetch(`/accounts/${accountId}/products`, "POST", {
      product_name: "route",
      requested_at: Math.floor(Date.now() / 1000),
    });

    // Step 4: Update product with bank settlement details
    try {
      await razorpayFetch(`/accounts/${accountId}/products/${product.id}`, "PATCH", {
        settlements: {
          account_number: body.account_number,
          ifsc_code: body.ifsc,
          beneficiary_name: body.beneficiary_name,
        },
      });
    } catch (e) {
      // Settlement config may fail if KYC isn't done yet — still save the account
      console.error("Settlement config failed (non-fatal):", (e as Error).message);
    }

    // Save to DB
    const activationStatus = account.activation_status || "submitted";
    await admin.from("profiles").update({
      razorpay_account_id: accountId,
      razorpay_stakeholder_id: stakeholder.id,
      razorpay_product_id: product.id,
      razorpay_account_status: activationStatus === "activated" ? "active" : "processing",
      razorpay_payment_enabled: activationStatus === "activated",
      razorpay_onboarding_error: null,
      razorpay_last_synced_at: new Date().toISOString(),
    }).eq("id", doctorId);

    return json(200, {
      ok: true,
      account_id: accountId,
      stakeholder_id: stakeholder.id,
      product_id: product.id,
      status: activationStatus === "activated" ? "active" : "processing",
      payment_enabled: activationStatus === "activated",
    });
  } catch (e) {
    console.error("onboard-doctor-payment error:", (e as Error).message);

    // Save failure state so doctor sees the error
    await admin.from("profiles").update({
      razorpay_account_status: "failed",
      razorpay_payment_enabled: false,
      razorpay_onboarding_error: (e as Error).message,
      razorpay_last_synced_at: new Date().toISOString(),
    }).eq("id", doctorId);

    return json(502, { error: (e as Error).message || "Failed to create Razorpay linked account" });
  }
});
