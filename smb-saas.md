# Doctylia: Master Context for AI Agents

> **Purpose:** This file gives any AI agent (sales, marketing, support, research, writing, or engineering) the full business and product context of Doctylia in one place, so it does not have to rediscover it or guess.
> **Snapshot date:** 28 November 2026 (updated from the 16 Nov 2026 snapshot to add multi-doctor clinics, prescription templates, the clinic-first public site, custom-plan seats and the social media marketing add-on). Facts about the product were read from the repository at that date.
> **Not a source of truth for code.** For engineering rules read `CLAUDE.md`, `AGENTS.md`, `CONTEXT.md` and `docs/` in the repo. This file points to them and does not duplicate their detail.
> **File name note:** it began as a note defining "SMB SaaS" (Section 2) and was expanded into the master context. Rename it (e.g. `AGENT_CONTEXT.md`) if you prefer.

---

## 0. How an agent should use this file

1. Read Sections 1-4 first (what the company is, who buys, what the rules are).
2. Read the section that matches your task (Section 5 product, 6 sales, 7 marketing, 8 compliance, 9 engineering pointers).
3. **Always check Section 11 (Claims and wording rules) before writing anything a customer will see.**
4. If something here conflicts with the live product, the live product wins. Report the conflict (Section 13).
5. Each fact carries a confidence tag where it matters:
   - **[code]** read from the repository on the snapshot date
   - **[user]** stated by the founder or team during work with Claude, not verified in code
   - **[research]** from web sources, mostly vendor blogs; directional, not exact
   - **[assumption]** a planning assumption; replace with real data

---

## 1. The company and product in brief

