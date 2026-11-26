# Multi-doctor clinics — Phase 0 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `practitioners` layer under today's clinic tenant (`profiles` / `doctor_id`) and scope slots, queue numbers, "in the room", slot counts, public queue, queue actions and booking price per practitioner. No user-visible change for any existing clinic.

**Architecture:** Strategy A from the spec. `doctor_id` keeps meaning "clinic tenant" and every RLS policy keyed on it stays untouched. A new `practitioners` table gets one primary row per clinic (the owner). A `practitioner_id` column is added only to data owned by one doctor. A single `fill_practitioner()` trigger fills or validates it, so old code paths keep working for single-doctor clinics and can never silently pick the wrong doctor in a multi-doctor clinic. Slot and queue locks move from the clinic key to the practitioner key, through one helper.

**Tech Stack:** Supabase Postgres (migrations in `supabase/migrations/`, PL/pgSQL), SQL checks in `supabase/tests/` run with `npx supabase db query --linked -f <file>`, Vite + React + TypeScript (generated types only in this phase), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-multi-doctor-clinic-design.md` (§3, §10, §12). Manager overview: `docs/multi-doctor-clinic-overview.md`.

## Global Constraints

- **Lock order everywhere:** slot → queue number → patient (CLAUDE.md). Two-queue operations lock both queue keys in `LEAST`/`GREATEST` uuid order.
- **Triggers fire alphabetically.** The new appointment trigger is `trg_a00_fill_practitioner` (sorts before `trg_a0_enforce_slot_capacity`, because `'0'` < `'_'`). The new profile trigger is `on_profile_a0_primary_practitioner` (sorts before `on_profile_created`, which inserts working hours).
- **New error codes**, raised with `ERRCODE = 'check_violation'` in triggers or returned as `{"ok":false,"error":...}` from RPCs:
  - `PRACTITIONER_REQUIRED`
  - `PRACTITIONER_MISMATCH`
  - `PRACTITIONER_NOT_BOOKABLE`
  - `PRACTITIONER_NOT_FOUND`
  - `PRACTITIONER_IN_SERVICE`
  - `USE_QUEUE_TRANSFER`
  - `NOT_TRANSFERABLE`
  - `SLOT_TAKEN`
  - `PRIMARY_PRACTITIONER_REQUIRED`
- **RPC signatures:** an RPC that gains a parameter is **dropped and recreated**, never overloaded (PostgREST ambiguity, see `20261124100000_restore_get_slot_counts_by_type.sql`). Grants are re-applied after every DROP. Each migration that changes signatures ends with `NOTIFY pgrst, 'reload schema';`.
- **Defaults:** a NULL `_practitioner_id` passed to an RPC means "the clinic's primary practitioner", so every existing caller behaves exactly as today.
- **Generated files:** `src/integrations/supabase/types.ts` is generated; never hand-edit it. `supabase/functions/mcp/` is never touched.
- **Branch:** do all work on branch `feat/multi-doctor-p0`. **Do not merge to `main` until Task 6 passes.** `main` syncs to Lovable.
- **Database:** migrations change the live database. Apply them in a low-traffic window (IST night), because the index rebuilds briefly lock `appointments`.
- **SQL check files:** each runs in one transaction, rolls back, and prints one row `pass`. Any failed check raises an exception.

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/20261125100000_practitioners_core.sql` (create) | `practitioners` table, RLS, primary invariants, `ensure_primary_practitioner`, `primary_practitioner_id`, signup hook, owner-field sync, backfill |
| `supabase/migrations/20261125100100_practitioner_columns.sql` (create) | `practitioner_id` on appointments, working_hours, prescriptions, patient_visits, patient_documents; `prescriptions.created_by`; backfill; same-clinic FKs; `fill_practitioner()` |
| `supabase/migrations/20261125100200_practitioner_scoped_slots_and_queue.sql` (create) | `slot_lock_key`; slot triggers, guard re-open check, queue numbering and renumbering, unique indexes; `get_slot_counts`, `get_public_queue`, `get_my_queue_status`, `reschedule_appointment_by_token`, `public_booking_price`, `enforce_public_booking_limits` |
| `supabase/migrations/20261125100300_queue_action_practitioner.sql` (create) | `queue_action_core` / `queue_action` with a practitioner scope and the `transfer` action |
| `supabase/tests/multi-doctor/00_preflight.sql` (create) | Read-only pre-flight report |
| `supabase/tests/multi-doctor/01_practitioners.sql` … `04_queue_action.sql` (create) | SQL checks, one per migration |
| `src/integrations/supabase/types.ts` (regenerate) | Types for the new table and columns |
| `CLAUDE.md` (modify) | Short "Multi-doctor (practitioners)" section |

---

### Task 0: Pre-flight (read-only)

**Files:**
- Create: `supabase/tests/multi-doctor/00_preflight.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: a go/no-go decision. Every count in the output must be 0 and the table name must be free.

- [ ] **Step 1: Write the pre-flight query**

```sql
-- Multi-doctor P0 pre-flight. Read-only. Every number must be 0 and existing_table NULL.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/00_preflight.sql
SELECT 'existing_table' AS check, to_regclass('public.practitioners')::text AS value
UNION ALL
SELECT 'orphan appointments', count(*)::text FROM public.appointments x
 WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = x.doctor_id)
UNION ALL
SELECT 'orphan working_hours', count(*)::text FROM public.working_hours x
 WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = x.doctor_id)
UNION ALL
SELECT 'orphan prescriptions', count(*)::text FROM public.prescriptions x
 WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = x.doctor_id)
UNION ALL
SELECT 'orphan patient_visits', count(*)::text FROM public.patient_visits x
 WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = x.doctor_id)
UNION ALL
SELECT 'orphan patient_documents', count(*)::text FROM public.patient_documents x
 WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = x.doctor_id)
UNION ALL
-- The backfill runs with ENABLE/DISABLE TRIGGER USER, which would switch an
-- intentionally disabled trigger back on.
SELECT 'disabled triggers', count(*)::text FROM pg_trigger
 WHERE NOT tgisinternal AND tgenabled <> 'O'
   AND tgrelid IN ('public.appointments'::regclass, 'public.working_hours'::regclass,
                   'public.prescriptions'::regclass, 'public.patient_visits'::regclass)
UNION ALL
SELECT 'rows appointments', n_live_tup::text FROM pg_stat_user_tables WHERE relname = 'appointments';
```

- [ ] **Step 2: Run it**

Run: `npx supabase db query --linked -f supabase/tests/multi-doctor/00_preflight.sql`

Expected: `existing_table` empty or NULL, and every `orphan …` and `disabled triggers` value `0`. `rows appointments` is informational (more than ~200k rows means planning a longer window).

**If anything is non-zero, STOP** and report it to the user:
- Orphans block `SET NOT NULL`. Delete them, or decide to keep the column nullable.
- A disabled trigger must be re-disabled after the backfill.

- [ ] **Step 3: Commit**

```bash
git checkout -b feat/multi-doctor-p0
git add supabase/tests/multi-doctor/00_preflight.sql
git commit -m "test(multi-doctor): add P0 pre-flight report"
```

---

### Task 1: `practitioners` table and primary-practitioner invariants

**Files:**
- Create: `supabase/migrations/20261125100000_practitioners_core.sql`
- Test: `supabase/tests/multi-doctor/01_practitioners.sql`

**Interfaces:**
- Consumes: `public.profiles`, `public.staff_doctor_id(uuid)`, `public.has_role(uuid, app_role)`, `public.update_updated_at_column()`, `public.directory_slugify(text)`.
- Produces:
  - table `public.practitioners` with columns `id, doctor_id, user_id, display_name, slug, specialization, qualifications, experience_years, bio, photo_url, registration_number, signature_url, hpr_id, consultation_fee, slot_duration_minutes, is_active, is_bookable, online_booking, directory_listed, is_primary, sort_order, created_at, updated_at`, plus a unique `(id, doctor_id)` for composite FKs
  - `public.ensure_primary_practitioner(_doctor_id uuid) RETURNS uuid` (internal)
  - `public.primary_practitioner_id(_doctor_id uuid) RETURNS uuid` (internal)

- [ ] **Step 1: Write the failing check**

Create `supabase/tests/multi-doctor/01_practitioners.sql`:

```sql
-- Multi-doctor P0, part 1: practitioners table. Rolled back; prints one row 'pass'.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/01_practitioners.sql
BEGIN;
DO $$
DECLARE
  d uuid := gen_random_uuid();
  p public.practitioners%ROWTYPE;
  n int;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  VALUES (d, 'authenticated', 'authenticated', d::text || '@example.test', '{"full_name":"Dr. Asha Rao"}'::jsonb);

  -- 1. A new signup gets exactly one primary practitioner, linked to the owner's login.
  SELECT count(*) INTO n FROM public.practitioners WHERE doctor_id = d;
  IF n <> 1 THEN RAISE EXCEPTION 'expected 1 practitioner for a new clinic, got %', n; END IF;
  SELECT * INTO p FROM public.practitioners WHERE doctor_id = d;
  IF NOT p.is_primary OR p.user_id IS DISTINCT FROM d OR p.display_name <> 'Dr. Asha Rao'
     OR p.slug <> 'dr-asha-rao' OR NOT (p.is_active AND p.is_bookable AND p.online_booking) THEN
    RAISE EXCEPTION 'bad primary practitioner: %', row_to_json(p);
  END IF;
  IF public.primary_practitioner_id(d) IS DISTINCT FROM p.id THEN
    RAISE EXCEPTION 'primary_practitioner_id() wrong';
  END IF;

  -- 2. Every existing clinic was backfilled with exactly one primary.
  SELECT count(*) INTO n FROM public.profiles pr
   WHERE NOT EXISTS (SELECT 1 FROM public.practitioners x WHERE x.doctor_id = pr.id AND x.is_primary);
  IF n <> 0 THEN RAISE EXCEPTION '% clinics have no primary practitioner', n; END IF;

  -- 3. Calling ensure_primary_practitioner again never creates a second one.
  PERFORM public.ensure_primary_practitioner(d);
  SELECT count(*) INTO n FROM public.practitioners WHERE doctor_id = d;
  IF n <> 1 THEN RAISE EXCEPTION 'ensure_primary_practitioner is not idempotent (%)', n; END IF;

  -- 4. Editing the owner's profile flows to the owner's practitioner row.
  UPDATE public.profiles
     SET full_name = 'Dr. Asha R. Rao', specialization = 'Dermatology', registration_number = 'MCI-123'
   WHERE id = d;
  SELECT * INTO p FROM public.practitioners WHERE doctor_id = d;
  IF p.display_name <> 'Dr. Asha R. Rao' OR p.specialization <> 'Dermatology' OR p.registration_number <> 'MCI-123' THEN
    RAISE EXCEPTION 'owner fields not synced: %', row_to_json(p);
  END IF;
  IF p.slug <> 'dr-asha-rao' THEN RAISE EXCEPTION 'slug must not follow renames in P0'; END IF;

  -- 5. A primary must stay active and bookable.
  BEGIN
    UPDATE public.practitioners SET is_active = false WHERE doctor_id = d;
    RAISE EXCEPTION 'primary practitioner was deactivated';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 6. A clinic cannot be left without a primary (deferred check, forced now).
  BEGIN
    UPDATE public.practitioners SET is_primary = false WHERE doctor_id = d;
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'clinic was left without a primary practitioner';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PRIMARY_PRACTITIONER_REQUIRED' THEN RAISE; END IF;
  END;

  -- 7. Signed-in clinic users can read their practitioners but not write them (P0).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.practitioners WHERE doctor_id = d;
  IF n <> 1 THEN RESET ROLE; RAISE EXCEPTION 'owner cannot read own practitioners (%)', n; END IF;
  UPDATE public.practitioners SET display_name = 'Hacked' WHERE doctor_id = d;
  GET DIAGNOSTICS n = ROW_COUNT;
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'client update of practitioners was allowed'; END IF;

  -- 8. Anonymous visitors cannot read the table.
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM public.practitioners;
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'anon can read practitioners'; END IF;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx supabase db query --linked -f supabase/tests/multi-doctor/01_practitioners.sql`
Expected: FAIL with `type "public.practitioners" does not exist` or `relation "public.practitioners" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261125100000_practitioners_core.sql`:

```sql
-- Multi-doctor clinics, P0 part 1: the practitioners table.
-- Spec: docs/superpowers/specs/2026-11-25-multi-doctor-clinic-design.md
--
-- A clinic is still a profiles row: doctor_id stays the tenant key everywhere and no
-- existing policy changes. This adds the doctors who see patients at a clinic. Every
-- clinic gets exactly one PRIMARY practitioner: the owner, linked to the owner's login.
-- Nothing user-visible changes in P0; clients can read practitioners but not write them.

