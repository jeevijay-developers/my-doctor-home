

## Plan: Full Mobile & Tablet Responsiveness Across All Pages

### Scope

Every page and component in the app will be audited and fixed for mobile (360-414px) and tablet (768-834px) breakpoints. Here's the page-by-page breakdown:

---

### 1. Landing Page Components (mostly done, minor fixes)

| Component | Issue | Fix |
|-----------|-------|-----|
| `LandingNavbar.tsx` | Mobile menu works, but CTA buttons missing in mobile hamburger | Add Login + Start Free Trial buttons inside mobile menu |
| `LandingHero.tsx` | Hero image may overflow on small screens | Add `max-w-[280px] mx-auto` on mobile for hero image, tighten text sizes |
| `PricingSection.tsx` | Cards may not stack properly on tablet | Ensure `grid-cols-1 md:grid-cols-3` |
| `ContactSection.tsx` | Form fields may be cramped | Verify `space-y-1.5` pattern on mobile |

### 2. Auth Page (`Auth.tsx`)

| Issue | Fix |
|-------|-----|
| Split-screen left panel hidden on mobile — good | No change needed |
| Form card padding too large on small screens | Change `p-7` to `p-5 sm:p-7` |
| Google button + form inputs look fine | Minor: ensure `max-w-md` doesn't overflow on 320px screens by adding `px-4` |

### 3. Onboarding Page (`Onboarding.tsx`)

| Issue | Fix |
|-------|-----|
| Sidebar stepper hidden on mobile — good | No change needed |
| `grid-cols-2 gap-4` inside Step 1 and Step 2 forms may cramp on 360px | Change to `grid-cols-1 sm:grid-cols-2` for experience/fee and city/phone fields |
| Form container `max-w-lg` with `px-4` is fine | No change |

### 4. Admin Layout (`AdminLayout.tsx`)

| Issue | Fix |
|-------|-----|
| Sidebar collapses via SidebarProvider — works | No change needed |
| Header breadcrumbs hidden on mobile — good | No change |
| Main content `p-4 md:p-6` — good | No change |

### 5. Dashboard Home (`DashboardHome.tsx`) — Most Changes

| Issue | Fix |
|-------|-----|
| Stats grid `grid-cols-2 lg:grid-cols-4` — good | No change |
| Schedule + Checklist `lg:grid-cols-3` — stacks on mobile — good | No change |
| WhatsApp + Revenue Goal `lg:grid-cols-2` — good | No change |
| Website + Revenue + Notes `lg:grid-cols-3` — good | No change |
| Quick Actions `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` — good | No change |
| Recent Patients `sm:grid-cols-2 lg:grid-cols-4` — good | No change |
| **Timeline items**: right-side time + badge layout wraps badly on small screens | Change flex direction to column on mobile: `flex-col sm:flex-row` for the inner row |
| **Stat cards**: `text-2xl` value too large on 360px with 2-col grid | Reduce to `text-xl sm:text-2xl` |
| **Growth tip banner**: button wraps oddly | Make banner `flex-col sm:flex-row` |

### 6. Appointments Page (`AppointmentsPage.tsx`)

| Issue | Fix |
|-------|-----|
| Calendar strip `grid-cols-7` — very tight on mobile | Add `overflow-x-auto` wrapper, or reduce day cell padding on mobile |
| Status summary `grid-cols-4` — cramped on 360px | Change to `grid-cols-2 sm:grid-cols-4` |
| Appointment cards: action buttons wrap badly on mobile | Stack actions below the patient info on mobile: `flex-col` always, actions as a separate row |
| Filter row works with `flex-col sm:flex-row` — good | No change |

### 7. Patients Page (`PatientsPage.tsx`)

| Issue | Fix |
|-------|-----|
| Patient grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` — good | No change |
| Patient detail Sheet `w-full sm:max-w-lg` — good | No change |
| Detail info grid `grid-cols-2` — fine on mobile | No change |

### 8. Prescriptions Page (`PrescriptionsPage.tsx`)

| Issue | Fix |
|-------|-----|
| Prescription cards may have cramped layout on mobile | Ensure card content uses `flex-col sm:flex-row` for patient info + actions |
| Dialog form grid fields need `grid-cols-1 sm:grid-cols-2` | Fix any `grid-cols-2` to be responsive |

### 9. Billing Page (`BillingPage.tsx`)

| Issue | Fix |
|-------|-----|
| Revenue cards `sm:grid-cols-3` — stacks on mobile — good | No change |
| Transaction list + donut chart `lg:grid-cols-3` — stacks — good | No change |
| Transaction card content `flex items-center justify-between` — badges + amount wrap badly on 360px | Change to `flex-col sm:flex-row` with badges wrapping below on mobile |

### 10. Blog Page (`BlogPage.tsx`)

| Issue | Fix |
|-------|-----|
| Blog post cards layout | Ensure responsive stacking |
| Editor dialog is `sm:max-w-2xl` — may need `max-h-[90vh] overflow-y-auto` for mobile | Add scroll support |

### 11. Settings Page (`SettingsPage.tsx`)

| Issue | Fix |
|-------|-----|
| Tabs overflow on mobile — 4 tabs (`Profile`, `Clinic`, `Subscription`, `Account`) may not fit | Make TabsList scrollable: add `overflow-x-auto` and `flex-nowrap` |
| Profile photo + info layout `flex items-center gap-5` — works | No change |
| Form grids `sm:grid-cols-2` — good | No change |
| Plan comparison `sm:grid-cols-2` — good | No change |

### 12. Reviews Page (`ReviewsManagePage.tsx`)

| Issue | Fix |
|-------|-----|
| Review cards | Ensure action buttons stack on mobile |

### 13. My Website Page (`MyWebsite.tsx`)

| Issue | Fix |
|-------|-----|
| This is a 629-line file with accordion sections | Ensure all form grids use responsive `sm:grid-cols-2` patterns |
| Preview iframe device toggle | Hide tablet/mobile toggles on small screens (no room for side-by-side preview) |

### 14. Doctor Public Page components

| Component | Fix |
|-----------|-----|
| `Navbar.tsx` | Mobile menu already works — no change |
| `HeroBanner.tsx` | Verify image + text stacking |
| `BookingWidget.tsx` | Ensure form fields stack on mobile |

---

### File Summary

| File | Changes |
|------|---------|
| `LandingNavbar.tsx` | Add CTA buttons in mobile menu |
| `LandingHero.tsx` | Constrain hero image on mobile |
| `Auth.tsx` | Responsive padding on form card |
| `Onboarding.tsx` | `grid-cols-1 sm:grid-cols-2` on two-column fields |
| `DashboardHome.tsx` | Responsive timeline items, smaller stat text, responsive tip banner |
| `AppointmentsPage.tsx` | Responsive status grid, calendar overflow, card action stacking |
| `PrescriptionsPage.tsx` | Responsive dialog form grids, card layouts |
| `BillingPage.tsx` | Responsive transaction card layout |
| `BlogPage.tsx` | Editor dialog scroll, responsive cards |
| `SettingsPage.tsx` | Scrollable tabs on mobile |
| `ReviewsManagePage.tsx` | Responsive action buttons |
| `MyWebsite.tsx` | Responsive form grids throughout |

### Build Order
1. Dashboard + AdminLayout (most used page)
2. Appointments + Patients + Prescriptions pages
3. Billing + Blog + Settings + Reviews pages
4. Auth + Onboarding
5. Landing page minor fixes
6. MyWebsite page form grids
7. Doctor public page verification