| Item | Detail |
|---|---|
| Product | **Doctylia** ("The Complete Doctor Platform"), site: doctylia.com |
| Company | Jeevijay Technologies Pvt. Ltd., Kota, Rajasthan, India **[code: legal pages]** |
| Support | support@doctylia.com **[code]** |
| What it is | A multi-tenant SaaS: each doctor/clinic gets a **branded booking website** (`/dr/<slug>`) plus a **practice-management admin panel** (appointments, live queue, patients and records, prescriptions, billing, staff, blog, video consults, analytics), on a Supabase backend **[code]** |
| Customer | Doctors and small clinics in India (the buyer is the doctor or clinic owner; the patient is the doctor's customer, not ours) |
| Business model | Monthly **subscription**: Pro Rs 1,499, Premium Rs 3,999, custom plans on request; **7-day free trial, no card** **[code]** (see Section 5.3 for an open question about a platform charge on online payments) |
| Stage | **Launched.** Many leads exist; conversion to paying customers is weak; marketing reach is low **[user]** |
| The core business problem | Not finding leads. **Converting existing leads into paying doctors** and getting doctors to use the product successfully **[user]** |
| Repo is synced with | Lovable (pushes to `main` sync into the Lovable editor) **[code: CLAUDE.md]** |

---

## 2. What "SMB SaaS" means (and why it shapes our playbook)

**SaaS** = Software as a Service: cloud software sold by subscription; the vendor runs hosting, updates and security.
**SMB** = Small and Medium-sized Business customers, as opposed to large enterprises.
**SMB SaaS** = subscription software sold to small businesses, usually at a fixed low monthly price, with fast self-serve onboarding, one decision-maker, a high-volume sales motion, free trials and scalable support.

| | SMB | Enterprise |
|---|---|---|
| Typical size | 1-250 employees | 250+ |
| Buyer | Owner or one decision-maker | Procurement and committees |
| Sales cycle | Days to weeks, often self-serve | Months, RFPs, contracts |
| Price point | Low to mid | High, custom |
| Support | Self-service, chat/WhatsApp, light onboarding | Dedicated account managers, SLAs |
| Churn risk | Higher (easy to cancel) | Lower (annual contracts) |

**Doctylia is SMB SaaS:** the customers are individual doctors and small clinics; the price is a flat monthly subscription; onboarding is self-serve with optional help; the decision is usually made by one person quickly.

**Consequences for how agents should think and write:**
- **Speed over ceremony.** Respond to leads in minutes, not days.
- **The product sells itself if activated.** The goal of a trial is "page live + first real booking within 48 hours".
- **Volume and repeatability.** A lightweight, measured process beats bespoke deals.
- **Price is judged against the doctor's own revenue.** Frame ROI in the doctor's numbers (e.g. "a few extra patients a month covers Pro").
- **Retention is earned in the first weeks.** Churn is high if the doctor does not see value early.

---

## 3. The customer

### 3.1 Ideal customer profile (ICP)
- **Best fit:** private OPD clinics with 1-3 doctors in Tier-1/2 cities; specialties such as GP, dentist, paediatrician, gynaecologist, dermatologist, physiotherapist, ENT, eye; 15-60 patients/day; booking by phone/walk-in/register/WhatsApp; one receptionist. **[assumption]**
- **Poor fit:** large hospitals with their own IT, employed-only doctors without a practice, practices with very poor internet.

### 3.2 Personas (examples)
Solo GP (wants fewer phone calls), dentist (slots, no-shows), paediatrician/gynaecologist (follow-ups and queue), specialist with tele-consult potential (reach beyond town), clinic owner with 2-3 doctors (control over staff and money), receptionist (daily user and influencer), young doctor starting a practice (online presence).

### 3.3 Buying process
Doctor or clinic owner decides; influencers are the receptionist, a family member who runs the clinic, an accountant, or a doctor friend. Typical triggers: new clinic, new receptionist, bad week of no-shows, a colleague's website, festive-season rush. Barriers found in research on Indian clinicians: data privacy, technical skills and training, infrastructure and internet, personal beliefs about technology **[research]**.

### 3.4 Common doctor pains and the matching feature
Phone rings all day -> online booking. Patients forget -> reminders. Paper files -> digital records. Unknown income -> billing dashboard. Not found online -> branded site, directory, articles hub. No staff control -> role permissions. Far-away patients -> video consults.

---

## 4. Roles, teams and who owns what

| Team / role | Owns |
|---|---|
| Founder / product owner | Product, pricing, final approvals, compliance sign-off |
| Sales team (5 reps + 1 Head) | Lead work, calls, demos, trials, closing, account ownership after sale |
| Marketing team (about 4 people assumed) | Message, content, social, ads, events, SEO, referral, tracking, enablement |
| Onboarding/training specialist (to be designated) | Day-0 setup, staff training, activation in 48 hours |
| Support desk (L1) | Tickets and how-to questions |
| Tech lead (L2) / Developers (L3) | Escalations and bugs; developers do **not** run customer demos or training |

**Definitions agents must use consistently**
- **Demo:** pre-sale, a 15-minute live walkthrough by a sales rep.
- **Training:** post-sale, onboarding specialist teaches the doctor and staff (about 2 sessions, 45-60 minutes each).
- **Support:** ongoing help for problems (ticket or WhatsApp), L1 -> L2 -> L3.
These three are separate; mixing them was a source of confusion in the sales team.

---

## 5. Product reference (as of 16 Nov 2026)

### 5.1 Four app surfaces **[code]**
1. **Marketing site** (`/`, `/features`, `/pricing`, `/about`, legal pages). Enquiries go to Super Admin > Leads (new, contacted, converted, lost).
2. **Doctor/clinic public site** (`/dr/<slug>`, `/dr/<slug>/blog`, `/dr/<slug>/manage`, `/dr/<slug>/queue`): profile, services and fees, gallery, map link, reviews, contact form, WhatsApp button, 5-step booking widget, patient manage-booking page, live queue screen (token numbers only). **A clinic with 2+ active doctors gets a clinic-first layout** (team hero, doctor cards, a full-page profile per doctor) instead of the single-doctor layout — see "Multi-doctor clinics" below; this redesign was still partly uncommitted at snapshot date and must be re-checked.
3. **Doctor/staff admin panel** (`/admin`): Dashboard, My Website, Appointments, Live Queue, Patients and medical records, Prescriptions (incl. Templates), Doctors (practitioners, multi-doctor clinics only), Reviews, Inquiries, Blog, Billing, Staff, Settings, Support.
4. **Super Admin** (`/superadmin`): Overview, Doctors, Leads, Subscriptions, Plan Requests (custom plans, incl. doctor-seat and social-media-marketing requests), Tickets, Moderation, Billing, Payments, Flags (incl. the multi-doctor launch switch), Audit log, Notifications, Team (permission-scoped team accounts).
Also: **Doctor directory** (`/doctors`, `/doctors/<city>/<specialty>`; search incl. pincode; ranking never paid; doctors can opt out; a clinic with 2+ active doctors can get a per-doctor directory row) and **Health Articles hub** (`/health-articles[/category]`; index of doctors' published articles; canonical stays on the doctor's page; AI-assisted articles carry a disclosure).

### 5.2 Features **[code unless noted]**
| Feature | Notes |
|---|---|
| Branded website | Server-rendered for Google and link previews via an Edge function |
| Online booking | Clinic or online; slots, two sessions a day, advance window; one patient per slot; token for each booking |
| Live queue | Staff call next, complete, skip, recall, no-show, priority with a reason; public screen shows numbers only |
| Online payments | Razorpay checkout; doctor onboards a Razorpay linked account (KYC + bank); settlement shown as T+2 business days |
| Billing and invoices | Invoice only when the visit is completed and paid (or pay-at-clinic); CSV export; refunds |
| Patients and records | Auto-managed patient records and visit counts; tabs for history, medications, allergies, documents, timeline (Premium) |
| Prescriptions | Digital prescription slip with registration number (Premium) |
| Video consults | Zoom link created per booking (Premium) |
| Staff roles | About 30 permissions in 11 areas, enforced server-side; separate staff login (Premium) |
| Check-up reminders | Scheduled WhatsApp/SMS follow-up reminders (Premium) |
| AI blog writer | Drafts health articles; doctor reviews; AI disclosure shown on AI-assisted posts |
| Reviews and inquiries | Doctor controls review visibility; inbox for site enquiries |
| Analytics dashboard | Schedule, appointments, patients, revenue, plan usage |
| Prescription templates | Doctor builds their own slip layout (extra fields, tooth chart, pain scale, letterhead mode) under Prescriptions > Templates; a default built-in layout is unaffected (Premium) |
| Multi-doctor clinics | A clinic can add more than one doctor (practitioners), each with their own slots, queue, prescriptions and (opt-in) revenue view; **built and merged to the codebase, but the platform-wide launch switch was still OFF at last review** — see the dedicated section below. Demo and quote only after confirming the launch flag and a priced seat are live for that clinic |
| Doctor-seat purchase | Extra doctor slots beyond the first are a paid add-on (Premium, active plan only); the per-seat price is a platform setting and was unset/hidden for most of the product's life — **confirm a live price before quoting** |
| Social media marketing | A superadmin-run add-on (posting, reporting, ad spend) recorded against a doctor's custom plan; **the team delivers it manually, the app only tracks scope/status/fee** — do not describe it as a self-serve platform feature |
| Custom plans | Doctor requests a feature set and price on top of Pro/Premium; can include a custom monthly appointment limit and/or the social media marketing add-on |
| Support tickets | In-app tickets by category with replies |
| Custom domain | **[user]** reported live; **not seen in code at last review**; demo before quoting |
| WhatsApp appointment reminders | **[user]** reported live; check-up reminders are confirmed in code; demo before quoting |
| Patient data import | CSV import exists for Pro/Premium clinics (import_patients RPC, rate-limited, no medical history/reports); confirm current limits before quoting a number |

### 5.2b Multi-doctor clinics **[code / user, snapshot 2026-11-27/28 — re-check before quoting]**
A clinic can now have more than one doctor under one subscription instead of one doctor = one account:
- One doctor is always the **primary** (the owner, by default); added doctors are **practitioners** with their own working hours, slot/queue numbers, prescriptions and (owner opt-in) revenue visibility.
- **A clinic with 2+ active doctors is multi-doctor regardless of plan tier**; the plan only controls whether the clinic may *add or re-enable* a doctor. The first extra doctor seat is included in Premium; further seats are a **paid add-on**, priced per seat per (up to 30-day) period, non-refundable.
- **Status at last review:** the feature is fully built and merged, but the **platform-wide launch switch (`multi_doctor_enabled`) was still off**, no seat price had been confirmed live, and no real clinic had piloted it yet. The public-site redesign for multi-doctor clinics (clinic-first homepage, per-doctor profile pages) was partly uncommitted. **Do not promise multi-doctor support to a prospect, and do not quote a seat price, until this is confirmed enabled in the live product.**
- Clinical records are shared across a clinic's doctors by default (an owner-only switch can restrict a doctor to their own patients' visits/prescriptions/documents); the patient list itself always stays clinic-wide so reception can find any walk-in.
- Doctor logins (separate from staff) can view their own prescriptions/revenue but do not book appointments; only reception/owner books.
- Full design: `docs/superpowers/specs/2026-11-25-multi-doctor-clinic-design.md` and the "Multi-doctor clinics" section of `CLAUDE.md`.

