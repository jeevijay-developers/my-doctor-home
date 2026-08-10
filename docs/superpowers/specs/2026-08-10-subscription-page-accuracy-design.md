# Design: Subscription page — accurate plan cards + real Upgrade Plan flow

**Status:** Approved by user, ready for implementation planning
**Date:** 2026-08-10
**Scope:** `SettingsPage.tsx`'s Subscription tab and `LockedFeatureCard.tsx`'s "Request Upgrade"
CTA. Explicitly excludes `PricingSection.tsx` (public marketing page) — flagged as a separate
follow-up, see below.

## Context & pre-existing state (confirmed by reading the actual code, not assumed)

- The Subscription tab currently shows two cards, "Free Trial" and "Pro Plan," with feature
  lists that don't match what's actually enforced (e.g. "AI Blog Writer" listed under Pro Plan,
  when the plan-gating feature made it Premium-only). There's no card representing Premium at
  all.
- "Upgrade Plan" currently opens `ContactSupportDialog` (a generic support-ticket form,
  `defaultSubject="Upgrade to Premium"`) which inserts into `support_tickets`. This is not a dead
  end — `SATickets.tsx` is a real superadmin review page for these — but the UI doesn't
  communicate plan-specific context, and looks like a bug-report form rather than a purchase
  intent.
- `support_tickets` schema today: `subject`, `description`, `priority`, `status`, `notes` — no
  structured/metadata column. `SATickets.tsx`'s ticket-detail view only renders `description` as
  free text.
- `LockedFeatureCard.tsx` (shown on Billing/Blog/MyWebsite when `!isPremium`) has its own
  "Request Upgrade" button, also currently wired to `ContactSupportDialog` with the same
  hardcoded subject — functionally the same action as the Settings page CTA.
- Real enforcement (confirmed by reading the actual gating code, per
  `2026-08-08-subscription-plan-gating-design.md`): `doctor_has_premium_access()` = `plan_status
  = 'trial' OR plan_tier = 'premium'`. Only three things are Premium-gated: the appointment cap
  (Basic capped, default 500/month via `platform_settings`, Premium unlimited), Online
  Consultation/Zoom, Billing & Invoices, and the AI Blog Writer action. Patient Records and manual
  blog posting are NOT gated — available on both tiers. `free` and `pro` plan_tier values have
  identical real feature access — the distinction is purely a billing/pricing concern.
  `DEFAULT_PLAN_PRICES` (`SASubscriptions.tsx`): `free: ₹0, pro: ₹999, premium: ₹2499`.
