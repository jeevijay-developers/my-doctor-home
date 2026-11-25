# Multi-doctor clinic (polyclinic) — design spec

Date: 2026-11-25
Status: approved design, pre-implementation
Companion (non-technical): `docs/multi-doctor-clinic-overview.md`

## 1. Goal and scope

Let one clinic (one physical location) run several doctors on one Doctylia account: one website, one front desk, shared patients, one bill, with each doctor having their own schedule, queue, fee and prescriptions.

**In scope (v1):** single-location polyclinics of 2–15 doctors.

**Out of scope (later):** multiple branches, one doctor working at several independent clinics under one login, automatic per-doctor payment splits, ABDM HFR/HPR linking, ownership transfer.

### Decisions taken

| Topic | Decision |
|---|---|
| Strategy | **A: practitioner layer on the existing tenant.** `profiles.id` / `doctor_id` keeps meaning "clinic tenant". No re-tenanting. |
| Target | One location, several doctors, shared front desk |
| Clinical privacy | Shared clinic-wide by default; the owner can switch to `treating` (own patients only) |
| Money | Clinic collects everything into its existing Razorpay linked account; per-doctor reports only |
| Pricing | Premium feature; Premium includes 1 bookable doctor; extra doctor seats are a monthly add-on whose price is a `platform_settings` value |
| Public site | Clinic site at `/dr/:slug` + doctor sub-pages `/dr/:slug/doctor/:doctorSlug`; one directory entry per doctor |
| Ownership | Accepted limitation: the clinic stays tied to the owner's login. Co-admin via a full-permission staff user; transfer is superadmin-assisted |

### Why strategy A

An audit (2026-11-25) found `doctor_id` on about 50 tables, about 222 RLS policies, 28 edge functions, 69 `.eq("doctor_id"…)` client queries, and every advisory lock and unique index. Re-tenanting (strategy B: new `clinics` table plus `clinic_id` everywhere) would rewrite all of that against a live, Lovable-synced database for no customer-visible gain in a single-location scope. Under A, everything that is clinic-level stays untouched, and only data that truly belongs to one doctor gains a `practitioner_id`. Branches can later be added the same additive way (`location_id`).

## 2. Hierarchy

```
Platform (superadmin / SA team)              unchanged
└── Clinic = profiles row (tenant, doctor_id)
     │  owns: patients, services, packages, website, blog, invoices,
     │        Razorpay linked account, plan + doctor seats, settings
     ├── Owner (profiles.id login)            full access, manages doctors & seats
     ├── Practitioners (1..N)                 bookable doctors
     │     └── optional login = staff_members row, role='doctor'
     └── Staff (staff_members, role='staff')  reception / billing, as today
```

- Every existing clinic gets exactly one practitioner (the owner, `is_primary`) on migration. Single-doctor clinics see no UI change until they have ≥2 active practitioners.
- The owner may be non-bookable (manager only); then another practitioner is primary.
- A practitioner may have no login (a visiting consultant managed by reception).
- One login belongs to exactly one clinic (same as staff today).

## 3. Data model

### 3.1 New table `practitioners`

| Column | Type / rule |
|---|---|
| `id` | uuid PK |
| `doctor_id` | uuid NOT NULL → `profiles(id)` (the clinic tenant) |
| `user_id` | uuid NULL; the owner's `profiles.id`, a `staff_members.id` with role `doctor`, or NULL. Unique when not null |
| `display_name`, `slug` | NOT NULL; `slug` unique per `doctor_id`, slugified with the same rules as `directory_slugify` |
| `specialization`, `qualifications`, `experience_years`, `bio`, `photo_url` | public profile |
| `registration_number`, `signature_url`, `hpr_id` | printed on prescriptions; `hpr_id` is reserved for ABDM |
| `consultation_fee` | numeric NULL; NULL = the clinic's fee |
| `slot_duration_minutes` | int NULL; NULL = `website_settings.slot_duration_minutes` |
| `is_active`, `is_bookable`, `online_booking`, `directory_listed`, `is_primary` | booleans. `is_bookable` = takes any new booking; `online_booking` = the public may book them; the primary must be active and bookable |
| `sort_order`, `created_at`, `updated_at` | |