### 5.3 Plans and pricing **[code defaults; editable in Super Admin]**
| | Pro | Premium |
|---|---|---|
| Price | Rs 1,499/month | Rs 3,999/month |
| Positioning | Solo doctors going digital | Growing practices |
| Included | Website, online booking, billing and invoices, AI blog writer, basic analytics | Everything in Pro plus unlimited appointments, online consultation, patient records, check-up alerts, staff roles |
| Monthly appointments | Standard limit (default 100, platform setting) | Unlimited |
| Trial | 7 days, no card; the trial unlocks Premium features | |
Custom plans exist for special needs. Prices and trial length can change in Super Admin; check the live pricing page. Whether list prices include 18% GST has **not** been confirmed.

> **Open payment-economics question (read carefully).** In the code and legal pages as of 16 Nov 2026, online patient payments **deduct a platform service charge** (default 10%, overridable per doctor; see `docs/adr/0001-razorpay-route-commission-split.md`, `CONTEXT.md`, the Pricing page FAQ and Terms). Management said it intends to **remove** this **[user]**. Until that is confirmed in the live product and legal pages, **agents must not say "no commission" or "you keep the full fee"** and must not state a specific percentage as permanent. Pay-at-clinic bookings carry no platform charge.

### 5.4 Trust and security facts that are safe to say **[code]**
- Each doctor's data is separated; staff see only what the doctor allows, enforced on the server.
- Public queue screens show token numbers only.
- Directory ranking is never sold.
- AI-assisted articles are labelled; the doctor reviews every article.
- Do **not** claim: "100% secure", specific certifications, "NMC approved", "DPDP compliant". Say "designed to keep data separated and access-controlled".

