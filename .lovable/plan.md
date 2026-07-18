## Doctylia QA Bug Fixes — Implementation Plan

Implement the fixes from `task-qa-bug-fixes.md`. Skipping items that the doc itself flags as "already implemented" or "product decision needed" (A5, B2, B3).

### A1. Hero descender clipping (P3)
- `src/components/landing/LandingHero.tsx`: change rotating word wrapper from `h-[1.2em] overflow-hidden` to `h-[1.5em]` (or drop `overflow-hidden` and use `pb-1`) so descenders in "Billing", "Blog" render fully at all breakpoints.

### A2. Realtime sync on admin pages (P1)
- Add the same `supabase.channel(...).on('postgres_changes', ...)` pattern already in `AppointmentsPage.tsx` to:
  - `src/components/admin/DashboardHome.tsx` — subscribe to `appointments` and `patients` filtered by `doctor_id=eq.{profile.id}`, re-run `load()` on any change.
  - `src/components/admin/PatientsPage.tsx` — subscribe to `patients` (and `appointments` for visit counts) → re-run load.
  - `src/components/admin/BillingPage.tsx` — subscribe to `appointments` and `invoices` → re-run load.
- Clean up channel on unmount.

### A3. Indian mobile validation (P1)
- New helper `src/lib/phone.ts` exporting `sanitizePhone(v)` (digits only, max 10) and `isValidIndianMobile(v)` (exactly 10 digits, starts 6–9).
- Wire into three forms:
  - `src/components/doctor/BookingWidget.tsx` Step 5 — sanitize onChange, `maxLength=10`, inline error, disable submit when invalid.
  - `src/components/admin/PatientsPage.tsx` Add/Edit Patient dialog — same.
  - `src/components/admin/AppointmentsPage.tsx` New Appointment dialog — same.

### A4. Optional email at booking (P2)
- `BookingWidget.tsx` Step 5: add optional Email input with basic format check (only if non-empty).
- Include email in `patients` upsert so it lands on `patients.email`. No schema change needed (column exists).

### A6. Prevent booking past time slots (P0)
- Add helper `filterFutureSlots(slots, dateStr, bufferMinutes=15)` in `src/lib/phone.ts` (or new `src/lib/slots.ts`).
- Apply in `BookingWidget.tsx` and `ManageAppointment.tsx` when building the visible slot list — if selected date is today, drop slots ≤ now + 15 min.
- Server-side guard: extend the existing `enforce_slot_capacity` / `enforce_slot_capacity_update` triggers (or add a new small trigger) to `RAISE EXCEPTION 'SLOT_IN_PAST'` when `(NEW.date + NEW.time_slot) < now()` and the caller is not the doctor. Also update `reschedule_appointment_by_token` to return `{ok:false, error:'SLOT_IN_PAST'}` in that case. Frontend surfaces a friendly toast.

### B1. Signup UX when email confirmation is on
- `src/pages/Auth.tsx`: when signup returns no `data.session`, instead of just a toast + mode switch, render an on-page success card: "Check your email — we've sent a verification link to {email}. Click the link, then come back to log in." Keep the toast as backup. No Supabase auth setting change (user hasn't asked to toggle it).

### Out of scope (per the task doc itself)
- A5 (reschedule) — already implemented; no code change.
- B2 (`/dashboard`) — no fix required.
- B3 (`/search`) — needs product decision; will flag back rather than build.

### Verification
- Typecheck.
- Playwright: load `/`, screenshot hero to confirm no clip; open booking widget, try invalid phone (blocked), pick today + a past time (no past slots visible).
