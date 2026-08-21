# Doctylia — Product Requirements Document

**Document status:** Draft, grounded in the current codebase as of 21 August 2026.  
**Audience:** Founders, hiring, fundraising, and engineers joining the project.  
**Legal entity (from Privacy Policy / Terms):** Jeevijay Technologies Pvt. Ltd., operating as Doctylia.

Where a claim is marketing copy rather than verified product behaviour, or a business decision is not encoded in the product, it is marked **`[TBD — confirm with founder]`**.

---

## 1. Overview

Doctylia is a multi-tenant SaaS for **solo doctors and small clinics in India**. It gives each doctor a branded booking website plus a practice admin panel (appointments, patients, prescriptions, billing, staff) on one platform.

That audience is confirmed by the public homepage: India-first copy (“India’s #1 … for doctors”), Indian rupee pricing, UPI/Razorpay payments, Indian mobile validation, GST invoices, Hindi-capable AI blog writing, and specialty targeting (GP, dentist, paediatrician, cardiologist, and others). The landing page does **not** currently describe hospital chains or large multi-location groups as the primary buyer.

**Core value proposition (as sold on the homepage):** a doctor can sign up, complete a short clinic setup, and go live with a site where patients book (and optionally pay) 24/7 — without building or maintaining their own website or installing a patient app.

**Product shape:** one web app with four surfaces:

| Surface | Who uses it | Typical URL |
|---|---|---|
| Public marketing site | Prospective doctors | `/` |
| Doctor’s public booking site | Patients | `/dr/:slug` |
| Practice admin panel | Doctors and their staff | `/admin/*` |
| Platform operations panel | Doctylia’s own team | `/superadmin/*` |

**Shipped vs in progress:** Most of the four surfaces are implemented and wired to a live Supabase backend. **Patient website inquiries** (contact form → admin Inquiries) is present in the working tree as new UI + a dated migration (`patient_queries`) and should be treated as **in-progress / not yet confirmed as production-shipped**. Marketing claims that are **not** implemented are listed in §6.

---

## 2. User Roles & Personas

Doctylia serves four distinct user types. Practice login (doctor/staff) is separate from platform-operator login.

### 2.1 Patients

People who visit a doctor’s Doctylia site. They do **not** create a Doctylia account.

**They need:**

- Find the doctor, services, hours, location, reviews, and (if enabled) blog posts
- Book a clinic visit; on Premium (or an override), book an **online consultation**
- Pay online via Razorpay (UPI / card / net banking) or choose pay-at-clinic when the doctor does not require prepayment
- Receive a token number, appointment slip, and payment slip; look up, reschedule, or cancel via `/dr/:slug/manage` using token + phone
- Send a general “get in touch” message without booking (**in progress** — see Inquiries)
- Join a Zoom video visit when the appointment is online and a meeting has been created

**They do not need:** a patient portal login, medical-record self-service, or a native app. Those are not in the product.

### 2.2 Doctors (practitioners)

The paying customer. A doctor has a practice profile, a public slug (e.g. `/dr/clinic-name`), and full admin access.

**They need:**

- A branded site they can edit without a developer
- Appointments, walk-in/token flow, and today’s queue
- Patient list, prescriptions, and (on Premium) full medical records + checkup reminders
- Billing: consultation payments, GST invoices, CSV export, bank/UPI details for payouts
- Blog + AI writer (Pro+), reviews, staff accounts (Premium)
- Subscription: 7-day trial, then Pro or Premium; renew, upgrade, schedule a plan change, or reactivate
- Support tickets to Doctylia’s team

**Auth:** email/password or phone OTP. Google sign-in is advertised in the UI as **coming soon**.

### 2.3 Staff

Clinic team members invited by a doctor. Staff have **no** practice profile of their own; they act on the assigned doctor’s practice, with checkboxes for what they can see and change.

**They need:**

- A separate staff login (`/staff-login`) with a username/password the doctor sets
- Only the modules the doctor granted (dashboard, website, appointments, patients, prescriptions, reviews, inquiries, blog, billing, profile, staff)
- Blocked access if they type a URL they are not allowed to use

Staff management itself is a **Premium** (or override) feature. Support tickets from staff currently hit a page that is empty under database rules (tickets are scoped to the doctor’s own login) — see §6.

### 2.4 Superadmin (platform operations)

Doctylia’s internal team. Access is a platform **admin** role, not the doctor’s practice profile.

**They need:**

- See all doctors, trials, and conversions
- Change plans and prices, grant one-off feature access, suspend a public site
- Collect and pay out patient payments; see subscription revenue
- Handle marketing leads and doctor support tickets
- Moderate blogs/reviews, invite ops teammates, audit actions, test notifications

---

## 3. Core Feature Areas

Status key: **Shipped** = implemented in the product UI and backend. **In progress** = in the current working tree, not treated as live until released. **Marketing-only** = promised on the site or unused components, not built.

### 3.1 Public marketing site (`/`)

**Shipped**

- Hero, trust bar, media logos, feature grid, before/after, how-it-works, dashboard preview, specialties, pricing, testimonials, FAQ, contact form, CTA, footer
- Auth (`/auth`): signup, login, forgot password; phone OTP; Cloudflare Turnstile
- Staff login, password reset, onboarding wizard (name, specialty, clinic, city/state, fee → live site)
- Terms (`/terms`) and Privacy (`/privacy`) — **legal drafts**, not counsel-signed

**Contact form** writes to `enquiries`; Superadmin **Leads** is the back office.

**Pricing shown:** Pro and Premium, monthly INR, “7-day free trial, no credit card.” Default list prices in code: **₹1,499 / ₹3,999** per month (overridable in Superadmin Feature Flags). Trial length shown as 7 days.

**Marketing claims that are not verified as product metrics** (hero “2,847 doctors joined”, trust bar “10,000+ doctors / 50,000+ appointments / 200+ cities / 99.9% uptime”, specialty headcounts): **`[TBD — confirm with founder]`**. Treat as campaign copy until sourced.

Components that exist in the repo but are **not** on the current homepage: `DetailedFeatures`, `Guarantee`, `SuccessMetrics`. Claims that only live there (custom domains, calendar drag-and-drop, 30-day money-back, full data export as a guarantee chip) are **not** current homepage commitments.

### 3.2 Doctor’s public booking site (`/dr/:slug`)

**Shipped**

| Module | What patients see |
|---|---|
| Navbar / hero | Doctor name, photo, clinic, CTA to book |
| About | Bio, qualifications (toggleable) |
| Services | Named services, prices, clinic vs online types |
| Gallery | Clinic photos (optional) |
| Booking widget | Multi-step: type → service → date → 30-min slots → patient details → review & pay |
| Reviews | Public ratings (toggleable) |
| Blog | Preview + `/dr/:slug/blog` list and post pages (optional) |
| Clinic details | Address, hours, map-oriented info |
| Footer | WhatsApp chat link if a number is configured |
| Manage visit | `/dr/:slug/manage` — lookup by token + phone; reschedule/cancel within cutoff; Zoom card when applicable |

**In progress**

- **Contact / inquiry form** on the public site (`ContactQueryForm`) → `patient_queries` → admin Inquiries. Spam: honeypot + 2-minute per-contact cooldown.

**Behaviour notes**

- Cancelled-plan doctors show “clinic temporarily unavailable” instead of the site.
- Online consultation is gated (Premium or a Superadmin feature override).
- Payments: Razorpay Checkout when live keys/mode allow it; otherwise **mock checkout** in test mode, or **pay at clinic** when payment is not required.
- Booking settings (advance days, max patients per slot, cancel/reschedule cutoff, auto-confirm, buffer minutes) are edited in **My Website**.

### 3.3 Practice admin panel (`/admin/*`)

Sidebar items and what they actually do:

| Sidebar item | Status | What it does |
|---|---|---|
| **Dashboard** | Shipped | Today’s appointments, counts (appointments, patients, revenue), 30-day revenue chart, growth tips, public-site link, trial/cap warnings |
| **My Website** | Shipped | Live preview (desktop/tablet/mobile). Accordion editor: hero, quick stats, about, services, gallery, working hours, online consult (Premium), booking settings, reviews show/hide/pin, blog section toggle, clinic details, WhatsApp number/message. Profile editor is embedded for site-facing identity. |
| **Appointments** | Shipped | List/filter, create, edit, status (pending / completed / cancelled / no-show), payment status, Zoom for online visits, bulk delete. Completing a visit can generate an invoice. |
| **Patients** | Shipped | Directory, add/edit, search, date filter, **CSV export** (not import), bulk delete. Opening a patient goes to the medical record if entitled. |
| **Prescriptions** | Shipped | Create/edit/print PDF slips: diagnosis, structured medicines, advice, follow-up. |
| **Reviews** | Shipped | List public reviews, pin/unpin, stats (average, verified, pinned). Hide/show is on **My Website**, not this page. |
| **Inquiries** | In progress | Inbox for website contact-form messages; statuses new / read / responded. Not wired to the notification bell (intentional). |
| **Blog** | Shipped | CRUD posts, publish, images, rich text. **AI Blog Writer** (Pro+) drafts articles via an edge function; Hindi is marketed. |
| **Billing** | Shipped (Pro+) | Transactions + invoices, GST line when the clinic is GST-registered, PDF, CSV export of transactions. |
| **Staff Management** | Shipped (Premium+) | Create staff, permissions matrix, reset password, disable/delete. |
| **Settings** | Shipped | Tabs: **Profile** (identity, GSTIN, bank/UPI for payouts), **Subscription** (trial/Pro/Premium, renew/upgrade/schedule, usage cap), **Account** (delete account). Staff only see Profile. |
| **Contact Support** | Shipped | Doctor (or staff UI) creates tickets; Superadmin replies. Staff-submitted tickets are a known gap (see §6). |

**Patient medical record** (Premium+), from a patient row: overview, medical history, medications, allergies, visits, documents, timeline, **regular checkup reminders** (WhatsApp / SMS / in-app, with a background worker).

**Locked features:** if the plan (or override) does not include a module, the doctor sees an upgrade card rather than the full tool.

### 3.4 Superadmin panel (`/superadmin/*`)

| Sidebar item | Status | What it does |
|---|---|---|
| **Overview** | Shipped | Counts: doctors, trials, paid, expired/cancelled, appointments, **patient billing volume**; signup chart; trials ending soon |
| **Doctors** | Shipped | Directory, search, plan badges, messages/broadcast, bulk delete. Detail: stats, suspend (hides public site), trial end, plan tier, **per-feature access overrides** |
| **Leads** | Shipped | Marketing `enquiries` pipeline: new / contacted / converted / lost |
| **Subscriptions** | Shipped | Per-doctor tier and custom price, scheduled plans, recent plan-upgrade payments, bulk delete |
| **Payments & Payouts** | Shipped | Patient Razorpay collections, doctor ledger, monthly earnings rollup, RazorpayX payouts. **No platform commission** on consultation fees |
| **Support Tickets** | Shipped | All practice tickets; status/priority; replies |
| **Moderation** | Shipped | Publish/unpublish blogs; show/hide reviews |
| **Billing** | Partial | Subscription **revenue dashboard** (plan-upgrade payments, estimated MRR, CSV). **Subscription invoicing UI is explicitly “coming soon”** |
| **Feature Flags** | Shipped | Maintenance mode, announcement banner, displayed trial-days setting, **default Pro/Premium prices**. (Trial-days control does not change the database default for new signups — see §6.) Per-doctor feature on/off lives on **Doctor detail**, not this page |
| **Audit Log** | Shipped | Filterable log of Superadmin actions |
| **Notification Testing** | Shipped | Notification log (WhatsApp / SMS / in-app), test vs live mode |
| **Team** | Shipped | Invite platform `admin` or `staff` roles |

### 3.5 Cross-cutting capabilities

| Capability | Status | Notes |
|---|---|---|
| Appointment booking & management | Shipped | Public widget + admin; 30-minute slots; token numbers |
| Patient records | Shipped, Premium-gated | Full chart + documents + checkup alerts |
| Prescriptions | Shipped | PDF slip |
| Billing & revenue (practice) | Shipped, Pro-gated | GST 18% when GST-registered; Razorpay |
| Staff + permissions | Shipped, Premium-gated | See permission table below |
| Subscriptions | Shipped | Trial → Pro/Premium; Razorpay for plan payments; pending/scheduled plan changes |
| AI Blog Writer | Shipped, Pro-gated | Edge function |
| Website builder | Shipped | My Website + public site |
| Feature overrides | Shipped | Superadmin can force a feature on/off per doctor without changing billed plan |
| WhatsApp / SMS | Partial | Checkup reminders and test sends exist; live provider + TRAI DLT / WhatsApp template approval **`[TBD — confirm with founder]`**. Appointment “auto WhatsApp reminders” is heavily marketed; production delivery vs simulation depends on notification mode |
| Zoom online consult | Shipped, Premium-gated | `create-zoom-meeting` |
| Custom domain | **Not built** | FAQ still sells ₹4,999/year |
| Patient CSV import | **Not built** | FAQ still promises it; **export** exists |
| Google login | **Not built** | “Coming soon” toast |

**Staff permission modules (shipped):** Dashboard; My Website (view/edit/settings); Appointments (view/create/edit/cancel); Patients (view/add/edit/medical records); Prescriptions; Reviews; Blog; Billing; Profile; Staff; Inquiries (view/manage).

**Plan-gated feature keys (shipped):**

| Feature | Default minimum plan |
|---|---|
| AI Blog Writer | Pro |
| Billing & Invoices | Pro |
| Online Consultation | Premium |
| Patient Medical Records | Premium |
| Staff Management | Premium |

Branded website, online booking, and the appointment cap apply on Pro. Trial is marketed as **full access** for 7 days (internally a trial status; UI still labels the post-trial floor as Pro).

---

## 4. Business Model

### 4.1 Who pays Doctylia

**Platform revenue is doctor subscription fees only.** There is **no per-transaction commission** on patient consultation payments. Doctors keep the fee they charge; the platform’s take is the monthly (or custom) plan price.

`[TBD — confirm with founder]`: target mix of Pro vs Premium, annual billing, discounts, and whether commission will ever return.

### 4.2 Doctor subscription

| Plan (customer-facing) | Default price | Position |
|---|---|---|
| **7-day free trial** | ₹0 | Full access; no card required (as marketed) |
| **Pro** | ₹1,499 / month | Solo doctors going digital: site, booking, cap of **100 appointments/month** (configurable platform default), basic analytics, AI blog, billing |
| **Premium** | ₹3,999 / month | Growing practices: unlimited appointments, online consult, patient records, checkup alerts, staff |

Prices are stored as platform defaults and can be overridden **per doctor**. Superadmin can change list prices for future purchases/renewals.

Internal `plan_tier` values include `free` / `pro` / `premium`; `free` is labelled **Pro** in the product so customers never see a “Free” paid tier. Statuses include `trial`, `active`, `expired`, `cancelled`.

Doctors pay upgrades/renewals through **Razorpay** (`create-plan-upgrade-order` / `verify-plan-upgrade-payment`). They can schedule a future plan (e.g. switch to Pro at period end).

**Not shipped:** a full recurring-subscription billing product (auto-debit every month as a first-class invoice object). Superadmin Billing tracks `plan_upgrade_payments` and estimated MRR; **subscription invoices are “coming soon.”**

### 4.3 Patient money flow

1. Patient pays on the doctor’s site (or pays at the clinic).
2. Online pay: Razorpay order → Checkout → verify webhook/signature → appointment + `payments` row.
3. Test mode can simulate payment without live charges.
4. Doctor share is **100% of the consultation amount** (ledger still has a commission field historically; it is not taken).
5. Superadmin runs monthly earnings and **RazorpayX payouts** to the doctor’s bank/UPI on file.
6. Refunds exist as an edge function (`refund-payment`).

`[TBD — confirm with founder]`: payout schedule (monthly vs on-demand), who absorbs Razorpay MDR/GST on gateway fees, and refund policy copy (Terms still have placeholders).

### 4.4 Other marketed revenue

FAQ: **custom domain ₹4,999/year** — **not implemented**. Do not treat as current SKU.

---

## 5. Non-Functional Requirements

### 5.1 Compliance (India)

| Topic | Product reality | Open item |
|---|---|---|
| **DPDP Act, 2023** | Privacy Policy drafted against current data (bookings, prescriptions, payouts, Razorpay). Explicit booking-form consent, retention periods, self-service access/erasure, and a named **Grievance Officer** are still placeholders | Counsel review; designate DPO/Grievance Officer **`[TBD — confirm with founder]`** |
| **TRAI DLT (SMS)** | SMS send path exists (templates + logs); live DLT registration is not encoded as a product setting | Sender ID, DLT entity, template IDs **`[TBD — confirm with founder]`** |
| **WhatsApp Business API** | WhatsApp send path + checkup templates exist; Privacy Policy still says the messaging vendor is not finalized | BSP, WABA, template approval **`[TBD — confirm with founder]`** |
| **Payments** | Razorpay / RazorpayX; card/UPI credentials not stored on Doctylia | PCI remains with Razorpay |
| **GST** | Practice invoices can show 18% GST + GSTIN | Platform GST invoices for subscriptions: not built |

### 5.2 Responsive design

- Marketing and doctor public sites: usable on phone, tablet, and desktop; public doctor pages keep text + media **side-by-side** (scale down, don’t stack to one column) per project convention.
- Admin/superadmin tables: a real `<table>` from `md` up, plus a parallel **card list** on small screens (`md:hidden`).
- My Website preview: desktop / tablet / mobile widths.

### 5.3 Security

- **Platform operators:** `user_roles` (e.g. `admin`); Superadmin routes check a `has_role` database function.
- **Practice:** doctors have `profiles`; staff have `staff_members`. Staff sessions resolve to the **doctor’s** profile for queries; **Postgres RLS** is the real authorization. Sidebar hide + route `PermissionGate` are a second, client-side layer.
- Auth: session in the browser; Turnstile on signup/login; staff passwords managed via edge functions.
- Maintenance mode can block doctor/patient surfaces while Superadmin stays up.

`[TBD — confirm with founder]`: formal pen-test, ISO/SOC claims (FAQ says “enterprise-grade encryption” without a named certification).

---

## 6. Known Gaps & Open Questions

Be honest: this is the product as coded, not the pitch deck.

1. **Inquiries (patient contact form)** — Built in the current branch (public form, admin inbox, RLS, rate limit). Treat as **in progress** until released.
2. **Marketing vs product**
   - Patient **CSV import** promised in FAQ; only **export** exists.
   - **Custom domains** and white-label promised in FAQ; no domain product.
   - Homepage **metrics** (doctor counts, uptime, cities) are static.
   - My Website still labels Razorpay **“Coming Soon / Not connected yet”** even though live Checkout exists — copy is stale.
3. **Google login** — Button shows “coming soon.”
4. **Subscription invoicing** — Superadmin Billing placeholder; no GST invoices for Doctylia’s own fees.
5. **Trial length setting** — Superadmin can save `default_trial_days`; UI warns the **actual signup trial is still a 7-day database default** until a follow-up change.
6. **Staff support tickets** — Support page is not permission-gated; RLS ties tickets to the doctor’s user id, so staff see an empty inbox.
7. **Reviews** — Pin on Reviews page; hide on My Website. Easy to miss.
8. **Legal** — Privacy and Terms are drafts with placeholders (consent UX, retention, refunds, jurisdiction, Grievance Officer). Last updated 13 August 2026 on Privacy.
9. **Notifications** — Dual mock/live mode. Whether every booking confirmation/reminder actually sends on WhatsApp/SMS in production depends on provider config and template approval.
10. **Data export / money-back** — Guarantee component (not on homepage) promises full data export and 30-day money-back; Settings has account delete, not a general “export everything” pack. **`[TBD — confirm with founder]`**
11. **Unused landing sections** — `DetailedFeatures` / `Guarantee` can contradict the live homepage if someone ships them without a copy pass.
12. **Competitive positioning, north-star metric, fundraising narrative** — not in the codebase. **`[TBD — confirm with founder]`**
13. **“Regular checkup alert”** — Shipped inside Premium medical records; not a separate marketing-site module.

---

## 7. Out of Scope / Explicit Non-Goals

Discoverable from the current product (not a promise of future work):

- **No patient login / patient app** — patients use the public site + token lookup.
- **No hospital / multi-doctor enterprise org model** — one doctor profile owns one public site; staff are delegates of that doctor, not a separate clinic tenant.
- **No marketplace** — patients are not browsing a directory of all Doctylia doctors from the marketing homepage.
- **No platform commission on consultations** — by current policy.
- **No first-class recurring subscription invoices** for Doctylia’s own fees (tracked via plan-upgrade payments instead).
- **No custom domain product** in the app (despite FAQ).
- **No patient CSV import** in the app (despite FAQ).
- **No Google OAuth** for doctors yet.
- **No native iOS/Android apps.**
- **No analytics/ad pixels** on the service (stated in Privacy Policy).
- **Doctylia is not the clinical system of record for hospitals** — no inpatient, pharmacy inventory, or lab LIS.

---

## Appendix A — Technical map (for engineers)

See `CLAUDE.md` for the living engineering guide. Short map:

- **Frontend:** Vite, React, TypeScript, Tailwind, shadcn/ui. Routes in `src/App.tsx`.
- **Backend:** Supabase (Postgres + RLS, Auth, Edge Functions, Storage). Schema truth: `supabase/migrations/`. Generated types: `src/integrations/supabase/types.ts` (do not hand-edit).
- **Payments:** Razorpay + RazorpayX via `supabase/functions/create-razorpay-order`, `verify-razorpay-payment`, `razorpay-webhook`, `create-plan-upgrade-order`, `create-doctor-payout`, etc.
- **Plan gating:** `src/lib/planFeatures.ts`, `src/hooks/usePlanAccess.ts`, `src/hooks/useFeatureAccess.ts`, `features` + `doctor_feature_overrides` tables.
- **Staff permissions:** `src/lib/staffPermissions.ts` must stay in sync with `supabase/functions/_shared/staffPermissions.ts`.
- **Four surfaces:** marketing `src/components/landing/*`; public clinic `src/components/doctor/*`; admin `src/components/admin/*`; superadmin `src/components/superadmin/*`.

---

## Appendix B — Status snapshot (Aug 2026)

| Area | Verdict |
|---|---|
| Marketing site + onboarding | Shipped (legal + some FAQ claims lag the product) |
| Public booking + pay | Shipped (test + live payment modes) |
| Admin practice suite | Shipped |
| Inquiries | In progress in working tree |
| Superadmin ops | Shipped except subscription invoicing |
| WhatsApp/SMS at production scale | Partial — plumbing shipped, compliance/vendor TBD |
| Custom domains, CSV import, Google login | Not built |

This PRD should be updated when Inquiries ships, when FAQ/legal are aligned with the product, and when founder TBDs above are decided.