### 5.5 Known gaps and risks in the product **[code review]**
- **No medical-registration verification** of doctors yet (a written plan exists: `Doctylia_Doctor_Verification_Implementation_Plan.md`). So never write "verified doctor" on materials.
- A doctor could historically edit any column of their own profile under the profile RLS policy; sensitive columns (plan, payment flags) should be locked. Public profile reads were being narrowed (`publicProfileColumns`, anon column-grant migrations in Nov 2026); re-check before relying on it.
- Legal pages (Terms, Privacy, Refund) were drafts with placeholders at last review; they must match what sales says.
- Landing/features page claims that were unsupported at last review: "10,000+ doctors", "2,847 doctors", "Rs 2.4 Cr revenue", "98% satisfaction", "India's #1", "30-Day Money Back" (contradicts the Refund Policy), and percentage outcome claims. Some may have been removed since; check the live pages.
- No separate evidence of Hindi UI; support language coverage should be confirmed.
- **Multi-doctor clinics** (Section 5.2b) are built but the platform launch switch was off at last review, no clinic had piloted it, and part of the clinic-first public-site redesign was uncommitted. Treat as not generally available until confirmed live.
- **Doctor-seat pricing** was unset/hidden for most of the product's life; a price being present in `platform_settings` does not by itself mean sales may quote it — confirm it is the intended, final price.
- **Social media marketing add-on**: the app only records scope, status and fee for a service the team delivers by hand; it is not a self-serve feature and its fee sits outside the subscription and outside any Razorpay order.

---

## 6. Sales system (what the sales team does and how)

