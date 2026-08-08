# Design: Subscription Plan-Based Feature Gating (Basic vs Premium)

**Status:** Approved by user, ready for implementation planning
**Date:** 2026-08-08
**Scope:** Real (DB/RLS/edge-function-level) enforcement of plan limits, plus the doctor-dashboard
UI reflecting them. Touches `appointments`, `website_settings`, `profiles`, `invoices`,
`platform_settings` (data only, no new tables), `create-zoom-meeting`, `ai-blog-writer`,
`BillingPage.tsx`, `BlogPage.tsx`, `MyWebsite.tsx`, `DashboardHome.tsx`, `AppointmentsPage.tsx`,
`SettingsPage.tsx`, and `PricingSection.tsx` (one copy fix).

## Context & pre-existing state (confirmed by reading the actual code, not assumed)

- `profiles.plan_status` (`trial`/`active`/`expired`/`cancelled`) is **already enforced** in three
  places: `ProtectedRoute.tsx` (doctor dashboard), `DoctorPublicPage.tsx` (public clinic site),
  and the `create-razorpay-order` edge function (booking) — all gate on `plan_status === 'cancelled'`.
- `profiles.plan_tier` (`free`/`pro`/`premium`) is **fully managed** by superadmins in
  `SASubscriptions.tsx` (tier changes, custom pricing, trial extension, audit log via
  `logAdminAction`), with default prices `free: ₹0, pro: ₹999, premium: ₹2499`
  (`DEFAULT_PLAN_PRICES` in that file). **But `plan_tier` is never read to gate any doctor-facing
  feature today** — this entire feature is new enforcement built on top of already-real billing
  infrastructure, not "wiring up dormant schema."
- The public marketing page (`PricingSection.tsx`) already displays a third, disconnected set of
  tier names (Starter/Professional/Premium at ₹999/₹1,999/₹3,999) with its own feature-comparison
  table. It is 100% cosmetic — no plan value or enforcement is wired to it. Its Starter tier
  claims "Up to 100 appointments/month," which conflicted with this feature's 500 figure; resolved
  by updating the copy to 500 (see Decisions table).
- **`pg_cron` is available on this Supabase project but not installed**, and nothing anywhere
  transitions `plan_status` from `trial` to `expired` when `trial_end` passes. Confirmed via
  `list_extensions` (installed_version: null) and a full grep for cron/expiry logic (no matches).
  Addressed in this spec (see Trial auto-expiry, below) since it's load-bearing for the
  full-Premium-during-trial decision to mean anything time-bounded.
- The existing "Upgrade Plan" button (`SettingsPage.tsx`) has no `onClick` handler — dead. There
  is no self-serve upgrade flow anywhere; all tier changes happen manually via
  `SASubscriptions.tsx`. `ContactSupportDialog` (already used in `AdminSidebar.tsx`, accepts a
  custom `trigger` prop) is the real, working mechanism this feature reuses for upgrade requests.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| "Basic" naming | Maps to the existing `pro` plan_tier value (display-only rename; no schema/constraint change). |
