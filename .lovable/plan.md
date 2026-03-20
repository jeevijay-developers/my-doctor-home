

## Plan: Full Doctor Admin Dashboard with All Features

This is a large build. We'll do it in **3 sub-phases** within this iteration, each building on the previous.

### Current State
- Landing page, Auth, Onboarding, Admin shell (welcome card only), Doctor public page (hardcoded demo data) — all built
- DB: `profiles` + `user_roles` tables only

---

### Sub-Phase A: Database Foundation

**New tables** (single migration):

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `services` | doctor_id, name, price, type (clinic/online/both), duration, active, sort_order | Doctor's listed services |
| `packages` | doctor_id, name, tagline, price, original_price, duration, features (jsonb), slots_available, is_popular, active | Care packages |
| `working_hours` | doctor_id, day_of_week (0-6), is_open, start_time, end_time, start_time_2, end_time_2 | Per-day schedule |
| `appointments` | doctor_id, patient_name, patient_phone, patient_age, patient_gender, service_name, appointment_type, date, time_slot, status (confirmed/completed/cancelled/no-show), payment_status, amount, token_number | Bookings |
| `patients` | doctor_id, name, phone, email, age, gender, first_visit, last_visit, total_visits, notes | Patient registry |
| `reviews` | doctor_id, patient_name, rating, review_text, is_verified, is_visible, is_pinned, created_at | Patient reviews |
| `gallery_photos` | doctor_id, photo_url, caption, sort_order | Clinic gallery |
| `blog_posts` | doctor_id, title, excerpt, content, featured_image_url, category, is_published, published_at | Doctor blogs |
| `website_settings` | doctor_id (unique), theme, seo_title, seo_description, seo_keywords, whatsapp_number, whatsapp_message, social_facebook, social_instagram, social_youtube, social_linkedin, google_analytics_id, show_online_consultation, online_fee, online_duration, booking_advance_days, require_payment, auto_confirm, max_per_slot, buffer_minutes | All website config |

- All tables have `doctor_id uuid references profiles(id)` + RLS: doctors can CRUD own rows only
- Storage bucket `doctor-uploads` for photos
- Realtime enabled on `appointments` table

---

### Sub-Phase B: Admin Dashboard Pages

**6 full pages** routed under `/admin/*`:

#### 1. Dashboard (`/admin/dashboard`) — Enhanced
- Real stats from DB (appointment count, patient count, today's revenue, website views placeholder)
- Today's appointments list (next 5)
- Recent patients
- Trial status bar

#### 2. My Website (`/admin/my-website`)
- **Left panel (40%)**: Accordion sections — Hero, Quick Stats, About, Services, Packages, Gallery, Online Consultation, Booking Settings, Reviews, Blog (read-only link), Clinic Details, Website Settings
- Each section has ON/OFF toggle + edit form
- **Right panel (60%)**: Live preview iframe showing `/dr/:slug` with query param `?preview=true`
- Top bar: Live/Draft badge, URL with copy, "View Live Page" button, Device tabs (Desktop/Mobile)
- Auto-save with "Saved" indicator

#### 3. Appointments (`/admin/appointments`)
- Calendar view (week) + list view toggle
- Filter by: date range, status, type (clinic/online)
- Each row: patient name, service, date, time, status badge, payment status
- Actions: Confirm, Complete, Cancel, No-Show
- New appointment form (manual booking by doctor)

#### 4. Patients (`/admin/patients`)
- Searchable table: name, phone, last visit, total visits, status
- Click row → patient detail panel (visit history, notes)
- Add patient manually
- Auto-created from appointment bookings

#### 5. Billing (`/admin/billing`)
- Revenue summary cards (today, this week, this month)
- Transactions table from appointments with payment_status
- Filter by date range, status (paid/pending/refunded)
- Invoice-style view per appointment

#### 6. Settings (`/admin/settings`)
- Profile settings (name, specialization, qualifications, photo)
- Clinic settings (name, address, hours)
- Subscription/plan status with trial countdown
- Custom domain request card (UI only — no Razorpay integration yet)
- Logout

---

### Sub-Phase C: Dynamic Public Page

Update `DoctorPublicPage.tsx` to fetch real data from DB:
- Load doctor profile by slug from `profiles`
- Load services, packages, working_hours, reviews, gallery, blog_posts, website_settings
- Booking widget writes to `appointments` table + creates `patients` entry
- Reviews section shows real reviews
- Sections hidden based on `website_settings` toggles

---

### Routing Update

```text
/admin/dashboard     → Enhanced dashboard
/admin/my-website    → Website editor
/admin/appointments  → Appointments manager
/admin/patients      → Patient registry
/admin/billing       → Billing & revenue
/admin/settings      → Account settings
```

`AdminDashboard.tsx` becomes a router that reads the sub-path and renders the right page component.

### File Summary

| Action | Count | Details |
|--------|-------|---------|
| Migration | 1 | All new tables, RLS policies, storage bucket |
| New components | ~25 | Admin page components + sub-components |
| Modified | ~15 | DoctorPublicPage + all doctor/ components to use real data, App.tsx routing, AdminDashboard routing |

### Build Order

1. Run DB migration (all tables + RLS + storage bucket)
2. Build admin sub-router in AdminDashboard
3. Build My Website editor (largest piece)
4. Build Appointments page
5. Build Patients page
6. Build Billing page
7. Build Settings page
8. Update public page to use real DB data