### 6.1 Diagnosis
Likely reasons results are poor: slow response, wrong call times (OPD), untrusted caller numbers, too few touches, no lead scoring, feature-first pitch, receptionist gatekeeping, weak proof, trials that never get activated, low awareness. A 2-week lead audit (export all leads, tag source, time-to-first-contact, attempts, outcomes, listen to calls, review trials) tells which leak matters most.

### 6.2 Core mechanics
1. **Score every lead** on Fit and Intent separately; call high-fit/high-intent first; warm high-fit/low-intent leads before calling; nurture low-fit.
2. **Speed-to-lead:** first touch within 5 minutes during working hours. One B2B SaaS benchmark reports 32% close rate under 5 minutes vs 12% after 24 hours **[research]**.
3. **14-day multichannel cadence** of calls and WhatsApp (about 6+ touches); about three call attempts are typically needed to connect **[research]**.
4. **Call timing:** avoid peak OPD; ask the best time on first contact; log it.
5. **Calls:** permission-based opener, pain question, small next step (15-minute demo or free setup); receptionist script that treats staff as future users.
6. **WhatsApp-first:** official API with approved templates; personal 30-second video; link to a live sample doctor page in the same specialty.
7. **Demo:** book close to interest (same/next day), confirm instantly, remind twice, 15 minutes, end with a calendar action; recover no-shows within 10 minutes.
8. **Trial activation:** done-for-you setup on Day 0; goal "page live + first real booking within 48 hours"; Day-3 rescue call; Day 5 review; Day 6 close; Day 7 convert or log reason.
9. **Reactivation:** segment old leads (never activated, expired trial, demo done, "call later", never reached, lost on price) and run small pilots.
10. **Handover:** a standard form from sales to onboarding on trial start.

### 6.3 Metrics and targets **[assumption until baselined]**
North star: **activated paying doctors** (paid plan and at least 10 real bookings in the last 30 days). Funnel: speed-to-lead, contact rate, demo booked, show rate (target 75%+), demo-to-trial (50%+), activation (50%+), trial-to-paid (25-35%), Day-90 retention. Reference benchmark: one study reports 24% median trial-to-paid for 7-day B2B trials, 35-45% for top performers **[research, vendor]**.

### 6.4 Objections (short)
"Send details" -> send a 1-minute video and book 5 minutes. "No time" -> we set it up. "Too expensive" -> tie to their fee and a few extra patients; 7 days free. "On Practo" -> keep it; this is your own site and patient list. "Is data safe?" -> separated, permissioned, server-enforced. "Who else uses it?" -> only real references with permission.

---

## 7. Marketing system

- **Positioning:** "Doctylia is not a marketplace. It is your own digital clinic." Marketing is **B2B to doctors**.
- **Message pillars:** (1) your own website and identity, (2) bookings and payments in one place, (3) records, billing and staff under your control, (4) safe and ethical by design.
- **Channels:** YouTube Hindi-first tutorials (2/week) and Shorts; Instagram Reels; LinkedIn founder posts; Facebook groups; WhatsApp Channel; doctor association talks (IMA, IDA, IAP, FOGSI, physio); webinars; referrals (doctor-to-doctor subscription credit, B2B only); partners (equipment dealers, distributors, CAs); small paid tests (Google Search, click-to-WhatsApp) only after tracking works; SEO via product, comparison and compliance articles; the directory and articles hub as free visibility for doctors.
- **Tracking:** UTM on every link; GA4 events (signup, activation, payment); Meta pixel + Conversions API; weekly dashboard by source.
- **Research agenda:** lead-source conversion, call failure reasons, objection mining, win/loss interviews, competitor teardown, best call time, segment performance, keyword and topic research, content-to-demo attribution, trial activation leaks, pricing, event ROI, compliance review.
- **Experiments:** run two per week, ranked by ICE (examples: WhatsApp before first call, time-slot split, business number series, personal video, free-setup offer, same-day demo slots, Day-3 rescue call).
- **Tools (indicative, verify prices):** CRM (Zoho Bigin/CRM, Freshsales, LeadSquared), telephony (MyOperator, Exotel, Knowlarity), WhatsApp BSP (AiSensy, WATI, Interakt), scheduling (Calendly/Zoho Bookings), automation (Zapier/Make/n8n), analytics (GA4, Search Console), call analysis (e.g. Convin) **[research]**.
- **90-day plan:** Days 1-30 fix basics and measurement; 31-60 experiment; 61-90 scale what works.

