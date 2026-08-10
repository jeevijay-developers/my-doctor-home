# Self-Service Plan Upgrade — Design

## Problem

Today, "Upgrade to Premium" (shown via `LockedFeatureCard` on gated pages, and both plan cards in Settings → Subscription) opens `RequestUpgradeDialog`, which files a `support_tickets` row with `metadata.upgrade_request` and tells the doctor "our team will reach out to arrange payment." A superadmin has to notice the ticket, contact the doctor out of band, collect payment somehow, then manually flip `plan_tier` via the dropdown in `SASubscriptions.tsx`.

The doctor should instead be able to pay for and receive the upgrade immediately, with no human in the loop.

## Goals

- Doctor clicks Upgrade → pays through Razorpay (real or mock, matching the platform's existing `PAYMENT_MODE` convention) → `plan_tier` updates immediately on verified payment.
- One-time payment, not a recurring subscription — the resulting state (`plan_tier` set, `plan_status='active'`, `trial_end=null`) is identical to what superadmin's manual dropdown already produces today. No new recurring-billing infrastructure, no webhooks for renewal.
- Applies uniformly to every existing `RequestUpgradeDialog` call site: locked-feature upgrade prompts, the Pro card's CTA (used for reactivating an expired/cancelled doctor onto Pro), and the Premium card's CTA (upgrade from Pro, or reactivate directly onto Premium).
- Superadmin regains visibility into these payments (previously implicit in the ticket), without losing the ability to manually override any doctor's tier.

## Non-goals

- No true recurring/auto-renewing billing (Razorpay Subscriptions API, dunning, renewal webhooks).
- No wiring of `profiles.custom_plan_price` into this checkout — it isn't used in any doctor-facing price display today, and threading it through is a separate, unrequested feature. Checkout always charges the standard published price (`TIER_PRICES.pro` / `TIER_PRICES.premium` from `src/lib/planFeatures.ts`).
- No changes to the patient-facing booking payment flow beyond extracting one small shared helper (see below).

## Architecture

Mirror the existing patient-booking payment pipeline (`create-razorpay-order` → Razorpay Checkout or `MockCheckoutModal` → `verify-razorpay-payment`) exactly, as a parallel pipeline for plan payments instead of appointment payments. Same `_shared/paymentMode.ts` mode resolution, same mock-signature-via-HMAC pattern, same `payment_txn_status` enum (`created` → `captured`/`failed`) for consistency with the rest of the payments code.

### New table: `plan_upgrade_payments`

Separate from `public.payments` because that table's shape (`appointment_id`, `pending_booking` holding a *patient's* booking details) represents a patient paying a doctor — semantically wrong for a doctor paying the platform. Mixing the two would also risk corrupting `SAPayments.tsx`/`SABilling.tsx` revenue aggregates, which assume every `payments` row is a patient transaction.

```sql
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

ALTER TABLE public.plan_upgrade_payments ENABLE ROW LEVEL SECURITY;

-- Doctors can see their own payment history/receipts, never write directly
-- (only the service-role edge functions below write to this table — a
-- doctor forging a client-side insert/update can't grant themselves a tier).
CREATE POLICY "Doctors view own plan payments" ON public.plan_upgrade_payments
  FOR SELECT USING (auth.uid() = doctor_id);

-- Superadmin visibility (mirrors the existing admin-read pattern used for
-- other platform-wide tables such as payments/profiles).
CREATE POLICY "Admins view all plan payments" ON public.plan_upgrade_payments
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
```

### New edge functions

