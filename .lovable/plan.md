

## Plan: Enhance Auth, Onboarding, and Full Dashboard UI

### Part 1: Auth Page — Premium Split-Screen Design

**Current state**: Simple centered card on gray background. Functional but plain.

**Upgrade to**:
- **Split-screen layout** on desktop: Left panel (45%) with brand gradient (navy-to-teal), Doctylia logo, tagline, and 3 animated trust points ("Join 10,000+ doctors", "Go live in 5 minutes", "7-day free trial"). Right panel (55%) with the auth form.
- Mobile: full-width form with compact brand header above.
- Add Google OAuth button placeholder (styled, shows "Coming Soon" toast).
- Password strength indicator on signup.
- Subtle animated background dots/pattern on the brand panel.

**File**: `src/pages/Auth.tsx`

---

### Part 2: Onboarding — Immersive Multi-Step Wizard

**Current state**: Functional 3-step wizard but plain. Basic progress dots on gray background.

**Upgrade to**:
- **Full-width layout** with brand sidebar (desktop) showing step progress vertically with icons, labels, and connecting lines (like a vertical stepper).
- Mobile: horizontal compact stepper at top (current style but polished).
- Each step gets a subtle illustration/icon header with gradient background.
- Step 3 (Review) shows a **mini preview card** of how their website will look (mockup with their entered name, specialization, clinic).
- Success step (Step 4) gets confetti animation and a more celebratory design.
- Add optional fields: "About / Bio" (textarea), "Consultation Fee" in step 2.

**File**: `src/pages/Onboarding.tsx`

---

### Part 3: Dashboard Home — Richer, More Featured

**Current state**: Good structure with stats, appointments, checklist, website preview, revenue chart, quick actions, recent patients. Solid foundation.

**Enhancements**:
- Add **"Today's Schedule Timeline"** — vertical timeline view of today's appointments with time markers (replaces the simple list, more visual).
- Add **"Practice Growth Tips"** card — rotating tips like "Add your services to get more bookings", "Write a blog post to improve SEO", contextual based on what's missing.
- Add **"Quick Stats Comparison"** — small "vs last week" percentage badges on stat cards (calculated from data).
- Better empty states with branded illustrations.
- Stat cards get micro-sparkline (tiny CSS line chart showing trend).

**File**: `src/components/admin/DashboardHome.tsx`

---

### Part 4: Admin Layout — Polish

- Fix the HSL color issue in AdminLayout header (avatar bg uses `hsl(var(--royal)/.1)` — change to `bg-royal/10 text-royal`).
- Add breadcrumb under page title.
- Add notification dot on bell icon.

**File**: `src/components/admin/AdminLayout.tsx`

---

### Part 5: Appointments Page — Enhanced UI

**Current state**: Table layout with search/filter. Functional.

**Enhancements**:
- Add **calendar strip** at top (horizontal scrollable dates, click to filter by date).
- Better card-based appointment list with color-coded left borders by status.
- Appointment detail expanded view with actions (Confirm, Complete, Cancel) as styled buttons.
- "New Appointment" dialog gets better styling with time slot picker grid.

**File**: `src/components/admin/AppointmentsPage.tsx`

---

### Part 6: Patients Page — Enhanced

- Patient cards in grid view (2-col on mobile, 3-col desktop) instead of plain list.
- Each card shows avatar initial, name, phone, last visit, visit count badge.
- Patient detail sheet gets visit history timeline.

**File**: `src/components/admin/PatientsPage.tsx`

---

### Part 7: Billing Page — Enhanced

- Revenue cards get gradient backgrounds and icons.
- Transaction list gets card-based design with payment status badges.
- Add a simple donut chart (CSS-based) showing payment status distribution.

**File**: `src/components/admin/BillingPage.tsx`

---

### Part 8: Settings Page — Enhanced

- Tabbed layout (Profile | Clinic | Subscription | Account).
- Profile tab: Photo upload area with avatar preview.
- Subscription tab: Clear plan comparison card, trial countdown with visual progress.
- Account tab: Danger zone (delete account), export data button.

**File**: `src/components/admin/SettingsPage.tsx`

---

### Part 9: New Feature — Quick Notes / Reminders

Add a small **"Notes & Reminders"** widget on the dashboard. Doctors can jot quick notes (stored in a new `doctor_notes` table). Simple text list with add/delete.

**Migration**: Create `doctor_notes` table (id, doctor_id, content, created_at) with RLS.

---

### File Summary

| Action | Files |
|--------|-------|
| Migration | 1 — `doctor_notes` table |
| Modify | `Auth.tsx` — split-screen premium design |
| Modify | `Onboarding.tsx` — immersive stepper with preview |
| Modify | `DashboardHome.tsx` — timeline, tips, sparklines, notes widget |
| Modify | `AdminLayout.tsx` — fix HSL colors, add breadcrumb |
| Modify | `AppointmentsPage.tsx` — calendar strip, card-based list |
| Modify | `PatientsPage.tsx` — grid cards, better detail view |
| Modify | `BillingPage.tsx` — gradient cards, donut chart |
| Modify | `SettingsPage.tsx` — tabbed layout, photo upload |

### Build Order
1. DB migration for doctor_notes
2. Auth page split-screen redesign
3. Onboarding immersive wizard
4. Dashboard enhancements (timeline, tips, notes widget)
5. AdminLayout polish
6. Appointments page calendar strip + card design
7. Patients page grid cards
8. Billing page visual upgrade
9. Settings page tabbed layout