---

## 8. Compliance and legal context

| Area | What agents must respect | Confidence |
|---|---|---|
| **NMC ethical advertising guidelines (issued about 6 Oct 2026)** | Press reports say they restrict patient testimonials, soliciting/showcasing reviews for promotion, "best/No.1/100% success/guaranteed" claims, before/after content, paid ranking, influencer endorsements, inducements/discounts to patients, and AI-generated testimonials; AI-generated promotional content must be marked; penalties are graded up to removal from the register. Doctor name, qualification and registration number are expected on websites. | **[research]**: from press and compliance blogs, not the primary NMC text. Counsel must read the primary text |
| **Telemedicine guidelines (2020)** | Registered practitioner; registration number shown | [research] |
| **TRAI telemarketing (Feb 2025 amendment)** | Promotional calls and SMS must use designated number series and registered headers/templates; ordinary 10-digit mobiles should not be used for telemarketing; consent and DND must be honoured | [research]; confirm with telephony provider and counsel |
| **SMS** | DLT registration (entity, sender ID, templates) | [research] |
| **WhatsApp** | Use the official Business API with approved templates; opt-in for marketing messages; opt-out in every marketing message | [research] and platform policy |
| **DPDP Act 2023 and Rules 2025** | Clinics and platforms handling personal data have consent, security and deletion duties; do not use purchased or scraped personal data without a lawful basis | [research] |
| **Doctylia's own legal pages** | Terms/Privacy/Refund were drafts with placeholders at last review | [code] |

Agents are **not lawyers**. For any legal question, say it needs counsel review.

---

## 9. Engineering pointers (for coding agents)

Read these in the repo before changing code: `CLAUDE.md`, `AGENTS.md`, `CONTEXT.md` (payment domain language), `docs/adr/0001-razorpay-route-commission-split.md`, `docs/doctor-discovery-plan.md`, `docs/checklist-fixes.md`, `README.md`.

Key facts **[code]**:
- **Stack:** Vite, React 18, TypeScript, Tailwind, shadcn/ui; Supabase (Postgres with RLS, Auth, Storage, Edge Functions on Deno, cron); Razorpay (Route linked accounts); Zoom; Google Gemini for AI blog drafts; Vercel Edge for SEO rendering.
- **Do not hand-edit** `src/integrations/supabase/client.ts` and `types.ts` (auto-generated). Schema truth is `supabase/migrations/`.
- **Do not regenerate** `supabase/functions/mcp/` (hand-maintained).
- **Two role systems:** platform-level (`user_roles`, `has_role`) vs practice-level (`profiles` for doctors, `staff_members` for staff). A separate Superadmin Team uses `superadmin_team_members` with `sa_has_permission`. Keep the hand-synced permission files in step (`src/lib/staffPermissions.ts` with `supabase/functions/_shared/staffPermissions.ts`; superadmin equivalents).
- **Booking, queue, patients, invoices** are enforced by database triggers and RPCs (patient lifecycle, queue RPC-only columns, abuse limits, `guard_appointment_writes`). The UI calls and renders; it does not own those rules.
- **SEO files** under `src/lib/seo/` and `src/lib/directory/` use relative imports only; `api/seo.ts` and `api/sitemap.ts` stay pinned to `syd1`; slug code must stay identical across client, functions and SQL (a test enforces it).
- **Type-check** with `npx tsc --noEmit -p tsconfig.app.json` (root `tsconfig.json` checks nothing).
- **Tests:** Vitest with Testing Library; colocated; Radix Tabs need `.focus()` before click.
- **Never commit secrets.** Provider keys live in Supabase function secrets, not in client env.

---

## 10. Documents already produced (index)