- Razorpay is not connected (`website_settings.payment_gateway_enabled` off, "Payment Gateway:
  Not connected yet" in Online Payment settings) — a real automated checkout is not achievable
  right now. Any upgrade flow built here must be honest that a human follows up, not simulate a
  working purchase.
- `ProtectedRoute.tsx` already fully blocks `plan_status = 'cancelled'` doctors before any
  dashboard route renders (dedicated "Account suspended" screen) — confirmed by reading it. So
  the Subscription page's cards can never actually be seen by a cancelled doctor in the current
  codebase; the cancelled-handling below is included for defensive correctness but is only
  practically exercised by `expired`.
- `PricingSection.tsx` (public marketing page) has a larger, separate accuracy problem: it shows
  three tiers (Starter/Professional/Premium) with feature and price differences that don't match
  the real two-tier (Basic/Premium boolean) system or real billing prices, includes features that
  don't exist in the codebase at all (multi-doctor, custom domain, API access, white-label), and
  misstates Patient Records as Starter-excluded when it's actually available on Basic. This needs
  its own design pass (is a 3rd marketing tier even wanted, given only 2 real tiers exist?) and is
  explicitly out of scope here — flagged as a follow-up item, not fixed in this pass.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Upgrade Plan button destination | Not a new checkout, not a new page. Reuse the existing `support_tickets`/`SATickets.tsx` plumbing (it already works and is reviewed by superadmins), but replace the generic `ContactSupportDialog` UI with a purpose-built `RequestUpgradeDialog` that shows real target-tier features and is honest that a human follows up to arrange payment. |
| Ticket data | Beyond the subject line, the doctor's current `plan_tier` and `plan_status` plus the requested tier are stored as real structured data, not just prose — new `support_tickets.metadata` JSONB column (mirrors the existing `admin_audit_log.details` pattern), rendered in `SATickets.tsx`'s ticket-detail view. |
| PricingSection.tsx | Out of scope for this pass — flagged as a separate follow-up given it needs its own tier-structure decision, not just a copy fix. |
| Card structure | Two cards only: Basic and Premium. Trial is a temporary status (already shown via the existing badge/progress bar above the cards), not a third purchasable tier — showing it as a peer card beside "Pro Plan" was the original bug. |
| Current-plan highlighting | Driven by real access (`usePlanAccess().isPremium`) and `plan_status`, not literal `plan_tier` matching — a trial doctor has full Premium access right now regardless of `plan_tier`, and that must be reflected accurately. |
| LockedFeatureCard reuse | Its existing "Request Upgrade" button switches to the same `RequestUpgradeDialog` (called with a fixed `targetTier="premium"`) for consistency — one place to keep the ticket structure and copy accurate, instead of two slightly different "request upgrade" experiences. |
| Expired/cancelled handling | Neither "Current Plan" badge is accurate when there's no active subscription at any tier. Basic card shows the doctor's real current *access level* (not "Current Plan") with a reactivate-style CTA; Premium keeps the normal upgrade CTA. Ticket subject reads "Reactivation request: ..." instead of "Upgrade request: ..." in this branch, so superadmins can distinguish a lapsed account resubscribing from an active Basic customer upgrading. `cancelled` gets the same treatment defensively, though `ProtectedRoute` makes it unreachable in practice. |

## Data model & components

1. **`src/lib/planFeatures.ts` (new)** — single source of truth, cross-referenced against the
   actual enforcement code (not guessed), consumed by both the Settings page and the new dialog:
   - `TIER_LABELS`: `{ pro: "Basic", premium: "Premium" }` (matches the display convention
     already used in `SADoctorDetail.tsx`).
   - `TIER_FEATURES`: `pro` → Website Builder, Appointment Booking (capped — cap value pulled at
     render time from `usePlanAccess().appointmentsCap`, never hardcoded, so this can't drift from
     `platform_settings` again the way `PricingSection.tsx` already did once); Patient Records;
     Manual Blog Posts; Basic Analytics. `premium` → everything in Basic + unlimited appointments
     + Online Consultation (Zoom) + Billing & Invoices + AI Blog Writer.
   - Re-exports/reuses `DEFAULT_PLAN_PRICES` from `SASubscriptions.tsx` rather than duplicating
     price constants.

2. **`support_tickets.metadata` (new migration)** — `ALTER TABLE support_tickets ADD COLUMN
   metadata jsonb;`, nullable. Shape: `{ upgrade_request: { from_tier, from_status, to_tier } }`.
   `SATickets.tsx`'s ticket-detail dialog renders a small summary line from this (e.g. "Upgrade
   request: Basic (active) → Premium") above the existing free-text description, when present.

3. **`RequestUpgradeDialog.tsx` (new component)** — props: `targetTier: "pro" | "premium"`,
   `trigger: ReactNode`. Reads current `plan_tier`/`plan_status` via `useProfile()`. Shows: honest
   copy (a team member reaches out to arrange payment; nothing is billed automatically), the
   target tier's unlocked features from `planFeatures.ts`, an optional free-text message field. On
   submit, inserts into `support_tickets`:
   - `subject`: `"Upgrade request: {fromLabel} → {toLabel}"` normally, or `"Reactivation request:
     {plan_status} → {toLabel}"` when the doctor has no active subscription at any tier (expired
     or cancelled — see logic below).
   - `priority`: fixed `"normal"` (not user-editable — this isn't a generic support form).
   - `description`: the doctor's optional message, or empty.
   - `metadata`: `{ upgrade_request: { from_tier: profile.plan_tier, from_status:
     profile.plan_status, to_tier: targetTier } }`.
   Replaces `ContactSupportDialog` at both call sites: `SettingsPage.tsx`'s cards and
   `LockedFeatureCard.tsx` (fixed `targetTier="premium"` there).

4. **`SettingsPage.tsx` Subscription tab** — existing status badge + trial progress bar
   unchanged. The two feature cards are replaced with Basic/Premium cards built from
   `planFeatures.ts`. Highlighting/CTA logic:

   ```
   if (plan_status === 'trial')
     → Premium: "Included via your trial" badge, no CTA.
       Basic: "What you'll have after your trial ends" preview, no CTA.
   else if (isPremium)   // true whenever plan_tier === 'premium', any status
     → Premium: "Current Plan" badge, no CTA.
       Basic: informational only ("Included in your plan"), no CTA — downgrade isn't
       self-serve here.
   else if (plan_status === 'active')
     → Basic: "Current Plan" badge, no CTA.
       Premium: RequestUpgradeDialog CTA ("Upgrade request: Basic → Premium").
   else   // plan_status is 'expired' or 'cancelled' — no active subscription at any tier
     → Basic: "Your access level" badge (not "Current Plan" — no active plan behind it) +
       RequestUpgradeDialog CTA, subject "Reactivation request: {status} → Basic".
       Premium: RequestUpgradeDialog CTA as normal, subject "Reactivation request: {status}
       → Premium".
   ```

## Explicitly out of scope

- `PricingSection.tsx` accuracy — flagged above as a separate follow-up needing its own
  tier-structure design decision.
- Any real payment/checkout integration — blocked on Razorpay connection, not part of this
  feature.
- Self-serve downgrade (Premium → Basic) — stays a manual superadmin action via
  `SASubscriptions.tsx`/`SADoctorDetail.tsx`, unchanged.
- Changing `SATickets.tsx`'s filtering/list view beyond rendering the new `metadata` summary in
  the detail dialog.

## Testing

- Vitest: `RequestUpgradeDialog` submits the correct `subject`/`priority`/`metadata` for each of
  the four branches above (trial, active-premium, active-basic, expired/cancelled). Existing
  tests referencing `ContactSupportDialog` at the two replaced call sites
  (`SettingsPage`/`LockedFeatureCard.test.tsx`) updated to assert against `RequestUpgradeDialog`
  instead.
- Manual QA: verify each of the four branches renders the correct card labels/CTAs for a real
  test doctor moved through trial → active-basic → active-premium → expired states via
  `SADoctorDetail.tsx`.
