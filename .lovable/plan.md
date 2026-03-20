

## Plan: Doctylia Landing Page + Onboarding Flow with Supabase Auth

### What We're Building

**Phase 1 (this iteration):** Doctylia marketing landing page + auth/onboarding flow with 1-week free trial. The doctor's public page (already built) moves to `/dr/:slug`.

### Route Structure

```text
/                    → Doctylia Landing Page (marketing)
/auth                → Login / Signup page
/onboarding          → Post-signup onboarding wizard (profile setup)
/admin/dashboard     → Doctor admin dashboard (shell/placeholder)
/dr/:slug            → Doctor's public page (existing, relocated)
```

### 1. Doctylia Landing Page (`/`)

Full marketing page with these sections:
- **Navbar**: Doctylia logo + nav links (Features, How It Works, Pricing, Contact) + "Login" and "Start Free Trial" CTAs
- **Hero**: Bold headline ("India's #1 AI-Powered Platform for Doctors"), subtext, "Start 7-Day Free Trial" button, hero illustration/mockup
- **Trusted By / Social Proof**: Doctor count, clinics, cities stats bar
- **Features Grid**: 6-8 feature cards (Website Builder, Appointments, Billing, Patient Records, AI Blog Writer, Online Consultation, WhatsApp Integration, Analytics)
- **How It Works**: 3-step flow (Sign Up → Set Up Your Clinic → Go Live)
- **Doctor Website Preview**: Screenshot/mockup of the doctor public page
- **Pricing Section**: 3 tiers (Starter, Professional, Premium) with 7-day free trial badge
- **Testimonials**: Doctor quotes
- **FAQ**: Accordion
- **CTA Banner**: Final "Start Your Free Trial" section
- **Footer**: Links, social, legal

### 2. Supabase Setup

Enable Lovable Cloud with:
- **Auth**: Email/password signup + login
- **Tables**:
  - `profiles` (id, user_id FK, full_name, specialization, phone, clinic_name, city, onboarding_completed, trial_start, trial_end, plan_status, created_at)
  - `user_roles` (id, user_id FK, role enum: admin/doctor/staff)
  - Auto-create profile + assign "doctor" role on signup via DB trigger
  - RLS policies: users read/update own profile only
  - `has_role()` security definer function

### 3. Auth Page (`/auth`)

- Toggle between Login and Sign Up
- Email + password fields
- Sign Up creates account → redirects to `/onboarding`
- Login redirects to `/admin/dashboard`
- 7-day trial starts automatically on signup (trial_end = now + 7 days)

### 4. Onboarding Wizard (`/onboarding`)

Multi-step form (3-4 steps):
1. **Basic Info**: Full name, specialization (dropdown), qualifications, experience years
2. **Clinic Details**: Clinic name, city, address, phone, working hours
3. **Profile Photo**: Upload doctor photo
4. **Done**: "Your website is ready!" with link to `/dr/:slug` preview

On completion: sets `onboarding_completed = true`, redirects to `/admin/dashboard`.

### 5. Admin Dashboard (Shell)

Minimal placeholder with:
- Sidebar navigation (Dashboard, My Website, Appointments, Patients, Billing, Settings)
- Welcome card showing trial status ("6 days left in your free trial")
- Quick stats placeholders
- This is just the shell — full admin features come in a future iteration

### 6. File Changes Summary

| Action | Files |
|--------|-------|
| Create | `src/pages/LandingPage.tsx` + 8-10 landing section components in `src/components/landing/` |
| Create | `src/pages/Auth.tsx`, `src/pages/Onboarding.tsx`, `src/pages/AdminDashboard.tsx` |
| Create | `src/components/admin/AdminSidebar.tsx`, `src/components/admin/AdminLayout.tsx` |
| Create | `src/components/ProtectedRoute.tsx` (auth guard) |
| Create | `src/integrations/supabase/` (auto-generated client) |
| Modify | `src/App.tsx` — add all new routes |
| Modify | `src/pages/Index.tsx` — render LandingPage instead of DoctorPublicPage |
| Create | 1 migration: profiles table, user_roles table, trigger, RLS policies |

### Build Order

1. Enable Lovable Cloud (Supabase)
2. Create DB migration (profiles, user_roles, triggers, RLS)
3. Build Landing Page with all sections
4. Build Auth page (login/signup)
5. Build Onboarding wizard
6. Build Admin dashboard shell with sidebar
7. Wire up routes and protected route guard

