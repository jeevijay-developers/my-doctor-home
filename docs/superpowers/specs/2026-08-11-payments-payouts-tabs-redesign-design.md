# Payments & Payouts — Overview/All Payments/Doctor Earnings Redesign — Design

## Problem

`SAPayments.tsx`'s Overview tab has a "Collections — monthly" bar chart that's purely historical/decorative. All Payments and Doctor-wise Earnings both label rows by `profiles.clinic_name` instead of the doctor's actual name, and All Payments is a flat list of every payment from every doctor mixed together — hard to scan once there's real volume. Doctor-wise Earnings crams gross/commission/share/unpaid onto the card face as small tags instead of a scannable summary.

This covers items 1–3 of the original ticket only. Items 4–5 (the monthly payout calculation bug and the empty Payout History tab) are explicitly out of scope here, per direction — no changes to `calculate-monthly-earnings`, `create-doctor-payout`, or the Payouts/Payout History tabs.

## Goals

- Overview: remove the bar chart; add a payout-status breakdown (actionable) and a top-5 earning doctors leaderboard (replaces the chart's at-a-glance value).
- All Payments: fix the doctor-name bug; restructure into a Doctor → Patient → Transaction breadcrumb drill-down; remove the Refund button and status badges from this tab's display only.
- Doctor-wise Earnings: fix the doctor-name bug; replace the tag-heavy card with a collapsed summary that expands to the detail breakdown, reusing the `DoctorGroupCard`-style card+collapsible pattern already built for `SAModeration.tsx` this session.

## Non-goals

- No changes to `calculate-monthly-earnings`, `create-doctor-payout`, the Payouts tab, or the Payout History tab (items 4–5, explicitly deferred).
- No schema changes. `payments` doesn't reference a patient directly, so patient grouping is derived client-side from the `appointments` join already available via `payments.appointment_id` — no new column, no new table.
- `refundPayment` and the payment/payout status-style maps stay in the file (used by Overview's new breakdown and unaffected tabs) — only removed from All Payments' own row display, not deleted from the codebase.
- No new query beyond adding an `appointments` fetch to the existing `Promise.all` in `loadData()` (id, doctor_id, patient_name, patient_phone, created_at) — everything else is client-side grouping over data already fetched.

## Architecture

### Data layer (`loadData()`)

Add a fifth parallel fetch: `supabase.from("appointments").select("id, doctor_id, patient_name, patient_phone, created_at")`, stored in a new `appointments` state array. Build an `appointmentById: Map<string, Appointment>` for O(1) lookup when grouping payments by patient. `doctorLabel()` changes from `clinic_name || full_name` to `full_name` only, everywhere it's used (All Payments, Doctor-wise Earnings, and the new Overview leaderboard) — Payouts/Payout History tabs are out of scope so their use of `doctorLabel` is untouched (they already show doctor name-or-fallback the same way; the function itself just stops preferring clinic name).

### Overview tab

Replace the "Collections — monthly" `Card`/`BarChart` block with two new `Card`s (stat cards above stay exactly as they are):

- **Payout status breakdown**: counts `payouts` (already fetched) by status into a small row of labeled counts — "N Pending," "M Processing," "K Paid this month" (only statuses with count > 0 shown, to avoid a wall of zeros when nothing's been run yet — consistent with items 4/5 currently producing no payouts).
- **Top earning doctors**: top 5 entries from the existing `doctorEarnings` computation (already sorted by gross descending), each row showing doctor name (`full_name`), gross amount, and a thin `div` with `width: %` proportional to that doctor's share of the top 5's combined gross (not a chart library — a single colored bar segment, matching the doc's "not a full chart" instruction).

### All Payments tab: breadcrumb drill-down

New local state: `drill: { doctorId: string | null; patientPhone: string | null }` (both `null` = Level 1). A `Breadcrumb` row above the list renders based on `drill`: "All Doctors" (always, clears both) › doctor name (shown once `doctorId` is set, clears `patientPhone` only) › patient name (shown once `patientPhone` is set).

- **Level 1** (`drill.doctorId === null`): group `payments` by `doctor_id` (reuse the same grouping shape as `groupByDoctor` — see below), one row per doctor: name, transaction count, total amount. Click sets `drill.doctorId`.
- **Level 2** (`doctorId` set, `patientPhone === null`): filter `payments` to that doctor, join each to `appointmentById.get(p.appointment_id)`, group by `patient_phone` (fallback to the payment's own id as key for the rare orphaned payment with no `appointment_id`, so it still surfaces instead of vanishing — labeled "Unknown patient"). One row per patient: `patient_name`, transaction count, total, last transaction date. Click sets `drill.patientPhone`.
- **Level 3** (both set): the actual payment rows for that doctor+patient pair — order ID, date/time, amount, payment method (`p.method`) — same info previously on the flat card, minus the Refund button and the "Test Mode"/status badges. `p.is_mock` and `p.status` remain on the object (untouched data model) — they're simply not rendered on this tab anymore.

Level 1 grouping does **not** reuse `groupByDoctor` (`src/lib/groupByDoctor.ts`, built this session for Moderation) — that helper assumes an embedded `profiles` object per item (as `blog_posts`/`reviews` have via their query's join), but `payments` is fetched with a flat `select("*")` and no such embed. Adding one solely to reuse the helper isn't worth the query change; Level 1's grouping is a few lines of `reduce` (doctor id → count/total, name resolved via the already-loaded `profiles` state map), inline and not extracted to a shared helper — it's used once, with a different input shape than `groupByDoctor` assumes.

### Doctor-wise Earnings tab

`DoctorGroupCard` moves from `SAModeration.tsx` to `src/components/shared/DoctorGroupCard.tsx` — it now has two consumers (Moderation, and this tab), the same threshold that already justified promoting `StatCard`/`PaymentStatusDonut` to `src/components/shared/` earlier this session. `SAModeration.tsx` switches to importing it from the new location; its own behavior is unchanged, this is a pure move (no prop/behavior changes), so its existing tests keep passing unmodified.

Doctor-wise Earnings then uses it directly: one card per doctor, collapsed shows doctor name + total gross + transaction count; expanded content shows the existing gross/commission/doctor-share/unpaid breakdown, restyled as a small key-value list instead of inline `Badge`s.

## Error handling

- A payment with no matching `appointments` row (orphaned — same case the current tab already flags via `needs_refund`/`!appointment_id`): still appears at Level 2 under an "Unknown patient" group rather than being silently dropped, keyed by the payment's own `id` so it doesn't collide with a real patient's group.
- Empty states: "No payments yet" at Level 1 (unchanged copy); if a doctor has zero payments matching current data at Level 2 (shouldn't happen since they only appear at Level 1 if they have ≥1 payment, but defensively) — same empty-state pattern as other tabs.

## Testing

- `src/components/superadmin/SAModeration.test.tsx` (existing, from this session's earlier grouping work) must continue passing unmodified after `DoctorGroupCard` moves to `src/components/shared/` — only its import path changes, not its props or rendering.
- Manual verification for the `SAPayments.tsx` changes themselves (no automated tests currently exist for this file, consistent with the rest of this module) — confirm: Overview shows no chart and the two new cards with correct counts/amounts; All Payments shows doctor names (not clinic names) and the 3-level breadcrumb drill-down works forward and backward with correct filtering at each level; Doctor-wise Earnings shows doctor names and expands to the correct breakdown per doctor; Payouts/Payout History tabs are visually and functionally unchanged.
