# Multi-doctor clinics — Phases 1 + 2 (Admin + Public booking) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Premium clinic run several doctors: the owner adds doctors (with optional logins), and each doctor gets their own hours, queue, prescriptions and fee. Patients choose a doctor when booking or paying online. All of it is invisible to single-doctor clinics and to every clinic until the launch flag or a pilot override turns it on.

**Architecture:** Builds on P0 (`docs/superpowers/plans/2026-11-25-multi-doctor-p0-foundation.md`, live in production). Every rule still keys on `doctor_id` (the clinic). Additions:
- **Seats and the launch gate:** `clinic_multi_doctor_enabled()` and `clinic_doctor_seat_limit()`, with a "within seats" rank so that downgrades degrade safely.
- **Writes:** SECURITY DEFINER RPCs for all practitioner writes.
- **Doctor logins:** a `doctor` role on `staff_members`.
- **Clinical visibility:** *restrictive* RLS policies that only bite for doctor-role users.
- **Public:** a safe RPC that lists a clinic's doctors.
- **Payments:** one shared edge-function helper that resolves and validates the doctor for every paid booking.

**Tech Stack:**
- Supabase Postgres: migrations, PL/pgSQL, RLS.
- SQL checks run with `npx supabase db query --linked -f`.
- Deno edge functions.
- React 18 + TypeScript + shadcn/ui, Tailwind; the doctor site uses the `ds-*` layer.
- Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-25-multi-doctor-clinic-design.md`. Manager overview: `docs/multi-doctor-clinic-overview.md`.

## Global Constraints

- **NO git commits, NO pushes.** Each task ends with "leave changes uncommitted and list the files changed" (standing user instruction, 2026-11-25).
- **The linked DB is PRODUCTION.** Before every push:
  - run `npx supabase db push --linked --dry-run`; it must list only that task's migration;
  - before writing a migration that copies an existing function, compare the live definition (`pg_get_functiondef`) with the file you copy from. If they differ, STOP.
  - A failed post-push check caused by the migration is fixed with a NEW follow-up migration. Never edit an applied file, and never run ad-hoc DDL/DML.
- **Single-doctor clinics must not change.** Every new UI path is behind `isMulti`:
  - admin: `access.enabled && activePractitioners.length >= 2`
  - public: `bookable-online-within-seats practitioners >= 2`
  - Otherwise render exactly what renders today, and send exactly the same requests. Tests that assert existing request payloads (e.g. `useSlotAvailability.test.tsx:22` `toHaveBeenCalledWith`) must keep passing unchanged.
- **When to send `practitioner_id`:** send it when `isMulti`. When not multi, omit it; `trg_a00_fill_practitioner` fills it.
- **Within seats:** a practitioner is within seats when `practitioner_seat_rank(id) < clinic_doctor_seat_limit(clinic)`. Rank order is `is_primary DESC, sort_order, created_at, id` over active and bookable practitioners. Only within-seat doctors can be booked or auto-filled.
- **Error codes:**
  - Inherited from P0: `PRACTITIONER_REQUIRED`, `PRACTITIONER_MISMATCH`, `PRACTITIONER_NOT_BOOKABLE`, `PRACTITIONER_NOT_FOUND`, `PRACTITIONER_IN_SERVICE`, `USE_QUEUE_TRANSFER`, `NOT_TRANSFERABLE`, `SLOT_TAKEN`, `PRIMARY_PRACTITIONER_REQUIRED`.
  - New: `SEAT_LIMIT`, `MULTI_DOCTOR_NOT_ENABLED`, `HAS_FUTURE_APPOINTMENTS`, `OWNER_ONLY`, `FORBIDDEN`, `PHONE_OWNS_CLINIC`, `PRACTITIONER_HAS_LOGIN`.
  - User-facing text for every code lives in ONE place: `src/lib/practitioners/errors.ts`.
- **Permission keys:** new keys go into BOTH `src/lib/staffPermissions.ts` and `supabase/functions/_shared/staffPermissions.ts`; `src/lib/permissionParity.test.ts` enforces this.
- **Fail closed.** `staff_doctor_id()` and `staff_has_permission()` return NULL for strangers, and `IF NOT (a OR NULL)` skips the refusal. Wrap every permission OR-chain used in an `IF` in `COALESCE(…, false)`. Each RPC test must include a "stranger is refused" case. (Found in A1: `get_clinic_doctor_access` failed open before the fix.)
- **Test clinics with two bookable doctors** need a pilot override (`doctor_feature_overrides` row for `multi_doctor`, `granted_by` set) plus a trial plan or `clinic_doctor_seats`, because seats are enforced since A1.
- **SEO:** files under `src/lib/seo/` and `src/lib/directory/` use relative imports only.
- **Doctor site:** uses `ds-*` tokens and `dsCn`, never `cn`. Portalled overlays carry the `doctor-site` class. Body text is ≥17px under 640px.
- **Times:** `appointments.time_slot` and `sort_time` are `time` (IST). `time_slot::text` is `'10:00:00'`.
- **Type check:** `npx tsc --noEmit -p tsconfig.app.json`. These errors already exist: `SADoctorDetail.tsx`, `NotFound.tsx`, `useCustomPlan.test.tsx:70`.

## Decisions taken in this plan (beyond the spec)

1. **Owner's own fields:** the owner's practitioner row keeps syncing from `profiles` (P0 `sync_owner_practitioner`). On the Doctors page the owner's personal fields are read-only, with "Edit in Profile". Only booking fields are editable there: fee, slot length, online booking, listing, order.
2. **Slugs are fixed at creation.** Renaming a doctor does not change their URL, so no slug-history table is needed. A deactivated doctor's page 301s to the clinic page.
3. **Seats live in `clinic_doctor_seats`,** their own table that superadmin can write and the clinic can only read. They do not live in `profiles`, where a doctor could edit them. Custom-plan seats and self-service purchase are P3.
4. **Seat formula:** 1 + extra seats, + 1 during a trial, capped at `doctor_seat_max`.
5. **Hero "next available" shortcut:** hidden for multi-doctor clinics. The clinic page has a "Choose your doctor" section instead.
6. **Reassigning appointments** reports the conflicting bookings it could not move. Patients are told by the clinic, since there is no outbound patient messaging for bookings.
7. **"New booking" notifications** go only to a doctor with a login (multi-doctor clinics only). There are no booking notifications today, and none are added for single-doctor clinics.
8. **What ships with the launch:** Parts A–D. Part E (doctor sub-pages, JSON-LD, sitemap) may ship right after launch, because multi-doctor clinics work without it. Part F (directory per doctor, blog author, reviews per doctor) is post-launch; the directory is hidden today (`DIRECTORY_HIDDEN`).

## Release rule

1. Migrations A1–A5 and D1 are safe to apply as soon as they are written. With `multi_doctor_enabled = false` and no overrides, every clinic's seat limit is 1, so nothing changes.
2. Client and edge changes (Parts B–D) deploy together.
3. Then pilot with 1–2 clinics through the superadmin feature override, then flip `platform_settings.multi_doctor_enabled`.

## File map

| Area | Create | Modify |
|---|---|---|
| DB | `supabase/migrations/20261126100000_multi_doctor_entitlements.sql`, `…100100_practitioner_management.sql`, `…100200_clinical_visibility.sql`, `…100300_practitioner_booking_notifications.sql`, `…100400_public_practitioners.sql`; `supabase/tests/multi-doctor/05_entitlements.sql` … `09_public.sql` | — |
| Shared client lib | `src/lib/practitioners/types.ts`, `hours.ts` (+test), `errors.ts` (+test) | `src/lib/staffPermissions.ts`, `src/lib/features.ts`, `src/lib/queue.ts` |
| Admin state | `src/hooks/usePractitioners.tsx` (+test) | `src/hooks/useProfile.tsx` (+test), `src/lib/auth/resolveDestination.ts`, `src/pages/AdminDashboard.tsx` |
| Admin UI | `src/components/admin/doctors/DoctorsPage.tsx`, `DoctorFormDialog.tsx`, `DoctorHoursEditor.tsx`, `DeactivateDoctorDialog.tsx`, `src/components/admin/PractitionerSelect.tsx` (+tests) | `AdminSidebar.tsx`, `AppointmentsPage.tsx`, `LiveQueue.tsx`, `PrescriptionsPage.tsx`, `PrescriptionSlip.tsx`, `medical-records/VisitsTab.tsx`, `PatientMedicalRecord.tsx`, `MyWebsite.tsx`, `StaffManagementPage.tsx`, `SettingsPage.tsx`, `src/hooks/useDoctorNotifications.ts` |
| Superadmin | `src/components/superadmin/SADoctorSeatsCard.tsx` | `SADoctorDetail.tsx` |
| Edge | `supabase/functions/_shared/practitioners.ts` (+test) | `create-staff-account`, `delete-staff-account`, `create-razorpay-order`, `verify-razorpay-payment`, `_shared/staffPermissions.ts` |
| Public | `src/components/doctor/DoctorPicker.tsx`, `src/components/doctor/DoctorsSection.tsx` | `src/contexts/DoctorContext.tsx`, `BookingWidget.tsx`, `src/hooks/useSlotAvailability.ts`, `src/pages/ManageAppointment.tsx`, `src/pages/QueueDisplay.tsx`, `HeroBanner.tsx`, `DoctorPublicPage.tsx` |
| SEO (Part E) | `src/pages/PractitionerPage.tsx` | `vercel.json`, `src/lib/seo/doctorSeo.ts`, `handleSeoRequest.ts`, `supabase/functions/sitemap/index.ts`, `src/App.tsx` |

---

# Part A — Database

### Task A1: Entitlements — launch flag, seats, within-seat rank

**Files:**
- Create: `supabase/migrations/20261126100000_multi_doctor_entitlements.sql`
- Test: `supabase/tests/multi-doctor/05_entitlements.sql`

**Interfaces:**
- Consumes: `doctor_has_feature(uuid,text)` (latest in `20261028100000_custom_plan_requests.sql:224-259`), `doctor_feature_overrides`, `platform_settings`, `platform_int_setting(text,int)` (`20261123100000_patient_import_limits_core.sql:18-29`), `sa_has_permission(uuid,text)`, `has_role(uuid,app_role)`, `fill_practitioner()` (P0).
- Produces:
  - `features` row `multi_doctor` (premium, active, not requestable)
  - `platform_settings` keys: `multi_doctor_enabled` (jsonb bool, default false), `doctor_seat_max` (15), `doctor_seat_price` (null), `trial_extra_doctor_seats` (1)
  - table `clinic_doctor_seats(doctor_id PK, extra_seats int, reason text, set_by uuid, set_at timestamptz)`
  - `clinic_multi_doctor_enabled(_doctor_id uuid) → boolean`
  - `clinic_doctor_seat_limit(_doctor_id uuid) → integer` (GRANT to service_role)
  - `practitioner_seat_rank(_practitioner_id uuid) → integer`
  - `practitioner_within_seats(_practitioner_id uuid) → boolean` (GRANT to service_role)
  - `get_clinic_doctor_access(_doctor_id uuid) → jsonb {enabled, has_feature, seat_limit, seats_used, extra_seats, seat_max, seat_price}`
  - `set_clinic_doctor_seats(_doctor_id uuid, _extra integer, _reason text) → jsonb`
  - triggers on practitioners: activation enforces `SEAT_LIMIT`
  - `fill_practitioner()` replaced:
    - booking-mode auto-fill picks only among within-seat doctors;
    - booking a doctor outside seats raises `SEAT_LIMIT`.

- [ ] **Step 1: Pre-write read-only checks** (temp `.sql` via `npx supabase db query --linked -f`):
  - the column list of `public.features`
  - the signatures of `platform_int_setting`, `sa_has_permission` and `doctor_has_feature`
  - that live `fill_practitioner` equals the body in `supabase/migrations/20261125100100_practitioner_columns.sql`
  - how `set_patient_import_override` writes `admin_audit_log` (`20261123130000_patient_import_hardening.sql:326-375`)

  Report all of these. If `features` lacks `is_active` or `is_requestable`, drop those columns from the INSERT below.

- [ ] **Step 2: Write the failing check** `supabase/tests/multi-doctor/05_entitlements.sql`:

```sql
-- Multi-doctor P1 part 1: launch gate, seats, within-seat rank. Rolled back; prints 'pass'.
BEGIN;
DO $$
DECLARE
  d uuid := gen_random_uuid();
  pa uuid; pb uuid; pc uuid;
  n int; r jsonb;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  VALUES (d, 'authenticated', 'authenticated', d::text || '@example.test', '{"full_name":"Dr Seats"}'::jsonb);
  UPDATE public.profiles SET plan_tier = 'premium', plan_status = 'active', plan_end = now() + interval '30 days' WHERE id = d;
  pa := public.primary_practitioner_id(d);

  -- 1. Off by default: not enabled, one seat, a second bookable doctor is refused.
  IF public.clinic_multi_doctor_enabled(d) THEN RAISE EXCEPTION 'enabled without flag or override'; END IF;
  IF public.clinic_doctor_seat_limit(d) <> 1 THEN RAISE EXCEPTION 'seat limit should be 1 when disabled'; END IF;
  BEGIN
    INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (d, 'Dr B', 'dr-b');
    RAISE EXCEPTION 'second bookable doctor accepted while disabled';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'SEAT_LIMIT' THEN RAISE; END IF;
  END;
  -- A non-bookable doctor uses no seat.
  INSERT INTO public.practitioners (doctor_id, display_name, slug, is_bookable) VALUES (d, 'Dr Manager', 'dr-manager', false)
  RETURNING id INTO pc;

  -- 2. Pilot override enables it; extra seats raise the limit.
  INSERT INTO public.doctor_feature_overrides (doctor_id, feature_key, enabled, reason)
  VALUES (d, 'multi_doctor', true, 'pilot');
  IF NOT public.clinic_multi_doctor_enabled(d) THEN RAISE EXCEPTION 'override did not enable'; END IF;
  IF public.clinic_doctor_seat_limit(d) <> 1 THEN RAISE EXCEPTION 'no extra seats yet: limit should be 1'; END IF;
  INSERT INTO public.clinic_doctor_seats (doctor_id, extra_seats, reason) VALUES (d, 1, 'test');
  IF public.clinic_doctor_seat_limit(d) <> 2 THEN RAISE EXCEPTION 'extra seat not counted'; END IF;
  INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (d, 'Dr B', 'dr-b') RETURNING id INTO pb;

  -- 3. Within seats: both bookable; a multi-doctor booking without a doctor still raises REQUIRED.
  IF NOT public.practitioner_within_seats(pb) THEN RAISE EXCEPTION 'B should be within seats'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status)
    VALUES (d, 'X', '9000000501', 'Visit', 'clinic', today, 100, 'SE01', 'pending');
    RAISE EXCEPTION 'ambiguous booking accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PRACTITIONER_REQUIRED' THEN RAISE; END IF;
  END;

  -- 4. Downgrade (seats back to 0): B is outside seats, the primary is auto-filled, booking B is refused.
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.clinic_doctor_seats SET extra_seats = 0 WHERE doctor_id = d;
  IF public.practitioner_within_seats(pb) THEN RAISE EXCEPTION 'B should be outside seats after downgrade'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status)
  VALUES (d, 'Y', '9000000502', 'Visit', 'clinic', today, 100, 'SE02', 'pending')
  RETURNING practitioner_id INTO pc;
  IF pc IS DISTINCT FROM pa THEN RAISE EXCEPTION 'downgraded clinic did not auto-fill the primary'; END IF;
  BEGIN
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status, practitioner_id)
    VALUES (d, 'Z', '9000000503', 'Visit', 'clinic', today, 100, 'SE03', 'pending', pb);
    RAISE EXCEPTION 'booking outside seats accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'SEAT_LIMIT' THEN RAISE; END IF;
  END;

  -- 5. The access summary, for the clinic, and refused for a stranger.
  r := public.get_clinic_doctor_access(d);
  IF (r->>'enabled')::boolean IS DISTINCT FROM true OR (r->>'seat_limit')::int <> 1 OR (r->>'seats_used')::int <> 2 THEN
    RAISE EXCEPTION 'access summary wrong: %', r;
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  r := public.get_clinic_doctor_access(d);
  IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'stranger read access summary: %', r; END IF;

  -- 6. Only platform admins set seats.
  r := public.set_clinic_doctor_seats(d, 3, 'self-grant');
  IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'non-admin set seats: %', r; END IF;

  -- 7. Clinic users can read, not write, their seats row.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.clinic_doctor_seats SET extra_seats = 9 WHERE doctor_id = d;
  GET DIAGNOSTICS n = ROW_COUNT;
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'clinic edited its own seats'; END IF;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
```

- [ ] **Step 3: Run it. Expected FAIL** (`function public.clinic_multi_doctor_enabled(uuid) does not exist`).

- [ ] **Step 4: Write the migration**:

```sql
-- Multi-doctor P1 part 1: launch gate, doctor seats and the "within seats" rule.
-- With multi_doctor_enabled = false and no override, every clinic keeps exactly 1 seat,
-- so applying this changes nothing for anyone.

