# Superadmin Billing — Subscription Revenue — Design

## Problem

`/superadmin/billing` (`src/components/superadmin/SABilling.tsx`) currently shows a bar chart of platform-wide `invoices.total_amount` — that's patient→doctor billing volume, not doctor→Doctylia subscription revenue. The page's own banner admits the real data "will appear once Razorpay is connected," but that's now stale: `plan_upgrade_payments` (added for self-service plan upgrades, see [[2026-08-10-self-service-plan-upgrade-design]]) has been recording real doctor→platform payments since that feature shipped, and is already queried once, ad hoc, inside `SASubscriptions.tsx`'s "Self-Service Upgrade Payments" panel.

Superadmin has no dedicated view of this revenue with totals, filtering, or export — this design gives it one, laid out like the existing `/admin/billing` page doctors already use.

## Goals

- Replace the patient-invoice bar chart with real doctor-subscription revenue: today/week/month sums of `plan_upgrade_payments`, plus an estimated-MRR figure derived from `profiles`.
- Transactions list, status filter, CSV export, and a payment-status donut — visually and structurally consistent with `/admin/billing`.
- Extract the two pieces of UI that `/admin/billing` currently hand-rolls per-page (gradient stat cards, SVG donut) into shared components, and have both this new page and `/admin/billing` consume them, so the "twin" pages actually share code instead of just looking similar.
- Remove the stale "once Razorpay is connected" banner.

## Non-goals

- No true MRR/recurring-subscription table. `plan_upgrade_payments` is one-time upgrade events, exactly as designed in [[2026-08-10-self-service-plan-upgrade-design]]. "Estimated MRR" here is a derived, not a stored/historical, figure — see below.
- No subscription-invoice generation or an `Invoices` data model. The Invoices tab is a placeholder for layout parity only.
- No retrofit of `DashboardHome.tsx` or `SAPayments.tsx` onto the new shared `StatCard` — they have the same duplicated pattern today, but touching them is out of scope for this change.
- No change to `plan_upgrade_payments` schema, RLS, or the edge functions that write to it.

## Data source

`plan_upgrade_payments` joined to `profiles(full_name, email)`, same shape already prototyped in `SASubscriptions.tsx`:

```ts
supabase
  .from("plan_upgrade_payments")
  .select("id, doctor_id, from_tier, target_tier, amount, status, is_mock, created_at, profiles(full_name, email)")
  .order("created_at", { ascending: false })
```

