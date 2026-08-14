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

### Supabase integration

- `src/integrations/supabase/client.ts` and `types.ts` are **auto-generated** — don't hand-edit; regenerate via the Supabase MCP/CLI instead.
- Edge functions live in `supabase/functions/*` (Deno runtime), one directory per function; `supabase/functions/_shared/` holds code duplicated between client and functions (see permissions note above).
- `supabase/functions/mcp/` is **hand-maintained and must never be regenerated**, in dev or in a build — the `mcpPlugin`/`componentTagger` sync mishandles absolute paths on Windows (see the comment in `vite.config.ts`). It's excluded from dev-server file watching for the same reason.
- Payments run through Razorpay (`create-razorpay-order`, `verify-razorpay-payment`, `razorpay-webhook`, refunds, payouts) — doctor subscription plans are billed via subscription fees only; per-transaction platform commission was explicitly removed (doctors receive the exact fee they charged).
- Migrations are in `supabase/migrations/` (sequential, timestamped) — this is the source of truth for schema, not the generated `types.ts`.

### Plan tiers & gating

Doctors are on `free`/`pro`/`premium` plan tiers (`profiles.plan_tier`, `profiles.plan_status`). `src/hooks/usePlanAccess.ts` + `src/lib/planFeatures.ts` centralize tier feature lists and upgrade-prompt logic; UI that should be tier-gated should go through this rather than checking `plan_tier` inline.

### Styling

Tailwind theme colors are CSS custom properties (HSL) defined in `src/index.css` and mapped in `tailwind.config.ts` — brand tokens are `royal`, `teal`, `navy`, `spark`, `ai-purple`, plus semantic `success`/`warning`/`destructive`. Dark mode uses the `class` strategy. Headings use the `font-heading` (Plus Jakarta Sans) family, body/dashboard text uses `font-body`/default (Inter). shadcn/ui components (`src/components/ui/*`) are generated via `components.json` (style: default, no RSC) — treat them as customizable local code, not a vendored package.

Responsive design convention in this codebase: admin/superadmin data tables render as an actual `<table>` inside `<Card className="hidden md:block">` alongside a parallel `<div className="md:hidden space-y-2">` of `<Card>` rows for mobile, rather than trying to make one table layout serve both. Marketing/profile pages that pair a text block with an image, form, or accordion keep them side-by-side at every width (not stacked) by making the grid unconditional (`grid-cols-N` with no breakpoint prefix) and scaling text/icon/image sizes down at the base and up through `sm:`/`md:`/`lg:`, rather than reflowing to a single column on narrow viewports.