| Document | Where | Audience / notes |
|---|---|---|
| Sales & Marketing Playbook (English) and Hinglish version | Desktop | Product reference, claims check, market, competitors, compliance, 31 doctor cross-questions, pitches, marketing strategy. **Contains an outdated "no commission" statement** |
| Sales Process Playbook (Hinglish v2) | Desktop | Demo vs training vs support, RACI, pre-sales to post-sales SOP, call and brochure stages, support levels, edge cases, growth plan |
| Marketing Team Guide (Hinglish v2) | Desktop | 45+ tasks with how-to and examples, SEO and Google Business Profile, WhatsApp consent, 90-day plan, budget tiers |
| Sales & Marketing PRD (English) | Desktop | Lead-to-customer system: diagnosis, scoring, cadence, playbooks, tools, research agenda, experiments, automations |
| Doctor Verification Implementation Plan | Repo folder | Registration verification design, phases, vendors, data model |
| project_doctylia.md | Repo folder | Portfolio-style project write-up (counts from the repo, no business results) |
| This file (smb-saas.md) | Repo folder | Master agent context |
If two documents disagree, **this file and the live product win**, and the Desktop playbooks that mention "no commission" are out of date until regenerated.

---

## 11. Claims and wording rules (must follow before customer-facing output)

**Safe to say [code]:** 7-day free trial, no card; Pro Rs 1,499 / Premium Rs 3,999 per month (check live page and GST status); branded website; online booking; live queue; billing and invoices; patient records and prescriptions (Premium); video consults (Premium); staff roles (Premium); AI blog writer with doctor review; directory and articles hub with unpaid ranking; per-doctor data separation and server-enforced staff permissions.