No `doctor_id` filter (platform-wide, unlike `/admin/billing`'s doctor-scoped query). Realtime subscription on this table, unfiltered, mirroring the pattern in `admin/BillingPage.tsx`.

**Status bucketing** (raw enum `created | authorized | captured | failed | refunded` → UI bucket):

| Raw status | UI bucket |
|---|---|
| `captured` | Paid |
| `created`, `authorized` | Pending |
| `failed` | Failed |
| `refunded` | Refunded |

Used consistently by the filter dropdown, the donut, and revenue sums (`captured` only counts as revenue).

**Mock payments** (`is_mock=true`, from the dev/mock payment gateway) are included in all sums and the donut — not excluded. Individual transaction rows still carry a small "mock" outline badge (reusing whatever badge `SASubscriptions.tsx` already uses for this) so it stays visually distinguishable, just not excluded from totals.

**Revenue cards:**
- Today / This Week / This Month = `sum(amount) where status='captured' and created_at` in the respective window.
- Estimated MRR (4th card) = `sum over profiles where plan_status='active' and plan_tier in ('pro','premium') of (custom_plan_price ?? DEFAULT_PLAN_PRICES[plan_tier])`. `DEFAULT_PLAN_PRICES` already exists in `SASubscriptions.tsx` (`{ free: 0, pro: 1499, premium: 3999 }`) — reused, not redefined. This is a live snapshot computed on load, not a stored history.

## Shared components (new)

`src/components/shared/StatCard.tsx`
- Props: `label: string`, `value: string` (pre-formatted, e.g. already `₹`-prefixed), `icon: LucideIcon`, `gradient: string` (Tailwind gradient classes, e.g. `"from-royal to-teal"`).
- Renders the existing `Card`/`CardContent` gradient-box markup currently duplicated in `admin/BillingPage.tsx`'s `revenueCards`. Pure presentational, no data fetching.

`src/components/shared/PaymentStatusDonut.tsx`
- Props: `buckets: { label: string; count: number; color: string }[]`, `total: number`.
- Recharts `PieChart`/`Pie` (donut via `innerRadius`), replacing `admin/BillingPage.tsx`'s hand-rolled `stroke-dasharray` SVG circles. Center total + legend list below, matching the current visual (see reference screenshot).

Both components are pure/presentational — callers own the query and pass in already-shaped data. This keeps them usable by both billing pages without embedding either page's data-fetching assumptions.

## Page layout: `SABilling.tsx`

Rewritten to mirror `/admin/billing`'s structure:

1. Remove the info banner and `recharts` bar chart entirely.
2. Four `StatCard`s: Today's Subscription Revenue / This Week / This Month / Estimated MRR.
3. `Tabs` (`Transactions` / `Invoices`, shared shadcn primitive, unchanged):
   - **Transactions**: one row per `plan_upgrade_payments` record — doctor name (from joined `profiles.full_name`), `from_tier → target_tier`, formatted date, status badge (bucketed), mock badge if `is_mock`, amount.
   - **Invoices**: placeholder card, "Subscription invoicing is coming soon" — no backing table exists (per Non-goals).
4. Filter `Select` (shared primitive): All Payments / Paid / Pending / Failed / Refunded — drives both the visible transaction list and the CSV export.
5. Export CSV button: doctor name, email, from_tier, target_tier, amount, status (raw), is_mock, created_at; respects the active filter. Reuses the manual CSV-building approach already in `admin/BillingPage.tsx`'s `exportTransactionsCSV()` (Blob + synthetic `<a download>`, no new library).
6. Right sidebar: `PaymentStatusDonut` fed from the same (filtered-by-status-bucket, not by the dropdown filter — always all statuses) dataset, so the donut always shows the full breakdown regardless of the transaction list's active filter, matching `/admin/billing`'s existing behavior.

Dark superadmin theme (existing `Card`/`Badge`/`Select` styling under the dark theme) is preserved — this is a data/layout change only.

## `admin/BillingPage.tsx` changes

Swap its inline `revenueCards` array + JSX for three `<StatCard>`s (adding a 4th is specific to the superadmin page, not this one), and its hand-rolled SVG donut for `<PaymentStatusDonut>`. No change to its own data source, doctor-scoping, or the "This Month" revenue logic already documented there (invoices-based, deliberately not live-appointment-based).

## Error handling

- Empty state (no `plan_upgrade_payments` rows yet, e.g. fresh env): cards show ₹0, donut shows 0 total, transaction list shows an empty-state message — no fake/mock data.
- Join failure or missing `profiles` row for a `doctor_id` (shouldn't happen given the FK, but defensively): fall back to showing the raw `doctor_id` instead of a name, don't drop the row.
- CSV export with zero filtered rows: still produces a valid (header-only) CSV rather than erroring.

## Testing

- Unit test for the status-bucketing function (raw enum → UI bucket mapping) and the Estimated MRR calculation (custom_plan_price override vs. default tier price fallback).
- Component test for `StatCard` and `PaymentStatusDonut` in isolation (presentational, easy to snapshot with fixed props).
- Existing `BillingPage.test.tsx` (admin) should continue passing after the `StatCard`/`PaymentStatusDonut` swap — same rendered output, refactored internals only.
- Manual check: `/superadmin/billing` and `/admin/billing` side by side, confirm visual parity of the stat-card and donut styling.