CREATE TABLE IF NOT EXISTS public.practitioners (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id               uuid UNIQUE,
  display_name          text NOT NULL CHECK (btrim(display_name) <> ''),
  slug                  text NOT NULL CHECK (slug <> ''),
  specialization        text,
  qualifications        text,
  experience_years      integer,
  bio                   text,
  photo_url             text,
  registration_number   text,
  signature_url         text,
  hpr_id                text,
  consultation_fee      numeric CHECK (consultation_fee IS NULL OR consultation_fee >= 0),
  slot_duration_minutes integer CHECK (slot_duration_minutes IS NULL OR slot_duration_minutes BETWEEN 5 AND 240),
  is_active             boolean NOT NULL DEFAULT true,
  is_bookable           boolean NOT NULL DEFAULT true,
  online_booking        boolean NOT NULL DEFAULT true,
  directory_listed      boolean NOT NULL DEFAULT true,
  is_primary            boolean NOT NULL DEFAULT false,
  sort_order            integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  -- The primary is the default doctor for old code paths, so it must take bookings.
  CONSTRAINT practitioners_primary_active CHECK (NOT is_primary OR (is_active AND is_bookable)),
  -- Target of the composite (practitioner_id, doctor_id) foreign keys: a row can only
  -- point at a practitioner of its own clinic.
  CONSTRAINT practitioners_id_doctor_key UNIQUE (id, doctor_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_practitioners_doctor_slug ON public.practitioners (doctor_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS uq_practitioners_one_primary ON public.practitioners (doctor_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS idx_practitioners_doctor_order ON public.practitioners (doctor_id, sort_order);

DROP TRIGGER IF EXISTS update_practitioners_updated_at ON public.practitioners;
CREATE TRIGGER update_practitioners_updated_at
  BEFORE UPDATE ON public.practitioners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: read-only for the clinic (owner and its staff) and platform admins in P0.
-- Writes go through SECURITY DEFINER functions; P1 adds the Doctors page policies.
ALTER TABLE public.practitioners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinic members can view practitioners" ON public.practitioners;
CREATE POLICY "Clinic members can view practitioners" ON public.practitioners
  FOR SELECT TO authenticated
  USING (auth.uid() = doctor_id OR public.staff_doctor_id(auth.uid()) = doctor_id);

DROP POLICY IF EXISTS "Platform admins can view practitioners" ON public.practitioners;
CREATE POLICY "Platform admins can view practitioners" ON public.practitioners
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- A clinic always has exactly one primary. Deferred, so a later "make Dr B primary"
-- can unset the old primary and set the new one in one transaction.
CREATE OR REPLACE FUNCTION public.practitioners_require_primary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = OLD.doctor_id)
     AND NOT EXISTS (SELECT 1 FROM public.practitioners WHERE doctor_id = OLD.doctor_id AND is_primary) THEN
    RAISE EXCEPTION 'PRIMARY_PRACTITIONER_REQUIRED' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_practitioners_primary_required ON public.practitioners;
CREATE CONSTRAINT TRIGGER trg_practitioners_primary_required
  AFTER UPDATE OR DELETE ON public.practitioners
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.practitioners_require_primary();

-- Creates the clinic's primary practitioner from the owner's profile if it is missing.
-- Idempotent and race-safe (advisory lock + the one-primary unique index).
CREATE OR REPLACE FUNCTION public.ensure_primary_practitioner(_doctor_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id   uuid;
  p      public.profiles%ROWTYPE;
  v_name text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('practitioner_primary:' || _doctor_id::text));
  SELECT id INTO v_id FROM public.practitioners WHERE doctor_id = _doctor_id AND is_primary;
  IF FOUND THEN
    RETURN v_id;
  END IF;

  SELECT * INTO p FROM public.profiles WHERE id = _doctor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CLINIC_NOT_FOUND' USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_name := COALESCE(NULLIF(btrim(p.full_name), ''), NULLIF(btrim(p.clinic_name), ''), 'Doctor');
  INSERT INTO public.practitioners (
    doctor_id, user_id, display_name, slug, specialization, qualifications, experience_years,
    bio, photo_url, registration_number, signature_url, is_primary)
  VALUES (
    _doctor_id, _doctor_id, v_name, COALESCE(NULLIF(public.directory_slugify(v_name), ''), 'doctor'),
    p.specialization, p.qualifications, p.experience_years,
    p.bio, p.profile_photo_url, p.registration_number, p.signature_url, true)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_primary_practitioner(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.primary_practitioner_id(_doctor_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.practitioners WHERE doctor_id = _doctor_id AND is_primary
$$;
REVOKE ALL ON FUNCTION public.primary_practitioner_id(uuid) FROM PUBLIC, anon, authenticated;

-- New clinics: create the primary practitioner the moment the profile exists.
-- Named to sort BEFORE on_profile_created, which inserts the clinic's working hours
-- (those rows need a practitioner since the next migration).
CREATE OR REPLACE FUNCTION public.create_primary_practitioner_for_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.ensure_primary_practitioner(NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_a0_primary_practitioner ON public.profiles;
CREATE TRIGGER on_profile_a0_primary_practitioner
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_primary_practitioner_for_profile();

-- Until P1 moves doctor details onto the Doctors page, the owner's profile stays the
-- source of truth for the owner's own practitioner row. The slug is NOT re-derived
-- (renames need redirects; P2).
CREATE OR REPLACE FUNCTION public.sync_owner_practitioner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.practitioners
     SET display_name        = COALESCE(NULLIF(btrim(NEW.full_name), ''), NULLIF(btrim(NEW.clinic_name), ''), 'Doctor'),
         specialization      = NEW.specialization,
         qualifications      = NEW.qualifications,
         experience_years    = NEW.experience_years,
         bio                 = NEW.bio,
         photo_url           = NEW.profile_photo_url,
         registration_number = NEW.registration_number,
         signature_url       = NEW.signature_url
   WHERE doctor_id = NEW.id AND user_id = NEW.id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_owner_practitioner ON public.profiles;
CREATE TRIGGER trg_sync_owner_practitioner
  AFTER UPDATE OF full_name, clinic_name, specialization, qualifications, experience_years,
                  bio, profile_photo_url, registration_number, signature_url
  ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_owner_practitioner();

-- Backfill: one primary practitioner per existing clinic.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.profiles LOOP
    PERFORM public.ensure_primary_practitioner(r.id);
  END LOOP;
END $$;
```

- [ ] **Step 4: Apply the migration and run the check**

Run: `npx supabase db push --linked` (or your usual migration path), then
`npx supabase db query --linked -f supabase/tests/multi-doctor/01_practitioners.sql`
Expected: one row `pass`.

If check 7 or 8 fails with `permission denied to set role`, the CLI user cannot switch roles. Replace `SET LOCAL ROLE authenticated;` and `SET LOCAL ROLE anon;` with `PERFORM set_config('role', 'authenticated', true);` and `PERFORM set_config('role', 'anon', true);`, and replace `RESET ROLE;` with `PERFORM set_config('role', 'postgres', true);`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261125100000_practitioners_core.sql supabase/tests/multi-doctor/01_practitioners.sql
git commit -m "feat(db): add practitioners with one primary per clinic"
```

---

### Task 2: `practitioner_id` columns and the fill/validate trigger

**Files:**
- Create: `supabase/migrations/20261125100100_practitioner_columns.sql`
- Test: `supabase/tests/multi-doctor/02_practitioner_columns.sql`

**Interfaces:**
- Consumes (Task 1): `public.practitioners`, `public.ensure_primary_practitioner(uuid)`, `public.primary_practitioner_id(uuid)`.
- Produces:
  - `appointments.practitioner_id`, `working_hours.practitioner_id`, `prescriptions.practitioner_id`, `patient_visits.practitioner_id`: all `uuid NOT NULL`.
  - `patient_documents.practitioner_id uuid NULL` (historic rows stay NULL: we don't know who uploaded them).
  - `prescriptions.created_by uuid NULL` (set from `auth.uid()` on insert).
  - Composite FKs `(practitioner_id, doctor_id) → practitioners(id, doctor_id)`.
  - `public.fill_practitioner()`, a trigger function taking one argument:

| Mode | Table | How a NULL `practitioner_id` is resolved |
|---|---|---|
| `booking` | appointments (INSERT and UPDATE OF practitioner_id) | the only active and bookable practitioner, else `PRACTITIONER_REQUIRED`. It also validates bookable, and online booking for anon callers |
| `sole` | working_hours | the only active practitioner, else `PRACTITIONER_REQUIRED` |
| `author` | prescriptions | the caller's own practitioner, then the visit's, then the only active one, else `PRACTITIONER_REQUIRED` |
| `visit` | patient_visits | the appointment's practitioner, then the caller's, then the only active one, else `PRACTITIONER_REQUIRED` |
| `optional` | patient_documents | the visit's practitioner, then the caller's, else NULL |

  For every mode, a practitioner of another clinic gives `PRACTITIONER_MISMATCH`.

- [ ] **Step 1: Write the failing check**

Create `supabase/tests/multi-doctor/02_practitioner_columns.sql`:

```sql
-- Multi-doctor P0, part 2: practitioner_id columns and fill_practitioner().
-- Rolled back; prints one row 'pass'.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/02_practitioner_columns.sql
BEGIN;
DO $$
DECLARE
  d  uuid := gen_random_uuid();
  d2 uuid := gen_random_uuid();
  reception uuid := gen_random_uuid();   -- a signed-in user who is not a practitioner
  pa uuid; pb uuid; p_other uuid;
  ap uuid; ap_b uuid; pat uuid; v uuid;
  got uuid; got2 uuid;
  n int;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  tmr   date := (now() AT TIME ZONE 'Asia/Kolkata')::date + 1;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"full_name":"Dr Test"}'::jsonb
  FROM unnest(ARRAY[d, d2]) AS u;
  UPDATE public.profiles SET plan_status = 'trial', trial_end = now() + interval '5 days' WHERE id IN (d, d2);
  pa := public.primary_practitioner_id(d);
  p_other := public.primary_practitioner_id(d2);

  -- 1. Signup working hours carry the primary practitioner; nothing anywhere is missing one.
  SELECT count(*) INTO n FROM public.working_hours WHERE doctor_id = d AND practitioner_id IS DISTINCT FROM pa;
  IF n <> 0 THEN RAISE EXCEPTION 'working hours not on the primary practitioner (%)', n; END IF;

  -- 2. Single-doctor clinic: an old-style insert (no practitioner_id) lands on the only doctor.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status)
  VALUES (d, 'Single Doc', '9000000101', 'Visit', 'clinic', today, 300, 'MD01', 'pending')
  RETURNING id, practitioner_id, patient_id INTO ap, got, pat;
  IF got IS DISTINCT FROM pa THEN RAISE EXCEPTION 'single-doctor booking not filled: %', got; END IF;
  IF pat IS NULL THEN RAISE EXCEPTION 'test setup: staff booking did not create a patient'; END IF;

  -- 3. Second doctor: from now on a booking must name its doctor.
  INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (d, 'Dr Second', 'dr-second')
  RETURNING id INTO pb;
  BEGIN
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                     date, amount, token_number, payment_status)
    VALUES (d, 'No Doc', '9000000102', 'Visit', 'clinic', today, 300, 'MD02', 'pending');
    RAISE EXCEPTION 'multi-doctor booking without practitioner was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PRACTITIONER_REQUIRED' THEN RAISE; END IF;
  END;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id)
  VALUES (d, 'Doc B Patient', '9000000103', 'Visit', 'clinic', today, 300, 'MD03', 'pending', pb)
  RETURNING id INTO ap_b;

  -- 4. A doctor of another clinic is refused.
  BEGIN
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                     date, amount, token_number, payment_status, practitioner_id)
    VALUES (d, 'Wrong Clinic', '9000000104', 'Visit', 'clinic', today, 300, 'MD04', 'pending', p_other);
    RAISE EXCEPTION 'cross-clinic practitioner accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PRACTITIONER_MISMATCH' THEN RAISE; END IF;
  END;

  -- 5a. Online booking switched off: the public is refused, the clinic is not.
  UPDATE public.practitioners SET online_booking = false WHERE id = pb;
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  BEGIN
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                     date, amount, token_number, time_slot, practitioner_id)
    VALUES (d, 'Public', '9000000105', 'Visit', 'clinic', tmr, 0, 'MD05', '10:00', pb);
    RAISE EXCEPTION 'public booking accepted for a doctor with online booking off';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PRACTITIONER_NOT_BOOKABLE' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id)
  VALUES (d, 'Counter Booking', '9000000106', 'Visit', 'clinic', today, 300, 'MD06', 'pending', pb);

  -- 5b. A doctor who is not taking bookings at all is refused for everyone.
  UPDATE public.practitioners SET is_bookable = false, online_booking = true WHERE id = pb;
  BEGIN
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                     date, amount, token_number, payment_status, practitioner_id)
    VALUES (d, 'Not Bookable', '9000000107', 'Visit', 'clinic', today, 300, 'MD07', 'pending', pb);
    RAISE EXCEPTION 'booking accepted for a non-bookable doctor';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PRACTITIONER_NOT_BOOKABLE' THEN RAISE; END IF;
  END;
  UPDATE public.practitioners SET is_bookable = true WHERE id = pb;

  -- 6. Prescriptions: the writer is the author; someone who is not a doctor must name one.
  INSERT INTO public.prescriptions (doctor_id, patient_name, date, medicines)
  VALUES (d, 'Single Doc', today, '[]'::jsonb)
  RETURNING practitioner_id, created_by INTO got, got2;
  IF got IS DISTINCT FROM pa OR got2 IS DISTINCT FROM d THEN
    RAISE EXCEPTION 'owner prescription: author % created_by %', got, got2;
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', reception, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO public.prescriptions (doctor_id, patient_name, date, medicines)
    VALUES (d, 'Single Doc', today, '[]'::jsonb);
    RAISE EXCEPTION 'prescription without author accepted in a multi-doctor clinic';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PRACTITIONER_REQUIRED' THEN RAISE; END IF;
  END;

  -- 7. A visit takes its appointment's doctor; a prescription on that visit follows it.
  INSERT INTO public.patient_visits (doctor_id, patient_id, appointment_id, visit_date, created_by, updated_by)
  VALUES (d, pat, ap_b, today, reception, reception)
  RETURNING id, practitioner_id INTO v, got;
  IF got IS DISTINCT FROM pb THEN RAISE EXCEPTION 'visit did not take its appointment''s doctor: %', got; END IF;
  INSERT INTO public.prescriptions (doctor_id, patient_name, date, medicines, visit_id)
  VALUES (d, 'Doc B Patient', today, '[]'::jsonb, v)
  RETURNING practitioner_id INTO got;
  IF got IS DISTINCT FROM pb THEN RAISE EXCEPTION 'prescription did not follow its visit: %', got; END IF;

  -- 8. Documents: optional. A reception upload without a visit stays unattributed.
  INSERT INTO public.patient_documents (doctor_id, patient_id, document_name, document_type, file_path,
                                        document_date, created_by)
  VALUES (d, pat, 'scan.pdf', (enum_range(NULL::public.medical_document_type))[1], d::text || '/scan.pdf',
          today, reception)
  RETURNING practitioner_id INTO got;
  IF got IS NOT NULL THEN RAISE EXCEPTION 'reception document was attributed to %', got; END IF;

  -- 9. Even a trusted writer (no JWT) cannot point a row at another clinic's doctor:
  --    the trigger refuses first (PRACTITIONER_MISMATCH); the composite FK is the backstop.
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    UPDATE public.working_hours SET practitioner_id = p_other WHERE doctor_id = d;
    RAISE EXCEPTION 'cross-clinic working hours accepted';
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN NULL;
  END;

  -- 10. Clients may omit the column: the generated Insert type depends on this default.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND column_name = 'practitioner_id' AND column_default IS NOT NULL
     AND table_name IN ('appointments', 'working_hours', 'prescriptions', 'patient_visits');
  IF n <> 4 THEN RAISE EXCEPTION 'practitioner_id default missing on % tables', 4 - n; END IF;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
```

If check 7 or 8 fails on an unrelated NOT NULL column of `patient_visits` or `patient_documents`, add that column with a dummy value. Do not change the assertion.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx supabase db query --linked -f supabase/tests/multi-doctor/02_practitioner_columns.sql`
Expected: FAIL with `column "practitioner_id" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261125100100_practitioner_columns.sql`:

```sql
-- Multi-doctor clinics, P0 part 2: which doctor a row belongs to.
--
-- Only data that belongs to ONE doctor gets practitioner_id: appointments (slot, queue,
-- room), working_hours, prescriptions and visits (author / treating doctor), documents
-- (uploader, optional). Patients, medical history, invoices, services etc. stay
-- clinic-level. queue_events needs no column: it always carries appointment_id.

ALTER TABLE public.appointments      ADD COLUMN IF NOT EXISTS practitioner_id uuid;
ALTER TABLE public.working_hours     ADD COLUMN IF NOT EXISTS practitioner_id uuid;
ALTER TABLE public.prescriptions     ADD COLUMN IF NOT EXISTS practitioner_id uuid;
ALTER TABLE public.prescriptions     ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.patient_visits    ADD COLUMN IF NOT EXISTS practitioner_id uuid;
ALTER TABLE public.patient_documents ADD COLUMN IF NOT EXISTS practitioner_id uuid;

-- Prescriptions whose clinic account no longer exists. Pre-flight on 2026-11-25 found 10,
-- from 5 deleted accounts: no auth user, no patient, no visit, unreachable through RLS.
-- Removed (decision 2026-11-25) so every prescription can carry a practitioner.
DO $$
DECLARE n integer;
BEGIN
  DELETE FROM public.prescriptions x
   WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = x.doctor_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'multi-doctor: removed % orphan prescriptions', n;
END $$;

-- Backfill to each clinic's primary practitioner with the tables' own triggers OFF.
-- With them on, every historic appointment would be re-checked as a new booking
-- (SLOT_IN_PAST), updated_at would move on every row, and invoice/patient triggers would
-- run again. Pre-flight (supabase/tests/multi-doctor/00_preflight.sql) confirmed no
-- trigger on these tables was disabled on purpose.
ALTER TABLE public.appointments DISABLE TRIGGER USER;
UPDATE public.appointments t SET practitioner_id = p.id
  FROM public.practitioners p
 WHERE p.doctor_id = t.doctor_id AND p.is_primary AND t.practitioner_id IS NULL;
ALTER TABLE public.appointments ENABLE TRIGGER USER;

ALTER TABLE public.working_hours DISABLE TRIGGER USER;
UPDATE public.working_hours t SET practitioner_id = p.id
  FROM public.practitioners p
 WHERE p.doctor_id = t.doctor_id AND p.is_primary AND t.practitioner_id IS NULL;
ALTER TABLE public.working_hours ENABLE TRIGGER USER;

ALTER TABLE public.prescriptions DISABLE TRIGGER USER;
UPDATE public.prescriptions t SET practitioner_id = p.id
  FROM public.practitioners p
 WHERE p.doctor_id = t.doctor_id AND p.is_primary AND t.practitioner_id IS NULL;
ALTER TABLE public.prescriptions ENABLE TRIGGER USER;

ALTER TABLE public.patient_visits DISABLE TRIGGER USER;
UPDATE public.patient_visits t SET practitioner_id = p.id
  FROM public.practitioners p
 WHERE p.doctor_id = t.doctor_id AND p.is_primary AND t.practitioner_id IS NULL;
ALTER TABLE public.patient_visits ENABLE TRIGGER USER;

-- Fail loudly (whole migration rolls back) if any row has no clinic practitioner.
DO $$
DECLARE t text; n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['appointments', 'working_hours', 'prescriptions', 'patient_visits'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE practitioner_id IS NULL', t) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'practitioner backfill: % rows in % have no clinic practitioner (orphans?)', n, t;
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.appointments   ALTER COLUMN practitioner_id SET NOT NULL;
ALTER TABLE public.working_hours  ALTER COLUMN practitioner_id SET NOT NULL;
ALTER TABLE public.prescriptions  ALTER COLUMN practitioner_id SET NOT NULL;
ALTER TABLE public.patient_visits ALTER COLUMN practitioner_id SET NOT NULL;

-- Clients may keep omitting practitioner_id: trg_a00_fill_practitioner fills it, and
-- Postgres checks NOT NULL only after BEFORE triggers. A real column default is what makes
-- the Supabase type generator mark the column optional in Insert types (a NOT NULL column
-- without a default is "required", which would break every existing insert call).
CREATE OR REPLACE FUNCTION public.practitioner_filled_by_trigger()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$ SELECT NULL::uuid $$;

ALTER TABLE public.appointments   ALTER COLUMN practitioner_id SET DEFAULT public.practitioner_filled_by_trigger();
ALTER TABLE public.working_hours  ALTER COLUMN practitioner_id SET DEFAULT public.practitioner_filled_by_trigger();
ALTER TABLE public.prescriptions  ALTER COLUMN practitioner_id SET DEFAULT public.practitioner_filled_by_trigger();
ALTER TABLE public.patient_visits ALTER COLUMN practitioner_id SET DEFAULT public.practitioner_filled_by_trigger();

-- Same-clinic foreign keys. NO ACTION (the default), not RESTRICT: deleting a clinic
-- cascades to its rows AND its practitioners in one statement and is checked at the end,
-- while deleting a practitioner who still has rows is refused.
ALTER TABLE public.appointments ADD CONSTRAINT appointments_practitioner_fk
  FOREIGN KEY (practitioner_id, doctor_id) REFERENCES public.practitioners (id, doctor_id) NOT VALID;
ALTER TABLE public.appointments VALIDATE CONSTRAINT appointments_practitioner_fk;
ALTER TABLE public.working_hours ADD CONSTRAINT working_hours_practitioner_fk
  FOREIGN KEY (practitioner_id, doctor_id) REFERENCES public.practitioners (id, doctor_id) NOT VALID;
ALTER TABLE public.working_hours VALIDATE CONSTRAINT working_hours_practitioner_fk;
ALTER TABLE public.prescriptions ADD CONSTRAINT prescriptions_practitioner_fk
  FOREIGN KEY (practitioner_id, doctor_id) REFERENCES public.practitioners (id, doctor_id) NOT VALID;
ALTER TABLE public.prescriptions VALIDATE CONSTRAINT prescriptions_practitioner_fk;
ALTER TABLE public.patient_visits ADD CONSTRAINT patient_visits_practitioner_fk
  FOREIGN KEY (practitioner_id, doctor_id) REFERENCES public.practitioners (id, doctor_id) NOT VALID;
ALTER TABLE public.patient_visits VALIDATE CONSTRAINT patient_visits_practitioner_fk;
ALTER TABLE public.patient_documents ADD CONSTRAINT patient_documents_practitioner_fk
  FOREIGN KEY (practitioner_id, doctor_id) REFERENCES public.practitioners (id, doctor_id) NOT VALID;
ALTER TABLE public.patient_documents VALIDATE CONSTRAINT patient_documents_practitioner_fk;

CREATE INDEX IF NOT EXISTS idx_appointments_practitioner_date ON public.appointments (practitioner_id, date);
CREATE INDEX IF NOT EXISTS idx_prescriptions_practitioner ON public.prescriptions (practitioner_id);
CREATE INDEX IF NOT EXISTS idx_patient_visits_practitioner ON public.patient_visits (practitioner_id);
CREATE INDEX IF NOT EXISTS idx_patient_documents_practitioner ON public.patient_documents (practitioner_id)
  WHERE practitioner_id IS NOT NULL;
-- Per-doctor weekly hours. The old UNIQUE (doctor_id, day_of_week) stays until P1 moves
-- MyWebsite to per-doctor hours (expand now, contract in P1).
CREATE UNIQUE INDEX IF NOT EXISTS uq_working_hours_practitioner_day ON public.working_hours (practitioner_id, day_of_week);

-- Fills a missing practitioner_id and validates a given one. TG_ARGV[0] is the mode
-- (booking | sole | author | visit | optional); see the plan / spec §3.3.
-- Table-specific columns are read inside nested IFs: PL/pgSQL resolves NEW.<column> when
-- the statement runs, and the columns differ per table.
CREATE OR REPLACE FUNCTION public.fill_practitioner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mode   text := TG_ARGV[0];
  v_uid    uuid := auth.uid();
  v_caller uuid;
  v_parent uuid;
  v_pid    uuid;
  v_ids    uuid[];
  p        public.practitioners%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'prescriptions' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_by := COALESCE(v_uid, NEW.created_by);
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.practitioner_id IS NULL THEN
    IF v_uid IS NOT NULL THEN
      SELECT id INTO v_caller FROM public.practitioners
       WHERE doctor_id = NEW.doctor_id AND user_id = v_uid AND is_active;
    END IF;

    IF TG_TABLE_NAME = 'patient_visits' THEN
      IF NEW.appointment_id IS NOT NULL THEN
        SELECT practitioner_id INTO v_parent FROM public.appointments
         WHERE id = NEW.appointment_id AND doctor_id = NEW.doctor_id;
      END IF;
    ELSIF TG_TABLE_NAME IN ('prescriptions', 'patient_documents') THEN
      IF NEW.visit_id IS NOT NULL THEN
        SELECT practitioner_id INTO v_parent FROM public.patient_visits
         WHERE id = NEW.visit_id AND doctor_id = NEW.doctor_id;
      END IF;
    END IF;

    v_pid := CASE v_mode
               WHEN 'author'   THEN COALESCE(v_caller, v_parent)
               WHEN 'visit'    THEN COALESCE(v_parent, v_caller)
               WHEN 'optional' THEN COALESCE(v_parent, v_caller)
             END;

    IF v_pid IS NULL AND v_mode <> 'optional' THEN
      SELECT array_agg(id) INTO v_ids FROM public.practitioners
       WHERE doctor_id = NEW.doctor_id AND is_active AND (v_mode <> 'booking' OR is_bookable);
      IF v_ids IS NULL AND NOT EXISTS (SELECT 1 FROM public.practitioners WHERE doctor_id = NEW.doctor_id) THEN
        -- A clinic created before its practitioner (any trigger order): make it now.
        v_pid := public.ensure_primary_practitioner(NEW.doctor_id);
      ELSIF v_ids IS NULL THEN
        RAISE EXCEPTION 'PRACTITIONER_NOT_BOOKABLE' USING ERRCODE = 'check_violation';
      ELSIF array_length(v_ids, 1) = 1 THEN
        v_pid := v_ids[1];
      ELSE
        -- Never guess between doctors: a paid booking must not land in the wrong queue.
        RAISE EXCEPTION 'PRACTITIONER_REQUIRED' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    NEW.practitioner_id := v_pid;
  END IF;

  IF NEW.practitioner_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.practitioner_id IS DISTINCT FROM OLD.practitioner_id) THEN
    SELECT * INTO p FROM public.practitioners WHERE id = NEW.practitioner_id AND doctor_id = NEW.doctor_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRACTITIONER_MISMATCH' USING ERRCODE = 'check_violation';
    END IF;
    IF v_mode = 'booking'
       AND (NOT (p.is_active AND p.is_bookable)
            OR (COALESCE(auth.role(), '') = 'anon' AND NOT p.online_booking)) THEN
      RAISE EXCEPTION 'PRACTITIONER_NOT_BOOKABLE' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- trg_a00_* sorts before trg_a0_enforce_slot_capacity*, so the slot lock already sees
-- the practitioner.
DROP TRIGGER IF EXISTS trg_a00_fill_practitioner ON public.appointments;
CREATE TRIGGER trg_a00_fill_practitioner
  BEFORE INSERT OR UPDATE OF practitioner_id ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.fill_practitioner('booking');

DROP TRIGGER IF EXISTS trg_a00_fill_practitioner ON public.working_hours;
CREATE TRIGGER trg_a00_fill_practitioner
  BEFORE INSERT OR UPDATE OF practitioner_id ON public.working_hours
  FOR EACH ROW EXECUTE FUNCTION public.fill_practitioner('sole');

DROP TRIGGER IF EXISTS trg_a00_fill_practitioner ON public.prescriptions;
CREATE TRIGGER trg_a00_fill_practitioner
  BEFORE INSERT OR UPDATE OF practitioner_id ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.fill_practitioner('author');

DROP TRIGGER IF EXISTS trg_a00_fill_practitioner ON public.patient_visits;
CREATE TRIGGER trg_a00_fill_practitioner
  BEFORE INSERT OR UPDATE OF practitioner_id ON public.patient_visits
  FOR EACH ROW EXECUTE FUNCTION public.fill_practitioner('visit');

DROP TRIGGER IF EXISTS trg_a00_fill_practitioner ON public.patient_documents;
CREATE TRIGGER trg_a00_fill_practitioner
  BEFORE INSERT OR UPDATE OF practitioner_id ON public.patient_documents
  FOR EACH ROW EXECUTE FUNCTION public.fill_practitioner('optional');
```

- [ ] **Step 4: Apply and run the check**

Run: `npx supabase db push --linked`, then
`npx supabase db query --linked -f supabase/tests/multi-doctor/02_practitioner_columns.sql`
Expected: `pass`. Then re-run `01_practitioners.sql`. Expected: `pass`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261125100100_practitioner_columns.sql supabase/tests/multi-doctor/02_practitioner_columns.sql
git commit -m "feat(db): attach appointments, hours, prescriptions and visits to a practitioner"
```

---

### Task 3: Per-practitioner slots, queue numbers and public RPCs

**Files:**
- Create: `supabase/migrations/20261125100200_practitioner_scoped_slots_and_queue.sql`
- Test: `supabase/tests/multi-doctor/03_slots_and_queue.sql`

**Interfaces:**
- Consumes (Tasks 1–2): `practitioners`, `appointments.practitioner_id`, `primary_practitioner_id(uuid)`.
- Produces:
  - `public.slot_lock_key(_practitioner_id uuid, _date date, _time text, _type text) RETURNS bigint`: the ONLY slot lock key from now on.
  - `public.get_slot_counts(_doctor_id uuid, _date date, _appointment_type text DEFAULT 'clinic', _practitioner_id uuid DEFAULT NULL) RETURNS TABLE(time_slot text, booked integer)`
  - `public.get_public_queue(_doctor_id uuid, _practitioner_id uuid DEFAULT NULL) RETURNS jsonb`
  - `public.get_my_queue_status(_doctor_id uuid, _token text, _phone text)` (same signature, now scoped to the patient's own doctor)
  - `public.public_booking_price(_doctor_id uuid, _service_name text, _type text, _practitioner_id uuid DEFAULT NULL) RETURNS numeric` (internal)
  - Appointment updates that change `practitioner_id`: refused while the patient is in the room (`PRACTITIONER_IN_SERVICE`); refused for today unless they come from `queue_action` (`USE_QUEUE_TRANSFER`); otherwise renumbered in the new doctor's line.

- [ ] **Step 1: Write the failing check**

Create `supabase/tests/multi-doctor/03_slots_and_queue.sql`:

```sql
-- Multi-doctor P0, part 3: per-doctor slots, queue numbers and public RPCs.
-- Rolled back; prints one row 'pass'.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/03_slots_and_queue.sql
BEGIN;
DO $$
DECLARE
  d  uuid := gen_random_uuid();
  pa uuid; pb uuid;
  a_t uuid; b_t uuid; a1 uuid; b1 uuid; a2 uuid; pub_b uuid; pub_a uuid;
  q int; n int; amt numeric;
  r jsonb;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  tmr   date := (now() AT TIME ZONE 'Asia/Kolkata')::date + 1;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  VALUES (d, 'authenticated', 'authenticated', d::text || '@example.test', '{"full_name":"Dr Slot"}'::jsonb);
  UPDATE public.profiles
     SET plan_status = 'trial', trial_end = now() + interval '5 days',
         onboarding_completed = true, consultation_fee = 400
   WHERE id = d;
  pa := public.primary_practitioner_id(d);
  INSERT INTO public.practitioners (doctor_id, display_name, slug, consultation_fee)
  VALUES (d, 'Dr B', 'dr-b', 900) RETURNING id INTO pb;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);

  -- 1. Two doctors may hold the same slot; one doctor may not hold it twice.
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, time_slot, practitioner_id)
  VALUES (d, 'Slot A', '9000000201', 'Visit', 'clinic', tmr, 300, 'MS01', 'pending', '10:00', pa)
  RETURNING id, queue_number INTO a_t, q;
  IF q <> 1 THEN RAISE EXCEPTION 'A tomorrow queue number %', q; END IF;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, time_slot, practitioner_id)
  VALUES (d, 'Slot B', '9000000202', 'Visit', 'clinic', tmr, 300, 'MS02', 'pending', '10:00', pb)
  RETURNING id, queue_number INTO b_t, q;
  IF q <> 1 THEN RAISE EXCEPTION 'queue numbers are not per doctor (B got %)', q; END IF;
  BEGIN
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                     date, amount, token_number, payment_status, time_slot, practitioner_id)
    VALUES (d, 'Slot A2', '9000000203', 'Visit', 'clinic', tmr, 300, 'MS03', 'pending', '10:00', pa);
    RAISE EXCEPTION 'same doctor double-booked';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'SLOT_FULL' THEN RAISE; END IF;
  END;

  -- 2. Slot counts are per doctor; no doctor given = the primary.
  SELECT count(*) INTO n FROM public.get_slot_counts(d, tmr, 'clinic', pb) WHERE time_slot::time = '10:00' AND booked = 1;
  IF n <> 1 THEN RAISE EXCEPTION 'slot count for B wrong'; END IF;
  SELECT count(*) INTO n FROM public.get_slot_counts(d, tmr) WHERE time_slot::time = '10:00' AND booked = 1;
  IF n <> 1 THEN RAISE EXCEPTION 'default slot count is not the primary''s'; END IF;

  -- 3. Moving a booking to a doctor whose slot is taken is refused; to a free time it is
  --    renumbered at the end of that doctor's line.
  BEGIN
    UPDATE public.appointments SET practitioner_id = pa WHERE id = b_t;
    RAISE EXCEPTION 'moved onto a taken slot';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'SLOT_FULL' THEN RAISE; END IF;
  END;
  UPDATE public.appointments SET practitioner_id = pa, time_slot = '11:00' WHERE id = b_t
  RETURNING queue_number INTO q;
  IF q <> 2 THEN RAISE EXCEPTION 'moved booking not renumbered in A''s line (got %)', q; END IF;

  -- 4. Today's line: numbers per doctor; a plain update cannot move a patient today.
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id, created_at)
  VALUES (d, 'Today A1', '9000000211', 'Visit', 'clinic', today, 300, 'MQ01', 'pending', pa, now() + interval '1 second')
  RETURNING id INTO a1;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id, created_at)
  VALUES (d, 'Today B1', '9000000212', 'Visit', 'clinic', today, 300, 'MQ02', 'pending', pb, now() + interval '2 seconds')
  RETURNING id, queue_number INTO b1, q;
  IF q <> 1 THEN RAISE EXCEPTION 'today B1 number %', q; END IF;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id, created_at)
  VALUES (d, 'Today A2', '9000000213', 'Visit', 'clinic', today, 300, 'MQ03', 'pending', pa, now() + interval '3 seconds')
  RETURNING id, queue_number INTO a2, q;
  IF q <> 2 THEN RAISE EXCEPTION 'today A2 number %', q; END IF;
  BEGIN
    UPDATE public.appointments SET practitioner_id = pb WHERE id = a2;
    RAISE EXCEPTION 'same-day doctor change outside queue_action accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'USE_QUEUE_TRANSFER' THEN RAISE; END IF;
  END;

  -- 5. Public queue screen and "my status" only count the patient's own doctor.
  r := public.get_public_queue(d, pb);
  IF (r->>'waiting')::int <> 1 THEN RAISE EXCEPTION 'B public queue: %', r; END IF;
  r := public.get_public_queue(d);
  IF (r->>'waiting')::int <> 2 THEN RAISE EXCEPTION 'default public queue is not the primary''s: %', r; END IF;
  r := public.get_my_queue_status(d, 'MQ03', '9000000213');
  IF (r->>'ahead')::int <> 1 THEN RAISE EXCEPTION 'A2 should have 1 ahead (own doctor only): %', r; END IF;

  -- 6. The public price uses the chosen doctor's fee, else the clinic's.
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, time_slot, practitioner_id)
  VALUES (d, 'Public B', '9000000221', 'No Such Service', 'clinic', tmr, 1, 'MP01', '12:00', pb)
  RETURNING id, amount INTO pub_b, amt;
  IF amt <> 900 THEN RAISE EXCEPTION 'public price for B should be 900, got %', amt; END IF;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, time_slot, practitioner_id)
  VALUES (d, 'Public A', '9000000222', 'No Such Service', 'clinic', tmr, 1, 'MP02', '12:30', pa)
  RETURNING id, amount INTO pub_a, amt;
  IF amt <> 400 THEN RAISE EXCEPTION 'public price for A should be the clinic fee 400, got %', amt; END IF;

  -- 7. A patient's own reschedule checks their own doctor's slots only.
  r := public.reschedule_appointment_by_token(d, 'MP01', '9000000221', tmr, '10:00');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'B reschedule onto a slot only A holds was refused: %', r; END IF;
  r := public.reschedule_appointment_by_token(d, 'MP02', '9000000222', tmr, '11:00');
  IF r->>'error' IS DISTINCT FROM 'SLOT_FULL' THEN RAISE EXCEPTION 'A reschedule onto A''s taken slot: %', r; END IF;

  -- 8. No function still builds a slot or queue-number lock from the clinic id
  --    (the 'queue:' lock of queue_action is checked in 04_queue_action.sql).
  SELECT count(*) INTO n
    FROM pg_proc pr JOIN pg_namespace ns ON ns.oid = pr.pronamespace
   WHERE ns.nspname = 'public' AND pr.prokind = 'f'
     AND pg_get_functiondef(pr.oid) ~ '(hashtextextended\(\s*(NEW\.doctor_id|_doctor_id)|''queue_number:'' \|\| NEW\.doctor_id)';
  IF n <> 0 THEN RAISE EXCEPTION '% functions still lock slots/queue numbers per clinic', n; END IF;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx supabase db query --linked -f supabase/tests/multi-doctor/03_slots_and_queue.sql`
Expected: FAIL with an uncaught `SLOT_FULL` at check 1. The old slot trigger is per clinic, so Dr B cannot take Dr A's 10:00.

- [ ] **Step 3: Write the migration — fully new functions**

Create `supabase/migrations/20261125100200_practitioner_scoped_slots_and_queue.sql` and start it with:

```sql
-- Multi-doctor clinics, P0 part 3: a slot, a queue number and "the room" belong to ONE
-- doctor, not to the whole clinic. Two doctors can see patients at 10:00; one cannot be
-- double-booked. Invoice numbering, the patient lock and the monthly cap stay per clinic.
-- Lock order is unchanged: slot -> queue number -> patient.

-- The one slot lock key. Every slot check (insert, update, re-open, patient reschedule)
-- must use it, or two bookings could take the same doctor's slot concurrently.
CREATE OR REPLACE FUNCTION public.slot_lock_key(_practitioner_id uuid, _date date, _time text, _type text)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT hashtextextended(_practitioner_id::text || ':' || _date::text || ':' || _time || ':' || _type, 0)
$$;

-- ---------------------------------------------------------------------------
-- 1. Slot capacity per practitioner (bodies from 20261029140000, re-keyed)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_slot_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  taken integer;
BEGIN
  IF NEW.time_slot IS NULL THEN
    RETURN NEW;
  END IF;

  IF ((NEW.date::text || ' ' || NEW.time_slot)::timestamp AT TIME ZONE 'Asia/Kolkata') < now() THEN
    RAISE EXCEPTION 'SLOT_IN_PAST' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(public.slot_lock_key(
    NEW.practitioner_id, NEW.date, NEW.time_slot::text, NEW.appointment_type::text));

  SELECT COUNT(*) INTO taken FROM public.appointments
   WHERE practitioner_id = NEW.practitioner_id AND date = NEW.date AND time_slot = NEW.time_slot
     AND appointment_type = NEW.appointment_type AND status <> 'cancelled';

  IF taken >= 1 THEN
    RAISE EXCEPTION 'SLOT_FULL' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_slot_capacity_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  taken integer;
BEGIN
  IF NEW.time_slot IS NULL THEN
    RETURN NEW;
  END IF;

  -- Moving to another doctor is a new slot claim too.
  IF NEW.date = OLD.date AND NEW.time_slot = OLD.time_slot AND NEW.appointment_type = OLD.appointment_type
     AND NEW.practitioner_id = OLD.practitioner_id THEN
    RETURN NEW;
  END IF;

  IF ((NEW.date::text || ' ' || NEW.time_slot)::timestamp AT TIME ZONE 'Asia/Kolkata') < now() THEN
    RAISE EXCEPTION 'SLOT_IN_PAST' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(public.slot_lock_key(
    NEW.practitioner_id, NEW.date, NEW.time_slot::text, NEW.appointment_type::text));

  SELECT COUNT(*) INTO taken FROM public.appointments
   WHERE practitioner_id = NEW.practitioner_id AND date = NEW.date AND time_slot = NEW.time_slot
     AND appointment_type = NEW.appointment_type AND status <> 'cancelled' AND id <> NEW.id;

  IF taken >= 1 THEN
    RAISE EXCEPTION 'SLOT_FULL' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Queue numbers and "one in the room" per practitioner per day
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_appointment_queue_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('queue_number:' || NEW.practitioner_id::text || NEW.date::text));
  SELECT COALESCE(MAX(queue_number), 0) + 1 INTO NEW.queue_number
    FROM public.appointments WHERE practitioner_id = NEW.practitioner_id AND date = NEW.date;
  RETURN NEW;
END;
$$;

-- A new day OR a new doctor = the next number in that doctor's line that day.
-- Same-day moves must go through queue_action('transfer') (end of the line, logged).
CREATE OR REPLACE FUNCTION public.renumber_rescheduled_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF NEW.practitioner_id IS DISTINCT FROM OLD.practitioner_id THEN
    IF OLD.serving_started_at IS NOT NULL AND OLD.status::text IN ('pending', 'confirmed') THEN
      RAISE EXCEPTION 'PRACTITIONER_IN_SERVICE' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.date = v_today AND COALESCE(current_setting('app.queue_rpc', true), '') <> '1' THEN
      RAISE EXCEPTION 'USE_QUEUE_TRANSFER' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.date IS DISTINCT FROM OLD.date OR NEW.practitioner_id IS DISTINCT FROM OLD.practitioner_id THEN
    PERFORM pg_advisory_xact_lock(hashtext('queue_number:' || NEW.practitioner_id::text || NEW.date::text));
    SELECT COALESCE(MAX(queue_number), 0) + 1 INTO NEW.queue_number
      FROM public.appointments WHERE practitioner_id = NEW.practitioner_id AND date = NEW.date;
    NEW.serving_started_at := NULL;
    NEW.skipped_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_a2b_renumber_rescheduled ON public.appointments;
CREATE TRIGGER trg_a2b_renumber_rescheduled
BEFORE UPDATE OF date, practitioner_id ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.renumber_rescheduled_appointment();

-- With one practitioner per clinic today these are equivalent to the old indexes, so the
-- rebuild cannot fail on existing data.
DROP INDEX IF EXISTS public.uq_appointments_queue_number;
CREATE UNIQUE INDEX uq_appointments_queue_number
  ON public.appointments (practitioner_id, date, queue_number) WHERE queue_number IS NOT NULL;

DROP INDEX IF EXISTS public.uq_appointments_one_serving;
CREATE UNIQUE INDEX uq_appointments_one_serving
  ON public.appointments (practitioner_id, date)
  WHERE serving_started_at IS NOT NULL AND status IN ('pending', 'confirmed');

-- ---------------------------------------------------------------------------
-- 3. Public RPCs (NULL practitioner = the clinic's primary, so old callers are unchanged)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_slot_counts(uuid, date, text);
CREATE FUNCTION public.get_slot_counts(
  _doctor_id uuid,
  _date date,
  _appointment_type text DEFAULT 'clinic',
  _practitioner_id uuid DEFAULT NULL
)
RETURNS TABLE(time_slot text, booked integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.time_slot, COUNT(*)::int AS booked
  FROM public.appointments a
  WHERE a.doctor_id = _doctor_id
    AND a.practitioner_id = COALESCE(_practitioner_id, public.primary_practitioner_id(_doctor_id))
    AND a.date = _date
    AND a.time_slot IS NOT NULL
    AND a.appointment_type = _appointment_type
    AND a.status <> 'cancelled'
  GROUP BY a.time_slot;
$$;
REVOKE ALL ON FUNCTION public.get_slot_counts(uuid, date, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_slot_counts(uuid, date, text, uuid) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_public_queue(uuid);
CREATE FUNCTION public.get_public_queue(_doctor_id uuid, _practitioner_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH t AS (SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS today),
  appts AS (
    SELECT a.* FROM public.appointments a, t
     WHERE a.doctor_id = _doctor_id
       AND a.practitioner_id = COALESCE(_practitioner_id, public.primary_practitioner_id(_doctor_id))
       AND a.date = t.today AND a.appointment_type = 'clinic'
       AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _doctor_id AND p.onboarding_completed = true)
  ),
  waiting AS (
    SELECT queue_number,
           row_number() OVER (ORDER BY priority DESC, sort_time, created_at, id) AS rn
      FROM appts
     WHERE status IN ('pending', 'confirmed') AND skipped_at IS NULL AND serving_started_at IS NULL
  ),
  recent AS (
    SELECT EXTRACT(EPOCH FROM (completed_at - serving_started_at)) / 60.0 AS minutes
      FROM appts
     WHERE status = 'completed' AND serving_started_at IS NOT NULL AND completed_at IS NOT NULL
       AND completed_at > serving_started_at
     ORDER BY completed_at DESC LIMIT 10
  ),
  serving AS (
    SELECT queue_number, btrim(regexp_replace(COALESCE(patient_name, ''), '\s+', ' ', 'g')) AS nm
      FROM appts
     WHERE serving_started_at IS NOT NULL AND status IN ('pending', 'confirmed') LIMIT 1
  )
  SELECT jsonb_build_object(
    'now_serving', (SELECT queue_number FROM serving),
    'now_serving_name', (SELECT CASE
        WHEN nm = '' THEN NULL
        WHEN position(' ' IN nm) = 0 THEN nm
        ELSE split_part(nm, ' ', 1) || ' ' || upper(left((regexp_split_to_array(nm, ' '))[array_length(regexp_split_to_array(nm, ' '), 1)], 1)) || '.'
      END FROM serving),
    'next_up',     COALESCE((SELECT jsonb_agg(queue_number ORDER BY rn) FROM waiting WHERE rn <= 5), '[]'::jsonb),
    'waiting',     (SELECT count(*) FROM waiting),
    'done',        (SELECT count(*) FROM appts WHERE status = 'completed'),
    'avg_minutes', (SELECT round(avg(minutes)::numeric, 1) FROM recent),
    'updated_at',  now()
  );
$$;
REVOKE EXECUTE ON FUNCTION public.get_public_queue(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_queue(uuid, uuid) TO anon, authenticated;

-- Same signature: the patient's own appointment says whose line they are in.
CREATE OR REPLACE FUNCTION public.get_my_queue_status(_doctor_id uuid, _token text, _phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  me public.appointments%ROWTYPE;
  ahead integer;
  serving integer;
  avg_min numeric;
BEGIN
  IF length(btrim(COALESCE(_phone, ''))) < 10 OR COALESCE(_token, '') = '' THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  IF public.token_lookup_blocked(_doctor_id, _phone) THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO me FROM public.appointments
   WHERE doctor_id = _doctor_id AND token_number = _token AND patient_phone = _phone
     AND date = today AND appointment_type = 'clinic'
   ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM public.appointments
                    WHERE doctor_id = _doctor_id AND token_number = _token AND patient_phone = _phone) THEN
      PERFORM public.token_lookup_failed(_doctor_id, _phone);
    END IF;
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT queue_number INTO serving FROM public.appointments
   WHERE doctor_id = _doctor_id AND practitioner_id = me.practitioner_id AND date = today
     AND serving_started_at IS NOT NULL AND status IN ('pending', 'confirmed') LIMIT 1;

  SELECT round(avg(EXTRACT(EPOCH FROM (completed_at - serving_started_at)) / 60.0)::numeric, 1) INTO avg_min
    FROM (SELECT completed_at, serving_started_at FROM public.appointments
           WHERE doctor_id = _doctor_id AND practitioner_id = me.practitioner_id AND date = today
             AND status = 'completed' AND serving_started_at IS NOT NULL AND completed_at > serving_started_at
           ORDER BY completed_at DESC LIMIT 10) r;

  IF me.status::text IN ('pending', 'confirmed') AND me.skipped_at IS NULL AND me.serving_started_at IS NULL THEN
    SELECT count(*)::int INTO ahead FROM public.appointments a
     WHERE a.doctor_id = _doctor_id AND a.practitioner_id = me.practitioner_id
       AND a.date = today AND a.appointment_type = 'clinic'
       AND a.status IN ('pending', 'confirmed') AND a.skipped_at IS NULL AND a.serving_started_at IS NULL
       AND a.id <> me.id
       AND (a.priority > me.priority
            OR (a.priority = me.priority
                AND (a.sort_time < me.sort_time
                     OR (a.sort_time = me.sort_time
                         AND (a.created_at < me.created_at
                              OR (a.created_at = me.created_at AND a.id < me.id))))));
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'queue_number', me.queue_number,
    'state', CASE
      WHEN me.status::text = 'completed' THEN 'done'
      WHEN me.status::text IN ('cancelled', 'no_show') THEN me.status::text
      WHEN me.serving_started_at IS NOT NULL THEN 'serving'
      WHEN me.skipped_at IS NOT NULL THEN 'skipped'
      ELSE 'waiting' END,
    'ahead', ahead,
    'now_serving', serving,
    'avg_minutes', avg_min
  );
END;
$$;

-- Internal (called by the public-booking trigger): the chosen doctor's own fee, else the
-- clinic's. A matching paid service still wins, exactly as before.
CREATE OR REPLACE FUNCTION public.public_booking_price(
  _doctor_id uuid, _service_name text, _type text, _practitioner_id uuid DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fee numeric;
  v_online numeric;
  v_default numeric;
  v_price numeric;
BEGIN
  SELECT NULLIF(consultation_fee, 0) INTO v_fee FROM public.practitioners
   WHERE id = _practitioner_id AND doctor_id = _doctor_id;
  IF v_fee IS NULL THEN
    SELECT COALESCE(NULLIF(consultation_fee, 0), 500) INTO v_fee FROM public.profiles WHERE id = _doctor_id;
  END IF;
  v_fee := COALESCE(v_fee, 500);
  SELECT NULLIF(online_fee, 0) INTO v_online FROM public.website_settings WHERE doctor_id = _doctor_id;
  v_default := CASE WHEN _type = 'online' THEN COALESCE(v_online, v_fee) ELSE v_fee END;

  SELECT price INTO v_price FROM public.services
   WHERE doctor_id = _doctor_id AND active = true
     AND lower(btrim(name)) = lower(btrim(COALESCE(_service_name, '')))
     AND (type = _type OR type = 'both')
   ORDER BY (price > 0) DESC, sort_order
   LIMIT 1;

  IF v_price IS NOT NULL AND v_price > 0 THEN
    RETURN v_price;
  END IF;
  RETURN v_default;
END;
$$;
REVOKE ALL ON FUNCTION public.public_booking_price(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
```

- [ ] **Step 4: Append the three re-keyed existing functions (copy, then exact replacements)**

These three bodies are long and recently hardened. Copy each **verbatim** from the named file, from the line `CREATE OR REPLACE FUNCTION public.<name>(` through its closing `$function$;`, append it to the migration, then make exactly the replacements below. Change nothing else.

**(a) `guard_appointment_writes`** from `supabase/migrations/20261102100000_db_security_fixes.sql`. Replace:

```sql
    PERFORM pg_advisory_xact_lock(hashtextextended(
      NEW.doctor_id::text || ':' || NEW.date::text || ':' || NEW.time_slot::text || ':' || NEW.appointment_type, 0));
    SELECT COUNT(*) INTO taken FROM public.appointments
     WHERE doctor_id = NEW.doctor_id AND date = NEW.date AND time_slot = NEW.time_slot
```

with:

```sql
    PERFORM pg_advisory_xact_lock(public.slot_lock_key(
      NEW.practitioner_id, NEW.date, NEW.time_slot::text, NEW.appointment_type::text));
    SELECT COUNT(*) INTO taken FROM public.appointments
     WHERE practitioner_id = NEW.practitioner_id AND date = NEW.date AND time_slot = NEW.time_slot
```

**(b) `reschedule_appointment_by_token`** from the same file. Replace:

```sql
  PERFORM pg_advisory_xact_lock(hashtextextended(
    _doctor_id::text || ':' || _new_date::text || ':' || new_t::text || ':' || appt.appointment_type, 0));

  SELECT COUNT(*) INTO taken FROM public.appointments
   WHERE doctor_id = _doctor_id AND date = _new_date AND time_slot = new_t
```

with:

```sql
  PERFORM pg_advisory_xact_lock(public.slot_lock_key(
    appt.practitioner_id, _new_date, new_t::text, appt.appointment_type::text));

  SELECT COUNT(*) INTO taken FROM public.appointments
   WHERE practitioner_id = appt.practitioner_id AND date = _new_date AND time_slot = new_t
```

**(c) `enforce_public_booking_limits`** from the same file. Replace:

```sql
  NEW.amount := public.public_booking_price(NEW.doctor_id, NEW.service_name, NEW.appointment_type::text);
```

with:

```sql
  NEW.amount := public.public_booking_price(NEW.doctor_id, NEW.service_name, NEW.appointment_type::text, NEW.practitioner_id);
```

The 3-booking limit per phone stays clinic-wide on purpose (spec §10.6).

Finish the migration with:

```sql
-- Only now is nothing left calling the 3-argument price function.
DROP FUNCTION IF EXISTS public.public_booking_price(uuid, text, text);

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 5: Apply and run the check**

Run: `npx supabase db push --linked`, then
`npx supabase db query --linked -f supabase/tests/multi-doctor/03_slots_and_queue.sql`
Expected: `pass`.

If check 8 reports functions, list them:

```sql
SELECT pr.proname FROM pg_proc pr JOIN pg_namespace ns ON ns.oid = pr.pronamespace
 WHERE ns.nspname = 'public' AND pr.prokind = 'f'
   AND pg_get_functiondef(pr.oid) ~ '(hashtextextended\(\s*(NEW\.doctor_id|_doctor_id)|''queue_number:'' \|\| NEW\.doctor_id)';
```

Each name listed is a missed lock site. Re-key it with `slot_lock_key` (or the practitioner queue-number key) in this migration.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261125100200_practitioner_scoped_slots_and_queue.sql supabase/tests/multi-doctor/03_slots_and_queue.sql
git commit -m "feat(db): scope slots, queue numbers and public queue RPCs per practitioner"
```

---

### Task 4: `queue_action` per practitioner + `transfer`

**Files:**
- Create: `supabase/migrations/20261125100300_queue_action_practitioner.sql`
- Test: `supabase/tests/multi-doctor/04_queue_action.sql`

**Interfaces:**
- Consumes: Tasks 1–3 (`renumber_rescheduled_appointment` honours `app.queue_rpc`).
- Produces:
  - `public.queue_action(_action text, _appointment_id uuid DEFAULT NULL, _reason text DEFAULT NULL, _payment_method text DEFAULT NULL, _expect text DEFAULT NULL, _payment_reference text DEFAULT NULL, _practitioner_id uuid DEFAULT NULL) RETURNS jsonb`
  - `call_next` uses `_practitioner_id`. NULL works only when the clinic has exactly one active practitioner; otherwise `PRACTITIONER_REQUIRED`.
  - Appointment actions take the appointment's own practitioner. If it moved meanwhile, they return `STALE`.
  - `transfer` (`_appointment_id`, `_practitioner_id` = target, optional `_reason`) returns `{ok, practitioner_id, queue_number}`, or one of `PRACTITIONER_REQUIRED`, `PRACTITIONER_NOT_FOUND`, `PRACTITIONER_NOT_BOOKABLE`, `NOT_TRANSFERABLE`, `PRACTITIONER_IN_SERVICE`, `SLOT_TAKEN`.
  - It logs a `queue_events` row with action `transfer` and reason `to <uuid>[: reason]`.

- [ ] **Step 1: Write the failing check**

Create `supabase/tests/multi-doctor/04_queue_action.sql`:

```sql
-- Multi-doctor P0, part 4: queue_action per doctor + transfer. Rolled back; prints 'pass'.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/04_queue_action.sql
BEGIN;
DO $$
DECLARE
  d  uuid := gen_random_uuid();
  d2 uuid := gen_random_uuid();
  pa uuid; pb uuid; pc uuid; p_other uuid;
  a1 uuid; a2 uuid; b1 uuid; s1 uuid;
  r jsonb;
  rec public.appointments%ROWTYPE;
  n int;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"full_name":"Dr Queue"}'::jsonb
  FROM unnest(ARRAY[d, d2]) AS u;
  UPDATE public.profiles SET plan_status = 'trial', trial_end = now() + interval '5 days' WHERE id IN (d, d2);
  pa := public.primary_practitioner_id(d);
  p_other := public.primary_practitioner_id(d2);
  INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (d, 'Dr B', 'dr-b') RETURNING id INTO pb;
  INSERT INTO public.practitioners (doctor_id, display_name, slug, is_bookable)
  VALUES (d, 'Dr C', 'dr-c', false) RETURNING id INTO pc;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id, created_at)
  VALUES (d, 'Q A1', '9000000301', 'Visit', 'clinic', today, 300, 'QA01', 'pending', pa, now() + interval '1 second')
  RETURNING id INTO a1;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id, created_at)
  VALUES (d, 'Q A2', '9000000302', 'Visit', 'clinic', today, 300, 'QA02', 'pending', pa, now() + interval '2 seconds')
  RETURNING id INTO a2;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id, created_at)
  VALUES (d, 'Q B1', '9000000303', 'Visit', 'clinic', today, 300, 'QB01', 'pending', pb, now() + interval '3 seconds')
  RETURNING id INTO b1;

  -- 1. With several doctors, "call next" must say whose line.
  r := public.queue_action('call_next');
  IF r->>'error' IS DISTINCT FROM 'PRACTITIONER_REQUIRED' THEN RAISE EXCEPTION 'call_next without doctor: %', r; END IF;

  -- 2. Each doctor has their own room, at the same time.
  r := public.queue_action('call_next', _practitioner_id => pb, _expect => 'none');
  IF r->>'serving' IS DISTINCT FROM b1::text THEN RAISE EXCEPTION 'B call_next: %', r; END IF;
  r := public.queue_action('call_next', _practitioner_id => pa, _expect => 'none');
  IF r->>'serving' IS DISTINCT FROM a1::text THEN RAISE EXCEPTION 'A call_next while B serving: %', r; END IF;

  -- 3. The stale-screen check is per doctor.
  r := public.queue_action('call_next', _practitioner_id => pb, _expect => 'none');
  IF r->>'error' IS DISTINCT FROM 'STALE' THEN RAISE EXCEPTION 'B stale check: %', r; END IF;

  -- 4. Transfer: end of the target doctor's line, logged.
  r := public.queue_action('transfer', a2, 'Dr A running late', _practitioner_id => pb);
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION 'transfer failed: %', r; END IF;
  SELECT * INTO rec FROM public.appointments WHERE id = a2;
  IF rec.practitioner_id <> pb OR rec.queue_number <> 2 OR rec.serving_started_at IS NOT NULL THEN
    RAISE EXCEPTION 'transferred row wrong: %', row_to_json(rec);
  END IF;
  -- The line is ordered by sort_time: the transferred patient joins it now (IST clock).
  IF rec.sort_time <> (now() AT TIME ZONE 'Asia/Kolkata')::time THEN
    RAISE EXCEPTION 'transferred row not at the end of the line: sort_time %', rec.sort_time;
  END IF;
  SELECT count(*) INTO n FROM public.queue_events WHERE appointment_id = a2 AND action = 'transfer';
  IF n <> 1 THEN RAISE EXCEPTION 'transfer not logged'; END IF;

  -- 5. Refusals.
  r := public.queue_action('transfer', a1, _practitioner_id => pb);
  IF r->>'error' IS DISTINCT FROM 'PRACTITIONER_IN_SERVICE' THEN RAISE EXCEPTION 'transfer of serving patient: %', r; END IF;
  r := public.queue_action('transfer', a2, _practitioner_id => pc);
  IF r->>'error' IS DISTINCT FROM 'PRACTITIONER_NOT_BOOKABLE' THEN RAISE EXCEPTION 'transfer to non-bookable: %', r; END IF;
  r := public.queue_action('transfer', a2, _practitioner_id => p_other);
  IF r->>'error' IS DISTINCT FROM 'PRACTITIONER_NOT_FOUND' THEN RAISE EXCEPTION 'transfer to other clinic: %', r; END IF;
  r := public.queue_action('transfer', a2);
  IF r->>'error' IS DISTINCT FROM 'PRACTITIONER_REQUIRED' THEN RAISE EXCEPTION 'transfer without target: %', r; END IF;

  -- 6. B's next call finishes B1 and calls the transferred patient.
  r := public.queue_action('call_next', _practitioner_id => pb, _expect => b1::text);
  IF r->>'serving' IS DISTINCT FROM a2::text OR r->>'completed' IS DISTINCT FROM b1::text THEN
    RAISE EXCEPTION 'B call_next after transfer: %', r;
  END IF;

  -- 7. Single-doctor clinic: unchanged behaviour without a practitioner argument.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d2, 'role', 'authenticated')::text, true);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status)
  VALUES (d2, 'Solo', '9000000311', 'Visit', 'clinic', today, 300, 'QS01', 'pending')
  RETURNING id INTO s1;
  r := public.queue_action('call_next', _expect => 'none');
  IF r->>'serving' IS DISTINCT FROM s1::text THEN RAISE EXCEPTION 'single-doctor call_next: %', r; END IF;

  -- 8. No function still locks a queue per clinic.
  SELECT count(*) INTO n
    FROM pg_proc pr JOIN pg_namespace ns ON ns.oid = pr.pronamespace
   WHERE ns.nspname = 'public' AND pr.prokind = 'f'
     AND pg_get_functiondef(pr.oid) ~ '''queue:'' \|\| v_doctor';
  IF n <> 0 THEN RAISE EXCEPTION 'queue still locked per clinic in % functions', n; END IF;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx supabase db query --linked -f supabase/tests/multi-doctor/04_queue_action.sql`
Expected: FAIL with `function public.queue_action(unknown, _practitioner_id => uuid, ...) does not exist`, or `call_next without doctor` (the old function calls the whole clinic's line).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261125100300_queue_action_practitioner.sql`:

```sql
-- Multi-doctor clinics, P0 part 4: the live-queue engine works per doctor.
-- The 6-argument queue_action gains _practitioner_id (7th, default NULL). Old and new
-- signatures cannot coexist (PostgREST overload ambiguity), so both functions are
-- dropped and recreated. Callers using named arguments are unaffected.
-- Body of queue_action_core is the 20261029140000 version; changes are marked "MD:".

DROP FUNCTION IF EXISTS public.queue_action(text, uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.queue_action_core(text, uuid, text, text, text);

CREATE FUNCTION public.queue_action_core(
  _action text,
  _appointment_id uuid,
  _reason text,
  _payment_method text,
  _expect text,
  _practitioner_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_doctor uuid;
  v_pract  uuid;                          -- MD: whose line this call acts on
  v_target public.practitioners%ROWTYPE;  -- MD: transfer target
  v_ids    uuid[];
  v_keep   boolean;
  v_today  date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  a        public.appointments%ROWTYPE;
  cur      public.appointments%ROWTYPE;
  nxt      public.appointments%ROWTYPE;
  v_have   boolean;
  v_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
    v_doctor := v_uid;
  ELSE
    v_doctor := public.staff_doctor_id(v_uid);
    IF v_doctor IS NULL OR NOT public.staff_has_permission(v_uid, 'appointments.edit') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
    END IF;
  END IF;

  IF _action NOT IN ('call_next', 'call', 'complete', 'skip', 'recall', 'no_show',
                     'set_priority', 'clear_priority', 'mark_paid', 'transfer') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'UNKNOWN_ACTION');
  END IF;

  -- MD: resolve the doctor's line.
  IF _action = 'call_next' THEN
    IF _practitioner_id IS NOT NULL THEN
      SELECT id INTO v_pract FROM public.practitioners WHERE id = _practitioner_id AND doctor_id = v_doctor;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'PRACTITIONER_NOT_FOUND');
      END IF;
    ELSE
      SELECT array_agg(id) INTO v_ids FROM public.practitioners WHERE doctor_id = v_doctor AND is_active;
      IF COALESCE(array_length(v_ids, 1), 0) <> 1 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'PRACTITIONER_REQUIRED');
      END IF;
      v_pract := v_ids[1];
    END IF;
  ELSE
    SELECT practitioner_id INTO v_pract FROM public.appointments
     WHERE id = _appointment_id AND doctor_id = v_doctor;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
    END IF;
  END IF;

  -- MD: one writer at a time per DOCTOR per day. A transfer changes two lines: lock both,
  -- always in uuid order, so two opposite transfers cannot deadlock.
  IF _action = 'transfer' THEN
    IF _practitioner_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PRACTITIONER_REQUIRED');
    END IF;
    SELECT * INTO v_target FROM public.practitioners WHERE id = _practitioner_id AND doctor_id = v_doctor;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PRACTITIONER_NOT_FOUND');
    END IF;
    IF NOT (v_target.is_active AND v_target.is_bookable) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PRACTITIONER_NOT_BOOKABLE');
    END IF;
    IF v_target.id = v_pract THEN
      RETURN jsonb_build_object('ok', true, 'practitioner_id', v_pract);
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('queue:' || LEAST(v_pract, v_target.id)::text || v_today::text));
    PERFORM pg_advisory_xact_lock(hashtext('queue:' || GREATEST(v_pract, v_target.id)::text || v_today::text));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext('queue:' || v_pract::text || v_today::text));
  END IF;
  -- Lets the guard trigger accept writes to the queue columns made by this function only.
  PERFORM set_config('app.queue_rpc', '1', true);

  -- ---- call_next: finish whoever is being seen, then call the next waiting patient ----
  IF _action = 'call_next' THEN
    SELECT * INTO cur FROM public.appointments
     WHERE doctor_id = v_doctor AND practitioner_id = v_pract AND date = v_today
       AND serving_started_at IS NOT NULL AND status IN ('pending', 'confirmed')
     FOR UPDATE;
    v_have := FOUND;
    IF _expect IS NOT NULL
       AND ((_expect = 'none' AND v_have) OR (_expect <> 'none' AND (NOT v_have OR cur.id::text <> _expect))) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'STALE');
    END IF;
    IF v_have THEN
      UPDATE public.appointments SET status = 'completed' WHERE id = cur.id;
      INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action) VALUES (v_doctor, cur.id, v_uid, 'complete');
    END IF;

    SELECT * INTO nxt FROM public.appointments
     WHERE doctor_id = v_doctor AND practitioner_id = v_pract AND date = v_today AND appointment_type = 'clinic'
       AND status IN ('pending', 'confirmed') AND skipped_at IS NULL AND serving_started_at IS NULL
     ORDER BY priority DESC, sort_time, created_at, id
     LIMIT 1
     FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', true, 'serving', NULL, 'completed', cur.id);
    END IF;
    UPDATE public.appointments SET serving_started_at = now() WHERE id = nxt.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action) VALUES (v_doctor, nxt.id, v_uid, 'call');
    RETURN jsonb_build_object('ok', true, 'serving', nxt.id, 'completed', cur.id);
  END IF;

  -- Everything below acts on one appointment of this clinic.
  SELECT * INTO a FROM public.appointments
   WHERE id = _appointment_id AND doctor_id = v_doctor
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;
  -- MD: moved to another doctor between our first read and the lock.
  IF a.practitioner_id <> v_pract THEN
    RETURN jsonb_build_object('ok', false, 'error', 'STALE');
  END IF;

  IF _action = 'call' THEN
    IF a.status NOT IN ('pending', 'confirmed') OR a.date <> v_today THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NOT_CALLABLE');
    END IF;
    IF a.serving_started_at IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'serving', a.id);
    END IF;
    SELECT * INTO cur FROM public.appointments
     WHERE doctor_id = v_doctor AND practitioner_id = v_pract AND date = v_today
       AND serving_started_at IS NOT NULL AND status IN ('pending', 'confirmed') AND id <> a.id
     FOR UPDATE;
    v_have := FOUND;
    IF _expect IS NOT NULL
       AND ((_expect = 'none' AND v_have) OR (_expect <> 'none' AND (NOT v_have OR cur.id::text <> _expect))) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'STALE');
    END IF;
    IF v_have THEN
      UPDATE public.appointments SET status = 'completed' WHERE id = cur.id;
      INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action) VALUES (v_doctor, cur.id, v_uid, 'complete');
    END IF;
    UPDATE public.appointments SET serving_started_at = now(), skipped_at = NULL WHERE id = a.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action, reason) VALUES (v_doctor, a.id, v_uid, 'call', v_reason);
    RETURN jsonb_build_object('ok', true, 'serving', a.id, 'completed', cur.id);

  -- MD: move a waiting patient to the end of another doctor's line today.
  ELSIF _action = 'transfer' THEN
    IF a.status NOT IN ('pending', 'confirmed') OR a.date <> v_today THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NOT_TRANSFERABLE');
    END IF;
    IF a.serving_started_at IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PRACTITIONER_IN_SERVICE');
    END IF;
    -- Keep the booked time only if it is still ahead and free with the new doctor;
    -- otherwise drop it (a late patient's 10:00 is in the past, and the line order comes
    -- from sort_time anyway, set below).
    v_keep := a.time_slot IS NOT NULL
      AND ((a.date::text || ' ' || a.time_slot)::timestamp AT TIME ZONE 'Asia/Kolkata') >= now()
      AND NOT EXISTS (SELECT 1 FROM public.appointments x
                       WHERE x.practitioner_id = v_target.id AND x.date = a.date AND x.time_slot = a.time_slot
                         AND x.appointment_type = a.appointment_type AND x.status <> 'cancelled');
    BEGIN
      UPDATE public.appointments
         SET practitioner_id = v_target.id,
             time_slot = CASE WHEN v_keep THEN time_slot ELSE NULL END,
             skipped_at = NULL
       WHERE id = a.id;
    EXCEPTION WHEN check_violation THEN
      IF SQLERRM = 'SLOT_FULL' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'SLOT_TAKEN');
      END IF;
      RAISE;
    END;
    -- MD: join the end of the line now. Separate statement because
    -- trg_set_appointment_sort_time (BEFORE UPDATE OF time_slot) recomputes sort_time from
    -- time_slot / created_at whenever time_slot is in the SET list; sort_time is an IST
    -- wall-clock time.
    UPDATE public.appointments
       SET sort_time = (now() AT TIME ZONE 'Asia/Kolkata')::time
     WHERE id = a.id
     RETURNING * INTO a;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action, reason)
    VALUES (v_doctor, a.id, v_uid, 'transfer', 'to ' || v_target.id::text || COALESCE(': ' || v_reason, ''));
    RETURN jsonb_build_object('ok', true, 'practitioner_id', v_target.id, 'queue_number', a.queue_number);

  ELSIF _action = 'complete' THEN
    IF a.status NOT IN ('pending', 'confirmed') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NOT_COMPLETABLE');
    END IF;
    UPDATE public.appointments
       SET status = 'completed', serving_started_at = COALESCE(serving_started_at, now())
     WHERE id = a.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action) VALUES (v_doctor, a.id, v_uid, 'complete');
    RETURN jsonb_build_object('ok', true);

  ELSIF _action = 'skip' THEN
    IF a.status NOT IN ('pending', 'confirmed') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NOT_SKIPPABLE');
    END IF;
    UPDATE public.appointments SET skipped_at = now(), serving_started_at = NULL WHERE id = a.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action, reason) VALUES (v_doctor, a.id, v_uid, 'skip', v_reason);
    RETURN jsonb_build_object('ok', true);

  ELSIF _action = 'recall' THEN
    IF a.skipped_at IS NULL THEN
      RETURN jsonb_build_object('ok', true);
    END IF;
    UPDATE public.appointments SET skipped_at = NULL WHERE id = a.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action, reason) VALUES (v_doctor, a.id, v_uid, 'recall', v_reason);
    RETURN jsonb_build_object('ok', true);

  ELSIF _action = 'no_show' THEN
    IF a.status NOT IN ('pending', 'confirmed') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NOT_MARKABLE');
    END IF;
    UPDATE public.appointments SET status = 'no_show', serving_started_at = NULL WHERE id = a.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action, reason) VALUES (v_doctor, a.id, v_uid, 'no_show', v_reason);
    RETURN jsonb_build_object('ok', true);

  ELSIF _action = 'set_priority' THEN
    IF v_reason IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'REASON_REQUIRED');
    END IF;
    IF a.status NOT IN ('pending', 'confirmed') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NOT_PRIORITISABLE');
    END IF;
    UPDATE public.appointments SET priority = 1, priority_reason = v_reason WHERE id = a.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action, reason) VALUES (v_doctor, a.id, v_uid, 'priority_on', v_reason);
    RETURN jsonb_build_object('ok', true);

  ELSIF _action = 'clear_priority' THEN
    UPDATE public.appointments SET priority = 0, priority_reason = NULL WHERE id = a.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action, reason) VALUES (v_doctor, a.id, v_uid, 'priority_off', v_reason);
    RETURN jsonb_build_object('ok', true);

  ELSIF _action = 'mark_paid' THEN
    IF _payment_method IS NULL OR _payment_method NOT IN ('cash', 'upi', 'card', 'other') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PAYMENT_METHOD_REQUIRED');
    END IF;
    IF a.payment_gateway IS NOT NULL OR a.payment_status::text IN ('paid', 'refunded') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ALREADY_SETTLED');
    END IF;
    UPDATE public.appointments
       SET payment_status = 'paid', payment_method = _payment_method, paid_at = now()
     WHERE id = a.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action, reason) VALUES (v_doctor, a.id, v_uid, 'mark_paid', _payment_method);
    RETURN jsonb_build_object('ok', true);
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'UNKNOWN_ACTION');
END;
$$;
REVOKE ALL ON FUNCTION public.queue_action_core(text, uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.queue_action(
  _action text,
  _appointment_id uuid DEFAULT NULL,
  _reason text DEFAULT NULL,
  _payment_method text DEFAULT NULL,
  _expect text DEFAULT NULL,
  _payment_reference text DEFAULT NULL,
  _practitioner_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ref text := upper(regexp_replace(COALESCE(_payment_reference, ''), '\s+', '', 'g'));
BEGIN
  IF _action = 'mark_paid' THEN
    IF _payment_method IN ('upi', 'card') THEN
      IF v_ref = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'PAYMENT_REFERENCE_REQUIRED');
      END IF;
      IF (_payment_method = 'upi'  AND v_ref !~ '^[0-9]{12}$')
      OR (_payment_method = 'card' AND v_ref !~ '^[A-Z0-9]{4,12}$') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'PAYMENT_REFERENCE_INVALID');
      END IF;
      PERFORM set_config('app.payment_reference', v_ref, true);
    ELSE
      PERFORM set_config('app.payment_reference', '', true);
    END IF;
  END IF;

  RETURN public.queue_action_core(_action, _appointment_id, _reason, _payment_method, _expect, _practitioner_id);
EXCEPTION
  WHEN unique_violation THEN
    IF SQLERRM LIKE '%appointments_upi_reference_unique%' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'DUPLICATE_PAYMENT_REFERENCE');
    END IF;
    RAISE;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.queue_action(text, uuid, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_action(text, uuid, text, text, text, text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 4: Apply and run the checks, then the full existing SQL regression**

Run: `npx supabase db push --linked`, then run each and expect `pass` (or the file's documented success output):

```bash
npx supabase db query --linked -f supabase/tests/multi-doctor/01_practitioners.sql
npx supabase db query --linked -f supabase/tests/multi-doctor/02_practitioner_columns.sql
npx supabase db query --linked -f supabase/tests/multi-doctor/03_slots_and_queue.sql
npx supabase db query --linked -f supabase/tests/multi-doctor/04_queue_action.sql
npx supabase db query --linked -f supabase/tests/appointments_queue.sql
npx supabase db query --linked -f supabase/tests/review_hardening.sql
npx supabase db query --linked -f supabase/tests/abuse_limits.sql
npx supabase db query --linked -f supabase/tests/patient_lifecycle.sql
npx supabase db query --linked -f supabase/tests/plan_flow.sql
npx supabase db query --linked -f supabase/tests/custom_plan_appointment_limit.sql
npx supabase db query --linked -f supabase/tests/custom_plan_integrity.sql
for f in supabase/tests/patient-import/*.sql; do npx supabase db query --linked -f "$f"; done
```

Any failure in the existing suites is a regression. Fix the migration, not the old test.

Note: `appointments_queue.sql` was fixed in `ea53a2c` (not a regression): its `mark_paid` checks now pass a UPI reference, which `trg_a1c_payment_reference` has required since `20261118100000`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261125100300_queue_action_practitioner.sql supabase/tests/multi-doctor/04_queue_action.sql
git commit -m "feat(db): per-doctor live queue and same-day transfer"
```

---

### Task 5: Regenerate types and verify the app is unchanged

**Files:**
- Regenerate: `src/integrations/supabase/types.ts`

**Interfaces:**
- Consumes: the live schema after Tasks 1–4.
- Produces: TypeScript types containing `practitioners` and the new columns and RPC args. No app code changes.

- [ ] **Step 1: Regenerate types**

Run: `npx supabase gen types typescript --linked --schema public > src/integrations/supabase/types.ts`
(or the Supabase MCP `generate_typescript_types`, which is how this file is normally produced).

Then run `git diff --stat src/integrations/supabase/types.ts`. Expected: additions only (the `practitioners` table, `practitioner_id` / `created_by` columns, new optional RPC args, new functions).

- [ ] **Step 2: Typecheck, lint and unit tests**

Run:

```bash
npx tsc --noEmit -p tsconfig.app.json
npm run lint
npm run test
```

Expected:
- `tsc` shows only the two known errors (`SADoctorDetail.tsx`, `NotFound.tsx`).
- lint shows no new errors.
- every Vitest suite passes.

In the regenerated file, `appointments.Insert.practitioner_id` must be **optional** (`practitioner_id?: string`), because Task 2 gave the column a default. If it shows as required, the default is missing: re-run `02_practitioner_columns.sql` (check 10). **Never hand-edit `types.ts`.**

- [ ] **Step 3: Smoke-test the real app (single-doctor clinic)**

Run `npm run dev` and, signed in as an existing doctor, do the following (use the `run` skill or Playwright):
- book a walk-in from Appointments
- open Live Queue and press "Call next" twice
- mark one visit paid
- open `/dr/<slug>` and check that slot availability loads
- open `/dr/<slug>/queue`
- open the manage-appointment page with a token

Expected: identical behaviour to before, and no console errors mentioning `PGRST202` or `PRACTITIONER_`.

- [ ] **Step 4: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "chore(types): regenerate Supabase types for practitioners"
```

---

### Task 6: Document the new rules and hand off

**Files:**
- Modify: `CLAUDE.md` (add a section under "Appointments, patients and the live queue")
- Modify: `docs/superpowers/specs/2026-11-25-multi-doctor-clinic-design.md` (mark P0 done)

- [ ] **Step 1: Add to CLAUDE.md**, directly after the "Overdue appointments are closed nightly…" bullet:

```markdown
### Multi-doctor clinics (practitioners)

Spec: `docs/superpowers/specs/2026-11-25-multi-doctor-clinic-design.md`.
- **Tenant and doctors:** `doctor_id` is still the clinic tenant everywhere. `practitioners` are the doctors who see patients there; each clinic has exactly one `is_primary` (the owner by default, created by `ensure_primary_practitioner`).
- **Which rows carry `practitioner_id`:** `appointments`, `working_hours`, `prescriptions`, `patient_visits` (NOT NULL) and `patient_documents` (nullable). Patients, medical history, invoices and services stay clinic-level.
- **`trg_a00_fill_practitioner`:** fills a missing value only when it is unambiguous (single doctor, or the caller / visit / appointment says who). Otherwise it raises `PRACTITIONER_REQUIRED`. **New code for multi-doctor flows must always send `practitioner_id`.** Composite FKs `(practitioner_id, doctor_id)` keep it inside the clinic.
- **Per-doctor scope:** slots, queue numbers, "in the room", `queue_action` locks, `get_slot_counts` / `get_public_queue` and `get_my_queue_status` are per practitioner. Any slot lock must use `slot_lock_key()`.
- **RPC defaults and same-day moves:** a NULL `_practitioner_id` means the primary. A same-day change of doctor must go through `queue_action('transfer')` (`USE_QUEUE_TRANSFER`).
- **Checks:** run `supabase/tests/multi-doctor/*.sql`.
```

- [ ] **Step 2: Mark P0 done in the spec**

In the spec's §11 table, change the P0 row's last cell from `No` to `No (done 2026-11-25)`.

- [ ] **Step 3: Commit, then open a PR**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-11-25-multi-doctor-clinic-design.md
git commit -m "docs: document the practitioner layer"
```

Open a PR from `feat/multi-doctor-p0` to `main`. Merge only after a reviewer confirms that Task 4 Step 4 and Task 5 Steps 2–3 passed.

**Rollback (if P0 must be undone after release):** the safe direction is forward. Re-applying the previous function bodies restores per-clinic behaviour, and the new columns and table can stay because nothing reads them. The previous bodies are in:
- `20261029140000_review_hardening.sql`: slot triggers and the queue_action body
- `20261029100000_appointments_hardening_and_patient_sync.sql`: queue numbering
- `20261124100000`, `20261120110000`, `20261029150000` and `20261102100000`: the RPCs
- `20261118100000`: the queue_action wrapper

Restore the old unique indexes on `(doctor_id, date, …)` at the same time.

---

## Later phases (each gets its own detailed plan when started)

**Release rule:** P1 and P2 go to production **together**, behind `platform_settings.multi_doctor_enabled` plus a per-clinic superadmin override. Until the public booking widget sends `practitioner_id` (P2), a second bookable doctor would make every public booking fail with `PRACTITIONER_REQUIRED`. Until `verify-razorpay-payment` carries it (P2), paid bookings would fail too. P0 is the only phase that ships on its own.

### P1 — Admin (planned next)

1. **Seat limits:** `clinic_doctor_seat_limit()`, `profiles.extra_doctor_seats`, `doctor_custom_plans.doctor_seats`, the `platform_settings` keys `doctor_seat_price` / `doctor_seat_max` / `multi_doctor_enabled`, and a `SEAT_LIMIT` check in the practitioners trigger and in `fill_practitioner('booking')`.
2. **Practitioner write paths:** RPCs `create_practitioner`, `update_practitioner`, `set_primary_practitioner`, `deactivate_practitioner` (blocked while future live appointments exist) and `reassign_practitioner_appointments`; slug generation with suffixes. Writes stay RPC-only; no client INSERT/UPDATE policies.
3. **Doctor role:** `staff_members.role` and `staff_members.practitioner_id`; the `create-staff-account` edge function accepts role `doctor` and refuses a phone that already owns a clinic; `useProfile()` exposes `role` / `practitionerId` / `practitioners`; `resolveDestination.ts` routing; new permission keys in both `staffPermissions.ts` files plus a parity test.
4. **Clinical visibility:** the `website_settings.clinical_visibility` setting, `can_view_clinical(patient_id)`, RLS on prescriptions, patient_visits and patient_documents, `clinical_access_log`, and prescription edits limited to the author or owner.
5. **Doctors page** (`/admin/doctors`): working hours per doctor (drop the old `UNIQUE (doctor_id, day_of_week)` after MyWebsite is migrated), and owner fields moving from Profile onto the owner's practitioner (retire `sync_owner_practitioner`).
6. **Appointments / Live Queue UI:** doctor filter and colours, doctor picker, queue tabs, a transfer button, and realtime filters per practitioner. Prescriptions: an author picker for staff, and the slip and `/rx/:token` printing the author.
7. **Superadmin:** practitioner count and seats on doctor detail, plus a manual seat override.
8. **Insert-path test** (Vitest): grep every `appointments` / `prescriptions` insert in `src/` and `supabase/functions/` and fail if a multi-doctor path omits `practitioner_id`.

### P2 — Public site and payments (ships with P1)

1. `get_public_practitioners(_doctor_id)` (safe columns plus next slot; add it to the anon-RPC allow-list if the schema audit test exists).
2. A choose-doctor step in `BookingWidget`; `useSlotAvailability` / `nextAvailable` pass `_practitioner_id`; and `service_practitioners`.
3. `create-razorpay-order` puts `practitioner_id` in the order notes and prices it via `public_booking_price`; `verify-razorpay-payment` inserts with it and refuses when it is missing on a multi-doctor clinic. Also update `get_appointment_by_token` and the manage page to show the doctor.
4. Doctor sub-pages `/dr/:slug/doctor/:doctorSlug`: a `vercel.json` rewrite, `kind=practitioner` in `api/seo.ts` / `src/lib/seo/` (relative imports), Physician + `worksFor` MedicalClinic JSON-LD, `practitioner_slug_history` 301s, the sitemap, and a byte-identical single-doctor snapshot test.
5. `search_doctors` returning one row per listed practitioner; `blog_posts.author_practitioner_id`; `reviews.practitioner_id`.
6. A multi-doctor `/dr/:slug/queue` screen.

### P3 — Money

1. Seat purchase in `create-plan-upgrade-order` (prorated to `plan_end`; removals take effect at renewal).
2. Per-doctor revenue, visits, no-shows and payment mix in Billing and the Dashboard, plus `billing.own_only`.