Constraints:
- A partial unique index enforces exactly one `is_primary` per `doctor_id`.
- A trigger enforces that the primary is active and bookable, and that a clinic always keeps at least one active practitioner.
- Practitioners with any history are never hard-deleted (`ON DELETE RESTRICT` from child tables).

Supporting tables:
- `practitioner_slug_history (practitioner_id, old_slug, created_at)`: 301 redirects.
- `service_practitioners (service_id, practitioner_id)`: optional; a service with no rows is offered by every doctor.
- `clinical_access_log (id, doctor_id, viewer_user_id, patient_id, resource, created_at)`: written in `treating` mode (see §5).

### 3.2 New `practitioner_id` columns

Each is backfilled to the clinic's primary practitioner, then set NOT NULL.

| Table | Meaning |
|---|---|
| `appointments` | the doctor being seen (drives slot, queue, room) |
| `working_hours` | unique key becomes `(practitioner_id, day_of_week)` |
| leave / blocked dates (if present) | per doctor |
| `prescriptions` | author; plus `created_by uuid` = the typing user |
| `patient_visits` | treating doctor |
| `patient_documents` | uploader practitioner, nullable (reception uploads); historic rows are not backfilled |

`queue_events` gets no column: every event carries `appointment_id`, so the practitioner is reached through the appointment.
| `reviews` | nullable; per-doctor rating |
| `blog_posts.author_practitioner_id` | nullable → primary; JSON-LD author |

These stay clinic-level and get no column: `patients` and the patient medical history tables (allergies, conditions, medications, family history, surgeries, vitals), invoices, payments, transfers, payouts, services, packages, website_settings, gallery, notifications (routing changes only), import tables and plan tables.

New columns on clinic-level tables:
- `profiles.extra_doctor_seats int NOT NULL DEFAULT 0`
- `website_settings.clinical_visibility text CHECK IN ('shared','treating') DEFAULT 'shared'`
- `staff_members.role text CHECK IN ('staff','doctor') DEFAULT 'staff'`
- `staff_members.practitioner_id uuid NULL`, required when `role = 'doctor'`
- `doctor_custom_plans.doctor_seats int NULL` (NULL = standard, -1 = unlimited, n = n)

### 3.3 Default-practitioner trigger (backward compatibility)

`trg_a00_fill_practitioner` runs `fill_practitioner(mode)`, BEFORE INSERT and UPDATE OF practitioner_id. The `a00` prefix makes it sort before `trg_a0_enforce_slot_capacity`, so the slot lock sees the practitioner. A missing value is filled only when the answer is unambiguous:

| Mode | Table | Resolution order, then `PRACTITIONER_REQUIRED` |
|---|---|---|
| `booking` | appointments | the only active and bookable practitioner. It never uses the caller: an owner-doctor booking for Dr B must not silently land on the owner |
| `sole` | working_hours | the only active practitioner |
| `author` | prescriptions | the caller's own practitioner, then the visit's, then the only active one |
| `visit` | patient_visits | the appointment's practitioner, then the caller's, then the only active one |
| `optional` | patient_documents | the visit's, then the caller's, else NULL (never raises) |

Further rules:
- **Validation:** a practitioner of another clinic gives `PRACTITIONER_MISMATCH`, backed by composite FKs `(practitioner_id, doctor_id) → practitioners(id, doctor_id)`. Booking an inactive or non-bookable doctor, or an `online_booking = false` doctor as anon, gives `PRACTITIONER_NOT_BOOKABLE`.
- **Backward compatibility:** old clients, Lovable-generated code and unchanged edge functions keep working for single-doctor clinics, and a silent wrong-doctor booking is impossible in multi-doctor clinics. The columns carry a NULL-returning function default, so generated Insert types stay optional.
- **Same-day moves:** changing the doctor of a same-day appointment outside `queue_action` is refused (`USE_QUEUE_TRANSFER`). Changing it while the patient is in the room is refused (`PRACTITIONER_IN_SERVICE`).
- **Signups:** `on_profile_a0_primary_practitioner` creates a new clinic's primary practitioner before `on_profile_created` inserts its working hours.

