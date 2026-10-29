# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Doctylia — a multi-tenant SaaS platform giving doctors their own branded booking website plus a practice-management admin panel (appointments, patients, billing, staff), on top of a Supabase backend. Vite + React + TypeScript + Tailwind CSS + shadcn/ui (Radix) on the frontend.

This project is synced with [Lovable](https://lovable.dev): pushes to `main` sync back into the Lovable editor, and prompts run there commit straight back to this repo. Don't assume a change here is the only place that history lives.

## Commands

```sh
npm run dev          # start Vite dev server (port 8080, see vite.config.ts)
npm run build         # production build
npm run build:dev     # development-mode build
npm run lint           # eslint .
npm run preview        # preview a production build
npm run test            # vitest run (single run, all tests)
npm run test:watch      # vitest in watch mode
npx vitest run path/to/file.test.tsx        # run a single test file
npx vitest run -t "test name"               # run tests matching a name
npx tsc --noEmit -p .                        # typecheck without emitting
```

Tests live colocated next to the source they cover (e.g. `src/lib/planFeatures.ts` + `src/lib/planFeatures.test.ts`), run under jsdom via `src/test/setup.ts`. `@testing-library/react` is used throughout.

**Radix Tabs gotcha**: Radix `Tabs` use `activationMode="automatic"`, which activates on focus, not click. In tests, call `.focus()` on the tab trigger before `fireEvent.click()`, or the click won't register.

## Architecture

### Four app surfaces, one route tree

`src/App.tsx` is the single router covering four distinct UIs:

- **Public marketing site** (`/`) — `src/pages/LandingPage.tsx` composing `src/components/landing/*`.
- **Doctor's public booking site** (`/dr/:slug`, plus `/dr/:slug/blog`, `/dr/:slug/manage`) — `src/pages/DoctorPublicPage.tsx` composing `src/components/doctor/*`, all reading from `DoctorContext` (see below).
- **Doctor/staff admin panel** (`/admin/*`, behind `ProtectedRoute`) — `src/pages/AdminDashboard.tsx` is a nested router inside `AdminLayout`; every page is lazy-loaded and wrapped in `PermissionGate` (see permissions below). Components live in `src/components/admin/*`.
- **Platform superadmin panel** (`/superadmin/*`, behind `SuperAdminRoute`) — nested routes defined directly in `App.tsx`, layout in `SuperAdminLayout`, pages in `src/components/superadmin/*` (prefixed `SA*`).

`src/components/shared/*` and `src/components/ui/*` (shadcn primitives) are used across surfaces.

### Two separate role/permission systems — don't conflate them

1. **Platform-level** (superadmin panel access): a `user_roles` table with roles like `"admin"`. `SuperAdminRoute` checks it via the `has_role` Postgres RPC, not via the `profiles` table.
2. **Practice-level** (admin panel access): a doctor has a `profiles` row; a staff member they've invited has a `staff_members` row instead (no `profiles` row of their own — `handle_new_user()` deliberately skips creating one for staff). `useProfile()` (`src/hooks/useProfile.ts`) resolves either identity, and when the caller is staff it returns the **assigned doctor's** profile so `.eq("doctor_id", profile.id)`-style queries work unchanged for both actors — actual read/write authorization is enforced per-table by Postgres RLS, not by this client-side resolution.

Staff permissions are fine-grained keys like `"patients.view"` / `"billing.manage"`, defined in `src/lib/staffPermissions.ts` and gated twice: the admin sidebar hides links a staff member can't use, and each route in `AdminDashboard.tsx` is separately wrapped in `<PermissionGate permission="...">` so a manually-typed URL is still blocked. **`src/lib/staffPermissions.ts` must be kept in sync by hand with `supabase/functions/_shared/staffPermissions.ts`** — edge functions run on Deno and can't import from `src/`, so the permission keys are duplicated rather than shared.

**Superadmin Team** (`/superadmin/team`, owner-only): permission-scoped platform admins who log in from the main login page with phone + OTP. They live only in `superadmin_team_members` (never `user_roles` 'admin', which means full owner access) and get access through additive `sa_has_permission(...)` RLS policies and `hasSuperadminPermission` checks in edge functions. **`src/lib/superadminPermissions.ts` must be kept in sync by hand with `supabase/functions/_shared/superadminPermissions.ts` and the policies in the `superadmin_team` migration.** Post-login routing for all four actor types (owner, team, clinic staff, doctor) lives in `src/lib/auth/resolveDestination.ts`.

### Supabase integration

- `src/integrations/supabase/client.ts` and `types.ts` are **auto-generated** — don't hand-edit; regenerate via the Supabase MCP/CLI instead.
- Edge functions live in `supabase/functions/*` (Deno runtime), one directory per function; `supabase/functions/_shared/` holds code duplicated between client and functions (see permissions note above).
- `supabase/functions/mcp/` is **hand-maintained and must never be regenerated**, in dev or in a build — the `mcpPlugin`/`componentTagger` sync mishandles absolute paths on Windows (see the comment in `vite.config.ts`). It's excluded from dev-server file watching for the same reason.
- Payments run through Razorpay (`create-razorpay-order`, `verify-razorpay-payment`, `razorpay-webhook`, refunds, payouts) — in addition to doctor subscription plans, online patient payments for consultations and clinical services deduct the configured platform service charge percentage (`profiles.commission_percent` override or `platform_settings.default_commission_percent`) and automatically route the net doctor share (`doctor_share`) to the doctor's Razorpay Route Linked Account (`transfers[]` on order creation, reversed via `reverse_all: 1` on refund). See `CONTEXT.md` and `docs/adr/0001-razorpay-route-commission-split.md`.
- Migrations are in `supabase/migrations/` (sequential, timestamped) — this is the source of truth for schema, not the generated `types.ts`.

### Appointments, patients and the live queue

The database owns these rules; the UI only calls and renders them (`supabase/migrations/20261029*.sql`):

- **Patient record + visit count + invoice** are produced by `BEFORE`/`AFTER` triggers on `appointments` (`sync_appointment_patient`, `invoice_on_appointment_billable`), not by client code. Staff bookings create the patient immediately; the visit is counted once (`visit_counted`) when the appointment becomes completed; an invoice exists only once the visit is completed **and** paid (or pay-at-clinic).
- **Patient lifecycle** (`20261029120000_patient_lifecycle.sql`): a staff booking creates a *provisional* patient (`patients.auto_created`, zero visits). Cancel / no-show / delete releases it again via `release_provisional_patient()` unless the patient has notes, another live or completed appointment, or any row in any table referencing `patients` (checked from the catalog). A visit counts only while its appointment is `completed`; leaving that status un-counts it. Manually added patients are never auto-deleted.
- **Queue columns are RPC-only** (`20261029140000_review_hardening.sql`): `queue_number`, `priority(_reason)`, `serving_started_at`, `skipped_at`, `sort_time` and `created_at` cannot be written directly by clients (`QUEUE_FIELDS_LOCKED`); only `queue_action` can (it sets the transaction-local `app.queue_rpc` flag the guard checks). `call_next` / `call` take `_expect` (`'none'` or the appointment id the screen thinks is in the room) and answer `STALE` if another device changed it. Public bookings must carry a `time_slot` and are stamped with the server's `created_at`.
- **Lock order** is slot -> queue number -> patient. That is why the slot triggers are named `trg_a0_*` (triggers fire alphabetically); keep new triggers that take advisory locks in that order.
- **Abuse limits & billing rules** (`20261029150000_abuse_limits_and_billing_rules.sql`): token lookups (`get_appointment_by_token`, cancel, reschedule, `get_my_queue_status`) lock a clinic+phone pair for 15 minutes after 8 failed guesses (`token_lookup_attempts`); a public booking needs a real phone, at most 3 open future bookings per phone and clinic, and its `amount` is overwritten from the clinic's own services (`public_booking_price`). **An invoice is created only when the appointment is completed AND `payment_status = 'paid'`**, so the UI asks how the patient paid when completing an unpaid visit (queue and appointments list). Online-paid no-shows are marked `no_show` and the doctor gets a `paid_no_show` notification; nothing is refunded automatically. `mark_paid` deliberately needs only `appointments.edit` (counter staff do it all day, and the guard already lets them set `paid` directly), and every call is logged in `queue_events`.
- **Type-checking**: the root `tsconfig.json` has no `files`, so `npx tsc --noEmit -p .` checks nothing. Use `npx tsc --noEmit -p tsconfig.app.json` (two old errors remain in `SADoctorDetail.tsx` and `NotFound.tsx`).
- **Booking tokens** (`src/lib/bookingToken.ts`, mirrored in `verify-razorpay-payment`) are 7 random characters from a 31-letter alphabet. Older `T123`-style tokens still work for lookups.
- **`guard_appointment_writes`** forces anonymous bookings to `pending` / `pay_at_clinic` and blocks client writes to gateway payment columns and to `refunded`. Edge functions use the service role and are trusted; cron and migrations have no JWT role and are trusted too.
- **Queue**: `appointments.queue_number` is assigned by the database per doctor per day (never by the browser). Staff actions go through the single `queue_action` RPC (call next, complete, skip, recall, no-show, priority with a required reason, mark paid) and are logged to `queue_events`. Waiting order is `priority DESC, sort_time, created_at`; `src/lib/queue.ts` mirrors it for rendering. Public screens (`/dr/:slug/queue`, the manage-appointment page) use `get_public_queue` / `get_my_queue_status`, which return queue **numbers only** — never names, phones or complaints.
- Overdue appointments are closed nightly by `expire_overdue_appointments()` (called-but-unclosed → completed, never-called → no-show); the browser no longer does this.

### Custom plans (Plan Requests)

A custom plan (`doctor_custom_plans`) is a feature set plus a monthly price negotiated on top of **one** paid tier (`base_tier`). It changes a doctor's price and features **only while `profiles.plan_tier = base_tier`**: the pricing cards (`getDoctorTierPrice`), the checkout (`create-plan-upgrade-order`) and `doctor_active_custom_plan()` all apply that same rule, and `customPlanApplication()` in `src/lib/customPlan.ts` is its client form (`applies` / `tier_mismatch` / `none`). `20261029160000_custom_plan_integrity.sql` keeps this honest: requests and approvals need a Pro/Premium doctor, a `plan_tier` change ends a plan built on the old tier (event + notification), and `rebase_custom_plan()` (superadmin button "Apply to <tier>") moves a stuck plan onto the doctor's current tier keeping the approved features, price and dates. The **monthly appointment limit** is part of a custom plan (`doctor_custom_plans.monthly_appointments_limit`, `20261029170000_custom_plan_appointment_limit.sql`): NULL = the tier's standard limit (`platform_settings.basic_appointment_cap`), -1 = unlimited, n = n per month; it is a number, not a `features` row, and only Pro-based plans carry one (Premium and trial are unlimited). `doctor_monthly_appointment_limit()` is the single place that decides it (Premium/trial, then an *applying* custom plan, then the standard); the booking trigger, `get_appointment_cap_usage` and the warnings all read it. On approval `review_plan_request(..., _appointments_limit)` reads NULL as "keep the plan's current limit", 0 as "reset to standard", -1 unlimited, n a number, so a features-only approval can never wipe a limit. The limit is judged for *today's* plan when a booking is made, not for the booked month. Plan cards show the STANDARD limit (`standardCap`); a custom limit appears as the custom plan's own line. In the approve dialog **Starts/Ends** are the dates the custom price and features apply; they are separate from the doctor's **paid until** (`plan_end`). Leave Ends blank or set it after the next renewal, because the price is read at payment time. Dates shown to users are formatted in IST (`src/lib/istDate.ts`); plan/trial days left come from `summarizePlan()` (`src/lib/planSummary.ts`), used by the header chip (`PlanStatusChip`) and dashboard `PlanCard`.

### Doctor discovery & SEO

Full plan in `docs/doctor-discovery-plan.md`. The app is a client-rendered SPA, so crawlers and link previews would only see the generic `index.html`. `vercel.json` rewrites `/dr/:slug` and `/doctors[/:city[/:specialty]]` to the Vercel Edge function `api/seo.ts` (logic in `src/lib/seo/handleSeoRequest.ts`), which injects page-specific head tags, JSON-LD and crawlable body into the built `index.html`, and falls back to the plain shell on any upstream failure. `DoctorPublicPage` and the Edge function share `src/lib/seo/doctorSeo.ts`.

- Files under `src/lib/seo/` and `src/lib/directory/` are bundled by Vercel: **use relative imports only (no `@/`)**.
- `src/lib/directory/slug.ts` must stay byte-identical to `supabase/functions/_shared/directorySlug.ts` (a test enforces it) and match SQL `directory_slugify()` in the `doctor_directory` migration.
- Directory search runs through the `search_doctors` / `directory_facets` SECURITY DEFINER RPCs (safe columns only); `profiles.directory_listed` is the doctor's opt-out. Hubs with fewer than `DIRECTORY_MIN_INDEXABLE` doctors are `noindex` and left out of the sitemap.

### Plan tiers & gating

Doctors are on `free`/`pro`/`premium` plan tiers (`profiles.plan_tier`, `profiles.plan_status`). `src/hooks/usePlanAccess.ts` + `src/lib/planFeatures.ts` centralize tier feature lists and upgrade-prompt logic; UI that should be tier-gated should go through this rather than checking `plan_tier` inline.

### Styling

Tailwind theme colors are CSS custom properties (HSL) defined in `src/index.css` and mapped in `tailwind.config.ts` — brand tokens are `royal`, `teal`, `navy`, `spark`, `ai-purple`, plus semantic `success`/`warning`/`destructive`. Dark mode uses the `class` strategy. Headings use the `font-heading` (Plus Jakarta Sans) family, body/dashboard text uses `font-body`/default (Inter). shadcn/ui components (`src/components/ui/*`) are generated via `components.json` (style: default, no RSC) — treat them as customizable local code, not a vendored package.

**Theme model (one global palette, derived from the logo — navy wordmark, blue→cyan "D", lime nodes).** Token values live only in `:root` and `.dark` in `src/index.css`; there is no per-surface theme override. `--primary`/`--royal` is a deep royal blue (white on it ≈ 7.7:1), `--accent` is shadcn's pale hover surface (not a brand color — use `teal` for the cyan brand hue), and `--navy` is the ink/wordmark color. Bright hues (`teal`, `spark`, `success`, `warning`, `destructive`) are **fills** (`bg-*`, borders); `tailwind.config.ts` `textColor` deliberately maps `text-teal/spark/success/warning/destructive` to darker "ink" tokens (`--teal-ink`, …) that pass 4.5:1 on light surfaces and flip lighter in `.dark`. On a **dark surface** (`bg-primary`, `bg-navy`, gradients) use `text-teal-bright` / `text-spark-bright` or white instead. `.gradient-brand` is the logo gradient. Shared admin pieces: `components/admin/StatusBadge` (appointment status → color; don't re-declare status color maps) and `components/admin/StatCard` (distinct from the gradient `components/shared/StatCard`). Fonts (Inter, Plus Jakarta Sans, Caveat) are self-hosted in `public/fonts` — the CSP in `vercel.json` blocks Google Fonts, so don't add them back.

Responsive design convention in this codebase: admin/superadmin data tables render as an actual `<table>` inside `<Card className="hidden md:block">` alongside a parallel `<div className="md:hidden space-y-2">` of `<Card>` rows for mobile, rather than trying to make one table layout serve both. Marketing/profile pages that pair a text block with an image, form, or accordion keep them side-by-side at every width (not stacked) by making the grid unconditional (`grid-cols-N` with no breakpoint prefix) and scaling text/icon/image sizes down at the base and up through `sm:`/`md:`/`lg:`, rather than reflowing to a single column on narrow viewports.