**`create-plan-upgrade-order`** — mirrors `create-razorpay-order`:
- Input: `{ target_tier: "pro" | "premium" }` (doctor identified via the caller's JWT, not a client-supplied id).
- Looks up the doctor's current `plan_tier` (`from_tier`) and computes the amount to charge server-side (never trust a client-supplied amount). `DEFAULT_PLAN_PRICES` (`src/components/superadmin/SASubscriptions.tsx`) is a frontend-only TS constant with no DB backing, so — following the same pattern already used for `staffPermissions.ts`'s Deno-side duplicate — this edge function carries its own hardcoded copy of `{ pro: 1499, premium: 3999 }`.
- Mock mode: inserts a `plan_upgrade_payments` row with a fake order id, `status='created'`, `is_mock=true`, returns the same response shape as live.
- Live mode: calls the real Razorpay Orders API, inserts the row with `is_mock=false`.

**`verify-plan-upgrade-payment`** — mirrors `verify-razorpay-payment`:
- Input: `{ payment_id, razorpay_order_id, razorpay_payment_id, razorpay_signature }`.
- Idempotency guard: if the row is already `status='captured'`, return success without reapplying anything (matches `verify-razorpay-payment`'s existing guard against replay).
- Verifies the signature (mock secret if `is_mock`, else the real `RAZORPAY_KEY_SECRET`) — a rejected signature marks the row `failed` and leaves `profiles` untouched.
- On a verified signature: updates the row to `status='captured'`, and in the same step updates `profiles` for `doctor_id`: `plan_tier = target_tier`, `plan_status = 'active'`, `trial_end = null`.

### Frontend: `UpgradeCheckoutDialog` replaces `RequestUpgradeDialog`

Same external contract as today (`targetTier: "pro" | "premium"`, `trigger: ReactNode`) so every call site (`LockedFeatureCard`, both cards in `SettingsPage.tsx`) swaps in as a drop-in replacement — no caller-side logic changes.

Flow: show target tier's price + feature list → "Pay ₹X & Upgrade" button → `create-plan-upgrade-order` → real Razorpay Checkout (script lazy-loaded, same as booking) or `MockCheckoutModal` (reused unmodified — it's already a generic mock-gateway UI, not booking-specific) depending on `mode` in the response → on success, `verify-plan-upgrade-payment` → refetch the doctor's own profile (`useProfile().refetch`) so `isPremium`/`plan_tier` update immediately without a page reload → success toast → close dialog.

**Small shared-code cleanup**: `loadRazorpayCheckout()` (the "lazily load Razorpay's checkout.js once" helper) currently lives inline in `BookingWidget.tsx`. Since `UpgradeCheckoutDialog` needs the identical helper, extract it to `src/lib/razorpayCheckout.ts` and have both call sites import it, rather than duplicating the script-loading logic.

`RequestUpgradeDialog.tsx` and `RequestUpgradeDialog.test.tsx` are deleted once nothing references them.

## Superadmin-side changes

- **New panel in `SASubscriptions.tsx`**: a "Self-Service Upgrade Payments" section listing `plan_upgrade_payments` rows (doctor name/email via join to `profiles`, from→to tier, amount, status, a mock/real badge reusing `TestModeBadge`, timestamp), most recent first. Read-only — this is visibility, not a new control surface.
- **Manual tier-change dropdown is untouched** — superadmin can still directly set any doctor's tier (comps, refunds, disputes) exactly as today; self-service payment is an additional path, not a replacement.
- **`SATickets.tsx`**: the `metadata.upgrade_request` rendering block is left in place untouched. No new tickets will ever carry that metadata going forward, but old ones (if any exist) still render correctly, and removing dead-but-harmless rendering code isn't worth the churn.

## Error handling

- Order-creation failure (Razorpay API error, or doctor's profile not found): toast error, no dangling `plan_upgrade_payments` row in an ambiguous state (mock/live branch both insert only after success from their respective source of truth).
- Checkout cancelled/failed by the doctor: row stays `created`/`failed`, profile untouched, dialog shows an error, doctor can retry (creates a fresh order — old row is just abandoned history, same as the booking flow's existing behavior for abandoned orders).
- Signature verification failure: row marked `failed`, profile untouched, error surfaced to the doctor.
- Double-verify (retry/duplicate call): idempotency guard returns success without reapplying the tier change.

## Testing

- Unit tests for `UpgradeCheckoutDialog` (replacing `RequestUpgradeDialog.test.tsx`), mocking `supabase.functions.invoke` for both `create-plan-upgrade-order` and `verify-plan-upgrade-payment`.
- Live Playwright, mock payment mode: a Pro-tier doctor completes a successful mock payment on the Premium card → `plan_tier` becomes `premium` and a previously-locked page (e.g. Staff Management) unlocks without a page reload; a failed/declined mock payment leaves the tier unchanged and shows an error toast.
- Existing plan-gating and subscription-card tests (`planFeatures.test.ts`, `SettingsPage.test.tsx`, `BillingPage.test.tsx`) should continue passing unmodified — this feature only changes how the CTA button gets acted on, not the gating logic itself.
