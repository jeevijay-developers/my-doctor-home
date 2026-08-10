# Self-Service Plan Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ticket-based "Request Upgrade" flow with a doctor-initiated Razorpay payment that upgrades `plan_tier` immediately on verified payment, and give superadmin visibility into these payments.

**Architecture:** Mirror the existing patient-booking payment pipeline (`create-razorpay-order` → Razorpay Checkout/`MockCheckoutModal` → `verify-razorpay-payment`) as a parallel pipeline for plan payments (`create-plan-upgrade-order` → same checkout UI → `verify-plan-upgrade-payment`), writing to a new `plan_upgrade_payments` table instead of the patient-facing `payments` table. Same `_shared/paymentMode.ts` mock/live resolution throughout.

**Tech Stack:** React + TypeScript, Supabase (Postgres + Edge Functions/Deno), Razorpay Checkout JS, Vitest, Playwright.

## Global Constraints

- One-time payment only — no recurring billing, no Razorpay Subscriptions API, no renewal webhooks.
- `plan_upgrade_payments` is a new table, separate from `public.payments` (that table's shape represents a *patient* paying a *doctor*, not a doctor paying the platform).
- The edge functions never trust a client-supplied amount — price is computed server-side from a hardcoded `{ pro: 1499, premium: 3999 }` map (mirrors `DEFAULT_PLAN_PRICES` in `src/components/superadmin/SASubscriptions.tsx`, duplicated because Deno edge functions can't import from `src/`).
- Doctor identity is resolved from the caller's JWT (`Authorization: Bearer <token>`), never from a client-supplied id. A staff session (no `profiles` row of their own) resolves through `staff_members` to their assigned doctor, exactly like `staff_doctor_id()` does at the SQL level.
- `profiles.custom_plan_price` stays untouched — checkout always charges the standard published price.
- `RequestUpgradeDialog.tsx` and its test are deleted once nothing references them.

---

### Task 1: `plan_upgrade_payments` table + RLS

**Files:**
- Create: `supabase/migrations/20260810100000_plan_upgrade_payments.sql`

**Interfaces:**
- Produces: table `public.plan_upgrade_payments` with columns `id, doctor_id, from_tier, target_tier, amount, currency, status, razorpay_order_id, razorpay_payment_id, razorpay_signature, is_mock, raw_response, created_at, updated_at`. `status` uses the existing `public.payment_txn_status` enum (`created`/`authorized`/`captured`/`failed`/`refunded`).

- [ ] **Step 1: Write the migration**

```sql
-- Self-service doctor plan upgrade payments (Razorpay one-time payment).
-- Separate from public.payments, which represents a PATIENT paying a
-- DOCTOR for a booking (appointment_id/pending_booking shape) — this table
-- represents a DOCTOR paying the platform for a tier upgrade. Reuses
-- payment_txn_status (created/authorized/captured/failed/refunded) for
-- consistency with the booking payments table's own status values.
CREATE TABLE public.plan_upgrade_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_tier text NOT NULL,
  target_tier text NOT NULL CHECK (target_tier IN ('pro', 'premium')),
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  status public.payment_txn_status NOT NULL DEFAULT 'created',
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_signature text,
  is_mock boolean NOT NULL DEFAULT false,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_plan_upgrade_payments_doctor ON public.plan_upgrade_payments(doctor_id);

ALTER TABLE public.plan_upgrade_payments ENABLE ROW LEVEL SECURITY;

-- Doctors can view their own payment history/receipts. They can never
-- INSERT/UPDATE directly — only the service-role edge functions
-- (create-plan-upgrade-order, verify-plan-upgrade-payment) write here, so a
-- doctor can't forge a "captured" row and grant themselves a tier for free.
CREATE POLICY "Doctors view own plan payments" ON public.plan_upgrade_payments
  FOR SELECT USING (auth.uid() = doctor_id);

CREATE POLICY "Admins view all plan payments" ON public.plan_upgrade_payments
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
```

- [ ] **Step 2: Apply the migration**

Run: `mcp__supabase__apply_migration` with `name: "plan_upgrade_payments"` and the SQL above (or `npx supabase db push` if working purely from the CLI against the linked project).

- [ ] **Step 3: Verify the table and policies exist**

Run:
```
npx supabase db query --linked "SELECT tablename FROM pg_tables WHERE tablename = 'plan_upgrade_payments';"
npx supabase db query --linked "SELECT policyname FROM pg_policies WHERE tablename = 'plan_upgrade_payments';"
```
Expected: the table row, and two policy rows (`Doctors view own plan payments`, `Admins view all plan payments`).

- [ ] **Step 4: Regenerate Supabase types**

Run: `mcp__supabase__generate_typescript_types` and write the result to `src/integrations/supabase/types.ts` (overwrite the file with the regenerated content — this project keeps generated types checked in).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260810100000_plan_upgrade_payments.sql src/integrations/supabase/types.ts
git commit -m "feat: add plan_upgrade_payments table for self-service upgrade payments"
```

---

### Task 2: Extract `loadRazorpayCheckout` into a shared helper

**Files:**
- Create: `src/lib/razorpayCheckout.ts`
- Modify: `src/components/doctor/BookingWidget.tsx:26-43` (remove the inline copy, import the shared one)

**Interfaces:**
- Produces: `loadRazorpayCheckout(): Promise<void>` — lazily loads `https://checkout.razorpay.com/v1/checkout.js` once, cached across repeat calls. Consumed by `BookingWidget.tsx` (existing) and `UpgradeCheckoutDialog.tsx` (Task 5).

This is a pure refactor — no behavior change, so there's no new test to write. Verified by the existing test suite + typecheck staying green.

- [ ] **Step 1: Create the shared helper**

```typescript
// src/lib/razorpayCheckout.ts
// Lazily loads Razorpay's Checkout script once, shared across every caller
// that opens a real (non-mock) Razorpay Checkout in this app — currently
// the patient booking flow (BookingWidget.tsx) and the doctor plan-upgrade
// checkout (UpgradeCheckoutDialog.tsx).
let razorpayCheckoutPromise: Promise<void> | null = null;

export const loadRazorpayCheckout = (): Promise<void> => {
  if ((window as any).Razorpay) return Promise.resolve();
  if (razorpayCheckoutPromise) return razorpayCheckoutPromise;
  razorpayCheckoutPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      razorpayCheckoutPromise = null;
      reject(new Error("Failed to load the payment gateway"));
    };
    document.body.appendChild(script);
  });
  return razorpayCheckoutPromise;
};
```

- [ ] **Step 2: Update `BookingWidget.tsx` to import the shared helper**

Remove lines 26-43 (the inline `razorpayCheckoutPromise`/`loadRazorpayCheckout` definitions) and add the import alongside the other local imports near the top of the file:

```typescript
import { loadRazorpayCheckout } from "@/lib/razorpayCheckout";
```

Everything else in `BookingWidget.tsx` (the `await loadRazorpayCheckout();` call inside `openCheckout`) stays exactly as-is — only the definition moves.

- [ ] **Step 3: Typecheck and run the existing test suite**

Run: `npx tsc --noEmit -p .` — expect no errors.
Run: `npx vitest run` — expect the same baseline as before this change (no new failures; `BlogPage.test.tsx` failures are pre-existing and unrelated).

- [ ] **Step 4: Commit**

```bash
git add src/lib/razorpayCheckout.ts src/components/doctor/BookingWidget.tsx
git commit -m "refactor: extract loadRazorpayCheckout into a shared lib helper"
```

---

### Task 3: `create-plan-upgrade-order` edge function

**Files:**
- Create: `supabase/functions/create-plan-upgrade-order/index.ts`

**Interfaces:**
- Consumes: `_shared/paymentMode.ts`'s `resolvePaymentMode`, `mockId`, `corsHeaders`, `json` (all already defined, same shapes as used by `create-razorpay-order`).
- Produces: `POST` endpoint. Request body: `{ target_tier: "pro" | "premium" }`, `Authorization: Bearer <doctor-or-staff-jwt>` header required. Response `200`: `{ order_id: string, key_id: string, amount: number /* paise */, currency: "INR", payment_id: string /* plan_upgrade_payments.id */, mode: "mock" | "live" }`. Consumed by `UpgradeCheckoutDialog.tsx` (Task 5).

- [ ] **Step 1: Write the function**

```typescript
// supabase/functions/create-plan-upgrade-order/index.ts
// Step 1 of the self-service plan-upgrade flow: Settings/LockedFeatureCard
// "Upgrade" button -> create-order -> Razorpay Checkout (or the mock
// checkout in PAYMENT_MODE=mock) -> verify-plan-upgrade-payment. Mirrors
// create-razorpay-order's shape exactly, but writes to
// plan_upgrade_payments (a doctor paying the platform) instead of payments
// (a patient paying a doctor).
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolvePaymentMode, mockId, corsHeaders, json } from "../_shared/paymentMode.ts";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// DEFAULT_PLAN_PRICES in src/components/superadmin/SASubscriptions.tsx is a
// frontend-only TS constant with no DB backing, so this Deno function (which
// can't import from src/) carries its own copy — same duplication pattern
// already used for staffPermissions.ts. Never trust a client-supplied amount.
const TIER_PRICES: Record<string, number> = { pro: 1499, premium: 3999 };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
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

  // Resolve the caller to a doctor: either they ARE the doctor (uid matches
  // a profiles row), or they're an active staff member acting on behalf of
  // one (mirrors staff_doctor_id() at the SQL level) — either way the
  // resulting doctor_id is who actually gets upgraded and who actually pays.
  const { data: ownProfile } = await admin.from("profiles").select("id, plan_tier").eq("id", uid).maybeSingle();
  let doctorId: string;
  let fromTier: string;
  if (ownProfile) {
    doctorId = ownProfile.id;
    fromTier = ownProfile.plan_tier || "free";
  } else {
    const { data: staffRow } = await admin
      .from("staff_members").select("doctor_id, status").eq("id", uid).maybeSingle();
    if (!staffRow || staffRow.status !== "active") return json(403, { error: "Not authorized" });
    const { data: doctorProfile } = await admin.from("profiles").select("id, plan_tier").eq("id", staffRow.doctor_id).maybeSingle();
    if (!doctorProfile) return json(404, { error: "Doctor not found" });
    doctorId = doctorProfile.id;
    fromTier = doctorProfile.plan_tier || "free";
  }

  const amountRupees = TIER_PRICES[targetTier];
  const amountPaise = Math.round(amountRupees * 100);
  const hasLiveKeys = Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
  const mode = resolvePaymentMode(hasLiveKeys);

  if (mode === "mock") {
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
```

- [ ] **Step 2: Deploy the function**

Run: `mcp__supabase__deploy_edge_function` with name `create-plan-upgrade-order` and the file content above (no `config.toml` entry needed — leaving `verify_jwt` at its default `true` matches `add-doctor-bank-account`, the closest existing precedent for an authenticated-doctor edge function).

- [ ] **Step 3: Verify it live against a real doctor account**

Get a real session token for an existing test/dev doctor (e.g. via the `create-e2e-session` pattern used throughout this repo's `e2e/` specs), then:

```bash
curl -s -X POST "https://atmelijhxsjzjixhdfcu.supabase.co/functions/v1/create-plan-upgrade-order" \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"target_tier":"premium"}'
```

Expected (mock mode, since no live Razorpay keys are configured yet): a `200` JSON body with `mode: "mock"`, `amount: 399900`, and a `payment_id`. Then confirm the row exists:

```bash
npx supabase db query --linked "SELECT target_tier, amount, status, is_mock FROM public.plan_upgrade_payments ORDER BY created_at DESC LIMIT 1;"
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/create-plan-upgrade-order/index.ts
git commit -m "feat: add create-plan-upgrade-order edge function"
```

---

### Task 4: `verify-plan-upgrade-payment` edge function

**Files:**
- Create: `supabase/functions/verify-plan-upgrade-payment/index.ts`

**Interfaces:**
- Consumes: `_shared/paymentMode.ts`'s `hmacHex`, `MOCK_SIGNING_SECRET`, `corsHeaders`, `json`. The `plan_upgrade_payments` row created by Task 3 (`payment_id`).
- Produces: `POST` endpoint. Request body: `{ payment_id, razorpay_order_id, razorpay_payment_id, razorpay_signature }`. Response `200`: `{ ok: true, already_verified?: true, plan_tier: string }`. Consumed by `UpgradeCheckoutDialog.tsx` (Task 5).

- [ ] **Step 1: Write the function**

```typescript
// supabase/functions/verify-plan-upgrade-payment/index.ts
// Step 2 of the self-service plan-upgrade flow. Verifies the payment
// ourselves (never trust the client) using the real Razorpay secret for a
// live order or the local mock secret for a mock order (is_mock, set once
// at order-creation time and never re-derived from client input) — and
// ONLY on a verified signature do we flip profiles.plan_tier. Mirrors
// verify-razorpay-payment's structure and idempotency guard exactly.
import { createClient } from "npm:@supabase/supabase-js@2";
import { hmacHex, MOCK_SIGNING_SECRET, corsHeaders, json } from "../_shared/paymentMode.ts";

const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Bad request" });
  }
  const { payment_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body || {};
  if (!payment_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return json(400, { error: "payment_id, razorpay_order_id, razorpay_payment_id and razorpay_signature are required" });
  }

  const { data: payment, error: payErr } = await admin
    .from("plan_upgrade_payments")
    .select("id, doctor_id, target_tier, status, razorpay_order_id, is_mock")
    .eq("id", payment_id)
    .eq("razorpay_order_id", razorpay_order_id)
    .maybeSingle();
  if (payErr) return json(500, { error: payErr.message });
  if (!payment) return json(404, { error: "No matching order found" });

  // Idempotent: a retry after we already applied this upgrade.
  if (payment.status === "captured") {
    const { data: profile } = await admin.from("profiles").select("plan_tier").eq("id", payment.doctor_id).maybeSingle();
    return json(200, { ok: true, already_verified: true, plan_tier: profile?.plan_tier ?? payment.target_tier });
  }

  const expectedSecret = payment.is_mock ? MOCK_SIGNING_SECRET : RAZORPAY_KEY_SECRET;
  if (!payment.is_mock && !RAZORPAY_KEY_SECRET) {
    return json(501, { error: "Razorpay integration pending — platform API keys not configured" });
  }
  const expectedSignature = await hmacHex(expectedSecret!, `${razorpay_order_id}|${razorpay_payment_id}`);
  if (expectedSignature !== razorpay_signature) {
    await admin.from("plan_upgrade_payments").update({ status: "failed", razorpay_payment_id }).eq("id", payment.id);
    return json(400, { error: "Signature verification failed" });
  }

  await admin
    .from("plan_upgrade_payments")
    .update({ status: "captured", razorpay_payment_id, razorpay_signature })
    .eq("id", payment.id);

  await admin
    .from("profiles")
    .update({ plan_tier: payment.target_tier, plan_status: "active", trial_end: null })
    .eq("id", payment.doctor_id);

  return json(200, { ok: true, plan_tier: payment.target_tier });
});
```

- [ ] **Step 2: Deploy the function**

Run: `mcp__supabase__deploy_edge_function` with name `verify-plan-upgrade-payment` and the file content above.

- [ ] **Step 3: Verify it live, chained after Task 3's mock order**

Using the `payment_id`/`order_id` from Task 3's verification step, simulate a mock success the same way `mock-simulate-payment` does for bookings — call that existing shared function directly (it's generic over any order id, not booking-specific):

```bash
curl -s -X POST "https://atmelijhxsjzjixhdfcu.supabase.co/functions/v1/mock-simulate-payment" \
  -H "Content-Type: application/json" \
  -d '{"payment_id":"<payment_id from Task 3>","result":"success"}'
```

Take the `razorpay_order_id`/`razorpay_payment_id`/`razorpay_signature` from that response and call:

```bash
curl -s -X POST "https://atmelijhxsjzjixhdfcu.supabase.co/functions/v1/verify-plan-upgrade-payment" \
  -H "Content-Type: application/json" \
  -d '{"payment_id":"<payment_id>","razorpay_order_id":"<order_id>","razorpay_payment_id":"<payment_id from mock-simulate-payment>","razorpay_signature":"<signature>"}'
```

Expected: `200` with `{ ok: true, plan_tier: "premium" }`. Then confirm:

```bash
npx supabase db query --linked "SELECT plan_tier, plan_status, trial_end FROM public.profiles WHERE id = '<doctor id used in Task 3>';"
npx supabase db query --linked "SELECT status FROM public.plan_upgrade_payments WHERE id = '<payment_id>';"
```
Expected: `plan_tier = 'premium'`, `plan_status = 'active'`, `trial_end IS NULL`; payment `status = 'captured'`.

Clean up the test doctor's tier afterward if it was a shared dev account (reset `plan_tier` back to whatever it was before this verification, via the same superadmin manual-tier-change UI or a direct update).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/verify-plan-upgrade-payment/index.ts
git commit -m "feat: add verify-plan-upgrade-payment edge function"
```

---

### Task 5: `UpgradeCheckoutDialog` component

**Files:**
- Create: `src/components/admin/UpgradeCheckoutDialog.tsx`
- Test: `src/components/admin/UpgradeCheckoutDialog.test.tsx`

**Interfaces:**
- Consumes: `create-plan-upgrade-order` and `verify-plan-upgrade-payment` (Tasks 3-4) via `supabase.functions.invoke`; `loadRazorpayCheckout` (Task 2); `useProfile()` (`profile`, `refetch`); `usePlanAccess()` (`appointmentsCap`); `usePaymentMode()`; `edgeFunctionErrorMessage`; `getTierFeatures`, `TIER_LABELS`, `TIER_PRICES`, `DEFAULT_APPOINTMENT_CAP` from `@/lib/planFeatures`; `MockCheckoutModal`; `TestModeBadge`.
- Produces: `<UpgradeCheckoutDialog targetTier: "pro" | "premium", trigger: React.ReactNode />` — identical external prop shape to the `RequestUpgradeDialog` it replaces, so every call site swaps in without other changes. Consumed by `LockedFeatureCard.tsx` and `SettingsPage.tsx` (Task 6).

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/admin/UpgradeCheckoutDialog.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import UpgradeCheckoutDialog from "./UpgradeCheckoutDialog";

const invokeMock = vi.fn();
const refetchMock = vi.fn();

vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile: { plan_tier: "pro", plan_status: "active" }, loading: false, refetch: refetchMock }),
}));
vi.mock("@/hooks/usePlanAccess", () => ({
  usePlanAccess: () => ({ isPremium: false, appointmentsCap: 100, appointmentsUsed: 0, nearCap: false, loading: false }),
}));
vi.mock("@/hooks/usePaymentMode", () => ({
  usePaymentMode: () => ({ mode: "mock", isMock: true }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

describe("UpgradeCheckoutDialog", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    refetchMock.mockReset();
  });

  it("opens on trigger click and shows the target tier's price and features", () => {
    render(<UpgradeCheckoutDialog targetTier="premium" trigger={<button>Request Upgrade</button>} />);
    fireEvent.click(screen.getByRole("button", { name: "Request Upgrade" }));
    expect(screen.getByText(/online consultation/i)).toBeInTheDocument();
    expect(screen.getByText(/3999/)).toBeInTheDocument();
  });

  it("creates an order and verifies a successful mock payment, then refetches the profile", async () => {
    invokeMock.mockImplementation((fn: string) => {
      if (fn === "create-plan-upgrade-order") {
        return Promise.resolve({
          data: { order_id: "order_mock_1", key_id: "mock_key", amount: 399900, currency: "INR", payment_id: "pay-row-1", mode: "mock" },
          error: null,
        });
      }
      if (fn === "verify-plan-upgrade-payment") {
        return Promise.resolve({ data: { ok: true, plan_tier: "premium" }, error: null });
      }
      return Promise.resolve({ data: null, error: new Error("unexpected function " + fn) });
    });

    render(<UpgradeCheckoutDialog targetTier="premium" trigger={<button>Request Upgrade</button>} />);
    fireEvent.click(screen.getByRole("button", { name: "Request Upgrade" }));
    fireEvent.click(screen.getByRole("button", { name: /pay .* upgrade/i }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("create-plan-upgrade-order", { body: { target_tier: "premium" } }));

    // Mock mode opens MockCheckoutModal instead of real Razorpay Checkout —
    // simulate its "Payment Successful" button.
    await waitFor(() => expect(screen.getByText(/mock payment gateway/i)).toBeInTheDocument());

    invokeMock.mockImplementationOnce((fn: string) => {
      expect(fn).toBe("mock-simulate-payment");
      return Promise.resolve({
        data: { razorpay_order_id: "order_mock_1", razorpay_payment_id: "pay_mock_1", razorpay_signature: "sig_mock_1" },
        error: null,
      });
    });
    fireEvent.click(screen.getByRole("button", { name: /payment successful/i }));

    await waitFor(() => expect(refetchMock).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/admin/UpgradeCheckoutDialog.test.tsx`
Expected: FAIL — `Cannot find module './UpgradeCheckoutDialog'`.

- [ ] **Step 3: Write the component**

```typescript
// src/components/admin/UpgradeCheckoutDialog.tsx
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { usePlanAccess } from "@/hooks/usePlanAccess";
import { usePaymentMode } from "@/hooks/usePaymentMode";
import { toast } from "sonner";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import { loadRazorpayCheckout } from "@/lib/razorpayCheckout";
import { TIER_LABELS, TIER_PRICES, hasNoActivePlan, getTierFeatures, DEFAULT_APPOINTMENT_CAP } from "@/lib/planFeatures";
import MockCheckoutModal from "@/components/doctor/MockCheckoutModal";
import TestModeBadge from "@/components/shared/TestModeBadge";

type Order = { order_id: string; key_id: string; amount: number; currency: string; payment_id: string; mode: "mock" | "live" };
type CheckoutResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };

const UpgradeCheckoutDialog = ({
  targetTier,
  trigger,
}: {
  targetTier: "pro" | "premium";
  trigger: React.ReactNode;
}) => {
  const { profile, refetch } = useProfile();
  const { appointmentsCap } = usePlanAccess();
  const { isMock } = usePaymentMode();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [mockOpen, setMockOpen] = useState(false);

  const fromTier = profile?.plan_tier || "free";
  const fromStatus = profile?.plan_status || "trial";
  const noActivePlan = hasNoActivePlan(fromStatus);
  const toLabel = TIER_LABELS[targetTier];
  const features = getTierFeatures(targetTier, appointmentsCap || DEFAULT_APPOINTMENT_CAP);
  const price = TIER_PRICES[targetTier];

  const handleResult = async (o: Order, response: CheckoutResponse) => {
    const { data, error } = await supabase.functions.invoke("verify-plan-upgrade-payment", {
      body: {
        payment_id: o.payment_id,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      },
    });
    if (error || !data?.ok) {
      const message = await edgeFunctionErrorMessage(error, "Payment verification failed. Please contact support with your payment ID.");
      toast.error(message);
      setMockOpen(false);
      setBusy(false);
      return;
    }
    toast.success(`You're now on ${toLabel}!`);
    setMockOpen(false);
    setOrder(null);
    setBusy(false);
    setOpen(false);
    refetch();
  };

  const handleFailed = (message: string) => {
    toast.error(message);
    setMockOpen(false);
    setBusy(false);
  };

  const handleDismiss = () => {
    setMockOpen(false);
    setBusy(false);
  };

  const startCheckout = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("create-plan-upgrade-order", {
      body: { target_tier: targetTier },
    });
    if (error || !data?.order_id) {
      const message = await edgeFunctionErrorMessage(error, "Couldn't start checkout. Please try again shortly.");
      toast.error(message);
      setBusy(false);
      return;
    }
    const o: Order = data;
    setOrder(o);

    if (o.mode === "mock") {
      setMockOpen(true);
      return;
    }

    try {
      await loadRazorpayCheckout();
    } catch {
      toast.error("Couldn't load the payment gateway. Please try again.");
      setBusy(false);
      return;
    }

    const rzp = new (window as any).Razorpay({
      key: o.key_id,
      amount: o.amount,
      currency: o.currency,
      order_id: o.order_id,
      name: "Doctylia",
      description: `Upgrade to ${toLabel}`,
      theme: { color: "#1e3a8a" },
      handler: (response: CheckoutResponse) => handleResult(o, response),
      modal: { ondismiss: handleDismiss },
    });
    rzp.on("payment.failed", (resp: { error?: { description?: string } }) => {
      handleFailed(resp?.error?.description || "Your payment could not be completed. Please try again.");
    });
    rzp.open();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {noActivePlan ? `Reactivate on ${toLabel}` : `Upgrade to ${toLabel}`}
            {isMock && <TestModeBadge />}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Pay ₹{price}/month to {noActivePlan ? "reactivate" : "switch"} to {toLabel} — your plan updates immediately after payment.
          </p>
          <div>
            <p className="text-xs font-medium mb-1.5">{toLabel} includes:</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {features.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-royal" />{f}
                </li>
              ))}
            </ul>
          </div>
          <Button onClick={startCheckout} disabled={busy} className="w-full">
            {busy ? "Processing…" : `Pay ₹${price} & Upgrade`}
          </Button>
        </div>

        {order?.mode === "mock" && (
          <MockCheckoutModal
            open={mockOpen}
            paymentId={order.payment_id}
            amount={price}
            doctorName="Doctylia"
            onResult={(response) => handleResult(order, response)}
            onFailed={handleFailed}
            onDismiss={handleDismiss}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UpgradeCheckoutDialog;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/admin/UpgradeCheckoutDialog.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/UpgradeCheckoutDialog.tsx src/components/admin/UpgradeCheckoutDialog.test.tsx
git commit -m "feat: add UpgradeCheckoutDialog for self-service plan upgrade payments"
```

---

### Task 6: Wire `UpgradeCheckoutDialog` into call sites, delete `RequestUpgradeDialog`

**Files:**
- Modify: `src/components/admin/LockedFeatureCard.tsx`
- Modify: `src/components/admin/SettingsPage.tsx:147-150, 170-173` (the two `RequestUpgradeDialog` usages)
- Delete: `src/components/admin/RequestUpgradeDialog.tsx`
- Delete: `src/components/admin/RequestUpgradeDialog.test.tsx`
- Modify: `src/components/admin/LockedFeatureCard.test.tsx` (mock updates for the new dependency chain)

**Interfaces:**
- Consumes: `UpgradeCheckoutDialog` (Task 5) — same `targetTier`/`trigger` props `RequestUpgradeDialog` took, so this is a drop-in swap.

- [ ] **Step 1: Update `LockedFeatureCard.tsx`**

Replace the import and usage:

```typescript
import UpgradeCheckoutDialog from "./UpgradeCheckoutDialog";
```

```tsx
<UpgradeCheckoutDialog
  targetTier="premium"
  trigger={<Button className="bg-royal hover:bg-royal/90 mt-2">Upgrade Now</Button>}
/>
```

(Button label changes from "Request Upgrade" to "Upgrade Now" — there's no request/ticket anymore, so the copy should reflect that it's an immediate action.)

- [ ] **Step 2: Update `SettingsPage.tsx`**

Replace the import:

```typescript
import UpgradeCheckoutDialog from "./UpgradeCheckoutDialog";
```

Replace both usages (lines 147-150 and 170-173), swapping the component name and button label:

```tsx
{basic.showCta && (
  <UpgradeCheckoutDialog
    targetTier="pro"
    trigger={<Button size="sm" className="w-full mt-4 bg-royal hover:bg-royal/90">Upgrade Now</Button>}
  />
)}
```

```tsx
{premium.showCta && (
  <UpgradeCheckoutDialog
    targetTier="premium"
    trigger={<Button size="sm" className="w-full mt-4 bg-royal hover:bg-royal/90">Upgrade Now</Button>}
  />
)}
```

- [ ] **Step 3: Delete the old dialog and its test**

```bash
git rm src/components/admin/RequestUpgradeDialog.tsx src/components/admin/RequestUpgradeDialog.test.tsx
```

- [ ] **Step 4: Update `LockedFeatureCard.test.tsx`**

The existing test mocks `@/hooks/useProfile`/`@/hooks/usePlanAccess`/`@/integrations/supabase/client` for the old ticket-insert path. `UpgradeCheckoutDialog` needs `refetch` on the profile mock and `usePaymentMode`, and no longer calls `supabase.from(...).insert`:

```typescript
// src/components/admin/LockedFeatureCard.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import LockedFeatureCard from "./LockedFeatureCard";

vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile: { plan_tier: "pro", plan_status: "active" }, loading: false, refetch: vi.fn() }),
}));
vi.mock("@/hooks/usePlanAccess", () => ({
  usePlanAccess: () => ({ isPremium: false, appointmentsCap: 100, appointmentsUsed: 0, nearCap: false, loading: false }),
}));
vi.mock("@/hooks/usePaymentMode", () => ({
  usePaymentMode: () => ({ mode: "mock", isMock: true }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

describe("LockedFeatureCard", () => {
  it("renders the feature name and description, and opens the upgrade checkout dialog on click", () => {
    render(<LockedFeatureCard featureName="Billing & Invoices" description="Track revenue and generate GST invoices." />);

    expect(screen.getByText("Billing & Invoices")).toBeInTheDocument();
    expect(screen.getByText(/track revenue and generate gst invoices/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /upgrade now/i }));
    expect(screen.getByText(/upgrade to premium/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Typecheck and run the full test suite**

Run: `npx tsc --noEmit -p .` — expect no errors (confirms no remaining import of the deleted `RequestUpgradeDialog`).
Run: `npx vitest run` — expect the same baseline as always (only the pre-existing unrelated `BlogPage.test.tsx` failures).

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/LockedFeatureCard.tsx src/components/admin/SettingsPage.tsx src/components/admin/LockedFeatureCard.test.tsx
git rm src/components/admin/RequestUpgradeDialog.tsx src/components/admin/RequestUpgradeDialog.test.tsx
git commit -m "feat: swap RequestUpgradeDialog for self-service UpgradeCheckoutDialog"
```

---

### Task 7: Superadmin "Self-Service Upgrade Payments" panel

**Files:**
- Modify: `src/components/superadmin/SASubscriptions.tsx`

**Interfaces:**
- Consumes: `plan_upgrade_payments` table (Task 1), joined to `profiles` for doctor name/email.

- [ ] **Step 1: Add state and a load function for the payments panel**

Add alongside the existing `rows`/`dates`/`prices` state near the top of the component (after line 35's `pendingTierChange` state):

```typescript
const [upgradePayments, setUpgradePayments] = useState<any[]>([]);

const loadUpgradePayments = () =>
  supabase
    .from("plan_upgrade_payments")
    .select("id, doctor_id, from_tier, target_tier, amount, status, is_mock, created_at, profiles(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(50)
    .then(({ data }) => setUpgradePayments(data ?? []));
```

Update the existing `useEffect` (line 39) to also call it:

```typescript
useEffect(() => { load(); loadUpgradePayments(); }, []);
```

- [ ] **Step 2: Add the panel to the JSX**

Insert a new `Card` right after the existing doctors-table `</Card>` (immediately before the `<AlertDialog open={!!pendingTierChange}` block, i.e. right after line 252's closing `</Card>`):

```tsx
<Card>
  <CardContent className="p-4">
    <h3 className="font-semibold text-sm mb-3">Self-Service Upgrade Payments</h3>
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted-foreground border-b">
          <th className="p-2 font-medium">Doctor</th>
          <th className="p-2 font-medium">Upgrade</th>
          <th className="p-2 font-medium">Amount</th>
          <th className="p-2 font-medium">Status</th>
          <th className="p-2 font-medium">Date</th>
        </tr>
      </thead>
      <tbody>
        {upgradePayments.map((p) => (
          <tr key={p.id} className="border-b last:border-0">
            <td className="p-2">
              <div className="font-medium">{p.profiles?.full_name || "—"}</div>
              <div className="text-xs text-muted-foreground">{p.profiles?.email || ""}</div>
            </td>
            <td className="p-2 text-xs">{p.from_tier} → {p.target_tier}</td>
            <td className="p-2">₹{p.amount}</td>
            <td className="p-2">
              <Badge variant={p.status === "captured" ? "default" : p.status === "failed" ? "destructive" : "secondary"}>
                {p.status}
              </Badge>
              {p.is_mock && <Badge variant="outline" className="ml-1 text-[10px]">mock</Badge>}
            </td>
            <td className="p-2 text-xs">{new Date(p.created_at).toLocaleString()}</td>
          </tr>
        ))}
        {upgradePayments.length === 0 && (
          <tr><td colSpan={5} className="p-6 text-center text-muted-foreground text-sm">No self-service upgrade payments yet.</td></tr>
        )}
      </tbody>
    </table>
  </CardContent>
</Card>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p .` — expect no errors.

- [ ] **Step 4: Live-verify against the payment row created in Task 4**

Log in as a superadmin (or reuse an existing E2E superadmin session pattern from this repo's `e2e/` specs) and navigate to the Subscriptions page. Confirm the "Self-Service Upgrade Payments" panel shows the row created during Task 4's live verification, with the correct doctor name, `pro → premium` (or whatever tier path was used), amount, `captured` status, and a "mock" badge.

- [ ] **Step 5: Commit**

```bash
git add src/components/superadmin/SASubscriptions.tsx
git commit -m "feat: show self-service upgrade payments in superadmin Subscriptions page"
```

---

### Task 8: End-to-end live verification

**Files:** none (verification only — use a scratch `e2e/_tmp-*.spec.ts` file per this repo's established convention, delete it when done).

- [ ] **Step 1: Write and run a scratch Playwright spec**

Seed a disposable Pro-tier doctor (mirroring the pattern in `e2e/plan-gating.spec.ts`'s `createDisposableDoctor` helper), log in, navigate to a locked feature (e.g. `/admin/staff`), click "Upgrade Now", click "Pay ₹3999 & Upgrade", click MockCheckoutModal's "Payment Successful", and assert:
- A success toast appears.
- The dialog closes.
- Without a page reload, the previously-locked page now shows real content (the `LockedFeatureCard` is gone) — proving `refetch()` actually updated `isPremium` client-side.
- `profiles.plan_tier` for that doctor is `premium` in the DB.

Also verify the failure path: a fresh Pro-tier doctor, click Upgrade, click MockCheckoutModal's "Payment Failed" — assert an error toast, the dialog stays open or shows the error, and `plan_tier` is unchanged in the DB.

- [ ] **Step 2: Run it**

Run: `npx playwright test e2e/_tmp-verify-self-service-upgrade.spec.ts --reporter=list`
Expected: both scenarios pass.

- [ ] **Step 3: Run the full test suite one more time**

Run: `npx tsc --noEmit -p .` and `npx vitest run` — expect no regressions versus the established baseline.

- [ ] **Step 4: Clean up the scratch spec and any disposable test doctors/payment rows**

```bash
rm e2e/_tmp-verify-self-service-upgrade.spec.ts
```

Delete any disposable doctor fixtures created during verification (their cascade-deletes clean up `plan_upgrade_payments` rows too, since that table has `ON DELETE CASCADE` on `doctor_id`).

No commit needed for this task — it's verification only, nothing new is left in the tree.