| Appointment cap value | 500/month, matching the doc (not the marketing page's stale 100) — marketing copy updated to match. |
| `free` tier feature access | Same limits as Basic/`pro` — gating is effectively boolean (`premium` vs not), not 3-way. `free`/`pro` distinction stays purely a billing/pricing concern in `SASubscriptions.tsx`, untouched by this feature. |
| Trial (`plan_status='trial'`) access | Full Premium access regardless of `plan_tier`, for the duration of the trial. |
| Appointment cap enforcement point | Blocks both: the doctor's own manual creation AND public/patient booking. Enforced at the DB trigger level — un-bypassable by direct API calls. |
| Cap counting window | By the appointment's scheduled `date` (calendar month it falls in), not `created_at`. |
| Cap storage | `platform_settings` (existing table) — superadmin-configurable without a deploy, not a hardcoded constant. |
| Downgrade behavior (Premium → Basic with Online Consultation already set up) | Auto-disable (`show_online_consultation = false`), keep all data/config intact — can be manually re-enabled by upgrading again. |
| Approaching-cap warning | Yes, shown at 90% usage (`nearCap`), not just a hard block at 500. |
| Additional Premium-only gates | Billing/Invoices (`invoices` table + `BillingPage.tsx`) and AI Blog Writer (`ai-blog-writer` edge function). Patient records explicitly **excluded** — stays available on Basic. |
| Enforcement depth for Billing/Blog | Same real server-side backstop as Appointments/Zoom — not UI-only. Kept consistent rather than half-real. |
| Dashboard distinction | Same `AdminLayout`/`AdminSidebar` for everyone (all nav items always visible) — gated pages show a locked/upsell state (`LockedFeatureCard`) in place of real content, rather than hiding nav items or using separate layouts. |
| Trial auto-expiry | In scope: enable `pg_cron`, add a daily job flipping lapsed trials to `expired`. |
| Dead "Upgrade Plan" button | In scope: wire it (`SettingsPage.tsx:82` — the only one; re-checked during planning, `DashboardHome.tsx` has no such button despite earlier assumption) to open `ContactSupportDialog`, since it's the same broken pattern this feature already fixes fresh in `LockedFeatureCard`. |

## Data model & enforcement layer

No new tables — everything hangs off existing schema.

1. **`platform_settings` seed row** (migration data, not schema): `key='basic_appointment_cap', value=500`.
2. **New SQL function `public.doctor_has_premium_access(_doctor_id uuid) returns boolean`**
   (`SECURITY DEFINER`, mirrors the existing `has_role` RPC pattern): `plan_status = 'trial' OR
   plan_tier = 'premium'`. Single source of truth — every trigger, RLS check, edge function, and
   the frontend hook call this one function via `.rpc()` rather than re-deriving the boolean
   independently, eliminating drift risk.
3. **New SQL function `public.get_appointment_cap_usage(_doctor_id uuid) returns table(is_premium
   boolean, appointments_used int, appointments_cap int)`** (`SECURITY DEFINER`): the read-only
   counterpart used by the frontend. Internally calls `doctor_has_premium_access()` for
   `is_premium`; if true, returns `appointments_used=0, appointments_cap=0` (frontend treats a
   `0` cap as "unlimited" when `is_premium` is true — never divides by it); if false, computes the
   same current-calendar-month count and `platform_settings` cap lookup used by the enforcement
   trigger below, so the displayed "460/500" always matches what the trigger would actually
   enforce. This function is purely for display (the trigger is the actual enforcement authority);
   it exists so the frontend doesn't re-derive counting logic independently.
4. **New trigger `enforce_monthly_appointment_cap()`, BEFORE INSERT ON `appointments`.** Unlike
   the existing `enforce_slot_capacity()` trigger (which exempts doctor-originated inserts via
   `auth.uid() = NEW.doctor_id`), this one applies to every insert, doctor or public. Skips if
   `doctor_has_premium_access()` is true. Otherwise: `cap := COALESCE((SELECT value::int FROM
   platform_settings WHERE key='basic_appointment_cap'), 500)`; counts non-cancelled appointments
   where `date_trunc('month', date) = date_trunc('month', NEW.date)`; raises a clear exception if
   at/over cap.
5. **New trigger `enforce_online_consultation_gate()`, BEFORE UPDATE ON `website_settings`.**
   Rejects `show_online_consultation` false→true unless `doctor_has_premium_access()`. Does not
   block turning it off.
6. **New trigger `auto_disable_online_consultation_on_downgrade()`, AFTER UPDATE OF `plan_tier`,
   `plan_status` ON `profiles`.** Computes premium-access before/after via the same function; on a
   true→false transition, sets `show_online_consultation = false` for that doctor. Fires whether
   the transition comes from a superadmin tier change or the trial-expiry cron job.
7. **`create-zoom-meeting` edge function**: adds `admin.rpc("doctor_has_premium_access", ...)`
   where it already loads the appointment/doctor row; rejects `action:"create"` with 403 if false.
   `action:"get"` stays ungated — a patient with an existing join link shouldn't be locked out
   mid-appointment-lifecycle if the doctor's tier changes.
8. **`invoices` table**: new RLS `WITH CHECK` policy on INSERT requiring
   `doctor_has_premium_access(doctor_id)`. Confirmed the real insert path: `BillingPage.tsx`
   auto-generates an invoice client-side for any paid appointment that doesn't have one yet
   (direct `.insert()`, not a hidden trigger) — so this RLS policy sits exactly on the real path.
9. **`ai-blog-writer` edge function**: currently has **no auth/identity handling at all** — no
   Supabase client, no JWT extraction, just takes topic/name/specialization and calls the AI
   gateway directly. Adds JWT extraction + the same `doctor_has_premium_access` RPC check.
   (`verify_jwt` is already `true` in `config.toml`, so unauthenticated calls are already rejected
   by the platform; this closes the gap of an *authenticated Basic doctor* calling it directly.)
   **Prerequisite bug found during planning**: `BlogPage.tsx`'s `generateWithAI` currently calls
   this function via a raw `fetch()` authenticated with `VITE_SUPABASE_PUBLISHABLE_KEY` (the anon
   key) as the bearer token, not the doctor's own session token — so there is currently no
   resolvable user identity on this call at all. Without fixing this, the new server-side gate
   would reject every doctor, not just Basic ones. Fix: switch `BlogPage.tsx` to
   `supabase.functions.invoke("ai-blog-writer", { body: {...} })`, matching the pattern already
   used elsewhere in this codebase (`PhoneOtpForm.tsx`, `VideoConsultationCard.tsx`) — it
   automatically attaches the current session's JWT.
10. **Marketing copy fix**: `PricingSection.tsx` Starter tier, "Up to 100 appointments/month" → 500.

## Trial auto-expiry

New migration: `CREATE EXTENSION IF NOT EXISTS pg_cron;` plus a daily job (`cron.schedule`, e.g.
`0 2 * * *`) running `UPDATE public.profiles SET plan_status = 'expired' WHERE plan_status =
'trial' AND trial_end < now()`. This naturally fires the `auto_disable_online_consultation_on_downgrade`
trigger above for any affected doctor whose tier isn't premium, so a lapsed trial correctly loses
Online Consultation access the same
day it expires.

## Frontend architecture

- **`usePlanAccess()` hook** (`src/hooks/usePlanAccess.ts`): calls a new RPC
  `get_appointment_cap_usage(_doctor_id)` (reads `platform_settings` + counts the current
  calendar month's non-cancelled appointments + calls `doctor_has_premium_access` internally,
  server-side) once per dashboard session. Returns `{ isPremium, appointmentsUsed,
  appointmentsCap, nearCap, loading }`, where `nearCap = appointmentsUsed / appointmentsCap >=
  0.9`. Every gated page and the warning banner consume this one hook.
- **`<LockedFeatureCard />`** (`src/components/admin/LockedFeatureCard.tsx`): reusable — icon,
  feature name, one-line explanation, "Request Upgrade" button opening `ContactSupportDialog`
  pre-filled (subject: "Upgrade to Premium"). Rendered in place of real content on
  `BillingPage.tsx`, `BlogPage.tsx`'s AI-writer action, and `MyWebsite.tsx`'s Online Consultation
  section (replaces the toggle entirely for Basic doctors, rather than showing a disabled
  checkbox) when `!isPremium`.
- **Sidebar unchanged**: `AdminSidebar.tsx` keeps every item visible for everyone — the locked
  state lives entirely on the destination page.
- **Appointment cap warning banner**: small dismissible-per-session banner in `DashboardHome.tsx`
  and `AppointmentsPage.tsx`, shown when `nearCap && !isPremium` ("You've used 460/500
  appointments this month — upgrade to Premium for unlimited").
- **Error surfacing**: DB trigger rejections (cap hit, forced Zoom toggle) are caught client-side
  and shown via `toast.error` with a friendly message, matching the existing error pattern used
  throughout the app rather than surfacing the raw Postgres exception text.
- **Dead button fix**: the existing non-functional "Upgrade Plan" button (`SettingsPage.tsx:82`)
  gets wired to open `ContactSupportDialog`.

## Edge cases & error handling

- **Race condition (documented, not solved)**: two concurrent booking attempts right at the
  boundary could let the count briefly overshoot by a row or two before either transaction
  commits. Same class of race already present in `enforce_slot_capacity()`. Accepted as a known
  limitation for a soft monthly cap (not a financial transaction) — not adding `SERIALIZABLE`
  isolation or advisory locks unless this proves to matter in practice.
- **`platform_settings` cap row missing/misconfigured**: `COALESCE(..., 500)` fails safe to the
  intended default rather than allowing unlimited or blocking everyone.
- **Superadmin actions unaffected**: all new triggers are additive (BEFORE INSERT on
  `appointments`/`website_settings`, AFTER UPDATE on `profiles`) — none block
  `SASubscriptions.tsx`'s own tier/trial-extension updates, only cascade downstream consequences.

## Testing

- **DB-level**: **correction found during planning** — `pgTAP` the extension exists on this
  project, but there is no existing pgTAP test harness/runner in this repo (`supabase/tests/` is
  empty), and the Supabase CLI needed to run `supabase test db` isn't installed in this dev
  environment. Rather than standing up a new test framework from scratch for this one feature,
  verification is done the same way all DB work has been verified in this project so far: apply
  migrations and run direct SQL assertions via the Supabase MCP tools
  (`apply_migration`/`execute_sql`), against an isolated **development branch**
  (`mcp__supabase__create_branch`), not production — this touches trigger logic on tables holding
  real doctor data. Covers: `enforce_monthly_appointment_cap` (blocks the 501st Basic appointment;
  allows Premium/trial unconditionally; respects scheduled-month window, not creation-month),
  `enforce_online_consultation_gate` (blocks Basic true-flip; allows false-flip),
  `auto_disable_online_consultation_on_downgrade` (true→false disables; other transitions no-op),
  and the pg_cron expiry UPDATE's WHERE-clause logic. The branch is left for the user's review
  rather than auto-merged to production.
- **Edge functions**: `create-zoom-meeting` gets a new test case asserting 403 for a Basic
  doctor's `action:"create"`; `ai-blog-writer` gets equivalent new coverage for its newly-added
  auth path (it currently has none).
- **Frontend (Vitest + Testing Library, matching this session's established pattern)**:
  `usePlanAccess()` hook tests (mocked RPC responses → correct `isPremium`/`nearCap` derivation),
  `LockedFeatureCard` renders and its CTA opens `ContactSupportDialog`, `BillingPage`/`BlogPage`/
  `MyWebsite` render the locked card instead of real content when `!isPremium`.
- **Manual QA checklist** (deferred to the implementation plan doc): full lifecycle walkthrough —
  trial doctor has unlimited access → trial expires via cron → drops to Basic limits → superadmin
  sets premium → limits lift → superadmin downgrades → Online Consultation auto-disables.

## Explicitly out of scope

- Multi-doctor support, staff roles/seats, custom domains, API access, white-label — these appear
  in the marketing page's Premium tier but don't exist as built features anywhere in the codebase;
  gating something that doesn't exist isn't meaningful, and building them is a separate project.
- Patient records gating — explicitly kept available on Basic.
- Self-serve payment/upgrade flow — upgrades remain a manual, superadmin-assisted process via
  `SASubscriptions.tsx`; this feature only wires the existing (and previously dead) upgrade CTAs
  to the existing support-ticket flow, not a new checkout.
- Hardening the appointment-cap race condition beyond documenting it.
- Automated WhatsApp reminders — `website_settings.whatsapp_number` currently only powers a
  click-to-chat link, not an automated reminder system, despite marketing copy implying one. Not
  addressed here; flagged as a separate, pre-existing marketing/reality gap.