INSERT INTO public.features (key, label, description, default_min_tier, sort_order, is_active, is_requestable)
VALUES ('multi_doctor', 'Multiple doctors',
        'Add more doctors to your clinic, each with their own timings, queue and prescriptions.',
        'premium', 900, true, false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.platform_settings (key, value) VALUES
  ('multi_doctor_enabled', 'false'::jsonb),
  ('doctor_seat_max', '15'::jsonb),
  ('doctor_seat_price', 'null'::jsonb),
  ('trial_extra_doctor_seats', '1'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Extra doctor seats bought by a clinic. A table of its own (not profiles) so the clinic can
-- read but never write it; superadmin sets it through set_clinic_doctor_seats().
CREATE TABLE IF NOT EXISTS public.clinic_doctor_seats (
  doctor_id   uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  extra_seats integer NOT NULL DEFAULT 0 CHECK (extra_seats >= 0),
  reason      text,
  set_by      uuid,
  set_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clinic_doctor_seats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Clinic members can view their doctor seats" ON public.clinic_doctor_seats;
CREATE POLICY "Clinic members can view their doctor seats" ON public.clinic_doctor_seats
  FOR SELECT TO authenticated
  USING (auth.uid() = doctor_id OR public.staff_doctor_id(auth.uid()) = doctor_id OR public.has_role(auth.uid(), 'admin'));

-- On for a clinic when it has the feature (Premium/trial, or an override) AND either the
-- platform launch flag is on or a superadmin enabled it for this clinic (pilot).
CREATE OR REPLACE FUNCTION public.clinic_multi_doctor_enabled(_doctor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.doctor_has_feature(_doctor_id, 'multi_doctor')
     AND (
       EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'multi_doctor_enabled' AND value = 'true'::jsonb)
       OR EXISTS (SELECT 1 FROM public.doctor_feature_overrides o
                   WHERE o.doctor_id = _doctor_id AND o.feature_key = 'multi_doctor' AND o.enabled
                     AND (o.expires_at IS NULL OR o.expires_at > now()))
     )
$$;
REVOKE ALL ON FUNCTION public.clinic_multi_doctor_enabled(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_multi_doctor_enabled(uuid) TO authenticated, service_role;

-- How many doctors may take bookings at once.
CREATE OR REPLACE FUNCTION public.clinic_doctor_seat_limit(_doctor_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_limit integer := 1;
BEGIN
  IF NOT public.clinic_multi_doctor_enabled(_doctor_id) THEN
    RETURN 1;
  END IF;
  v_limit := v_limit + COALESCE((SELECT extra_seats FROM public.clinic_doctor_seats WHERE doctor_id = _doctor_id), 0);
  IF EXISTS (SELECT 1 FROM public.profiles
              WHERE id = _doctor_id AND plan_status = 'trial' AND (trial_end IS NULL OR trial_end > now())) THEN
    v_limit := v_limit + public.platform_int_setting('trial_extra_doctor_seats', 1);
  END IF;
  RETURN LEAST(v_limit, public.platform_int_setting('doctor_seat_max', 15));
END;
$$;
REVOKE ALL ON FUNCTION public.clinic_doctor_seat_limit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_doctor_seat_limit(uuid) TO authenticated, service_role;

-- Seat order: the primary first, then sort_order, created_at, id. A doctor ranked at or past
-- the limit (after a downgrade) keeps every existing booking but takes no new ones.
CREATE OR REPLACE FUNCTION public.practitioner_seat_rank(_practitioner_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::int
    FROM public.practitioners x
    JOIN public.practitioners p ON p.id = _practitioner_id
   WHERE x.doctor_id = p.doctor_id AND x.is_active AND x.is_bookable AND x.id <> p.id
     AND (x.is_primary > p.is_primary
          OR (x.is_primary = p.is_primary AND (x.sort_order, x.created_at, x.id) < (p.sort_order, p.created_at, p.id)))
$$;
REVOKE ALL ON FUNCTION public.practitioner_seat_rank(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.practitioner_within_seats(_practitioner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.is_active AND p.is_bookable
         AND public.practitioner_seat_rank(p.id) < public.clinic_doctor_seat_limit(p.doctor_id)
    FROM public.practitioners p WHERE p.id = _practitioner_id
$$;
REVOKE ALL ON FUNCTION public.practitioner_within_seats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.practitioner_within_seats(uuid) TO authenticated, service_role;

-- Adding a doctor, or making one bookable again, needs a free seat.
CREATE OR REPLACE FUNCTION public.enforce_practitioner_seats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  used integer;
BEGIN
  IF NOT (NEW.is_active AND NEW.is_bookable) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_active AND OLD.is_bookable THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('practitioner_seats:' || NEW.doctor_id::text));
  SELECT count(*) INTO used FROM public.practitioners
   WHERE doctor_id = NEW.doctor_id AND is_active AND is_bookable AND id <> NEW.id;
  IF used + 1 > public.clinic_doctor_seat_limit(NEW.doctor_id) THEN
    RAISE EXCEPTION 'SEAT_LIMIT' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_practitioners_seats ON public.practitioners;
CREATE TRIGGER trg_practitioners_seats
  BEFORE INSERT OR UPDATE OF is_active, is_bookable ON public.practitioners
  FOR EACH ROW EXECUTE FUNCTION public.enforce_practitioner_seats();

CREATE OR REPLACE FUNCTION public.get_clinic_doctor_access(_doctor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT (v_uid = _doctor_id OR public.staff_doctor_id(v_uid) = _doctor_id
          OR public.has_role(v_uid, 'admin') OR public.sa_has_permission(v_uid, 'doctors.view')) THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;
  RETURN jsonb_build_object(
    'enabled',     public.clinic_multi_doctor_enabled(_doctor_id),
    'has_feature', public.doctor_has_feature(_doctor_id, 'multi_doctor'),
    'seat_limit',  public.clinic_doctor_seat_limit(_doctor_id),
    'seats_used',  (SELECT count(*) FROM public.practitioners WHERE doctor_id = _doctor_id AND is_active AND is_bookable),
    'extra_seats', COALESCE((SELECT extra_seats FROM public.clinic_doctor_seats WHERE doctor_id = _doctor_id), 0),
    'seat_max',    public.platform_int_setting('doctor_seat_max', 15),
    'seat_price',  (SELECT value FROM public.platform_settings WHERE key = 'doctor_seat_price')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_clinic_doctor_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clinic_doctor_access(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_clinic_doctor_seats(_doctor_id uuid, _extra integer, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid, 'admin') OR public.sa_has_permission(v_uid, 'plan_requests.manage')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;
  IF v_uid = _doctor_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;
  IF _extra IS NULL OR _extra < 0 OR _extra > public.platform_int_setting('doctor_seat_max', 15) - 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID');
  END IF;
  IF v_reason IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'REASON_REQUIRED');
  END IF;
  INSERT INTO public.clinic_doctor_seats (doctor_id, extra_seats, reason, set_by, set_at)
  VALUES (_doctor_id, _extra, v_reason, v_uid, now())
  ON CONFLICT (doctor_id) DO UPDATE
    SET extra_seats = EXCLUDED.extra_seats, reason = EXCLUDED.reason, set_by = EXCLUDED.set_by, set_at = now();
  -- AUDIT: insert into admin_audit_log exactly the way set_patient_import_override does
  -- (20261123130000_patient_import_hardening.sql), action 'set_doctor_seats',
  -- details {extra_seats, reason}.
  RETURN jsonb_build_object('ok', true, 'seat_limit', public.clinic_doctor_seat_limit(_doctor_id));
END;
$$;
REVOKE ALL ON FUNCTION public.set_clinic_doctor_seats(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_clinic_doctor_seats(uuid, integer, text) TO authenticated;
```

Replace the `-- AUDIT:` comment with the real `INSERT INTO public.admin_audit_log (...)` statement modelled on `set_patient_import_override`. Its columns are found in Step 1.

Then **append the new `fill_practitioner()`**:
1. Copy the function verbatim from `20261125100100_practitioner_columns.sql`.
2. Assert that each of the two snippets below occurs exactly once.
3. Replace them as shown.

Snippet 1, the booking candidate list. Replace

```sql
      SELECT array_agg(id) INTO v_ids FROM public.practitioners
       WHERE doctor_id = NEW.doctor_id AND is_active AND (v_mode <> 'booking' OR is_bookable);
```

with

```sql
      IF v_mode = 'booking' THEN
        -- Only doctors within the clinic's seats can be auto-picked (a downgraded clinic falls
        -- back to its primary instead of failing every booking).
        SELECT array_agg(id) INTO v_ids FROM (
          SELECT id FROM public.practitioners
           WHERE doctor_id = NEW.doctor_id AND is_active AND is_bookable
           ORDER BY is_primary DESC, sort_order, created_at, id
           LIMIT public.clinic_doctor_seat_limit(NEW.doctor_id)) s;
      ELSE
        SELECT array_agg(id) INTO v_ids FROM public.practitioners
         WHERE doctor_id = NEW.doctor_id AND is_active;
      END IF;
```

Snippet 2, the booking validation. Replace

```sql
      RAISE EXCEPTION 'PRACTITIONER_NOT_BOOKABLE' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
```

with

```sql
      RAISE EXCEPTION 'PRACTITIONER_NOT_BOOKABLE' USING ERRCODE = 'check_violation';
    END IF;
    IF v_mode = 'booking' AND NOT public.practitioner_within_seats(p.id) THEN
      RAISE EXCEPTION 'SEAT_LIMIT' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
```

- [ ] **Step 5: Apply.** Run the dry-run (only this file should be listed), then `npx supabase db push --linked --yes`. Run `05`, then `01`–`04`: all must `pass`.
- [ ] **Step 6: Leave changes uncommitted.** List the files changed.

---

### Task A2: Practitioner management RPCs, doctor role, per-doctor hours

**Files:**
- Create: `supabase/migrations/20261126100100_practitioner_management.sql`
- Test: `supabase/tests/multi-doctor/06_management.sql`

**Interfaces:**
- Consumes: A1. Also P0 `ensure_primary_practitioner`, `queue_action` locks, `revoke_user_sessions` (find its signature; used by `update-staff-phone`).
- Produces:
  - `staff_members.role text ('staff'|'doctor')`, `staff_members.practitioner_id uuid`. FK `(practitioner_id, doctor_id) → practitioners(id, doctor_id)`; role `doctor` requires a practitioner.
  - trigger `trg_guard_doctor_role_staff`: only the clinic owner (or a JWT-less service call) may create, change or delete a doctor-role staff row → `OWNER_ONLY`.
  - `working_hours`: the old `UNIQUE (doctor_id, day_of_week)` is dropped.
  - `practitioners` added to the `supabase_realtime` publication.
  - `practitioner_manager_clinic() → uuid`: the owner, or staff with `practitioners.manage`.
  - `upsert_practitioner(_id uuid, _data jsonb) → jsonb {ok, id | error}`
  - `set_practitioner_status(_id uuid, _is_active boolean, _is_bookable boolean) → jsonb {ok | error, count?}`
  - `set_primary_practitioner(_id uuid) → jsonb`
  - `reassign_practitioner_appointments(_from uuid, _to uuid, _from_date date DEFAULT NULL) → jsonb {ok, moved, skipped: uuid[]}`
  - `my_practitioner_id(_doctor_id uuid) → uuid`: the caller's own practitioner in that clinic.

- [ ] **Step 1: Pre-write read-only checks.**
  - The UNIQUE constraint name on `working_hours (doctor_id, day_of_week)`, e.g. `working_hours_doctor_id_day_of_week_key`.
  - Whether the `supabase_realtime` publication exists and already includes `practitioners`.
  - The `revoke_user_sessions` signature.
  - The existing `staff_members` triggers.

- [ ] **Step 2: Write the failing check** `06_management.sql`. It covers:
  1. The owner creates Dr B via `upsert_practitioner(NULL, '{"display_name":"Dr Priya Shah","specialization":"Dermatology","consultation_fee":800}')`.
     - Expect `ok` and slug `dr-priya-shah`.
     - Dr B gets 7 working_hours rows copied from the primary.
     - A second create with the same name gets slug `dr-priya-shah-2`.
     - Use the A1 test setup: premium, pilot override, `clinic_doctor_seats.extra_seats = 2`.
  2. A stranger (random JWT) gets `FORBIDDEN`. Staff without `practitioners.manage` get `FORBIDDEN`. Staff with it get `ok`.
  3. With the flag off and no override, `upsert_practitioner(NULL, …)` gives `MULTI_DOCTOR_NOT_ENABLED`.
  4. On the owner's own row, `upsert_practitioner(pa, '{"display_name":"X","consultation_fee":700}')`: the fee changes and display_name does NOT (owner personal fields are read-only here).
  5. `set_practitioner_status(pb, false, true)` while Dr B has a future pending appointment gives `HAS_FUTURE_APPOINTMENTS` with `count = 1`.
     - After `reassign_practitioner_appointments(pb, pa)` → `moved = 1`, the same call is `ok`.
     - Dr B is inactive, and Dr B's linked staff login (if any) has `status = 'inactive'`.
  6. Reassign skips a conflicting booking: Dr A already has that slot, so the result is `skipped` containing its id, and the booking still belongs to Dr B.
     Reassign also moves a today booking whose time has already passed: it is moved, its `time_slot` becomes NULL, and its `sort_time` is the current IST time.
  7. `set_primary_practitioner(pb)` by staff gives `OWNER_ONLY`. By the owner it is `ok`: exactly one primary, and it is Dr B.
  8. Two practitioners' working hours for the same weekday can coexist. An insert for Dr B's day 1 when Dr A has day 1 succeeds.
  9. Doctor-role guard: a staff user (with `staff.create`) inserting a `staff_members` row with `role = 'doctor'` gives `OWNER_ONLY`.

  Write each scenario in the same `BEGIN … EXCEPTION WHEN check_violation THEN IF SQLERRM <> '…'` style as the P0 tests. For RPC results, use `IF r->>'error' IS DISTINCT FROM '…' THEN RAISE …`.

- [ ] **Step 3: Run it. Expected FAIL.**

- [ ] **Step 4: Write the migration**:

```sql
-- Multi-doctor P1 part 2: managing doctors, doctor logins, per-doctor working hours.

-- ---- Doctor logins: a staff_members row with role 'doctor' linked to one practitioner ----
ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'staff'
  CHECK (role IN ('staff', 'doctor'));
ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS practitioner_id uuid UNIQUE;
ALTER TABLE public.staff_members ADD CONSTRAINT staff_members_practitioner_fk
  FOREIGN KEY (practitioner_id, doctor_id) REFERENCES public.practitioners (id, doctor_id);
ALTER TABLE public.staff_members ADD CONSTRAINT staff_members_doctor_role_needs_practitioner
  CHECK (role <> 'doctor' OR practitioner_id IS NOT NULL);

-- Only the clinic owner manages doctor logins (closes the "staff.edit can grant more than they
-- hold" gap for doctor accounts). Edge functions (service role, no JWT) are trusted: they check
-- the owner themselves.
CREATE OR REPLACE FUNCTION public.guard_doctor_role_staff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_clinic uuid := COALESCE(NEW.doctor_id, OLD.doctor_id);
BEGIN
  IF v_uid IS NULL OR v_uid = v_clinic THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF (TG_OP <> 'DELETE' AND (NEW.role = 'doctor' OR NEW.practitioner_id IS NOT NULL))
     OR (TG_OP <> 'INSERT' AND (OLD.role = 'doctor' OR OLD.practitioner_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'OWNER_ONLY' USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_doctor_role_staff ON public.staff_members;
CREATE TRIGGER trg_guard_doctor_role_staff
  BEFORE INSERT OR UPDATE OR DELETE ON public.staff_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_doctor_role_staff();

-- ---- Per-doctor working hours: contract step of P0's expand/contract ----
-- (use the constraint name found in Step 1)
ALTER TABLE public.working_hours DROP CONSTRAINT IF EXISTS working_hours_doctor_id_day_of_week_key;

-- ---- Realtime for the Doctors page and pickers ----
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'practitioners') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.practitioners;
  END IF;
END $$;

-- ---- Who may manage doctors ----
CREATE OR REPLACE FUNCTION public.practitioner_manager_clinic()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()) THEN auth.uid()
    WHEN public.staff_has_permission(auth.uid(), 'practitioners.manage') THEN public.staff_doctor_id(auth.uid())
  END
$$;
REVOKE ALL ON FUNCTION public.practitioner_manager_clinic() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_practitioner_id(_doctor_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.practitioners
   WHERE doctor_id = _doctor_id AND user_id = auth.uid() AND is_active
$$;
REVOKE ALL ON FUNCTION public.my_practitioner_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_practitioner_id(uuid) TO authenticated;

-- ---- Create / edit a doctor ----
-- _data keys (all optional on edit): display_name, specialization, qualifications,
-- experience_years, bio, photo_url, registration_number, signature_url (personal fields; not
-- editable on the owner's own row, which syncs from Profile), consultation_fee,
-- slot_duration_minutes, online_booking, directory_listed, sort_order. Unknown keys are ignored.
-- The slug is set once at creation and never changes.
CREATE OR REPLACE FUNCTION public.upsert_practitioner(_id uuid, _data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_clinic uuid := public.practitioner_manager_clinic();
  p        public.practitioners%ROWTYPE;
  v_name   text := NULLIF(btrim(COALESCE(_data->>'display_name', '')), '');
  v_base   text;
  v_slug   text;
  v_n      integer := 1;
  v_owner_row boolean;
BEGIN
  IF v_clinic IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;

  IF _id IS NULL THEN
    IF NOT public.clinic_multi_doctor_enabled(v_clinic) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'MULTI_DOCTOR_NOT_ENABLED');
    END IF;
    IF v_name IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NAME_REQUIRED');
    END IF;
    v_base := COALESCE(NULLIF(public.directory_slugify(v_name), ''), 'doctor');
    v_slug := v_base;
    WHILE EXISTS (SELECT 1 FROM public.practitioners WHERE doctor_id = v_clinic AND slug = v_slug) LOOP
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n;
    END LOOP;
    BEGIN
      INSERT INTO public.practitioners (doctor_id, display_name, slug, sort_order)
      VALUES (v_clinic, v_name, v_slug,
              COALESCE((SELECT max(sort_order) + 1 FROM public.practitioners WHERE doctor_id = v_clinic), 0))
      RETURNING * INTO p;
    EXCEPTION WHEN check_violation THEN
      IF SQLERRM = 'SEAT_LIMIT' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'SEAT_LIMIT');
      END IF;
      RAISE;
    END;
    -- New doctors start with the primary doctor's weekly hours (editable right after).
    INSERT INTO public.working_hours (doctor_id, practitioner_id, day_of_week, is_open, start_time, end_time, start_time_2, end_time_2)
    SELECT w.doctor_id, p.id, w.day_of_week, w.is_open, w.start_time, w.end_time, w.start_time_2, w.end_time_2
      FROM public.working_hours w
     WHERE w.doctor_id = v_clinic AND w.practitioner_id = public.primary_practitioner_id(v_clinic);
  ELSE
    SELECT * INTO p FROM public.practitioners WHERE id = _id AND doctor_id = v_clinic FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PRACTITIONER_NOT_FOUND');
    END IF;
  END IF;

  v_owner_row := COALESCE(p.user_id = v_clinic, false);
  UPDATE public.practitioners SET
    display_name        = CASE WHEN v_owner_row OR NOT (_data ? 'display_name') OR v_name IS NULL THEN display_name ELSE v_name END,
    specialization      = CASE WHEN v_owner_row OR NOT (_data ? 'specialization') THEN specialization ELSE NULLIF(btrim(_data->>'specialization'), '') END,
    qualifications      = CASE WHEN v_owner_row OR NOT (_data ? 'qualifications') THEN qualifications ELSE NULLIF(btrim(_data->>'qualifications'), '') END,
    experience_years    = CASE WHEN v_owner_row OR NOT (_data ? 'experience_years') THEN experience_years ELSE NULLIF(_data->>'experience_years', '')::int END,
    bio                 = CASE WHEN v_owner_row OR NOT (_data ? 'bio') THEN bio ELSE NULLIF(btrim(_data->>'bio'), '') END,
    photo_url           = CASE WHEN v_owner_row OR NOT (_data ? 'photo_url') THEN photo_url ELSE NULLIF(_data->>'photo_url', '') END,
    registration_number = CASE WHEN v_owner_row OR NOT (_data ? 'registration_number') THEN registration_number ELSE NULLIF(btrim(_data->>'registration_number'), '') END,
    signature_url       = CASE WHEN v_owner_row OR NOT (_data ? 'signature_url') THEN signature_url ELSE NULLIF(_data->>'signature_url', '') END,
    consultation_fee    = CASE WHEN NOT (_data ? 'consultation_fee') THEN consultation_fee ELSE NULLIF(_data->>'consultation_fee', '')::numeric END,
    slot_duration_minutes = CASE WHEN NOT (_data ? 'slot_duration_minutes') THEN slot_duration_minutes ELSE NULLIF(_data->>'slot_duration_minutes', '')::int END,
    online_booking      = CASE WHEN NOT (_data ? 'online_booking') THEN online_booking ELSE (_data->>'online_booking')::boolean END,
    directory_listed    = CASE WHEN NOT (_data ? 'directory_listed') THEN directory_listed ELSE (_data->>'directory_listed')::boolean END,
    sort_order          = CASE WHEN NOT (_data ? 'sort_order') THEN sort_order ELSE (_data->>'sort_order')::int END
  WHERE id = p.id;

  RETURN jsonb_build_object('ok', true, 'id', p.id);
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID');
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID');
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_practitioner(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_practitioner(uuid, jsonb) TO authenticated;

-- ---- Activate / deactivate / stop bookings ----
CREATE OR REPLACE FUNCTION public.set_practitioner_status(_id uuid, _is_active boolean, _is_bookable boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_clinic uuid := public.practitioner_manager_clinic();
  p public.practitioners%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_future integer;
BEGIN
  IF v_clinic IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;
  SELECT * INTO p FROM public.practitioners WHERE id = _id AND doctor_id = v_clinic FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PRACTITIONER_NOT_FOUND');
  END IF;
  IF p.is_primary AND NOT (_is_active AND _is_bookable) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PRIMARY_PRACTITIONER_REQUIRED');
  END IF;
  IF NOT _is_active THEN
    SELECT count(*) INTO v_future FROM public.appointments
     WHERE practitioner_id = p.id AND date >= v_today AND status::text IN ('pending', 'confirmed');
    IF v_future > 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'HAS_FUTURE_APPOINTMENTS', 'count', v_future);
    END IF;
  END IF;

  BEGIN
    UPDATE public.practitioners SET is_active = _is_active, is_bookable = _is_active AND _is_bookable WHERE id = p.id;
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM = 'SEAT_LIMIT' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'SEAT_LIMIT');
    END IF;
    RAISE;
  END;

  -- A deactivated doctor can no longer sign in. (Use revoke_user_sessions' real signature.)
  IF NOT _is_active AND p.user_id IS NOT NULL AND p.user_id <> v_clinic THEN
    UPDATE public.staff_members SET status = 'inactive' WHERE id = p.user_id;
    PERFORM public.revoke_user_sessions(p.user_id);
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.set_practitioner_status(uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_practitioner_status(uuid, boolean, boolean) TO authenticated;

-- ---- Change the primary doctor (owner only) ----
CREATE OR REPLACE FUNCTION public.set_primary_practitioner(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'OWNER_ONLY');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.practitioners WHERE id = _id AND doctor_id = v_uid AND is_active AND is_bookable) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PRACTITIONER_NOT_BOOKABLE');
  END IF;
  UPDATE public.practitioners SET is_primary = false WHERE doctor_id = v_uid AND is_primary AND id <> _id;
  UPDATE public.practitioners SET is_primary = true WHERE id = _id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.set_primary_practitioner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_primary_practitioner(uuid) TO authenticated;

-- ---- Move a doctor's open bookings to another doctor ----
-- Each booking moves on its own; one that clashes with the target's existing booking is left
-- with the original doctor and reported in "skipped". Patients in the room are never moved.
-- Today's waiting patients join the end of the target's line (queue_action-style move).
CREATE OR REPLACE FUNCTION public.reassign_practitioner_appointments(_from uuid, _to uuid, _from_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_clinic uuid := public.practitioner_manager_clinic();
  v_today  date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_from_date date := COALESCE(_from_date, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  r record;
  v_moved integer := 0;
  v_skipped uuid[] := '{}';
BEGIN
  IF v_clinic IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.practitioners WHERE id = _from AND doctor_id = v_clinic)
     OR NOT EXISTS (SELECT 1 FROM public.practitioners WHERE id = _to AND doctor_id = v_clinic) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PRACTITIONER_NOT_FOUND');
  END IF;
  IF NOT public.practitioner_within_seats(_to) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PRACTITIONER_NOT_BOOKABLE');
  END IF;

  -- Same lock order as queue_action('transfer') for today's lines.
  PERFORM pg_advisory_xact_lock(hashtext('queue:' || LEAST(_from, _to)::text || v_today::text));
  PERFORM pg_advisory_xact_lock(hashtext('queue:' || GREATEST(_from, _to)::text || v_today::text));
  PERFORM set_config('app.queue_rpc', '1', true);

  FOR r IN
    SELECT id, date, serving_started_at FROM public.appointments
     WHERE practitioner_id = _from AND doctor_id = v_clinic AND date >= v_from_date
       AND status::text IN ('pending', 'confirmed')
     ORDER BY date, sort_time, id
  LOOP
    IF r.serving_started_at IS NOT NULL THEN
      v_skipped := v_skipped || r.id;
      CONTINUE;
    END IF;
    BEGIN
      -- A booked time already past today would fail the new doctor's slot check (SLOT_IN_PAST):
      -- drop it, as queue_action('transfer') does; the line order comes from sort_time.
      UPDATE public.appointments
         SET practitioner_id = _to,
             time_slot = CASE
               WHEN date = v_today AND time_slot IS NOT NULL
                    AND ((date::text || ' ' || time_slot)::timestamp AT TIME ZONE 'Asia/Kolkata') < now()
               THEN NULL ELSE time_slot END
       WHERE id = r.id;
      IF r.date = v_today THEN
        -- sort_time is recomputed by trg_set_appointment_sort_time only when time_slot is set;
        -- set it explicitly so today's moved patients join the END of the target's line.
        UPDATE public.appointments SET sort_time = (now() AT TIME ZONE 'Asia/Kolkata')::time WHERE id = r.id;
      END IF;
      v_moved := v_moved + 1;
    EXCEPTION WHEN check_violation THEN
      v_skipped := v_skipped || r.id;
    END;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'moved', v_moved, 'skipped', to_jsonb(v_skipped));
END;
$$;
REVOKE ALL ON FUNCTION public.reassign_practitioner_appointments(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_practitioner_appointments(uuid, uuid, date) TO authenticated;
```

- [ ] **Step 5: Apply.** Run the dry-run, then push, then `06`, then `01`–`05`: all must pass.
- [ ] **Step 6: Leave uncommitted.** List the files.

---

### Task A3: Clinical visibility and prescription authorship

**Files:**
- Create: `supabase/migrations/20261126100200_clinical_visibility.sql`
- Test: `supabase/tests/multi-doctor/07_clinical_visibility.sql`

**Interfaces:**
- Consumes: A1, A2 (`staff_members.role`, `my_practitioner_id`).
- Produces:
  - `website_settings.clinical_visibility text ('shared'|'treating')`. Only the owner may change it (`OWNER_ONLY`).
  - `clinical_row_visible(_doctor_id uuid, _patient_id uuid, _practitioner_id uuid) → boolean`. RESTRICTIVE `FOR ALL` policies on `prescriptions`, `patient_visits` and `patient_documents` use it.
  - A RESTRICTIVE UPDATE/DELETE policy on `prescriptions`: in multi-doctor clinics only the author's user or the owner may change or delete a prescription.
  - Table `clinical_access_log(id, doctor_id, viewer_user_id, patient_id, created_at)`, owner-readable.
  - `log_clinical_access(_patient_id uuid) → void`
  - `get_shared_prescription`: its `doctor` object uses the author practitioner's name, qualifications, specialization, registration number and signature, falling back to `profiles`.

- [ ] **Step 1: Pre-write checks.**
  - List existing policies on prescriptions, patient_visits and patient_documents (`pg_policies`).
  - Confirm live `get_shared_prescription` equals `20261120100000_prescription_shares.sql:107-198`.
  - Find any trigger on `website_settings` that rejects unknown columns.

- [ ] **Step 2: Write the failing check** `07_clinical_visibility.sql`. Setup: clinic `d` (pilot-enabled, 2 extra seats), Dr A = primary, Dr B with doctor login `ub`, reception staff `ur`, patients P1 (appointment with A only) and P2 (appointment with B). Each staff row is inserted the way the patient-import test does. Check:
  1. **Shared mode:** `ub` (via `SET LOCAL ROLE authenticated` + claims) reads A's prescription for P1. Count = 1.
  2. **Treating mode** (set as owner): `ub` reads 0 of A's P1 prescriptions, and reads their own P2 prescription. The owner reads both.
  3. **Reception is unaffected by the setting:** `ur` with `prescriptions.view` reads both, in both modes.
  4. **Author-only edits:** `ub` updating A's prescription changes 0 rows, and `ub` updating their own changes 1. Reception updating any prescription changes 0 rows (multi-doctor clinic). In a single-doctor clinic (second clinic `d2`, no override), reception with `prescriptions.edit` updating a prescription changes 1 row, as today.
  5. **Owner-only setting:** `ur` (with `website.settings`) changing `clinical_visibility` gives `OWNER_ONLY`.
  6. **Access log:** `log_clinical_access(P1)` as `ub` in treating mode inserts 1 row; as the owner it inserts 0.
  7. **Shared prescription:** `get_shared_prescription` for B's prescription returns `doctor.full_name = 'Dr B'` and B's registration number. Create the share with `create_prescription_share` as the owner, and use the last 4 digits of the patient phone.

- [ ] **Step 3: Run it. Expected FAIL.**

- [ ] **Step 4: Write the migration**:

```sql
-- Multi-doctor P1 part 3: who sees and edits clinical records when a clinic has several doctors.
-- Everything here is RESTRICTIVE and returns true for anyone who is not a doctor-role login,
-- so owners and reception keep exactly today's access (their permissive policies decide).

ALTER TABLE public.website_settings ADD COLUMN IF NOT EXISTS clinical_visibility text NOT NULL DEFAULT 'shared'
  CHECK (clinical_visibility IN ('shared', 'treating'));

CREATE OR REPLACE FUNCTION public.guard_clinical_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.clinical_visibility IS DISTINCT FROM OLD.clinical_visibility
     AND auth.uid() IS NOT NULL AND auth.uid() <> NEW.doctor_id THEN
    RAISE EXCEPTION 'OWNER_ONLY' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_clinical_visibility ON public.website_settings;
CREATE TRIGGER trg_guard_clinical_visibility
  BEFORE UPDATE OF clinical_visibility ON public.website_settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_clinical_visibility();

CREATE OR REPLACE FUNCTION public.clinical_row_visible(_doctor_id uuid, _patient_id uuid, _practitioner_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mine uuid;
BEGIN
  IF v_uid IS NULL OR v_uid = _doctor_id THEN
    RETURN true;
  END IF;
  SELECT practitioner_id INTO v_mine FROM public.staff_members
   WHERE id = v_uid AND doctor_id = _doctor_id AND role = 'doctor' AND status = 'active';
  IF NOT FOUND THEN
    RETURN true;                      -- not a doctor login: normal permissions decide
  END IF;
  IF COALESCE((SELECT clinical_visibility FROM public.website_settings WHERE doctor_id = _doctor_id), 'shared') = 'shared' THEN
    RETURN true;
  END IF;
  RETURN _practitioner_id = v_mine
      OR EXISTS (SELECT 1 FROM public.appointments a
                  WHERE a.doctor_id = _doctor_id AND a.patient_id = _patient_id AND a.practitioner_id = v_mine);
END;
$$;
REVOKE ALL ON FUNCTION public.clinical_row_visible(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinical_row_visible(uuid, uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Clinical visibility between doctors" ON public.prescriptions;
CREATE POLICY "Clinical visibility between doctors" ON public.prescriptions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.clinical_row_visible(doctor_id, patient_id, practitioner_id))
  WITH CHECK (public.clinical_row_visible(doctor_id, patient_id, practitioner_id));

DROP POLICY IF EXISTS "Clinical visibility between doctors" ON public.patient_visits;
CREATE POLICY "Clinical visibility between doctors" ON public.patient_visits
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.clinical_row_visible(doctor_id, patient_id, practitioner_id))
  WITH CHECK (public.clinical_row_visible(doctor_id, patient_id, practitioner_id));

DROP POLICY IF EXISTS "Clinical visibility between doctors" ON public.patient_documents;
CREATE POLICY "Clinical visibility between doctors" ON public.patient_documents
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.clinical_row_visible(doctor_id, patient_id, practitioner_id))
  WITH CHECK (public.clinical_row_visible(doctor_id, patient_id, practitioner_id));

-- In a multi-doctor clinic a prescription is changed only by its author or the owner.
-- Single-doctor clinics keep today's rule (reception with prescriptions.edit may edit).
DROP POLICY IF EXISTS "Only the author changes a prescription" ON public.prescriptions;
CREATE POLICY "Only the author changes a prescription" ON public.prescriptions
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (auth.uid() = doctor_id
         OR NOT public.clinic_multi_doctor_enabled(doctor_id)
         OR practitioner_id = public.my_practitioner_id(doctor_id));
DROP POLICY IF EXISTS "Only the author deletes a prescription" ON public.prescriptions;
CREATE POLICY "Only the author deletes a prescription" ON public.prescriptions
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (auth.uid() = doctor_id
         OR NOT public.clinic_multi_doctor_enabled(doctor_id)
         OR practitioner_id = public.my_practitioner_id(doctor_id));

-- "Own patients only" mode leaves a trail of who opened which patient's clinical records.
CREATE TABLE IF NOT EXISTS public.clinical_access_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewer_user_id uuid NOT NULL,
  patient_id     uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clinical_access_log_doctor ON public.clinical_access_log (doctor_id, created_at DESC);
ALTER TABLE public.clinical_access_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner reads the clinical access log" ON public.clinical_access_log;
CREATE POLICY "Owner reads the clinical access log" ON public.clinical_access_log
  FOR SELECT TO authenticated USING (auth.uid() = doctor_id);

CREATE OR REPLACE FUNCTION public.log_clinical_access(_patient_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  s public.staff_members%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.staff_members WHERE id = auth.uid() AND role = 'doctor' AND status = 'active';
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF COALESCE((SELECT clinical_visibility FROM public.website_settings WHERE doctor_id = s.doctor_id), 'shared') <> 'treating' THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE id = _patient_id AND doctor_id = s.doctor_id) THEN
    RETURN;
  END IF;
  INSERT INTO public.clinical_access_log (doctor_id, viewer_user_id, patient_id) VALUES (s.doctor_id, s.id, _patient_id);
END;
$$;
REVOKE ALL ON FUNCTION public.log_clinical_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_clinical_access(uuid) TO authenticated;
```

Then **append `get_shared_prescription`**:
1. Copy it verbatim from `20261120100000_prescription_shares.sql`.
2. In the `doctor` object, take `full_name`, `qualifications`, `specialization`, `registration_number` and `signature_url` from the author practitioner, each with `COALESCE(<practitioner value>, <profiles value>)`. To get the practitioner values, either add `LEFT JOIN public.practitioners pr ON pr.id = rx.practitioner_id` where the profile row is read, or use a scalar subquery on `rx.practitioner_id`.
3. Map `full_name` to `pr.display_name`.
4. Keep all clinic fields (`clinic_name`, `address`, `city`, `phone`, `clinic_email`, `slug`) from `profiles`.
5. Assert each replaced snippet occurs exactly once.

- [ ] **Step 5: Apply.** Run the dry-run, then push, then `07`. Then run all earlier multi-doctor checks and `supabase/tests/patient-import/*.sql`: all must pass.
- [ ] **Step 6: Leave uncommitted.** List the files.

---

### Task A4: "New booking" notification for doctors with a login

**Files:**
- Create: `supabase/migrations/20261126100300_practitioner_booking_notifications.sql`
- Test: `supabase/tests/multi-doctor/08_notifications.sql`

**Interfaces:**
- Produces: `notifications.source_type` also allows `'new_booking'`; trigger `trg_a7_notify_practitioner_booking` AFTER INSERT on appointments.

- [ ] **Step 1: Pre-write checks.** Find the current CHECK constraint name and definition on `notifications.source_type` (last set in `20261029150000_abuse_limits_and_billing_rules.sql:501`). Find the `notifications` columns.

- [ ] **Step 2: Write the failing check.** It covers:
  1. A booking for Dr B (who has a login `ub`), made by the owner, creates exactly 1 notification with `recipient_user_id = ub` and `source_type = 'new_booking'`.
  2. A booking for the owner's own practitioner creates 0.
  3. A booking Dr B makes for themselves creates 0.
  4. A booking in a single-doctor clinic creates 0.

- [ ] **Step 3: Run it. Expected FAIL.**

- [ ] **Step 4: Migration.** Drop the constraint and re-add it with the same list plus `'new_booking'`. Then:

```sql
CREATE OR REPLACE FUNCTION public.notify_practitioner_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
  v_name text;
BEGIN
  SELECT user_id, display_name INTO v_user, v_name FROM public.practitioners WHERE id = NEW.practitioner_id;
  IF v_user IS NULL OR v_user = NEW.doctor_id OR v_user = auth.uid()
     OR NOT public.clinic_multi_doctor_enabled(NEW.doctor_id) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.notifications (doctor_id, recipient_user_id, source_type, title, message)
  VALUES (NEW.doctor_id, v_user, 'new_booking',
          'New appointment',
          COALESCE(NEW.patient_name, 'A patient') || ' booked for ' || to_char(NEW.date, 'DD Mon')
            || COALESCE(' at ' || to_char(NEW.time_slot, 'HH12:MI AM'), ''));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_a7_notify_practitioner_booking ON public.appointments;
CREATE TRIGGER trg_a7_notify_practitioner_booking
  AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.notify_practitioner_booking();
```

If `notifications` has more NOT NULL columns, add them, using the values the existing `paid_no_show` insert uses.

- [ ] **Step 5: Apply, then run `08` and all earlier checks.** Leave uncommitted.

---

### Task A5: Public doctor list and appointment lookup

**Files:**
- Create: `supabase/migrations/20261126100400_public_practitioners.sql`
- Test: `supabase/tests/multi-doctor/09_public.sql`

**Interfaces:**
- Produces:
  - `get_public_practitioners(_doctor_id uuid) → TABLE(id uuid, display_name text, slug text, specialization text, qualifications text, experience_years int, bio text, photo_url text, registration_number text, consultation_fee numeric, slot_duration_minutes int, online_booking boolean, bookable boolean, is_primary boolean, sort_order int)`, granted to anon and authenticated.
    - It only returns active practitioners of an onboarded, not-cancelled clinic.
    - `bookable = practitioner_within_seats(id) AND online_booking`.
    - `consultation_fee` and `slot_duration_minutes` are the practitioner's values, NULL meaning the clinic default.
  - `get_appointment_by_token`: the result additionally includes `practitioner_id uuid` and `practitioner_name text`.

- [ ] **Step 1: Pre-write checks.**
  - Get `pg_get_function_result` and the body of live `get_appointment_by_token`, and compare with `20261124110000_appointment_lookup_payment_details.sql`.
  - Find how "not cancelled" is defined in `search_doctors` (`20261030090000…sql`) and reuse that exact condition.

- [ ] **Step 2: Write the failing check.** It covers:
  1. Anon sees 2 rows for a pilot clinic with A and B. B with `online_booking = false` has `bookable = false`.
  2. An inactive doctor is absent.
  3. A non-onboarded clinic returns 0 rows.
  4. `get_appointment_by_token` for B's booking returns `practitioner_name = 'Dr B'`.

- [ ] **Step 3: Migration.**
  - Create `get_public_practitioners` as `LANGUAGE sql STABLE SECURITY DEFINER`, ordered `is_primary DESC, sort_order, display_name`.
  - For `get_appointment_by_token`: changing a `RETURNS TABLE` needs `DROP FUNCTION` and a new `CREATE`, with its grants re-applied exactly as before. Add `a.practitioner_id` and `(SELECT display_name FROM practitioners WHERE id = a.practitioner_id)`.
  - End with `NOTIFY pgrst, 'reload schema';`.

- [ ] **Step 4: Apply, run `09` and all earlier checks.** Regenerate types into a temp file, diff, then write `src/integrations/supabase/types.ts` (`npx supabase gen types typescript --linked`, no `--schema` flag). Leave uncommitted.

---

# Part B — Shared client foundations

### Task B1: Practitioner types, hours helpers, error messages, permission keys

**Files:**
- Create: `src/lib/practitioners/types.ts`, `src/lib/practitioners/hours.ts`, `src/lib/practitioners/hours.test.ts`, `src/lib/practitioners/errors.ts`, `src/lib/practitioners/errors.test.ts`
- Modify: `src/lib/staffPermissions.ts`, `supabase/functions/_shared/staffPermissions.ts`, `src/lib/features.ts`, `src/lib/queue.ts` (`QUEUE_ERRORS`)

**Interfaces (produces):**

```ts
// src/lib/practitioners/types.ts
import type { Tables } from "@/integrations/supabase/types";
export type Practitioner = Tables<"practitioners">;
export interface PublicPractitioner {
  id: string; display_name: string; slug: string; specialization: string | null; qualifications: string | null;
  experience_years: number | null; bio: string | null; photo_url: string | null; registration_number: string | null;
  consultation_fee: number | null; slot_duration_minutes: number | null; online_booking: boolean; bookable: boolean;
  is_primary: boolean; sort_order: number;
}
export interface ClinicDoctorAccess {
  enabled: boolean; has_feature: boolean; seat_limit: number; seats_used: number;
  extra_seats: number; seat_max: number; seat_price: number | null;
}
```

- [ ] **Step 1: Write the failing tests** `src/lib/practitioners/hours.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hoursFor, clinicHoursUnion, type HoursRow } from "./hours";

const row = (p: string, d: number, s: string | null, e: string | null, s2: string | null = null, e2: string | null = null, open = true): HoursRow =>
  ({ practitioner_id: p, day_of_week: d, is_open: open, start_time: s, end_time: e, start_time_2: s2, end_time_2: e2 });

describe("hoursFor", () => {
  it("keeps only the chosen doctor's rows", () => {
    const rows = [row("a", 1, "09:00:00", "13:00:00"), row("b", 1, "15:00:00", "19:00:00")];
    expect(hoursFor(rows, "b")).toEqual([rows[1]]);
  });
});

describe("clinicHoursUnion", () => {
  it("returns the very same array for a single doctor (no change for single-doctor clinics)", () => {
    const rows = [row("a", 1, "09:00:00", "13:00:00", "17:00:00", "20:00:00"), row("a", 2, null, null, null, null, false)];
    expect(clinicHoursUnion(rows)).toBe(rows);
  });
  it("merges overlapping doctors' hours per day", () => {
    const rows = [row("a", 1, "09:00:00", "13:00:00"), row("b", 1, "12:00:00", "16:00:00")];
    const d1 = clinicHoursUnion(rows).find((r) => r.day_of_week === 1)!;
    expect(d1).toMatchObject({ is_open: true, start_time: "09:00:00", end_time: "16:00:00", start_time_2: null, end_time_2: null });
  });
  it("keeps two separate sessions and folds any further ones into the second", () => {
    const rows = [row("a", 3, "09:00:00", "11:00:00"), row("b", 3, "13:00:00", "14:00:00"), row("c", 3, "17:00:00", "19:00:00")];
    const d3 = clinicHoursUnion(rows).find((r) => r.day_of_week === 3)!;
    expect(d3).toMatchObject({ start_time: "09:00:00", end_time: "11:00:00", start_time_2: "13:00:00", end_time_2: "19:00:00" });
  });
  it("marks a day closed when no doctor works it, and returns all 7 days", () => {
    const rows = [row("a", 1, "09:00:00", "13:00:00"), row("b", 2, "09:00:00", "13:00:00")];
    const out = clinicHoursUnion(rows);
    expect(out).toHaveLength(7);
    expect(out.find((r) => r.day_of_week === 0)).toMatchObject({ is_open: false, start_time: null });
  });
});
```

`src/lib/practitioners/errors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { practitionerErrorMessage, PRACTITIONER_ERROR_CODES } from "./errors";

describe("practitionerErrorMessage", () => {
  it("has a non-empty message for every code", () => {
    for (const code of PRACTITIONER_ERROR_CODES) expect(practitionerErrorMessage(code)).toMatch(/\w/);
  });
  it("finds a code inside a Postgres error message", () => {
    expect(practitionerErrorMessage('new row violates ... SEAT_LIMIT')).toBe(practitionerErrorMessage("SEAT_LIMIT"));
  });
  it("returns null for unrelated errors", () => {
    expect(practitionerErrorMessage("SLOT_FULL")).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/practitioners` **. Expected FAIL** (modules missing).

- [ ] **Step 3: Implement** `hours.ts`:

```ts
export interface HoursRow {
  day_of_week: number; is_open: boolean;
  start_time: string | null; end_time: string | null;
  start_time_2: string | null; end_time_2: string | null;
  practitioner_id?: string | null;
  [k: string]: unknown;
}

export function hoursFor<T extends HoursRow>(rows: T[], practitionerId: string): T[] {
  return rows.filter((r) => r.practitioner_id === practitionerId);
}

/** When the clinic is open: the union of its doctors' hours. A single doctor's rows come back unchanged. */
export function clinicHoursUnion<T extends HoursRow>(rows: T[]): T[] | HoursRow[] {
  if (new Set(rows.map((r) => r.practitioner_id ?? "")).size <= 1) return rows;
  const out: HoursRow[] = [];
  for (let d = 0; d < 7; d++) {
    const iv: [string, string][] = [];
    for (const r of rows) {
      if (r.day_of_week !== d || !r.is_open) continue;
      if (r.start_time && r.end_time) iv.push([r.start_time, r.end_time]);
      if (r.start_time_2 && r.end_time_2) iv.push([r.start_time_2, r.end_time_2]);
    }
    iv.sort((a, b) => a[0].localeCompare(b[0]));
    const merged: [string, string][] = [];
    for (const [s, e] of iv) {
      const last = merged[merged.length - 1];
      if (last && s <= last[1]) { if (e > last[1]) last[1] = e; } else merged.push([s, e]);
    }
    const rest = merged.slice(1);
    out.push({
      day_of_week: d, is_open: merged.length > 0, practitioner_id: null,
      start_time: merged[0]?.[0] ?? null, end_time: merged[0]?.[1] ?? null,
      start_time_2: rest.length ? rest[0][0] : null, end_time_2: rest.length ? rest[rest.length - 1][1] : null,
    });
  }
  return out;
}
```

`errors.ts`:

```ts
export const PRACTITIONER_ERROR_CODES = [
  "PRACTITIONER_REQUIRED", "PRACTITIONER_MISMATCH", "PRACTITIONER_NOT_BOOKABLE", "PRACTITIONER_NOT_FOUND",
  "PRACTITIONER_IN_SERVICE", "USE_QUEUE_TRANSFER", "NOT_TRANSFERABLE", "SLOT_TAKEN", "PRIMARY_PRACTITIONER_REQUIRED",
  "SEAT_LIMIT", "MULTI_DOCTOR_NOT_ENABLED", "HAS_FUTURE_APPOINTMENTS", "OWNER_ONLY", "PHONE_OWNS_CLINIC",
  "PRACTITIONER_HAS_LOGIN", "NAME_REQUIRED",
] as const;
export type PractitionerErrorCode = (typeof PRACTITIONER_ERROR_CODES)[number];

const MESSAGES: Record<PractitionerErrorCode, string> = {
  PRACTITIONER_REQUIRED: "Please choose a doctor.",
  PRACTITIONER_MISMATCH: "That doctor is not part of this clinic.",
  PRACTITIONER_NOT_BOOKABLE: "This doctor is not taking bookings right now.",
  PRACTITIONER_NOT_FOUND: "That doctor could not be found. Refresh and try again.",
  PRACTITIONER_IN_SERVICE: "This patient is with the doctor now and can't be moved.",
  USE_QUEUE_TRANSFER: "To move today's patient to another doctor, use Transfer in the live queue.",
  NOT_TRANSFERABLE: "Only today's waiting patients can be transferred.",
  SLOT_TAKEN: "The other doctor already has a patient at that time.",
  PRIMARY_PRACTITIONER_REQUIRED: "Make another doctor the main doctor first.",
  SEAT_LIMIT: "All your doctor seats are in use. Add a seat or stop bookings for another doctor.",
  MULTI_DOCTOR_NOT_ENABLED: "Multiple doctors is not enabled for your clinic yet.",
  HAS_FUTURE_APPOINTMENTS: "This doctor still has upcoming appointments. Move or cancel them first.",
  OWNER_ONLY: "Only the clinic owner can do this.",
  PHONE_OWNS_CLINIC: "This number already runs its own clinic on Doctylia. Use another number, or add the doctor without a login.",
  PRACTITIONER_HAS_LOGIN: "This doctor already has a login.",
  NAME_REQUIRED: "Enter the doctor's name.",
};

/** User-facing text for a practitioner error code found anywhere in `raw`; null if none. */
export function practitionerErrorMessage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = PRACTITIONER_ERROR_CODES.find((c) => raw.includes(c));
  return code ? MESSAGES[code] : null;
}
```

**Permission keys.** Add `"practitioners.view" | "practitioners.manage" | "appointments.all_doctors"` to the `PermissionKey` union. Add a `PERMISSION_MODULES` entry `{ key: "practitioners", label: "Doctors", permissions: [{key:"practitioners.view",label:"View doctors"},{key:"practitioners.manage",label:"Add & manage doctors"}] }`. Add `{key:"appointments.all_doctors", label:"See all doctors' appointments & queues"}` to the appointments module. Mirror all three in `STAFF_PERMISSION_KEYS`. Add `ROUTE_PERMISSIONS` `"/admin/doctors": "practitioners.view"`. Add presets:

```ts
export const PERMISSION_PRESETS: Record<"doctor" | "reception", PermissionKey[]> = {
  doctor: ["dashboard.view", "appointments.view", "appointments.create", "appointments.edit",
           "patients.view", "patients.add", "patients.edit", "patients.medical_records",
           "prescriptions.view", "prescriptions.create", "prescriptions.edit", "profile.view"],
  reception: ["dashboard.view", "appointments.view", "appointments.create", "appointments.edit", "appointments.cancel",
              "appointments.all_doctors", "patients.view", "patients.add", "patients.edit",
              "billing.view", "billing.manage", "inquiries.view", "inquiries.manage", "practitioners.view"],
};
```

Add a test to `staffPermissions.test.ts`: every preset key is a real `PermissionKey`, and `reception` contains no `prescriptions.*` and no `patients.medical_records`.

**Other edits:**
- `features.ts`: add `MULTI_DOCTOR: "multi_doctor"`.
- `queue.ts` `QUEUE_ERRORS`: for each practitioner code used by `queue_action`, delegate to `practitionerErrorMessage`.

- [ ] **Step 4: Run** `npx vitest run src/lib` **. Expected PASS.** That includes `permissionParity.test.ts` and `staffPermissions.test.ts`.
- [ ] **Step 5: Leave uncommitted.** List the files.

---

### Task B2: `useProfile` knows doctor logins; `usePractitioners` provider

**Files:**
- Modify: `src/hooks/useProfile.tsx`, `src/hooks/useProfile.test.tsx`, `src/lib/auth/resolveDestination.ts` (+ its test if present), `src/pages/AdminDashboard.tsx`
- Create: `src/hooks/usePractitioners.tsx`, `src/hooks/usePractitioners.test.tsx`

**Interfaces:**
- `useProfile()` additionally returns:
  - `role: "owner" | "staff" | "doctor"`
  - `myPractitionerId: string | null`. For the owner it is their own practitioner (`practitioners.user_id = authUserId`); for a doctor login it is `staff_members.practitioner_id`; for reception it is null.
- The staff read becomes `select("doctor_id, staff_name, permissions, status, role, practitioner_id")`. `can()` is unchanged.
- `usePractitioners()` is served by `<PractitionersProvider>`, mounted inside `ProfileProvider` in AdminDashboard. It returns:

```ts
interface PractitionersState {
  practitioners: Practitioner[];          // all, primary first then sort_order
  active: Practitioner[];                 // is_active
  bookable: Practitioner[];               // is_active && is_bookable
  primary: Practitioner | null;
  byId: (id: string | null | undefined) => Practitioner | undefined;
  access: ClinicDoctorAccess | null;      // from get_clinic_doctor_access
  isMulti: boolean;                       // !!access?.enabled && active.length >= 2
  loading: boolean;
  refetch: () => Promise<void>;
}
```

- It loads `from("practitioners").select("*").eq("doctor_id", clinicId).order("is_primary",{ascending:false}).order("sort_order")` and `rpc("get_clinic_doctor_access",{_doctor_id: clinicId})`.
- It subscribes to realtime on channel `practitioners-${clinicId}`, filter `doctor_id=eq.${clinicId}`, with a 250 ms debounce refetch.
- When used outside the provider it returns an inert state: `isMulti: false`, empty lists.
- `resolveDestination`: an active staff row with `role = 'doctor'` → `/admin/appointments?tab=queue`; other staff unchanged.

- [ ] **Step 1: Write the failing tests:**
  - `usePractitioners.test.tsx`, mocking `@/integrations/supabase/client` as the existing hook tests do:
    1. `isMulti` is false when `access.enabled` is false, even with 2 active rows.
    2. `isMulti` is true with `enabled` and 2 active rows.
    3. `primary` is the `is_primary` row.
    4. `bookable` excludes `is_bookable = false`.
    5. Outside the provider, the hook returns the inert state without throwing.
  - `useProfile.test.tsx`, new cases: doctor login gives `role = 'doctor'` and `myPractitionerId` from the staff row; owner gives `role = 'owner'` and `myPractitionerId` from a practitioners query; reception gives `role = 'staff'` and `myPractitionerId = null`.
- [ ] **Step 2: Run. Expected FAIL.**
- [ ] **Step 3: Implement.** Mount the provider in `AdminDashboard.tsx` around the `<Routes>`, inside `ProfileProvider`.
- [ ] **Step 4: Run** `npx vitest run src/hooks src/lib/auth` **(PASS)**, then `npm run test` (no regressions).
- [ ] **Step 5: Leave uncommitted.**

---

# Part C — Admin UI

UI tasks follow the existing patterns cited by file:line. For each one, write the listed tests first. Each test renders the component with mocked `useProfile` / `usePractitioners` / supabase, the way the sibling `*.test.tsx` files do. For Radix Tabs, `.focus()` before `fireEvent.click()`.

### Task C1: `PractitionerSelect` + Doctors page

**Files:**
- Create: `src/components/admin/PractitionerSelect.tsx` (+test), `src/components/admin/doctors/DoctorsPage.tsx` (+test), `DoctorFormDialog.tsx`, `DoctorHoursEditor.tsx`, `DeactivateDoctorDialog.tsx`
- Modify: `src/pages/AdminDashboard.tsx` (lazy route `doctors` wrapped in `<PermissionGate permission="practitioners.view">`), `src/components/admin/AdminSidebar.tsx` (`mainItems` entry "Doctors", icon `Stethoscope`, permission `practitioners.view`; shown only when `access?.has_feature`), `src/lib/staffPermissions.ts` already has the route.

**Behaviour:**
- **`PractitionerSelect`**:
  - props: `{ value: string | null; onChange(id: string): void; options?: "active" | "bookable"; allowAll?: boolean; required?: boolean; disabled?: boolean }`
  - a shadcn `Select` listing `display_name` (+ specialization); `allowAll` adds an "All doctors" item with value `"all"`
  - renders nothing when `!isMulti`
- **DoctorsPage**:
  - If `!access?.has_feature`, show `LockedFeatureCard`, as `StaffManagementPage.tsx:166-175` does.
  - If the feature is there but not enabled, show a card saying "Multiple doctors is coming soon for your clinic" with no actions.
  - Otherwise:
    - header: seat usage `seats_used / seat_limit` with a "Need more seats? Contact support" link
    - list: desktop `<table>` in `<Card className="hidden md:block">` plus mobile cards (responsive convention)
    - each row shows: photo, name, specialization, badges (Main doctor, Not taking bookings, Inactive, Online booking off, Has login), fee, and actions
- **Row actions:**

| Action | Shown when | Calls |
|---|---|---|
| Edit | `practitioners.manage` | opens `DoctorFormDialog` |
| Hours | `practitioners.manage` | opens `DoctorHoursEditor` |
| Make main doctor | owner only | `set_primary_practitioner` |
| Stop / resume bookings | `practitioners.manage` | `set_practitioner_status(id, true, !is_bookable)` |
| Deactivate | `practitioners.manage` | `DeactivateDoctorDialog` |
| Create login / Remove login | owner only | create: a `StaffManagementPage`-style dialog that calls `create-staff-account` with `{role:"doctor", practitioner_id, staff_name, phone, permissions: PERMISSION_PRESETS.doctor}`; remove: `delete-staff-account` |

  - The owner's own row shows its personal fields read-only, with the note "Edit your name, photo and signature in Profile" and a link to `/admin/profile`.
- **DoctorFormDialog:**
  - fields: name (required), specialization (the same Select list as `ProfilePage.tsx:24`), qualifications, experience, registration number, bio, consultation fee (blank = clinic fee), appointment length (`SLOT_DURATION_OPTIONS`, blank = clinic default), online booking switch, show in directory switch, photo + signature upload
  - uploads go to bucket `doctor-uploads`, path `${clinicId}/practitioners/${id}/photo.${ext}` / `signature.${ext}`, using the `upsert:true` + `getPublicUrl` + `?v=` pattern from `ProfilePage.tsx:124-163`
  - on create, upload after `upsert_practitioner` returns the id, then call `upsert_practitioner(id, {photo_url, signature_url})`
  - map errors through `practitionerErrorMessage`
- **DoctorHoursEditor:**
  - the same morning/evening grid as `MyWebsite.tsx:690-741`, over `hoursFor(rows, practitionerId)`
  - saves with `working_hours.update` by row `id`; any missing day is inserted with `practitioner_id` set
- **DeactivateDoctorDialog:**
  1. Calls `set_practitioner_status(id, false, false)`.
  2. On `HAS_FUTURE_APPOINTMENTS` it shows the count and a `PractitionerSelect options="bookable"` (excluding this doctor) with "Move bookings", which calls `reassign_practitioner_appointments`.
  3. It then shows "Moved N. These K could not be moved (time clash): …" listing date, time and patient name for the skipped ids (fetched from `appointments`).
  4. It then retries the deactivation.

**Tests** (DoctorsPage):
- locked card without the feature
- the list renders the owner row with read-only personal fields
- SEAT_LIMIT from create shows the seat message
- the deactivate flow shows the move step on HAS_FUTURE_APPOINTMENTS and calls `reassign_practitioner_appointments` with `{_from, _to}`
- staff without `practitioners.manage` see no action buttons

**Tests** (PractitionerSelect): renders nothing when not multi; lists only bookable with `options="bookable"`.

- [ ] Steps: write tests → run (FAIL) → implement → run `npx vitest run src/components/admin/doctors src/components/admin/PractitionerSelect.test.tsx` (PASS) → `npm run test` → leave uncommitted.

### Task C2: Staff logins for doctors (edge functions + Staff page)

**Files:**
- Modify: `supabase/functions/create-staff-account/index.ts`, `supabase/functions/delete-staff-account/index.ts`, `src/components/admin/StaffManagementPage.tsx` (+test)

**create-staff-account** accepts `role?: "staff" | "doctor"` and `practitioner_id?: string`. When `role === "doctor"`:
1. The caller must be the owner (has a `profiles` row), else 403 `OWNER_ONLY`.
2. `admin.rpc("clinic_multi_doctor_enabled", {_doctor_id})` must be true, else 403 `MULTI_DOCTOR_NOT_ENABLED`.
3. The practitioner must belong to the clinic, be active, and have `user_id IS NULL`, else 409 `PRACTITIONER_HAS_LOGIN` / 404 `PRACTITIONER_NOT_FOUND`.
4. Phone guard, for both roles: before creating the auth user, look up `profiles` whose phone digits end with the same 10 digits (`.like("phone", "%" + last10)`), then filter exactly in JS on `digits.slice(-10)`. If one is found → 409 `PHONE_OWNS_CLINIC`.
5. Insert `staff_members` with `role` and `practitioner_id`.
6. Then `practitioners.update({user_id: authUserId}).eq("id", practitioner_id)`. If it fails, delete the staff row and the auth user, exactly like the existing insert-failure rollback (`:128`).
7. Run `sanitizePermissions` on the doctor preset as for any staff.

**delete-staff-account:** before deleting, `practitioners.update({user_id: null}).eq("user_id", staff_id)`. If the auth delete fails, restore `user_id` along with the existing staff-row re-insert.

**StaffManagementPage:**
- The list shows a "Doctor" badge for `role = 'doctor'` and hides those rows' Edit permissions and Delete actions. They are managed from the Doctors page; the row shows "Managed in Doctors".
- The Add dialog gains a "Start from" preset select (Reception, Custom) that fills the checkboxes from `PERMISSION_PRESETS.reception`.
- Map `PHONE_OWNS_CLINIC` (and the other codes) through `practitionerErrorMessage`.

**Tests:**
- StaffManagementPage: the doctor-role row shows the badge and no Delete; the Reception preset ticks exactly the preset keys.
- If edge functions have Vitest coverage (check `supabase/functions/**/**.test.ts`), add tests for the phone guard and the doctor-role owner check. If not, add a pure helper `phoneOwnsClinic(digits, rows)` in `_shared/practitioners.ts` and test that.

- [ ] Steps: tests → FAIL → implement → PASS → `npm run test`. **Deploy edge functions only at release time** (`npx supabase functions deploy create-staff-account delete-staff-account`). Leave uncommitted.

### Task C3: Appointments page per doctor

**Files:** Modify `src/components/admin/AppointmentsPage.tsx` (+ `AppointmentsPage*.test.tsx`).

Only when `isMulti`:
- **Doctor filter:** `PractitionerSelect allowAll` in the filter bar. It defaults to `myPractitionerId` for a doctor login without `appointments.all_doctors`; otherwise "all".
- **Filtering:** the query adds `.eq("practitioner_id", f)` when `f !== "all"`. The status tile counts use the same filter.
- **Rows:** each row/card shows the doctor's name as a small badge (`text-muted-foreground`, no new colour map).
- **Booking dialog:**
  - a required `PractitionerSelect options="bookable"`, defaulting to the filter's doctor or `myPractitionerId`
  - the pre-check (`:451-461`) adds `.eq("practitioner_id", sel)`
  - the insert payload (`:466`) adds `practitioner_id: sel`
  - error mapping adds `practitionerErrorMessage(err.message)` before the generic fallback
- **Reschedule dialog:**
  - adds a doctor select
  - if the date is today and the doctor changed, the dialog says "Use Transfer in the live queue for today" and disables Save
  - otherwise it updates `{date, time_slot, practitioner_id, reschedule_count}`
- **Realtime:** the channel is unchanged (clinic-wide); the filter is applied in the query.

When not multi, no new requests and no new UI: the existing tests must pass untouched.

**Tests:**
- not multi: the insert payload has no `practitioner_id` key (toMatchObject plus `expect(payload).not.toHaveProperty("practitioner_id")`)
- multi: Save is disabled until a doctor is picked; the payload includes `practitioner_id`; the pre-check query was called with `eq("practitioner_id", id)`; a same-day doctor change in reschedule disables Save
- a doctor login without `appointments.all_doctors` defaults the filter to their own id

- [ ] Steps: tests → FAIL → implement → PASS → `npm run test`. Leave uncommitted.

### Task C4: Live queue per doctor + transfer

**Files:** Modify `src/components/admin/LiveQueue.tsx` (+ `LiveQueue.test.tsx`), `src/lib/queue.ts` (add `splitQueueByPractitioner(rows) → Map<practitionerId, ReturnType<typeof splitQueue>>`, + test).

Only when `isMulti`:
- **Tabs:** "All" plus one tab per active doctor, using shadcn `Tabs`. The default tab is `myPractitionerId` for a doctor login, else "All".
- **Load:** the query adds `practitioner_id` to the selected columns (`:34-35`).
- **Doctor tab:**
  - exactly today's board for that doctor, from `splitQueue` over that doctor's rows
  - `run()` passes `_practitioner_id: tabId` for `call_next`
  - `_expect` is that doctor's serving id
- **All tab:** one compact "Now serving" card per doctor plus a combined waiting list showing each patient's doctor name. "Call next" is disabled with the hint "Choose a doctor tab to call the next patient".
- **Transfer:** a waiting row's action menu gains "Transfer to…", which opens a small dialog with `PractitionerSelect options="bookable"` (excluding the current doctor) and an optional reason. It calls `queue_action({_action:"transfer", _appointment_id, _practitioner_id: target, _reason})` and shows toast errors through `practitionerErrorMessage`.
- **Public screen link:** in a doctor tab it is `/dr/${slug}/queue?doctor=${practitioner.slug}`.
- **A doctor login without `appointments.all_doctors`** sees only their own tab: no All tab, no other doctors.

**Tests:**
- not multi: `queue_action` call_next args have no `_practitioner_id` (exact `toHaveBeenCalledWith` as today)
- multi: the doctor tab passes `_practitioner_id`; the All tab disables Call next; Transfer calls `queue_action` with `_action: "transfer"` and the target
- `SLOT_TAKEN` shows the mapped message
- `splitQueueByPractitioner` unit test: groups rows, one serving per doctor

- [ ] Steps: tests → FAIL → implement → PASS → `npm run test`. Leave uncommitted.

### Task C5: Prescriptions, slip and visits per doctor

**Files:** Modify `src/components/admin/PrescriptionsPage.tsx`, `src/components/admin/PrescriptionSlip.tsx`, `src/components/admin/medical-records/VisitsTab.tsx`, `src/components/admin/PatientMedicalRecord.tsx` (+ their tests). Create `src/lib/practitioners/slipDoctor.ts` (+test).

- **`slipDoctor(profile, practitioner?)`:** returns the `profile` object with `full_name`, `qualifications`, `specialization`, `registration_number` and `signature_url` overridden by the practitioner's values when present (`display_name` maps to `full_name`). Clinic fields stay from `profile`. Unit test: practitioner fields win; clinic fields stay; with no practitioner, the very same object comes back.
- **PrescriptionsPage:**
  - The list's select adds `practitioner_id`.
  - When multi, each row shows the author badge, and the doctor filter is `PractitionerSelect allowAll`.
  - Create: when `isMulti && !myPractitionerId` (reception), a required "Prescribing doctor" select. The insert adds `practitioner_id` when multi. A doctor login inserts without it, and the DB fills the caller.
  - Edit and delete buttons are hidden when multi and the row's `practitioner_id !== myPractitionerId` and `role !== "owner"`. RLS is the real guard.
  - The slip and share get `profile={slipDoctor(profile, byId(rx.practitioner_id))}` and `doctorName={slipDoctor(...).full_name}`.
- **VisitsTab:** when multi and no appointment is picked and `!myPractitionerId`, show a required "Doctor" select. The insert adds `practitioner_id` in that case.
- **PatientMedicalRecord:** on mount, when multi and `role === "doctor"`, call `rpc("log_clinical_access", {_patient_id})` once (the DB ignores it in shared mode).

**Tests:** reception in multi must pick a doctor before Save, and the payload carries it. The single-doctor payload is unchanged (no key). The slip renders the practitioner's name and registration number. Edit is hidden for another doctor's prescription when multi.

- [ ] Steps: tests → FAIL → implement → PASS → `npm run test`. Leave uncommitted.

### Task C6: Settings — clinical visibility, and the My Website hours hand-off

**Files:** Modify `src/components/admin/SettingsPage.tsx` (+test), `src/components/admin/MyWebsite.tsx` (+test if present).

- **SettingsPage, owner only, when multi:** a "Doctors' access to records" card with a radio group:
  - "Shared: every doctor sees every patient's records (recommended)"
  - "Own patients only: a doctor sees records only for patients they have seen or booked"
  - with a small note that allergies and history remain visible to the treating doctor
  - It saves `website_settings.update({clinical_visibility})` and maps `OWNER_ONLY`.
- **MyWebsite:**
  - The Working Hours accordion now loads `working_hours` with `.eq("practitioner_id", primary.id)` (from `usePractitioners`), so it edits the main doctor's hours. In a single-doctor clinic these are exactly the rows it edits today.
  - When multi, the accordion shows "Each doctor's hours are set on the Doctors page" with a link, and the grid is hidden.
  - `slot_duration_minutes` stays the clinic default.

**Tests:** the visibility card is hidden for staff and for non-multi; saving calls update with `clinical_visibility: "treating"`; MyWebsite in multi shows the link and no grid; in single, the grid works as before.

- [ ] Steps: tests → FAIL → implement → PASS → `npm run test`. Leave uncommitted.

### Task C7: Notifications routing + superadmin seats card

**Files:**
- Modify `src/hooks/useDoctorNotifications.ts` / `AdminLayout.tsx:83-90`: `new_booking` → `/admin/appointments`.
- Create `src/components/superadmin/SADoctorSeatsCard.tsx` (+test).
- Modify `SADoctorDetail.tsx`: render it after `SAImportAccessCard`, with `canManage={can("plan_requests.manage")}`.

**SADoctorSeatsCard:**
- modelled on `SAImportAccessCard.tsx` (loadSeq guard, savingRef)
- loads `get_clinic_doctor_access(doctorId)` plus `practitioners` (count, names)
- shows: enabled / not enabled (and why: no feature, or flag off and no pilot), seats used / limit, extra seats
- when `canManage`: a number input for extra seats plus a required Reason, saved with `set_clinic_doctor_seats`; a hint that "Pilot: enable 'Multiple doctors' in Feature access above"
- error codes map to messages

**Tests:** loads and shows the seat numbers; Save is disabled without a reason; it calls the RPC with `{_doctor_id, _extra, _reason}`.

- [ ] Steps: tests → FAIL → implement → PASS → `npm run test`. Leave uncommitted.

---

# Part D — Public booking & payments

### Task D1: Edge helper + paid booking carries the doctor

**Files:**
- Create: `supabase/functions/_shared/practitioners.ts`, plus a Vitest test beside it, matching how `_shared/commissionSplit.ts` is tested; find the existing pattern.
- Modify: `supabase/functions/create-razorpay-order/index.ts`, `supabase/functions/verify-razorpay-payment/index.ts`

```ts
// supabase/functions/_shared/practitioners.ts
export interface PractitionerRow {
  id: string; is_primary: boolean; online_booking: boolean; consultation_fee: number | null;
  sort_order: number; created_at: string;
}
export type PractitionerPick =
  | { ok: true; id: string; fee: number | null }
  | { ok: false; error: "PRACTITIONER_REQUIRED" | "PRACTITIONER_NOT_BOOKABLE" | "PRACTITIONER_LOOKUP_FAILED"; status: number };

/** Pure rule shared by the order and verify functions. `rows` = the clinic's active, bookable
 *  practitioners ordered is_primary DESC, sort_order, created_at, id; `seatLimit` from
 *  clinic_doctor_seat_limit(). Mirrors fill_practitioner('booking') + practitioner_within_seats. */
export function pickBookingPractitioner(rows: PractitionerRow[], seatLimit: number, requested?: string | null): PractitionerPick {
  const within = rows.slice(0, Math.max(1, seatLimit));
  const pick = requested ? within.find((r) => r.id === requested) : within.length === 1 ? within[0] : undefined;
  if (!pick) return { ok: false, error: requested ? "PRACTITIONER_NOT_BOOKABLE" : "PRACTITIONER_REQUIRED", status: 409 };
  if (!pick.online_booking) return { ok: false, error: "PRACTITIONER_NOT_BOOKABLE", status: 409 };
  const fee = pick.consultation_fee != null && Number(pick.consultation_fee) > 0 ? Number(pick.consultation_fee) : null;
  return { ok: true, id: pick.id, fee };
}

// deno-lint-ignore no-explicit-any
export async function resolveBookingPractitioner(admin: any, doctorId: string, requested?: string | null): Promise<PractitionerPick> {
  const [{ data: rows, error }, { data: limit, error: limitErr }] = await Promise.all([
    admin.from("practitioners")
      .select("id, is_primary, online_booking, consultation_fee, sort_order, created_at")
      .eq("doctor_id", doctorId).eq("is_active", true).eq("is_bookable", true)
      .order("is_primary", { ascending: false }).order("sort_order").order("created_at").order("id"),
    admin.rpc("clinic_doctor_seat_limit", { _doctor_id: doctorId }),
  ]);
  if (error || limitErr) return { ok: false, error: "PRACTITIONER_LOOKUP_FAILED", status: 500 };
  return pickBookingPractitioner(rows ?? [], typeof limit === "number" ? limit : 1, requested ?? null);
}
```

**Tests for `pickBookingPractitioner`:**
- single within seats + no request → that one
- two within seats + no request → `PRACTITIONER_REQUIRED`
- request outside seats → `PRACTITIONER_NOT_BOOKABLE`
- `online_booking: false` → `PRACTITIONER_NOT_BOOKABLE`
- fee 0 or null → `fee: null`
- `seatLimit: 1` with 2 rows and no request → the first row (the downgrade fallback)

**create-razorpay-order:**
1. Read `practitioner_id` from the body.
2. After the doctor read (`:86-90`), call `resolveBookingPractitioner(admin, doctor_id, body.practitioner_id)`. If not ok, return `json({ error: pick.error }, pick.status)`.
3. The slot pre-check (`:125-133`) adds `.eq("practitioner_id", pick.id)`.
4. Pricing (`:136-182`): wherever the profile `consultation_fee` is used as the default fee, use `pick.fee ?? profile.consultation_fee`. This mirrors `public_booking_price`.
5. `authoritativeBooking`: add `practitioner_id: pick.id` and delete `captchaToken` from the stored object.
6. Order notes: add `practitioner_id: pick.id`.

**verify-razorpay-payment:** the appointment insert (`:139-163`) adds `practitioner_id: pending.practitioner_id ?? undefined`. Older pending payments without one fall back to the DB fill. Changing verify needs no other logic: a refused insert already goes to the `needs_refund` path.

**Tests:** if `create-razorpay-order` has tests, add: a body with two-doctor rows and no `practitioner_id` → 409 `PRACTITIONER_REQUIRED`; the slot pre-check filters by practitioner. Otherwise the pure-function tests above are the gate.

- [ ] Steps: tests → FAIL → implement → PASS. **Deploy at release:** `npx supabase functions deploy create-razorpay-order verify-razorpay-payment`. Leave uncommitted.

### Task D2: Public data — DoctorContext, slots, hours

**Files:** Modify `src/contexts/DoctorContext.tsx` (+test if present), `src/hooks/useSlotAvailability.ts` (+test), `src/components/doctor/HeroBanner.tsx`, `src/components/doctor/ClinicDetails.tsx` (only if it reads `workingHours` in a way the union breaks).

- **DoctorContext:**
  - adds `rpc("get_public_practitioners", {_doctor_id: id})` to the parallel loads (`:97-105`)
  - exposes:
    - `practitioners: PublicPractitioner[]`
    - `bookablePractitioners` (= `.filter(p => p.bookable)`)
    - `isMultiDoctor` (= `bookablePractitioners.length >= 2`)
    - `allWorkingHours`: the raw rows, filtered to the ids in `practitioners`. **If `practitioners` is empty (RPC failed or old DB), use the raw rows unfiltered**, so a failed lookup never empties the clinic's hours.
    - `workingHours = clinicHoursUnion(allWorkingHours)`. For a single doctor that is the identical array, so consumers are unchanged.
  - If the RPC fails, keep `practitioners = []` and `isMultiDoctor = false`, so the page still works as today.
- **useSlotAvailability(doctorId, date, type, practitionerId?):** the args object adds `_practitioner_id` only when defined:

```ts
const args: Record<string, unknown> = { _doctor_id: doctorId, _date: date, _appointment_type: type };
if (practitionerId) args._practitioner_id = practitionerId;
```

  so `useSlotAvailability.test.tsx:22` passes unchanged. Add a test: with a practitioner id, the call includes `_practitioner_id`. The realtime filter stays `doctor_id`.
- **HeroBanner:** when `isMultiDoctor`, skip `useNextAvailable` and the slot shortcut. Show a "Choose your doctor" CTA scrolling to `#doctors`, and show the clinic name rather than the doctor's name.

**Tests:** DoctorContext with a 2-row RPC gives `isMultiDoctor = true` and `workingHours` as the union; a 1-row RPC gives the identical `workingHours` array. HeroBanner in multi does not call `get_slot_counts` (the existing `HeroBanner.test.tsx` mocks show how).

- [ ] Steps: tests → FAIL → implement → PASS → `npm run test`. Leave uncommitted.

### Task D3: Booking widget — choose a doctor

**Files:** Create `src/components/doctor/DoctorPicker.tsx`, `src/components/doctor/DoctorsSection.tsx`. Modify `src/components/doctor/BookingWidget.tsx` (+ `BookingWidget.test.tsx`, `BookingWidget.payment.test.tsx`), `src/pages/DoctorPublicPage.tsx`.

- **DoctorsSection** (`id="doctors"`, rendered after About only when `isMultiDoctor`, built on the `ds-*` layer with `dsCn`):
  - a grid of doctor cards: photo, name, specialization, qualifications, experience, fee (`consultation_fee ?? profile.consultation_fee`) and a "Book" button
  - "Book" dispatches `window.dispatchEvent(new CustomEvent("doctylia:select-doctor", {detail:{id}}))` and scrolls to `#booking-zone`
  - single column under 640px; 2 columns from 768px, 3 from 1024px; body ≥17px
  - a specialty filter chip row appears when there are 4 or more doctors
- **BookingWidget, when `isMultiDoctor`:**
  - A first step "Doctor" (internal step 0) renders `DoctorPicker`: the `bookablePractitioners` as large radio cards. The visible step labels become "Doctor / When / Your details / Review & pay".
  - It listens for `doctylia:select-doctor` to preselect the doctor and jump to When.
  - **Slot generation** for the selected doctor:
    - hours = `hoursFor(allWorkingHours, sel.id)`
    - step = `sel.slot_duration_minutes ?? settings.slot_duration_minutes ?? 30`
    - `useSlotAvailability(profile.id, dateStr, type, sel.id)`
  - **Default service price:** `sel.consultation_fee ?? profile.consultation_fee ?? 500` (the online fee rule is unchanged).
  - **Pay-at-clinic insert:** adds `practitioner_id: sel.id`. The `ensureOrder` `bookingPayload` adds `practitioner_id: sel.id`, and the cached `bookingKey` includes `sel.id`.
  - **Doctor name** in the confirmation, slip, ICS and Razorpay `name`: `sel.display_name`.
  - **Changing doctor** resets the date/slot and drops the cached order (like going back below step 5, `:126`).
- **Error mapping** (`:334-356`): `practitionerErrorMessage(msg)` before the generic message.
- **When not multi:** no doctor step, no new props in the payload, no `_practitioner_id`. Existing tests must pass unchanged.

**Tests:**
- single: the existing suites pass untouched, and an extra assertion checks the insert has no `practitioner_id` key
- multi:
  - the Doctor step shows 2 cards and Continue is disabled until one is picked
  - slots use the selected doctor's hours (Dr B open Monday 15:00–17:00 only gives 15:00 slots)
  - the insert has `practitioner_id`
  - the payment `create-razorpay-order` body has `practitioner_id`
  - the `doctylia:select-doctor` event preselects
  - `PRACTITIONER_NOT_BOOKABLE` shows the mapped message

- [ ] Steps: tests → FAIL → implement → PASS → `npm run test`. Leave uncommitted.

### Task D4: Manage appointment + public queue screen

**Files:** Modify `src/pages/ManageAppointment.tsx` (+ `ManageAppointment.test.tsx`), `src/pages/QueueDisplay.tsx` (+ `QueueDisplay.test.tsx`).

- **ManageAppointment:**
  - Uses `appointment.practitioner_id` (now returned by `get_appointment_by_token`).
  - Loads `working_hours` with `.eq("practitioner_id", appointment.practitioner_id)` when present, else as today.
  - Slot length: `practitioner.slot_duration_minutes` via `get_public_practitioners`, else clinic.
  - `useSlotAvailability(doctor.id, newDateStr, type, appointment.practitioner_id ?? undefined)`.
  - When the clinic has 2 or more practitioners, the details show "Doctor: {practitioner_name}".
- **QueueDisplay:**
  - Loads `get_public_practitioners` once.
  - If `?doctor=<slug>` matches one, it polls `get_public_queue({_doctor_id, _practitioner_id})` for that doctor and shows their name in the header.
  - Else, if 2 or more active doctors, it shows a panel per doctor (name, now serving, next up), polling each every 5 s (the same `POLL_MS`).
  - Else, exactly today's single view and the same RPC args (no `_practitioner_id` key).

**Tests:** single: the `get_public_queue` args are unchanged. `?doctor=dr-b` passes `_practitioner_id` and shows Dr B. Multi without the param renders 2 panels. ManageAppointment passes `_practitioner_id` to slot counts when the lookup returns one.

- [ ] Steps: tests → FAIL → implement → PASS → `npm run test`. Leave uncommitted.

---

# Part E — Doctor pages & SEO (may ship right after launch)

### Task E1: Doctor sub-page + Edge SEO + sitemap

**Files:**
- Create `src/pages/PractitionerPage.tsx`.
- Modify `src/App.tsx` (route `/dr/:slug/doctor/:doctorSlug`), `vercel.json` (rewrite `/dr/:slug/doctor/:doctorSlug` → `/api/seo?kind=practitioner&slug=:slug&doctor=:doctorSlug`, placed BEFORE the catch-all at `:68`), `src/lib/seo/doctorSeo.ts` (+test), `src/lib/seo/handleSeoRequest.ts` (+test), `supabase/functions/sitemap/index.ts` (+test).

**Behaviour:**
- **The page** reuses DoctorContext. It shows the doctor's profile (photo, name, qualifications, registration, bio, fee) and their own hours via `hoursFor`. It embeds `BookingWidget` with the doctor preselected (dispatch `doctylia:select-doctor` on mount). A doctor who is unknown or inactive → `navigate("/dr/"+slug, {replace:true})`.
- **`doctorSeo.ts`:**
  - `buildPractitionerMeta(profile, practitioner, settings)` and `buildPractitionerJsonLd(...)`: a `Physician` node `@id …/doctor/<slug>#physician` with `worksFor: {"@id": "<clinic url>#clinic"}` and a BreadcrumbList Clinic → Doctor.
  - `buildDoctorJsonLd(profile, …, practitioners?)`: when `practitioners` has ≥2 active entries, the main node becomes `["MedicalClinic","MedicalBusiness"]` with `@id #clinic` and `employee: [{ "@id": …/doctor/<slug>#physician }]`. Otherwise the output is exactly as today.
  - **Golden test first:** before changing anything, capture `JSON.stringify(buildDoctorJsonLd(fixture))` and `buildDoctorMeta(fixture)` into `doctorSeo.golden.test.ts` as literal expected strings. The changes must keep them byte-identical.
- **handleSeoRequest:**
  - `kind=practitioner`: fetch the profile by slug, then `rpc get_public_practitioners`, find the doctor slug (inactive or missing → 301 to `/dr/:slug`), and render head + JSON-LD + crawlable body, as `doctorPage` does.
  - `kind=doctor` additionally fetches practitioners and passes them to `buildDoctorJsonLd`. If that fetch fails, pass nothing, so the output equals today's.
- **Sitemap:** for profiles with ≥2 active practitioners, add `/dr/:slug/doctor/:doctorSlug` entries.

**Tests:** the golden test passes before and after; practitioner JSON-LD has `worksFor`; a multi clinic main node is `MedicalClinic` with `employee`; the handleSeoRequest practitioner kind renders and 301s on an unknown doctor; the sitemap includes doctor URLs only for multi clinics.

- [ ] Steps: golden test (PASS on current code) → new tests (FAIL) → implement → all PASS → `npm run test`. Leave uncommitted.

---

# Part F — Post-launch (separate plan later)

These are out of scope here:
- `search_doctors` returning one row per listed practitioner; the directory is hidden today.
- `blog_posts.author_practitioner_id` + article author JSON-LD.
- `reviews.practitioner_id` + per-doctor rating.
- `service_practitioners`, so a service is offered only by some doctors.
- P3: per-doctor revenue reports, `billing.own_only`, and self-service seat purchase priced by `doctor_seat_price`.

---

# Release checklist

1. Run `supabase/tests/multi-doctor/01…09` and every existing SQL suite: all pass on production.
2. `npm run test`: all pass. `npx tsc --noEmit -p tsconfig.app.json`: only the 3 known errors.
3. Deploy edge functions: `create-staff-account`, `delete-staff-account`, `create-razorpay-order`, `verify-razorpay-payment`.
4. Deploy the frontend. The user handles git/Lovable; this plan makes no commits.
5. Pilot:
   1. A superadmin enables "Multiple doctors" for one clinic in Feature access and sets extra seats.
   2. The owner adds Dr B, gives them a login and sets hours.
   3. Book online as a patient for Dr B (pay at clinic, then a mock payment).
   4. Dr B logs in and sees the new-booking notification.
   5. Run Dr B's queue tab, transfer a patient, and write a prescription. Check the slip shows Dr B's signature.
   6. Switch to "Own patients only" and confirm Dr B can't see Dr A's patient's prescriptions.
6. Flip `platform_settings.multi_doctor_enabled = true`.