### 3.4 Re-keyed locks and indexes

The lock order stays **slot → queue number → patient**.

| Today | New |
|---|---|
| slot lock `hashtext(doctor_id‖date‖time)` | `hashtext(practitioner_id‖date‖time)` |
| slot exclusivity per doctor | per practitioner |
| `uq_appointments_queue_number (doctor_id, date, queue_number)` | `(practitioner_id, date, queue_number)` |
| "one in the room per doctor per day" | per practitioner |
| `queue_action` lock `'queue:'‖doctor‖today` | `'queue:'‖practitioner‖today` |
| queue number lock `'queue_number:'‖doctor‖date` | `'queue_number:'‖practitioner‖date` |

These stay unchanged:
- invoice numbering (per clinic per year)
- patient lock and `uq_patients_doctor_phone_name`
- the monthly cap lock (per clinic)
- import counters and the insert throttle

### 3.5 RPC changes

These gain `_practitioner_id uuid DEFAULT NULL` (NULL = primary practitioner, so old callers are unchanged):
- `get_slot_counts`
- `get_public_queue`
- `get_my_queue_status`
- `public_booking_price` (uses the practitioner fee when it is set)
- `reschedule_appointment_by_token` (must stay with the same practitioner)
- `get_appointment_by_token` (returns the practitioner's name)

`queue_action` gains:
- a practitioner scope on `call_next`, `call` and STALE checks
- a new action `transfer`, which moves a waiting appointment to another practitioner's queue at the end. It is refused while the patient is being served, re-checks the slot and is logged.

New:
- `clinic_doctor_seat_limit(_doctor_id)`, the single place that decides seats: Premium/trial base, then an applying custom plan, then `extra_doctor_seats`.
- `get_public_practitioners(_doctor_id)`, which returns safe public columns plus the next free slot. It must be added to `INTENDED_ANON` in `tests/db/schemaAudit.test.ts`.
- `reassign_practitioner_appointments(_from, _to, _from_date)`, used when deactivating a doctor.

## 4. Roles and permissions

| Actor | Clinical data | Appointments / queue | Billing |
|---|---|---|---|
| Owner | All, always | All | All |
| Doctor role | Per `clinical_visibility` | Own queue; all if `appointments.all_doctors` | Off by default; `billing.own_only` limits it to their own revenue |
| Staff | Only if granted, as today | All | Per permission |

New permission keys, added in **both** `src/lib/staffPermissions.ts` and `supabase/functions/_shared/staffPermissions.ts`:
- `practitioners.view`
- `practitioners.manage`
- `appointments.all_doctors`
- `billing.own_only`

There are permission presets for "Doctor" and "Reception". Reception never includes `patients.medical_records` or `prescriptions.*`.

Prescription rules:
- Only the author practitioner's user or the owner may update a prescription; everyone else gets read-only access.
- Staff creating one must select the author practitioner.
- The slip (`PrescriptionSlipCard`, the shared link `/rx/:token`) prints the author's name, registration number and signature.

`useProfile()` additionally exposes `role`, `practitionerId` and `practitioners[]`. `resolveDestination.ts` routes doctor-role users to `/admin/appointments`, filtered to their queue.

## 5. Clinical visibility

`can_view_clinical(_patient_id)` is a SECURITY DEFINER helper used by RLS on prescriptions, patient_visits and patient_documents. It returns true when any of these hold:
- the caller is the owner
- the setting is `shared` and the caller has the clinical permission
- the setting is `treating` and the caller's practitioner has (or had) any appointment with the patient, or authored the record

Patient-level history (allergies, conditions, medications, family and surgical history, vitals) is readable by any doctor-role user allowed to see the patient in either mode, for safety.

In `treating` mode, reads of a patient's clinical tab write a `clinical_access_log` row (owner-visible, kept 1 year).

## 6. Seats and pricing

- `multi_doctor` is a Premium feature in `src/lib/planFeatures.ts` (gated through `usePlanAccess`). Trial gets 1 extra seat.
- Seats = active and bookable practitioners. A non-bookable owner-manager costs nothing.
- `platform_settings`: `doctor_seat_price` (monthly, INR; value filled in later), `doctor_seat_max` (default 15).
- A trigger on `practitioners` raises `SEAT_LIMIT` when activating or making bookable would exceed `clinic_doctor_seat_limit()`.
- Booking a practitioner who is above the limit (after a downgrade or expiry) is refused with `SEAT_LIMIT`. Existing appointments stand, and nothing is deleted. The owner picks which doctors stay bookable.
- Purchase:
  - P1: a superadmin sets seats manually on the doctor detail page.
  - P3: `create-plan-upgrade-order` sells seats, prorated to `plan_end`. Removing seats takes effect at renewal, with no refund.

## 7. Public site and SEO

The multi-doctor rendering activates only when the clinic has **≥2 active bookable practitioners**. Otherwise HTML, JSON-LD and the booking flow stay byte-identical to today (a test enforces this).

- `/dr/:slug`:
  - clinic hero
  - an "Our doctors" grid (photo, specialty, fee, next slot; specialty filter at ≥4 doctors)
  - booking flow: **choose doctor → services (filtered by `service_practitioners`) → slot → details/pay**
- `/dr/:slug/doctor/:doctorSlug`: the doctor's profile, timings, reviews and a booking widget with the doctor preselected.
  - Add a `vercel.json` rewrite to `api/seo.ts`, with new `kind=practitioner` logic under `src/lib/seo/` (relative imports only).
  - JSON-LD: a `Physician` node with `worksFor` → the clinic's `MedicalClinic` node.
  - The clinic page emits a `MedicalClinic` with `employee`/`member` links.
  - Inactive or renamed doctor pages 301 to the clinic page or the new slug.
  - Include in the sitemap.
- `/dr/:slug/queue`: one panel per active doctor; `?doctor=` for one. Still numbers only plus a masked now-serving name.
- `search_doctors` returns one row per `directory_listed` practitioner of a listed clinic. Hub `noindex` counts use practitioners.
- The blog article author is `author_practitioner_id`'s person (`Person` + `honorificPrefix`).

## 8. Payments

- Clinic-collects only, so the Razorpay linked account, commission and `transfers[]` are unchanged.
- `create-razorpay-order` stores `practitioner_id` in the order notes. `verify-razorpay-payment` creates the appointment with it.
  - For a multi-doctor clinic, a missing or mismatched practitioner fails the request (`PRACTITIONER_REQUIRED`); it never falls back to the primary.
  - The amount comes from `public_booking_price(..., _practitioner_id)`.
- Billing and Dashboard add a "by doctor" split: revenue, visits, no-shows and payment-mode mix. It is computed from invoices joined to `appointments.practitioner_id`.

## 9. Admin UI (shown only with ≥2 active practitioners)

- **New page: Doctors** (`/admin/doctors`, `practitioners.view/manage`). Lists, adds, edits, deactivates and reorders doctors; sets primary; creates a login (role `doctor`); edits working hours per doctor; shows seat usage and an upgrade prompt.
- **Appointments:** a doctor filter, a colour per doctor, a doctor picker on create, and a doctor change on reschedule.
- **Queue:** tabs per doctor plus "All". Doctor-role users default to their own tab. Realtime subscriptions are filtered by practitioner.
- **Prescriptions:** an author picker for staff; a read-only view of other doctors' prescriptions.
- **Patients:** an appointment history column "Doctor"; the clinical tab respects §5.
- **Website / settings:** the clinic-level settings stay; per-doctor fee, slot length and bio live on the Doctors page; the clinical visibility switch.
- **Notifications:** new booking → that doctor's user + owner + reception; `paid_no_show` → owner.
- **Superadmin:** the doctor list shows doctor count and seats; doctor detail shows practitioners and a seat override.

## 10. Edge cases (normative)

1. **Wrong-doctor paid booking.** Prevented by §8 and the `PRACTITIONER_REQUIRED` trigger.
2. **Ownership.** Tied to the owner login (accepted). A co-admin is a full-permission staff user; transfer is superadmin-assisted.
3. **Existing Doctylia doctor joins.** A phone already owned by a `profiles` account cannot become staff; the error says so, and the doctor can be added as a no-login practitioner instead.
4. **Deactivating a doctor.**
   - It is blocked while future live appointments exist. Those are reassigned (`reassign_practitioner_appointments`, each slot re-checked, patients notified) or cancelled with notification.
   - Then the login is disabled, the public page is 301-redirected and the seat is freed.
   - Prescriptions keep the author.
5. **Primary and last doctor.** The primary cannot be deactivated without promoting another, and a clinic keeps ≥1 active practitioner.
6. **Same patient, two doctors, same day.** Allowed: two queues, one patient, a clinic-wide visit count. The 3-open-bookings-per-phone limit stays per clinic and becomes `platform_settings.public_booking_max_open`.
7. **Moving a patient between doctors mid-day.** Only through `queue_action('transfer')`. Token-based patient reschedules keep the same doctor.
8. **Doctor leave.** Per practitioner; other doctors stay bookable. Bookings affected by new leave are listed for reassignment or cancellation.
9. **Clinic timings display.** The union of practitioners' hours.
10. **Nightly expiry.** `expire_overdue_appointments()` scopes "in the room" per practitioner.
11. **Downgrade or expiry.** §6: no deletion; over-limit doctors stop taking new bookings.
12. **Provisional patient release** and visit counting stay clinic-wide (unchanged logic).
13. **Patient insert throttle** (1,500/day booking counter) is unchanged; review it for clinics of ≥10 doctors.
14. **Lovable / old code paths.** The §3.3 trigger covers single-doctor clinics. A test greps every insert into `appointments`/`prescriptions` in `src/` and `supabase/functions/` and fails if a multi-doctor path omits `practitioner_id`.
15. **Directory duplicates.** A doctor in two clinics under separate logins appears twice; accepted (dedupe by registration number later).
16. **Slug collisions.** Unique per clinic; renames go into `practitioner_slug_history`.

## 11. Rollout

| Phase | Content | User-visible |
|---|---|---|
| P0 Foundation | `practitioners`, backfill, columns, §3.3 triggers, §3.4 re-keys, §3.5 RPC params, SQL tests | No (done 2026-11-25) |
| P1 Admin | Doctors page, doctor role + login, filters, queue tabs, authorship, clinical visibility, seat gate (manual) | Premium clinics |
| P2 Public | Choose-doctor booking, doctor pages, SEO/JSON-LD, directory, multi-doctor queue screen, payment path §8 | Patients |
| P3 Money | Seat checkout, per-doctor reports | Owners |
| Later | Per-doctor Razorpay splits, branches, multi-clinic doctors, ABDM | — |

**Release rule:** P0 ships alone. **P1 and P2 go to production together**, behind `platform_settings.multi_doctor_enabled` plus a per-clinic superadmin override. Before P2:
- the public booking widget sends no `practitioner_id`, so a second bookable doctor would make every public booking fail with `PRACTITIONER_REQUIRED`;
- `verify-razorpay-payment` (§8) doesn't carry it either, so paid bookings would fail too.

Implementation plan for P0: `docs/superpowers/plans/2026-11-25-multi-doctor-p0-foundation.md`.

## 12. Testing

SQL checks in `supabase/tests/multi-doctor/*.sql` (each rolls back and prints one `pass` row):
- two practitioners can take the same slot, and the same practitioner cannot
- queue numbers are independent; STALE is scoped per queue; `transfer` works
- default trigger: fills for a single-doctor clinic, and raises `PRACTITIONER_REQUIRED` for a multi-doctor one
- `PRACTITIONER_MISMATCH` across clinics
- `SEAT_LIMIT` on activation and on booking
- `treating` mode: a doctor cannot read another doctor's patient's prescriptions; reception never reads clinical tables
- the primary/last-practitioner invariants

Vitest:
- doctor-choice step in the booking widget
- queue tabs
- permission gating
- JSON-LD for the doctor page, plus a byte-identical snapshot for a single-doctor clinic
- a staffPermissions parity test between the two files
- the insert-path grep test

## 13. Open items for later

- The seat price value (`doctor_seat_price`).
- Retention period for `clinical_access_log` (proposed 1 year).
- Whether reception may see doctor fees per practitioner on the public page (default: yes, as today).
