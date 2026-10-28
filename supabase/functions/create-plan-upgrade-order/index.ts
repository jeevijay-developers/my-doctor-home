// Step 1 of the self-service plan-upgrade flow: Settings/LockedFeatureCard
// "Upgrade" button -> create-order -> Razorpay Checkout (or the mock
// checkout in PAYMENT_MODE=mock) -> verify-plan-upgrade-payment. Mirrors
// create-razorpay-order's shape exactly, but writes to
// plan_upgrade_payments (a doctor paying the platform) instead of payments
// (a patient paying a doctor).
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolvePaymentMode, isExplicitMockMode, mockId, beginPaymentRequest, json } from "../_shared/paymentMode.ts";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Fallback prices in case platform_settings does not have keys seeded yet.
const FALLBACK_TIER_PRICES: Record<string, number> = { pro: 1499, premium: 3999 };

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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Bad request" });
  }
  const targetTier = body?.target_tier;
  if (targetTier !== "pro" && targetTier !== "premium") {
    return json(400, { error: "target_tier must be 'pro' or 'premium'" });
  }

  // Fetch dynamic default prices from platform_settings
  const { data: pricingRows } = await admin
    .from("platform_settings")
    .select("key, value")
    .in("key", ["pro_default_price", "premium_default_price"]);

  const tierPrices: Record<string, number> = { ...FALLBACK_TIER_PRICES };
  for (const row of pricingRows ?? []) {
    if (row.key === "pro_default_price" && row.value != null) {
      tierPrices.pro = Number(row.value);
    } else if (row.key === "premium_default_price" && row.value != null) {
      tierPrices.premium = Number(row.value);
    }
  }

  // Resolve the caller to a doctor: either they ARE the doctor (uid matches
  // a profiles row), or they're an active staff member acting on behalf of
  // one (mirrors staff_doctor_id() at the SQL level) — either way the
  // resulting doctor_id is who actually gets upgraded and who actually pays.
  const { data: ownProfile } = await admin.from("profiles").select("id, plan_tier, plan_status, custom_plan_price").eq("id", uid).maybeSingle();
  let doctorId: string;
  let fromTier: string;
  let planStatus: string | null;
  let customPrice: number | null = null;
  if (ownProfile) {
    doctorId = ownProfile.id;
    fromTier = ownProfile.plan_tier || "free";
    planStatus = ownProfile.plan_status ?? null;
    customPrice = ownProfile.custom_plan_price != null ? Number(ownProfile.custom_plan_price) : null;
  } else {
    const { data: staffRow } = await admin
      .from("staff_members").select("doctor_id, status, permissions").eq("id", uid).maybeSingle();
    if (!staffRow || staffRow.status !== "active") return json(403, { error: "Not authorized" });
    // Spending the doctor's money needs the explicit billing permission.
    if ((staffRow.permissions as Record<string, boolean> | null)?.["billing.manage"] !== true) {
      return json(403, { error: "You don't have permission to manage billing" });
    }
    const { data: doctorProfile } = await admin.from("profiles").select("id, plan_tier, plan_status, custom_plan_price").eq("id", staffRow.doctor_id).maybeSingle();
    if (!doctorProfile) return json(404, { error: "Doctor not found" });
    doctorId = doctorProfile.id;
    fromTier = doctorProfile.plan_tier || "free";
    planStatus = doctorProfile.plan_status ?? null;
    customPrice = doctorProfile.custom_plan_price != null ? Number(doctorProfile.custom_plan_price) : null;
  }

  // 'cancelled' is how Superadmin suspends an account; paying must not lift it.
  if (planStatus === "cancelled") {
    return json(403, { error: "This account is suspended. Please contact support." });
  }

  // One scheduled plan at a time: a second purchase would replace the first
  // and leave that payment paid-for but unused.
  const { data: existingPending } = await admin.from("pending_plans").select("id").eq("doctor_id", doctorId).limit(1);
  if (existingPending && existingPending.length > 0) {
    return json(409, { error: "You already have a plan scheduled. Cancel it from Settings before buying another." });
  }

  let amountRupees = tierPrices[targetTier];
  if (customPrice != null && (fromTier === targetTier || ((fromTier === "free" || fromTier === "trial") && targetTier === "pro"))) {
    amountRupees = customPrice;
  }

  // An approved custom plan (Superadmin → Plan Requests) outranks the manual
  // per-doctor price, but only for the tier it was approved on. The price is
  // read here, server-side, at order creation — never taken from the client.
  const { data: customPlan } = await admin
    .from("doctor_custom_plans")
    .select("base_tier, monthly_price, valid_from, valid_until, status")
    .eq("doctor_id", doctorId)
    .eq("status", "active")
    .maybeSingle();
  if (
    customPlan &&
    customPlan.base_tier === targetTier &&
    new Date(customPlan.valid_from) <= new Date() &&
    (!customPlan.valid_until || new Date(customPlan.valid_until) > new Date())
  ) {
    amountRupees = Number(customPlan.monthly_price);
  }
  // Garbage settings (NaN / negative / zero) must not become a free or broken order.
  if (!Number.isFinite(amountRupees) || amountRupees <= 0) {
    console.error("create-plan-upgrade-order: invalid price", { doctorId, targetTier, amountRupees });
    return json(500, { error: "Pricing is not configured correctly. Please contact support." });
  }
  const amountPaise = Math.round(amountRupees * 100);
  const hasLiveKeys = Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
  const mode = resolvePaymentMode(hasLiveKeys);

  if (mode === "mock") {
    // Mock upgrades are free upgrades: require PAYMENT_MODE=mock to be set on
    // purpose rather than falling into mock because a secret went missing.
    if (!isExplicitMockMode()) {
      return json(501, { error: "Online payment isn't active yet. Please try again shortly." });
    }
    const orderId = mockId("order");
    const { data: paymentRow, error: insErr } = await admin.from("plan_upgrade_payments").insert({
      doctor_id: doctorId,
      from_tier: fromTier,
      target_tier: targetTier,
      amount: amountRupees,
      currency: "INR",
      status: "created",
      razorpay_order_id: orderId,
      raw_response: { mock: true, order_id: orderId, amount: amountPaise },
      is_mock: true,
    }).select("id").single();
    if (insErr) return json(500, { error: insErr.message });

    return json(200, {
      order_id: orderId,
      key_id: "mock_key",
      amount: amountPaise,
      currency: "INR",
      payment_id: paymentRow.id,
      mode: "mock",
    });
  }

  if (!hasLiveKeys) {
    return json(501, { error: "Online payment isn't active yet. Please try again shortly." });
  }

  try {
    const basicAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        notes: { doctor_id: doctorId, target_tier: targetTier },
      }),
    });
    const order = await res.json();
    if (!res.ok) return json(502, { error: order?.error?.description || "Razorpay order creation failed" });

    const { data: paymentRow, error: insErr } = await admin.from("plan_upgrade_payments").insert({
      doctor_id: doctorId,
      from_tier: fromTier,
      target_tier: targetTier,
      amount: amountRupees,
      currency: order.currency || "INR",
      status: "created",
      razorpay_order_id: order.id,
      raw_response: order,
      is_mock: false,
    }).select("id").single();
    if (insErr) return json(500, { error: insErr.message });

    return json(200, {
      order_id: order.id,
      key_id: RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency,
      payment_id: paymentRow.id,
      mode: "live",
    });
  } catch (e) {
    console.error("create-plan-upgrade-order error:", e);
    return json(500, { error: (e as Error).message || "Internal error" });
  }
});