**Say only after demo-testing or confirmation:** custom domain; WhatsApp appointment reminders; patient data import limits; "GST invoices", "dynamic UPI QR", "in-call Rx" (features-page wording); **multi-doctor clinics and any doctor-seat price** (confirm the launch flag is on and a seat price is live for that clinic); **prescription templates** (confirm which blocks/fields are available on the doctor's plan).

**Do not say (unsupported or risky):**
- "No commission" / "you keep the full fee" (until the platform charge is confirmed removed)
- "10,000+ doctors", "2,847 doctors", "Rs 2.4 Cr", "98% satisfaction", per-specialty doctor counts
- "India's #1", "best", "guaranteed", "3x patients", "no-shows down 70%", "Google #1"
- "30-day money back" (conflicts with the Refund Policy)
- "NMC approved", "DPDP compliant", "100% secure", "enterprise-grade" without proof
- Patient testimonials, before/after, patient photos or names in any marketing
- "Verified doctor" (verification does not exist yet)
- Any competitor claim that is not factual, dated and sourced
**Real numbers only,** with a date and source (Super Admin data), and written permission for any named doctor or case study.

---

## 12. Decisions made and still open

**Decided / stated by the team [user]**
- Demo is done by sales (about 15 minutes); training is done by an onboarding specialist; support is L1/L2/L3; developers do not run demos or training (recommended in the Sales Process Playbook).
- Commission/service-charge wording removed from the Marketing Guide v2; management intends to remove the charge from the product (not yet confirmed in code).
- Custom domain and WhatsApp appointment reminders are described as implemented.
- The goal now is converting existing leads, not generating new ones.
- Multi-doctor clinics, prescription templates, patient CSV import and per-doctor revenue are built and merged into the codebase (2026-11-27/28); the multi-doctor platform launch switch and a confirmed live seat price are still a human/owner step, not yet flipped at last review.

**Open (needs a human decision)**
10. Pilot and launch multi-doctor clinics (one real clinic, confirm a live Razorpay seat payment, then flip the superadmin launch switch) and confirm the public per-doctor site redesign is fully shipped.
11. Confirm and announce the doctor-seat price once set, and decide whether/how to market multi-doctor and prescription templates to new and existing leads.
1. Is the platform service charge removed, and where (pricing page FAQ, Terms, code)?
2. Does the list price include GST?
3. Confirmed status of patient data import, custom domain and WhatsApp appointment reminders (plan, setup steps, limits).
4. Who is the onboarding specialist and support owner; support hours and SLAs.
5. Tool purchases: CRM, telephony number series, WhatsApp BSP; budget.
6. Pre-approved offers: annual plan, founding doctor, referral reward.
7. Doctor registration verification: build now or later; gating policy for unverified doctors.
8. Counsel review of NMC primary text, TRAI, DPDP and the legal pages.
9. Real pilot doctors who can be named as references (with written permission).

---

## 13. Rules of behaviour for agents

1. **Truth over polish.** If a fact is not in this file, the repo, or a source you can cite, say you do not know and name who could confirm.
2. **Never invent** customer counts, revenue, testimonials, case studies, benchmarks for Doctylia, or doctor names.
3. **Mark the confidence** of research figures and say they are directional.
4. **Respect Section 11** in every customer-facing output.
5. **No patient data** in demos, prompts or outputs. Use dummy data only.
6. **Do not give legal advice**; flag items for counsel.
7. **Do not take outward-facing or irreversible actions** (sending messages, emails, posts, ads, payments, deleting data, changing production settings or secrets) without explicit human approval.
8. **Do not store secrets** in files. Never print API keys, tokens or personal data.
9. **Engineering:** follow `CLAUDE.md`/`AGENTS.md`; do not edit generated files; do not hand-change schema outside migrations; run tests before claiming a fix works.
10. **When this file may be stale** (the snapshot date is old, or a feature seems to have changed), check the repo or ask, and report the discrepancy so the file can be updated.
11. **Language:** the sales and marketing teams work in Hindi/Hinglish for speaking and in English for documents. Write customer-facing Hindi/Hinglish in a respectful register ("Doctor sahab", "Dr. ___ ji").
12. **Escalate** to the founder/product owner for pricing changes, discounts, legal questions, new claims and compliance doubts.

---

## 14. Glossary

| Term | Meaning |
|---|---|
| ICP | Ideal customer profile |
| Fit / intent score | How good a customer a lead is / how ready to buy now |
| Speed-to-lead | Time from lead creation to first contact |
| Cadence | Planned sequence of calls and messages |
| Activation | Doctor's page is live and a first real booking happened |
| Show rate | Booked demos that actually happen |
| CAC / payback | Cost to acquire a paying doctor / months to recover it |
| MRR / ARR / ARPU / churn | Monthly or annual recurring revenue / revenue per customer / customers lost in a period |
| NPS | Net Promoter Score |
| RLS | Row-level security in Postgres: rules that stop one doctor reading another's rows |
| Linked Account | Doctor's Razorpay Route sub-merchant account for receiving payments |
| Route Transfer | Automated split of a payment to the doctor's linked account |
| Gross Consultation Fee / Platform Charge / Doctor Net Share | Terms from `CONTEXT.md` for the payment split |
| BSP | WhatsApp Business Solution Provider |
| DLT | TRAI registration for commercial SMS senders and templates |
| TCCCPR | TRAI's telemarketing and commercial communications regulations |
| NMC | National Medical Commission |
| DPDP | Digital Personal Data Protection Act |
| OPD | Outpatient department (the doctor's consulting hours) |
| UTM | Tags on links that show where a visitor came from |
| ICE | Impact, Confidence, Ease: a way to rank experiments |
| Pro / Premium / Custom | Subscription tiers |

---

## 15. Sources and limits

- **Repository** (routes, admin and super-admin modules, plan features, pricing page, migrations up to Nov 2026, `CLAUDE.md`, `AGENTS.md`, `CONTEXT.md`, docs): primary for product facts.
- **Founder/team statements** during the working sessions: used for intent and decisions; marked **[user]**.
- **Web research** (speed-to-lead, calling benchmarks, TRAI rules, CRM/telephony/WhatsApp tool pricing, lead scoring, demo show rates, reactivation, doctor technology adoption, NMC advertising and DPDP coverage): mostly vendor blogs, agency pages, press and law-firm summaries. Treat as directional. Primary texts (NMC notice, TRAI regulation, DPDP Rules, Meta pricing page) have not been read.
- **Staleness:** this is a snapshot of 16 Nov 2026. Update the snapshot date and the changed sections whenever pricing, features, compliance rules or team structure change.
