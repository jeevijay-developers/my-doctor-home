# Patient Import Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Commits:** this repository's owner only wants commits when they ask. Treat every "Commit" step as "stage and show the diff"; run `git commit` only if the user has asked for commits in this session.

**Goal:** Make patient CSV import a Pro/Premium-only feature with database-enforced size limits, plus a request-and-approval path for clinics that need a higher limit.

**Architecture:** One `import_patients(rows jsonb, file_name text)` Postgres function is the only bulk path. It resolves the clinic from `auth.uid()`, checks plan eligibility, daily limits and the per-tier cap inside one transaction, and inserts. A trigger on `patients` rate-limits direct (non-import) inserts so the API cannot be looped. The browser calls the function once, reads an access summary from `get_patient_import_access()`, and a request/approve flow (`patient_import_requests`) raises a clinic's cap. Superadmin can also allow or block a clinic through `patient_import_overrides`.

**Tech Stack:** Supabase Postgres (SECURITY DEFINER functions, RLS), React 18 + TypeScript, Vitest + Testing Library, Supabase CLI (`npx supabase db push`, `npx supabase db query --linked -f`).

**Spec:** `docs/superpowers/specs/2026-11-23-patient-import-limits-design.md`

## As-built notes (read before trusting the code blocks below)

The tasks were executed by separate agents that ran the SQL and tests for real; the code on disk is authoritative and differs from the blocks below in these ways:

- `import_patients` validates JSON types strictly, uses strict `YYYY-MM-DD` dates, set-based validation/dedupe, `v_`-prefixed variables, and raises `NOT_ALLOWED` with ERRCODE 42501.
- Eligibility also requires `plan_end IS NULL OR plan_end > now()`. `platform_int_setting` falls back to the default on a non-numeric setting. Read policies for staff on the import log/requests require `patients.add`.
- Request/review/override functions trim with a whitespace regex (not `btrim`), refuse NULL decisions/modes, cap notes at 1000 characters, and **refuse to approve a clinic that is not currently eligible**. `get_doctor_import_access` also returns `plan_tier`, `plan_status`, `plan_end` and `reason`.
- Client: `importPatients` also returns `rejectedCount` (the server lists at most 100 rejected rows but counts them all), handles a thrown send, and an empty file never calls the server. The hook ignores out-of-order responses and clears state when disabled.
- A fourth migration, `20261123130000_patient_import_hardening.sql`, was added after independent database, security and client reviews: no depth exemption for signed-in users (booking-trigger inserts count against `patient_clinic_booking_inserts_per_day` = 1500), a daily direct-insert limit (`patient_direct_insert_per_day` = 300) and a total ceiling (`PATIENT_TOTAL_LIMIT`), clinic resolved from the caller inside the guard, no self-review by a superadmin, only the file extension stored, and nested payload checks. Check script `04_hardening.sql` covers it.
- Known and accepted: anyone with `flags.manage` can edit `platform_settings`; a booking can lose a race with an in-flight import on the same phone+name once; failed import calls are not logged; `get_doctor_import_access` allows `doctors.view` or `plan_requests.view`.
- `staff_members.phone` is NOT NULL in test fixtures; the SQL checks use helper functions that set and clear JWT claims.

## Global Constraints

- Eligible = paid Pro or Premium plan with `plan_status = 'active'` (`plan_tier IN ('pro','premium')`); free, trial, expired and cancelled are not eligible. An unexpired row in `patient_import_overrides` (`allowed` / `blocked`) wins over the plan rule.
- Defaults in `platform_settings`: `patient_import_cap_pro` = 2000, `patient_import_cap_premium` = 10000, `patient_import_max_rows` = 1000, `patient_import_max_per_day` = 5, `patient_import_max_rows_per_day` = 2000, `patient_import_cap_ceiling` = 100000, `patient_direct_insert_per_hour` = 100. Wait after a declined request: 7 days.
- The cap is judged only when an import runs (current patients + new rows must be <= cap). Bookings and single manual adds never count against it.
- The clinic is always taken from `auth.uid()` (the doctor, or active staff with `patients.add`), never from the payload.
- `import_patients` is all-or-nothing, rejects bad rows into a `rejected` list, skips duplicates (same key as `uq_patients_doctor_phone_name`: `doctor_id, phone, lower(btrim(name))`), and does not count duplicates toward the cap.
- The direct-insert guard must not affect: inserts from another trigger (`pg_trigger_depth() > 1`), inserts from `import_patients` (flag `app.patient_import = 'on'`), or inserts with no JWT (`auth.uid() IS NULL`: service role, cron, migrations).
- New superadmin screens reuse the existing `plan_requests.view` / `plan_requests.manage` permissions. No new permission keys.
- Notifications to doctors reuse `notifications.source_type = 'plan_request'` (already allowed by the check constraint).
- The audit table is `admin_audit_log (admin_user_id, action, target_table, target_id, details)`.
- `src/integrations/supabase/types.ts` is generated; RPCs and new tables are called with `as any` casts, as `SAPlanRequests.tsx` already does. Do not hand-edit `types.ts`.
- In tests, `createTableMock` treats an object result containing an `error` key as a raw `{data, error}` pair. Mock RPC results that carry an `error` field as `{ data: { ok: false, error: "CAP_EXCEEDED", ... }, error: null }`.
- Type-check with `npx tsc --noEmit -p tsconfig.app.json` (old errors only in `SADoctorDetail.tsx`, `NotFound.tsx`, `useCustomPlan.test.tsx`).
- Upgrade link for clinics: `/admin/settings?tab=subscription`.

## File Structure

Create:
- `supabase/migrations/20261123100000_patient_import_limits_core.sql`: settings, tables, RLS, eligibility, cap, clinic resolver, access summary.
- `supabase/migrations/20261123110000_import_patients.sql`: row validator, `import_patients`, direct-insert guard.
- `supabase/migrations/20261123120000_patient_import_requests_and_overrides.sql`: request, review, override and superadmin-access functions (Phase 2).
- `supabase/tests/patient-import/01_access.sql`, `02_import.sql`, `03_requests.sql`: rolled-back SQL checks run with `supabase db query --linked -f`.
- `src/lib/patientImportApi.ts` (+ `.test.ts`): access type, error-code messages.
- `src/hooks/usePatientImportAccess.ts` (+ `.test.tsx`).
- `src/components/admin/ImportLimitRequestForm.tsx` (+ `.test.tsx`).
- `src/components/superadmin/SAImportRequests.tsx` (+ `.test.tsx`).
- `src/components/superadmin/SAImportAccessCard.tsx` (+ `.test.tsx`).

Modify:
- `src/lib/patientImport.ts` and `patientImport.test.ts`: single-call import, new result type.
- `src/components/admin/PatientImportDialog.tsx` and `.test.tsx`: access states, remaining line, over-limit state, request form.
- `src/components/superadmin/SAPlanRequests.tsx`: one extra tab.
- `src/components/superadmin/SADoctorDetail.tsx`: mount `SAImportAccessCard`.
- `CLAUDE.md`: patient import bullet.

Not touched: `patientCsv.ts` (parsing and validation stay as they are), `patients` RLS policies.

---

# Phase 1: database limits and the plan gate

### Task 1: Core migration (settings, tables, eligibility, cap, access summary)

**Files:**
- Create: `supabase/migrations/20261123100000_patient_import_limits_core.sql`
- Create: `supabase/tests/patient-import/01_access.sql`

**Interfaces:**
- Produces (SQL): `platform_int_setting(text, integer) -> integer`; `patient_import_eligible(uuid) -> boolean`; `patient_import_cap(uuid) -> integer`; `patient_import_clinic() -> uuid` (null when the caller may not import); `get_patient_import_access() -> jsonb` with keys `eligible`, `reason` (`ok|plan|blocked|no_permission`), `cap`, `patient_count`, `remaining`, `imports_today`, `rows_today`, `max_rows`, `max_per_day`, `max_rows_per_day`, `pending_request` (boolean), `cooldown_until` (timestamp or null). Tables `patient_import_overrides`, `patient_imports`, `patient_import_requests`, `patient_insert_counters`.

- [ ] **Step 1: Write the failing SQL check**

Create `supabase/tests/patient-import/01_access.sql`:

```sql
BEGIN;
DO $$
DECLARE
  d_pro uuid := gen_random_uuid();
  d_free uuid := gen_random_uuid();
  d_trial uuid := gen_random_uuid();
  d_prem uuid := gen_random_uuid();
  a jsonb;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{}'::jsonb
  FROM unnest(ARRAY[d_pro, d_free, d_trial, d_prem]) AS u;
  EXECUTE format('UPDATE public.profiles SET plan_tier=%L, plan_status=%L WHERE id=%L', 'pro', 'active', d_pro);
  EXECUTE format('UPDATE public.profiles SET plan_tier=%L, plan_status=%L WHERE id=%L', 'free', 'active', d_free);
  EXECUTE format('UPDATE public.profiles SET plan_tier=%L, plan_status=%L WHERE id=%L', 'free', 'trial', d_trial);
  EXECUTE format('UPDATE public.profiles SET plan_tier=%L, plan_status=%L WHERE id=%L', 'premium', 'active', d_prem);

  -- eligibility by plan
  IF NOT public.patient_import_eligible(d_pro) THEN RAISE EXCEPTION 'pro/active should be eligible'; END IF;
  IF NOT public.patient_import_eligible(d_prem) THEN RAISE EXCEPTION 'premium/active should be eligible'; END IF;
  IF public.patient_import_eligible(d_free) THEN RAISE EXCEPTION 'free must not be eligible'; END IF;
  IF public.patient_import_eligible(d_trial) THEN RAISE EXCEPTION 'trial must not be eligible'; END IF;
  EXECUTE format('UPDATE public.profiles SET plan_status=%L WHERE id=%L', 'expired', d_pro);
  IF public.patient_import_eligible(d_pro) THEN RAISE EXCEPTION 'expired pro must not be eligible'; END IF;
  EXECUTE format('UPDATE public.profiles SET plan_status=%L WHERE id=%L', 'active', d_pro);

  -- overrides: blocked beats premium, allowed beats free, an ended override falls back to the plan
  INSERT INTO public.patient_import_overrides (doctor_id, mode, reason, set_by) VALUES (d_prem, 'blocked', 'abuse', d_prem);
  IF public.patient_import_eligible(d_prem) THEN RAISE EXCEPTION 'blocked premium must not be eligible'; END IF;
  INSERT INTO public.patient_import_overrides (doctor_id, mode, reason, set_by) VALUES (d_free, 'allowed', 'support', d_free);
  IF NOT public.patient_import_eligible(d_free) THEN RAISE EXCEPTION 'allowed free should be eligible'; END IF;
  UPDATE public.patient_import_overrides SET until = now() - interval '1 day' WHERE doctor_id = d_free;
  IF public.patient_import_eligible(d_free) THEN RAISE EXCEPTION 'ended override must fall back to the plan'; END IF;
  DELETE FROM public.patient_import_overrides WHERE doctor_id = d_prem;

  -- caps
  IF public.patient_import_cap(d_pro) <> 2000 THEN RAISE EXCEPTION 'pro cap should be 2000'; END IF;
  IF public.patient_import_cap(d_prem) <> 10000 THEN RAISE EXCEPTION 'premium cap should be 10000'; END IF;
  INSERT INTO public.patient_import_requests (doctor_id, requested_cap, status, approved_cap, decided_at)
  VALUES (d_pro, 5000, 'approved', 5000, now());
  IF public.patient_import_cap(d_pro) <> 5000 THEN RAISE EXCEPTION 'approved cap should raise the cap'; END IF;

  -- the access summary, read as the doctor
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d_pro, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', d_pro::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  a := public.get_patient_import_access();
  EXECUTE 'RESET ROLE';
  IF (a->>'eligible')::boolean IS NOT TRUE OR a->>'reason' <> 'ok' OR (a->>'cap')::int <> 5000
     OR (a->>'patient_count')::int <> 0 OR (a->>'remaining')::int <> 5000 THEN
    RAISE EXCEPTION 'unexpected access summary for pro: %', a;
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', d_trial, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', d_trial::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  a := public.get_patient_import_access();
  EXECUTE 'RESET ROLE';
  IF (a->>'eligible')::boolean IS NOT FALSE OR a->>'reason' <> 'plan' THEN
    RAISE EXCEPTION 'trial should be reason=plan, got %', a;
  END IF;

  -- anonymous callers cannot reach it
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM public.get_patient_import_access();
    RAISE EXCEPTION 'anon must not execute get_patient_import_access';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  EXECUTE 'RESET ROLE';
END $$;
SELECT 'pass' AS result;
ROLLBACK;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx supabase db query --linked -f supabase/tests/patient-import/01_access.sql`
Expected: an error mentioning `patient_import_eligible` (or `patient_import_overrides`) does not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261123100000_patient_import_limits_core.sql`:

```sql
-- Patient import limits, part 1: settings, tables, eligibility, cap and the access summary.
-- Enforcement of the limits is in import_patients (next migration). Nothing here changes who
-- can read or write `patients`.

-- ---------------------------------------------------------------------------
-- Settings (editable without a deploy)
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_settings (key, value) VALUES
  ('patient_import_cap_pro', '2000'::jsonb),
  ('patient_import_cap_premium', '10000'::jsonb),
  ('patient_import_max_rows', '1000'::jsonb),
  ('patient_import_max_per_day', '5'::jsonb),
  ('patient_import_max_rows_per_day', '2000'::jsonb),
  ('patient_import_cap_ceiling', '100000'::jsonb),
  ('patient_direct_insert_per_hour', '100'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.platform_int_setting(_key text, _default integer)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT (value #>> '{}')::integer FROM public.platform_settings WHERE key = _key), _default)
$$;
REVOKE ALL ON FUNCTION public.platform_int_setting(text, integer) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
-- Superadmin allow/block for one clinic. Separate from `features` (which also feeds the
-- public feature flags) and from `profiles` (which the doctor can edit).
CREATE TABLE public.patient_import_overrides (
  doctor_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  mode      text NOT NULL CHECK (mode IN ('allowed', 'blocked')),
  until     timestamptz,
  reason    text NOT NULL,
  set_by    uuid NOT NULL,
  set_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.patient_import_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.patient_import_overrides FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.patient_import_overrides TO authenticated;
CREATE POLICY "Superadmin reads import overrides" ON public.patient_import_overrides
  FOR SELECT TO authenticated USING (public.sa_has_permission(auth.uid(), 'plan_requests.view'));

-- One row per import call: counts only, never patient data.
CREATE TABLE public.patient_imports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,
  file_name     text,
  rows_received integer NOT NULL,
  rows_inserted integer NOT NULL,
  rows_duplicate integer NOT NULL,
  rows_rejected integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_patient_imports_doctor ON public.patient_imports (doctor_id, created_at DESC);
ALTER TABLE public.patient_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.patient_imports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.patient_imports TO authenticated;
CREATE POLICY "Clinic reads own import log" ON public.patient_imports
  FOR SELECT TO authenticated USING (doctor_id = auth.uid() OR public.staff_doctor_id(auth.uid()) = doctor_id);
CREATE POLICY "Superadmin reads import log" ON public.patient_imports
  FOR SELECT TO authenticated USING (public.sa_has_permission(auth.uid(), 'plan_requests.view'));

CREATE TABLE public.patient_import_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_cap  integer NOT NULL CHECK (requested_cap > 0),
  doctor_note    text,
  -- Snapshots taken when the request is made, so the reviewer sees the situation then.
  patient_count  integer NOT NULL DEFAULT 0,
  cap_at_request integer NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_cap   integer CHECK (approved_cap IS NULL OR approved_cap > 0),
  reviewer_id    uuid,
  reviewer_note  text,
  decided_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_patient_import_requests_one_pending ON public.patient_import_requests (doctor_id) WHERE status = 'pending';
CREATE INDEX idx_patient_import_requests_doctor ON public.patient_import_requests (doctor_id, created_at DESC);
CREATE INDEX idx_patient_import_requests_status ON public.patient_import_requests (status, created_at DESC);
ALTER TABLE public.patient_import_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.patient_import_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.patient_import_requests TO authenticated;
CREATE POLICY "Clinic reads own import requests" ON public.patient_import_requests
  FOR SELECT TO authenticated USING (doctor_id = auth.uid() OR public.staff_doctor_id(auth.uid()) = doctor_id);
CREATE POLICY "Superadmin reads import requests" ON public.patient_import_requests
  FOR SELECT TO authenticated USING (public.sa_has_permission(auth.uid(), 'plan_requests.view'));

-- Hourly counter for the direct-insert guard. No client access at all.
CREATE TABLE public.patient_insert_counters (
  doctor_id    uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  n            integer NOT NULL
);
ALTER TABLE public.patient_insert_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.patient_insert_counters FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Eligibility, cap and clinic resolution
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.patient_import_eligible(_doctor_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.patient_import_overrides%ROWTYPE;
  p public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.patient_import_overrides
   WHERE doctor_id = _doctor_id AND (until IS NULL OR until > now());
  IF FOUND THEN RETURN o.mode = 'allowed'; END IF;

  SELECT * INTO p FROM public.profiles WHERE id = _doctor_id;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN p.plan_tier::text IN ('pro', 'premium') AND p.plan_status::text = 'active';
END;
$$;
REVOKE ALL ON FUNCTION public.patient_import_eligible(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.patient_import_cap(_doctor_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tier text;
  base integer;
  approved integer;
BEGIN
  SELECT plan_tier::text INTO tier FROM public.profiles WHERE id = _doctor_id;
  base := CASE WHEN tier = 'premium'
               THEN public.platform_int_setting('patient_import_cap_premium', 10000)
               ELSE public.platform_int_setting('patient_import_cap_pro', 2000) END;
  SELECT approved_cap INTO approved FROM public.patient_import_requests
   WHERE doctor_id = _doctor_id AND status = 'approved'
   ORDER BY decided_at DESC NULLS LAST LIMIT 1;
  RETURN GREATEST(base, COALESCE(approved, 0));
END;
$$;
REVOKE ALL ON FUNCTION public.patient_import_cap(uuid) FROM PUBLIC, anon, authenticated;

-- The clinic the caller imports for: themself if they have a profile, or the doctor of an
-- active staff member who holds patients.add. NULL otherwise. Never read from client input.
CREATE OR REPLACE FUNCTION public.patient_import_clinic()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  d uuid;
BEGIN
  IF uid IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = uid) THEN RETURN uid; END IF;
  d := public.staff_doctor_id(uid);
  IF d IS NOT NULL AND public.staff_has_permission(uid, 'patients.add') THEN RETURN d; END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.patient_import_clinic() FROM PUBLIC, anon, authenticated;

-- What the Import dialog shows. Not an enforcement point: import_patients decides again.
CREATE OR REPLACE FUNCTION public.get_patient_import_access()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clinic uuid := public.patient_import_clinic();
  elig boolean;
  blocked boolean;
  v_cap integer;
  v_count integer;
  v_imports integer;
  v_rows integer;
  v_cooldown timestamptz;
BEGIN
  IF clinic IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'no_permission');
  END IF;

  elig := public.patient_import_eligible(clinic);
  blocked := EXISTS (SELECT 1 FROM public.patient_import_overrides
                      WHERE doctor_id = clinic AND mode = 'blocked' AND (until IS NULL OR until > now()));
  v_cap := public.patient_import_cap(clinic);
  SELECT count(*) INTO v_count FROM public.patients WHERE doctor_id = clinic;
  SELECT count(*), COALESCE(sum(rows_inserted), 0) INTO v_imports, v_rows
    FROM public.patient_imports WHERE doctor_id = clinic AND created_at > now() - interval '24 hours';
  SELECT max(decided_at) + interval '7 days' INTO v_cooldown
    FROM public.patient_import_requests WHERE doctor_id = clinic AND status = 'rejected';
  IF v_cooldown IS NOT NULL AND v_cooldown <= now() THEN v_cooldown := NULL; END IF;

  RETURN jsonb_build_object(
    'eligible', elig,
    'reason', CASE WHEN elig THEN 'ok' WHEN blocked THEN 'blocked' ELSE 'plan' END,
    'cap', v_cap,
    'patient_count', v_count,
    'remaining', GREATEST(v_cap - v_count, 0),
    'imports_today', v_imports,
    'rows_today', v_rows,
    'max_rows', public.platform_int_setting('patient_import_max_rows', 1000),
    'max_per_day', public.platform_int_setting('patient_import_max_per_day', 5),
    'max_rows_per_day', public.platform_int_setting('patient_import_max_rows_per_day', 2000),
    'pending_request', EXISTS (SELECT 1 FROM public.patient_import_requests WHERE doctor_id = clinic AND status = 'pending'),
    'cooldown_until', v_cooldown
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_patient_import_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_patient_import_access() TO authenticated;
```

- [ ] **Step 4: Apply and re-run the check**

Run: `npx supabase db push --yes` then `npx supabase db query --linked -f supabase/tests/patient-import/01_access.sql`
Expected: the push reports the migration applied; the check returns one row `pass`. If `INSERT INTO auth.users` is refused for a missing NOT NULL column, add that column to the test's insert and re-run. If a plan-change trigger blocks the profile `UPDATE`, run the updates as postgres (they already are) and read the trigger's message.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261123100000_patient_import_limits_core.sql supabase/tests/patient-import/01_access.sql
git commit -m "feat: patient import limits core (eligibility, cap, access summary)"
```

---

### Task 2: `import_patients` and the direct-insert guard

**Files:**
- Create: `supabase/migrations/20261123110000_import_patients.sql`
- Create: `supabase/tests/patient-import/02_import.sql`

**Interfaces:**
- Consumes: everything produced by Task 1.
- Produces: `import_patients(_rows jsonb, _file_name text default null) -> jsonb`. Success: `{ok:true, inserted, duplicates, rejected:[{index, error}], rejected_count}` (`index` is 1-based position in `_rows`; `rejected` holds at most the first 100). Failure (returned, not raised): `{ok:false, error:'NOT_ELIGIBLE'}`, `{ok:false, error:'PAYLOAD_INVALID', max_rows}`, `{ok:false, error:'DAILY_LIMIT', imports_today, rows_today, max_per_day, max_rows_per_day}`, `{ok:false, error:'CAP_EXCEEDED', cap, current, incoming}`. A caller with no right to import gets a raised `NOT_ALLOWED`. Row error codes: `ROW_INVALID, NAME, PHONE, AGE, GENDER, WEIGHT, EMAIL, NOTES, DATE, DATE_ORDER, VISITS`. A direct insert over the hourly limit raises `PATIENT_RATE_LIMIT`.

- [ ] **Step 1: Write the failing SQL check**

Create `supabase/tests/patient-import/02_import.sql`:

```sql
BEGIN;
DO $$
DECLARE
  d_pro uuid := gen_random_uuid();
  d_trial uuid := gen_random_uuid();
  s_ok uuid := gen_random_uuid();
  s_no uuid := gen_random_uuid();
  r jsonb;
  n integer;
  three jsonb := jsonb_build_array(
    jsonb_build_object('name', 'Test One',   'phone', '9000000001', 'age', 30, 'gender', 'male'),
    jsonb_build_object('name', 'Test Two',   'phone', '9000000002', 'age', 31, 'gender', 'female', 'patient_since', '2019-03-15', 'first_visit', '2019-03-15', 'last_visit', '2025-09-02', 'total_visits', 14),
    jsonb_build_object('name', 'Test Three', 'phone', '9000000003', 'age', 0,  'gender', 'other', 'weight', 6.8));
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{}'::jsonb FROM unnest(ARRAY[d_pro, d_trial]) AS u;
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"account_type":"staff"}'::jsonb FROM unnest(ARRAY[s_ok, s_no]) AS u;
  EXECUTE format('UPDATE public.profiles SET plan_tier=%L, plan_status=%L WHERE id=%L', 'pro', 'active', d_pro);
  EXECUTE format('UPDATE public.profiles SET plan_tier=%L, plan_status=%L WHERE id=%L', 'free', 'trial', d_trial);
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, permissions, created_by)
  VALUES (s_ok, d_pro, 'Staff Ok', 'ok-' || s_ok, '{"patients.add": true}'::jsonb, d_pro),
         (s_no, d_pro, 'Staff No', 'no-' || s_no, '{"patients.view": true}'::jsonb, d_pro);

  -- a trial clinic is refused
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d_trial, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', d_trial::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r := public.import_patients(three, 'x.csv');
  EXECUTE 'RESET ROLE';
  IF r->>'error' <> 'NOT_ELIGIBLE' THEN RAISE EXCEPTION 'trial should get NOT_ELIGIBLE, got %', r; END IF;

  -- a Pro clinic imports three patients
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d_pro, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', d_pro::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r := public.import_patients(three, 'demo.csv');
  EXECUTE 'RESET ROLE';
  IF (r->>'ok')::boolean IS NOT TRUE OR (r->>'inserted')::int <> 3 OR (r->>'duplicates')::int <> 0 THEN
    RAISE EXCEPTION 'expected 3 inserted, got %', r;
  END IF;
  SELECT count(*) INTO n FROM public.patients WHERE doctor_id = d_pro AND NOT auto_created;
  IF n <> 3 THEN RAISE EXCEPTION 'expected 3 patient rows, found %', n; END IF;
  SELECT count(*) INTO n FROM public.patients WHERE doctor_id = d_pro AND name = 'Test Two'
     AND patient_since = DATE '2019-03-15' AND last_visit = DATE '2025-09-02' AND total_visits = 14;
  IF n <> 1 THEN RAISE EXCEPTION 'history columns were not stored'; END IF;
  SELECT count(*) INTO n FROM public.patient_imports WHERE doctor_id = d_pro AND rows_inserted = 3 AND file_name = 'demo.csv';
  IF n <> 1 THEN RAISE EXCEPTION 'import log row missing'; END IF;

  -- the same file again: everything is a duplicate, nothing new
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d_pro, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', d_pro::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r := public.import_patients(three, 'demo.csv');
  EXECUTE 'RESET ROLE';
  IF (r->>'inserted')::int <> 0 OR (r->>'duplicates')::int <> 3 THEN RAISE EXCEPTION 'expected 3 duplicates, got %', r; END IF;

  -- bad rows are rejected with their position; a repeat inside the file is a duplicate
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d_pro, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', d_pro::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r := public.import_patients(jsonb_build_array(
    jsonb_build_object('name', 'Good Four', 'phone', '9000000004', 'age', 40, 'gender', 'male'),
    jsonb_build_object('name', 'Bad Phone', 'phone', '12345', 'age', 40, 'gender', 'male'),
    jsonb_build_object('name', 'Future', 'phone', '9000000005', 'age', 40, 'gender', 'male', 'first_visit', '2999-01-01'),
    jsonb_build_object('name', 'Backwards', 'phone', '9000000006', 'age', 40, 'gender', 'male', 'first_visit', '2022-05-10', 'last_visit', '2022-05-01'),
    jsonb_build_object('name', 'good four', 'phone', '9000000004', 'age', 40, 'gender', 'male')), 'mix.csv');
  EXECUTE 'RESET ROLE';
  IF (r->>'inserted')::int <> 1 OR (r->>'duplicates')::int <> 1 OR (r->>'rejected_count')::int <> 3 THEN
    RAISE EXCEPTION 'unexpected mixed result: %', r;
  END IF;
  IF NOT (r->'rejected' @> '[{"index":2,"error":"PHONE"},{"index":3,"error":"DATE"},{"index":4,"error":"DATE_ORDER"}]'::jsonb) THEN
    RAISE EXCEPTION 'rejected list wrong: %', r->'rejected';
  END IF;

  -- more rows than allowed in one import
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d_pro, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', d_pro::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r := public.import_patients((SELECT jsonb_agg(jsonb_build_object('name', 'Bulk ' || g, 'phone', '8' || lpad(g::text, 9, '0'), 'age', 30, 'gender', 'male')) FROM generate_series(1, 1001) g), 'big.csv');
  EXECUTE 'RESET ROLE';
  IF r->>'error' <> 'PAYLOAD_INVALID' THEN RAISE EXCEPTION 'expected PAYLOAD_INVALID, got %', r; END IF;

  -- the cap: lower it to the current size + 1, then import two new patients
  SELECT count(*) INTO n FROM public.patients WHERE doctor_id = d_pro;
  UPDATE public.platform_settings SET value = to_jsonb(n + 1) WHERE key = 'patient_import_cap_pro';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d_pro, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', d_pro::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r := public.import_patients(jsonb_build_array(
    jsonb_build_object('name', 'Cap One', 'phone', '9000000011', 'age', 30, 'gender', 'male'),
    jsonb_build_object('name', 'Cap Two', 'phone', '9000000012', 'age', 30, 'gender', 'male')), 'cap.csv');
  EXECUTE 'RESET ROLE';
  IF r->>'error' <> 'CAP_EXCEEDED' OR (r->>'incoming')::int <> 2 THEN RAISE EXCEPTION 'expected CAP_EXCEEDED, got %', r; END IF;
  IF EXISTS (SELECT 1 FROM public.patients WHERE name IN ('Cap One', 'Cap Two')) THEN RAISE EXCEPTION 'cap breach wrote rows'; END IF;
  UPDATE public.platform_settings SET value = '2000'::jsonb WHERE key = 'patient_import_cap_pro';

  -- the daily import limit
  UPDATE public.platform_settings SET value = '1'::jsonb WHERE key = 'patient_import_max_per_day';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d_pro, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', d_pro::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r := public.import_patients(jsonb_build_array(jsonb_build_object('name', 'Daily One', 'phone', '9000000021', 'age', 30, 'gender', 'male')), 'd.csv');
  EXECUTE 'RESET ROLE';
  IF r->>'error' <> 'DAILY_LIMIT' THEN RAISE EXCEPTION 'expected DAILY_LIMIT, got %', r; END IF;
  UPDATE public.platform_settings SET value = '5'::jsonb WHERE key = 'patient_import_max_per_day';

  -- staff: without patients.add is refused, with it works for the doctor's clinic
  PERFORM set_config('request.jwt.claims', json_build_object('sub', s_no, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', s_no::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.import_patients(three, 'x.csv');
    RAISE EXCEPTION 'staff without patients.add must be refused';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'NOT_ALLOWED' THEN RAISE; END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', s_ok, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', s_ok::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r := public.import_patients(jsonb_build_array(jsonb_build_object('name', 'Staff Added', 'phone', '9000000031', 'age', 30, 'gender', 'male')), 's.csv');
  EXECUTE 'RESET ROLE';
  IF (r->>'inserted')::int <> 1 THEN RAISE EXCEPTION 'staff import failed: %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE name = 'Staff Added' AND doctor_id = d_pro) THEN
    RAISE EXCEPTION 'staff import must land in the doctor''s clinic';
  END IF;

  -- the direct-insert guard: 3 per hour allowed, the 4th refused; postgres (no JWT) is exempt
  UPDATE public.platform_settings SET value = '3'::jsonb WHERE key = 'patient_direct_insert_per_hour';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d_pro, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', d_pro::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.patients (doctor_id, name, phone, age, gender) VALUES (d_pro, 'Direct 1', '9000000041', 30, 'male');
  INSERT INTO public.patients (doctor_id, name, phone, age, gender) VALUES (d_pro, 'Direct 2', '9000000042', 30, 'male');
  INSERT INTO public.patients (doctor_id, name, phone, age, gender) VALUES (d_pro, 'Direct 3', '9000000043', 30, 'male');
  BEGIN
    INSERT INTO public.patients (doctor_id, name, phone, age, gender) VALUES (d_pro, 'Direct 4', '9000000044', 30, 'male');
    RAISE EXCEPTION 'the 4th direct insert must be refused';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'PATIENT_RATE_LIMIT' THEN RAISE; END IF;
  END;
  -- an import is still allowed while direct inserts are throttled
  r := public.import_patients(jsonb_build_array(jsonb_build_object('name', 'After Guard', 'phone', '9000000051', 'age', 30, 'gender', 'male')), 'g.csv');
  EXECUTE 'RESET ROLE';
  IF (r->>'inserted')::int <> 1 THEN RAISE EXCEPTION 'import must bypass the direct-insert guard: %', r; END IF;
  -- no JWT at all (service role, cron, migrations): exempt even though the hourly limit is used up
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO public.patients (doctor_id, name, phone, age, gender) VALUES (d_pro, 'Service Insert', '9000000061', 30, 'male');
END $$;
SELECT 'pass' AS result;
ROLLBACK;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx supabase db query --linked -f supabase/tests/patient-import/02_import.sql`
Expected: an error that `import_patients` does not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261123110000_import_patients.sql`:

```sql
-- Patient import limits, part 2: the only bulk path (import_patients) and the guard that
-- rate-limits direct inserts so the API cannot be looped around it.

-- Mirrors patientIntake.ts and patientCsv.ts. Returns an error code, or NULL for a good row.
CREATE OR REPLACE FUNCTION public.patient_import_row_error(_r jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  nm text; ph text; ag text; gd text; wt text; em text; nt text; tv text;
  ps date; fv date; lv date;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF jsonb_typeof(_r) IS DISTINCT FROM 'object' THEN RETURN 'ROW_INVALID'; END IF;

  nm := btrim(COALESCE(_r->>'name', ''));
  IF length(nm) < 2 OR length(nm) > 100 THEN RETURN 'NAME'; END IF;

  ph := COALESCE(_r->>'phone', '');
  IF ph !~ '^[6-9][0-9]{9}$' THEN RETURN 'PHONE'; END IF;

  ag := COALESCE(_r->>'age', '');
  IF ag !~ '^[0-9]{1,3}$' OR ag::integer > 120 THEN RETURN 'AGE'; END IF;

  gd := COALESCE(_r->>'gender', '');
  IF gd NOT IN ('male', 'female', 'other') THEN RETURN 'GENDER'; END IF;

  wt := _r->>'weight';
  IF wt IS NOT NULL AND (wt !~ '^[0-9]{1,3}(\.[0-9])?$' OR wt::numeric < 0.5 OR wt::numeric > 500) THEN RETURN 'WEIGHT'; END IF;

  em := _r->>'email';
  IF em IS NOT NULL AND btrim(em) <> '' AND (length(em) > 254 OR btrim(em) !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$') THEN RETURN 'EMAIL'; END IF;

  nt := _r->>'notes';
  IF nt IS NOT NULL AND length(nt) > 2000 THEN RETURN 'NOTES'; END IF;

  BEGIN
    ps := NULLIF(_r->>'patient_since', '')::date;
    fv := NULLIF(_r->>'first_visit', '')::date;
    lv := NULLIF(_r->>'last_visit', '')::date;
  EXCEPTION WHEN OTHERS THEN
    RETURN 'DATE';
  END;
  IF (ps IS NOT NULL AND (ps > today OR ps < DATE '1900-01-01'))
     OR (fv IS NOT NULL AND (fv > today OR fv < DATE '1900-01-01'))
     OR (lv IS NOT NULL AND (lv > today OR lv < DATE '1900-01-01')) THEN
    RETURN 'DATE';
  END IF;
  IF (fv IS NOT NULL AND lv IS NOT NULL AND lv < fv) OR (ps IS NOT NULL AND fv IS NOT NULL AND ps > fv) THEN
    RETURN 'DATE_ORDER';
  END IF;

  tv := COALESCE(NULLIF(_r->>'total_visits', ''), '0');
  IF tv !~ '^[0-9]{1,5}$' OR tv::integer > 10000 THEN RETURN 'VISITS'; END IF;

  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.patient_import_row_error(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.import_patients(_rows jsonb, _file_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clinic uuid;
  max_rows integer := public.platform_int_setting('patient_import_max_rows', 1000);
  max_per_day integer := public.platform_int_setting('patient_import_max_per_day', 5);
  max_rows_day integer := public.platform_int_setting('patient_import_max_rows_per_day', 2000);
  v_cap integer;
  v_current integer;
  v_imports integer;
  v_rows_today integer;
  good jsonb := '[]'::jsonb;
  new_rows jsonb;
  rejected jsonb := '[]'::jsonb;
  rejected_n integer := 0;
  seen text[] := '{}';
  dupes integer := 0;
  incoming integer;
  inserted integer := 0;
  received integer;
  rec record;
  err text;
  k text;
BEGIN
  clinic := public.patient_import_clinic();
  IF clinic IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;

  IF NOT public.patient_import_eligible(clinic) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_ELIGIBLE');
  END IF;

  IF _rows IS NULL OR jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) = 0
     OR jsonb_array_length(_rows) > max_rows OR octet_length(_rows::text) > 2097152 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAYLOAD_INVALID', 'max_rows', max_rows);
  END IF;
  received := jsonb_array_length(_rows);

  -- One import per clinic at a time, so two tabs (or doctor + staff) cannot both pass the cap check.
  PERFORM pg_advisory_xact_lock(hashtext('patient_import:' || clinic::text));

  -- Validate every row; keep the good ones, drop repeats inside the file.
  FOR rec IN SELECT value AS r, ordinality AS idx FROM jsonb_array_elements(_rows) WITH ORDINALITY LOOP
    err := public.patient_import_row_error(rec.r);
    IF err IS NOT NULL THEN
      rejected_n := rejected_n + 1;
      IF rejected_n <= 100 THEN
        rejected := rejected || jsonb_build_array(jsonb_build_object('index', rec.idx, 'error', err));
      END IF;
      CONTINUE;
    END IF;
    k := (rec.r->>'phone') || '|' || lower(btrim(rec.r->>'name'));
    IF k = ANY (seen) THEN
      dupes := dupes + 1;
      CONTINUE;
    END IF;
    seen := seen || k;
    good := good || jsonb_build_array(rec.r);
  END LOOP;

  -- Which good rows are really new for this clinic (the uq_patients_doctor_phone_name key).
  SELECT COALESCE(jsonb_agg(g), '[]'::jsonb) INTO new_rows
    FROM jsonb_array_elements(good) g
   WHERE NOT EXISTS (
     SELECT 1 FROM public.patients p
      WHERE p.doctor_id = clinic AND p.phone = g->>'phone' AND lower(btrim(p.name)) = lower(btrim(g->>'name')));
  incoming := jsonb_array_length(new_rows);
  dupes := dupes + (jsonb_array_length(good) - incoming);

  SELECT count(*), COALESCE(sum(rows_inserted), 0) INTO v_imports, v_rows_today
    FROM public.patient_imports WHERE doctor_id = clinic AND created_at > now() - interval '24 hours';
  IF v_imports >= max_per_day OR v_rows_today + incoming > max_rows_day THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DAILY_LIMIT', 'imports_today', v_imports,
      'rows_today', v_rows_today, 'max_per_day', max_per_day, 'max_rows_per_day', max_rows_day);
  END IF;

  v_cap := public.patient_import_cap(clinic);
  SELECT count(*) INTO v_current FROM public.patients WHERE doctor_id = clinic;
  IF v_current + incoming > v_cap THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CAP_EXCEEDED', 'cap', v_cap, 'current', v_current, 'incoming', incoming);
  END IF;

  PERFORM set_config('app.patient_import', 'on', true);
  INSERT INTO public.patients (doctor_id, name, phone, email, age, gender, weight, notes,
                               patient_since, first_visit, last_visit, total_visits)
  SELECT clinic,
         btrim(g->>'name'),
         g->>'phone',
         NULLIF(btrim(COALESCE(g->>'email', '')), ''),
         (g->>'age')::integer,
         g->>'gender',
         NULLIF(g->>'weight', '')::numeric,
         NULLIF(btrim(COALESCE(g->>'notes', '')), ''),
         NULLIF(g->>'patient_since', '')::date,
         NULLIF(g->>'first_visit', '')::date,
         NULLIF(g->>'last_visit', '')::date,
         COALESCE(NULLIF(g->>'total_visits', '')::integer, 0)
    FROM jsonb_array_elements(new_rows) g
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  PERFORM set_config('app.patient_import', 'off', true);
  dupes := dupes + (incoming - inserted);

  INSERT INTO public.patient_imports (doctor_id, user_id, file_name, rows_received, rows_inserted, rows_duplicate, rows_rejected)
  VALUES (clinic, auth.uid(), left(_file_name, 200), received, inserted, dupes, rejected_n);

  RETURN jsonb_build_object('ok', true, 'inserted', inserted, 'duplicates', dupes,
                            'rejected', rejected, 'rejected_count', rejected_n);
END;
$$;
REVOKE ALL ON FUNCTION public.import_patients(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_patients(jsonb, text) TO authenticated;

-- Direct inserts (the Add Patient form, or someone calling the API in a loop) are throttled per clinic.
-- Exempt: inserts made by another trigger (bookings), by import_patients, or with no JWT at all.
CREATE OR REPLACE FUNCTION public.guard_patient_direct_inserts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim integer := public.platform_int_setting('patient_direct_insert_per_hour', 100);
  cnt integer;
BEGIN
  IF pg_trigger_depth() > 1 OR auth.uid() IS NULL OR current_setting('app.patient_import', true) = 'on' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.patient_insert_counters (doctor_id, window_start, n)
  VALUES (NEW.doctor_id, now(), 1)
  ON CONFLICT (doctor_id) DO UPDATE
     SET n = CASE WHEN patient_insert_counters.window_start < now() - interval '1 hour'
                  THEN 1 ELSE patient_insert_counters.n + 1 END,
         window_start = CASE WHEN patient_insert_counters.window_start < now() - interval '1 hour'
                             THEN now() ELSE patient_insert_counters.window_start END
  RETURNING n INTO cnt;

  IF cnt > lim THEN
    RAISE EXCEPTION 'PATIENT_RATE_LIMIT';
  END IF;
  RETURN NEW;
END;
$$;

-- Named trg_a0_* so it fires first (triggers run alphabetically; see the lock-order note in CLAUDE.md).
DROP TRIGGER IF EXISTS trg_a0_guard_patient_direct_inserts ON public.patients;
CREATE TRIGGER trg_a0_guard_patient_direct_inserts
  BEFORE INSERT ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.guard_patient_direct_inserts();
```

- [ ] **Step 4: Apply and re-run the check**

Run: `npx supabase db push --yes` then `npx supabase db query --linked -f supabase/tests/patient-import/02_import.sql`
Expected: one row `pass`. If a step fails, the error names the failed expectation; fix the function (not the test) unless the test's setup is what is wrong.

- [ ] **Step 5: Re-run Task 1's check and commit**

Run: `npx supabase db query --linked -f supabase/tests/patient-import/01_access.sql` (expected `pass`).

```bash
git add supabase/migrations/20261123110000_import_patients.sql supabase/tests/patient-import/02_import.sql
git commit -m "feat: import_patients function and direct-insert guard"
```

---

### Task 3: Client import call and the access type

**Files:**
- Create: `src/lib/patientImportApi.ts`, `src/lib/patientImportApi.test.ts`
- Modify: `src/lib/patientImport.ts`, `src/lib/patientImport.test.ts`

**Interfaces:**
- Consumes: `ImportRow` from `src/lib/patientCsv.ts` (fields `line, name, phone, email, age, gender, weight, notes, patient_since, first_visit, last_visit, total_visits`).
- Produces (`patientImportApi.ts`): `type ImportAccess`, `type ImportReason`, `importErrorMessage(code: string, details?: Record<string, unknown>): string`, `rowErrorMessage(code: string): string`.
- Produces (`patientImport.ts`): `type ImportPayloadRow`, `type SendImportFn = (rows: ImportPayloadRow[], fileName: string) => Promise<{ data: unknown; error: { message: string } | null }>`, `type ImportFailure = { line: number; name: string; message: string }`, `type ImportOutcome = { ok: true; imported: number; duplicates: number; rejected: ImportFailure[] } | { ok: false; code: string; message: string }`, and `importPatients(rows: ImportRow[], send: SendImportFn, fileName: string): Promise<ImportOutcome>`. The old exports `PatientInsert`, `InsertFn`, `ImportResult` are removed.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/patientImportApi.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { importErrorMessage, rowErrorMessage } from "./patientImportApi";

describe("importErrorMessage", () => {
  it("explains the plan requirement", () => {
    expect(importErrorMessage("NOT_ELIGIBLE")).toMatch(/Pro and Premium/);
  });
  it("shows the numbers behind a cap breach", () => {
    expect(importErrorMessage("CAP_EXCEEDED", { cap: 2000, current: 1900, incoming: 300 })).toBe(
      "This file would take you to 2,200 patients, above your limit of 2,000.",
    );
  });
  it("explains the daily limit and the row limit", () => {
    expect(importErrorMessage("DAILY_LIMIT")).toMatch(/today/i);
    expect(importErrorMessage("PAYLOAD_INVALID", { max_rows: 1000 })).toMatch(/1,000/);
  });
  it("falls back to a generic message", () => {
    expect(importErrorMessage("SOMETHING_ELSE")).toMatch(/try again/i);
  });
});

describe("rowErrorMessage", () => {
  it("has a readable message for every server row code", () => {
    for (const c of ["ROW_INVALID", "NAME", "PHONE", "AGE", "GENDER", "WEIGHT", "EMAIL", "NOTES", "DATE", "DATE_ORDER", "VISITS"]) {
      expect(rowErrorMessage(c).length).toBeGreaterThan(5);
    }
    expect(rowErrorMessage("UNKNOWN")).toBe("Could not be saved.");
  });
});
```

Replace `src/lib/patientImport.test.ts` entirely with:

```ts
import { describe, expect, it, vi } from "vitest";
import { importPatients, type SendImportFn } from "./patientImport";
import type { ImportRow } from "./patientCsv";

const row = (n: number, over: Partial<ImportRow> = {}): ImportRow => ({
  line: n + 1, name: `Patient ${n}`, phone: `98765${String(n).padStart(5, "0")}`, email: null, age: 30, gender: "male", weight: null, notes: null,
  patient_since: null, first_visit: null, last_visit: null, total_visits: 0, ...over,
});

const reply = (data: unknown): SendImportFn => vi.fn(async () => ({ data, error: null }));

describe("importPatients", () => {
  it("sends the validated rows in ONE call, without a doctor id, with the file name", async () => {
    const send = reply({ ok: true, inserted: 1, duplicates: 0, rejected: [], rejected_count: 0 });
    await importPatients([row(1, { email: "a@b.co", weight: 62.5, notes: "n", age: 0, gender: "female", patient_since: "2019-03-15", first_visit: "2019-03-15", last_visit: "2025-09-02", total_visits: 14 })], send, "demo.csv");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      [{ name: "Patient 1", phone: "9876500001", email: "a@b.co", age: 0, gender: "female", weight: 62.5, notes: "n", patient_since: "2019-03-15", first_visit: "2019-03-15", last_visit: "2025-09-02", total_visits: 14 }],
      "demo.csv",
    );
  });

  it("reports what the server added and skipped", async () => {
    const out = await importPatients([row(1), row(2)], reply({ ok: true, inserted: 1, duplicates: 1, rejected: [], rejected_count: 0 }), "f.csv");
    expect(out).toEqual({ ok: true, imported: 1, duplicates: 1, rejected: [] });
  });

  it("maps a rejected row back to its file line and name", async () => {
    const out = await importPatients([row(1), row(2), row(3)], reply({ ok: true, inserted: 2, duplicates: 0, rejected: [{ index: 2, error: "PHONE" }], rejected_count: 1 }), "f.csv");
    expect(out).toMatchObject({ ok: true, imported: 2 });
    expect(out.ok && out.rejected).toEqual([{ line: 3, name: "Patient 2", message: "The phone number is not a valid Indian mobile number." }]);
  });

  it.each([
    ["NOT_ELIGIBLE", {}, /Pro and Premium/],
    ["DAILY_LIMIT", {}, /today/i],
    ["CAP_EXCEEDED", { cap: 10, current: 8, incoming: 5 }, /13 patients, above your limit of 10/],
  ])("turns %s into a plain message and keeps the code", async (code, extra, pattern) => {
    const out = await importPatients([row(1)], reply({ ok: false, error: code, ...extra }), "f.csv");
    expect(out.ok).toBe(false);
    expect(!out.ok && out.code).toBe(code);
    expect(!out.ok && out.message).toMatch(pattern);
  });

  it("treats a transport error or an unreadable answer as a failed import", async () => {
    const down: SendImportFn = async () => ({ data: null, error: { message: "network" } });
    expect(await importPatients([row(1)], down, "f.csv")).toMatchObject({ ok: false, code: "FAILED" });
    expect(await importPatients([row(1)], reply(null), "f.csv")).toMatchObject({ ok: false, code: "FAILED" });
  });

  it("recognises a refusal raised by the database", async () => {
    const refused: SendImportFn = async () => ({ data: null, error: { message: "NOT_ALLOWED" } });
    expect(await importPatients([row(1)], refused, "f.csv")).toMatchObject({ ok: false, code: "NOT_ALLOWED" });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/patientImportApi.test.ts src/lib/patientImport.test.ts`
Expected: FAIL (missing module `patientImportApi`, and `importPatients` has the old signature).

- [ ] **Step 3: Write the implementation**

Create `src/lib/patientImportApi.ts`:

```ts
// Shapes and wording for the patient import limits (see get_patient_import_access and
// import_patients). Pure, so the dialog and its tests share one set of messages.

export type ImportReason = "ok" | "plan" | "blocked" | "no_permission";

export type ImportAccess = {
  eligible: boolean;
  reason: ImportReason;
  cap?: number;
  patient_count?: number;
  remaining?: number;
  imports_today?: number;
  rows_today?: number;
  max_rows?: number;
  max_per_day?: number;
  max_rows_per_day?: number;
  pending_request?: boolean;
  cooldown_until?: string | null;
};

const n = (v: unknown) => Number(v ?? 0).toLocaleString("en-IN");

export function importErrorMessage(code: string, details: Record<string, unknown> = {}): string {
  switch (code) {
    case "NOT_ELIGIBLE":
      return "Importing patients is available on the Pro and Premium plans.";
    case "DAILY_LIMIT":
      return "You have reached today's import limit. Please try again tomorrow.";
    case "PAYLOAD_INVALID":
      return `A single import can have at most ${n(details.max_rows ?? 1000)} patients.`;
    case "CAP_EXCEEDED":
      return `This file would take you to ${n(Number(details.current ?? 0) + Number(details.incoming ?? 0))} patients, above your limit of ${n(details.cap)}.`;
    case "NOT_ALLOWED":
      return "You do not have permission to import patients.";
    default:
      return "Could not import. Please try again.";
  }
}

const ROW_MESSAGES: Record<string, string> = {
  ROW_INVALID: "This row could not be read.",
  NAME: "The name must be 2 to 100 characters.",
  PHONE: "The phone number is not a valid Indian mobile number.",
  AGE: "The age must be a number from 0 to 120.",
  GENDER: "The gender must be Male, Female or Other.",
  WEIGHT: "The weight must be between 0.5 and 500 kg.",
  EMAIL: "The email address is not valid.",
  NOTES: "The notes are too long.",
  DATE: "A date is not a real date, or is in the future.",
  DATE_ORDER: "The dates are in the wrong order.",
  VISITS: "Total visits must be a whole number from 0 to 10,000.",
};

export const rowErrorMessage = (code: string): string => ROW_MESSAGES[code] ?? "Could not be saved.";
```

Replace `src/lib/patientImport.ts` entirely with:

```ts
import type { ImportRow } from "./patientCsv";
import { importErrorMessage, rowErrorMessage } from "./patientImportApi";

// What the server needs per patient. The clinic is NOT sent: the database works it out from
// the signed-in user, so a payload can never import into someone else's clinic.
export type ImportPayloadRow = {
  name: string;
  phone: string;
  email: string | null;
  age: number;
  gender: string;
  weight: number | null;
  notes: string | null;
  patient_since: string | null;
  first_visit: string | null;
  last_visit: string | null;
  total_visits: number;
};

export type SendImportFn = (
  rows: ImportPayloadRow[],
  fileName: string,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export type ImportFailure = { line: number; name: string; message: string };

export type ImportOutcome =
  | { ok: true; imported: number; duplicates: number; rejected: ImportFailure[] }
  | { ok: false; code: string; message: string };

const toPayload = (r: ImportRow): ImportPayloadRow => ({
  name: r.name,
  phone: r.phone,
  email: r.email,
  age: r.age,
  gender: r.gender,
  weight: r.weight,
  notes: r.notes,
  patient_since: r.patient_since,
  first_visit: r.first_visit,
  last_visit: r.last_visit,
  total_visits: r.total_visits,
});

const failed = (code: string, message: string): ImportOutcome => ({ ok: false, code, message });

// One call, one transaction: the database either imports the lot (minus duplicates and rows it
// rejects) or refuses with a reason. Nothing is retried row by row any more.
export async function importPatients(rows: ImportRow[], send: SendImportFn, fileName: string): Promise<ImportOutcome> {
  const { data, error } = await send(rows.map(toPayload), fileName);

  if (error) {
    return error.message.includes("NOT_ALLOWED")
      ? failed("NOT_ALLOWED", importErrorMessage("NOT_ALLOWED"))
      : failed("FAILED", importErrorMessage("FAILED"));
  }
  const r = data as Record<string, any> | null;
  if (!r || typeof r !== "object") return failed("FAILED", importErrorMessage("FAILED"));

  if (r.ok === false) {
    const code = String(r.error ?? "FAILED");
    return failed(code, importErrorMessage(code, r));
  }
  if (r.ok !== true) return failed("FAILED", importErrorMessage("FAILED"));

  const rejected: ImportFailure[] = ((r.rejected as { index: number; error: string }[]) ?? []).map((x) => {
    const src = rows[x.index - 1];
    return { line: src?.line ?? 0, name: src?.name ?? "", message: rowErrorMessage(x.error) };
  });
  return { ok: true, imported: Number(r.inserted ?? 0), duplicates: Number(r.duplicates ?? 0), rejected };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/patientImportApi.test.ts src/lib/patientImport.test.ts`
Expected: PASS. (`PatientImportDialog.tsx` will not type-check until Task 5; that is expected.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/patientImportApi.ts src/lib/patientImportApi.test.ts src/lib/patientImport.ts src/lib/patientImport.test.ts
git commit -m "feat: single-call patient import client and limit messages"
```

---

### Task 4: `usePatientImportAccess` hook

**Files:**
- Create: `src/hooks/usePatientImportAccess.ts`, `src/hooks/usePatientImportAccess.test.tsx`

**Interfaces:**
- Consumes: `ImportAccess` from `src/lib/patientImportApi.ts`.
- Produces: `usePatientImportAccess(enabled: boolean): { access: ImportAccess | null; loading: boolean; failed: boolean; refresh: () => Promise<void> }`. Calls `supabase.rpc("get_patient_import_access")` when `enabled` becomes true and on `refresh()`.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/usePatientImportAccess.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { usePatientImportAccess } from "./usePatientImportAccess";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));

const ACCESS = { eligible: true, reason: "ok", cap: 2000, patient_count: 40, remaining: 1960 };

describe("usePatientImportAccess", () => {
  beforeEach(() => {
    mock.current = createTableMock();
    mock.current.rpcs.get_patient_import_access = () => ACCESS;
  });

  it("does nothing until it is enabled", () => {
    renderHook(() => usePatientImportAccess(false));
    expect(mock.current.rpc).not.toHaveBeenCalled();
  });

  it("loads the access summary once enabled", async () => {
    const { result } = renderHook(() => usePatientImportAccess(true));
    await waitFor(() => expect(result.current.access).toEqual(ACCESS));
    expect(result.current.loading).toBe(false);
    expect(result.current.failed).toBe(false);
    expect(mock.current.rpc).toHaveBeenCalledWith("get_patient_import_access");
  });

  it("flags a failed lookup instead of guessing an answer", async () => {
    mock.current.rpcs.get_patient_import_access = () => ({ data: null, error: { message: "down" } });
    const { result } = renderHook(() => usePatientImportAccess(true));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.access).toBeNull();
  });

  it("re-reads on refresh", async () => {
    const { result } = renderHook(() => usePatientImportAccess(true));
    await waitFor(() => expect(result.current.access).not.toBeNull());
    mock.current.rpcs.get_patient_import_access = () => ({ ...ACCESS, patient_count: 100, remaining: 1900 });
    await act(async () => { await result.current.refresh(); });
    expect(result.current.access?.patient_count).toBe(100);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/hooks/usePatientImportAccess.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the hook**

Create `src/hooks/usePatientImportAccess.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ImportAccess } from "@/lib/patientImportApi";

// Reads what the Import dialog may offer. This is for display only; import_patients decides
// again on the server, so a stale answer here can never let anything through.
export function usePatientImportAccess(enabled: boolean) {
  const [access, setAccess] = useState<ImportAccess | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_patient_import_access" as any);
    if (error || !data) {
      setFailed(true);
      setAccess(null);
    } else {
      setFailed(false);
      setAccess(data as unknown as ImportAccess);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  return { access, loading, failed, refresh };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/hooks/usePatientImportAccess.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePatientImportAccess.ts src/hooks/usePatientImportAccess.test.tsx
git commit -m "feat: usePatientImportAccess hook"
```

---

### Task 5: Import dialog uses the new rules

**Files:**
- Modify: `src/components/admin/PatientImportDialog.tsx`
- Modify: `src/components/admin/PatientImportDialog.test.tsx`

**Interfaces:**
- Consumes: `usePatientImportAccess` (Task 4), `importPatients`, `ImportOutcome`, `SendImportFn` (Task 3), `ImportAccess` (Task 3).
- Produces: same props as today (`open`, `onOpenChange`, `doctorId`, `onImported`). New visible states: *checking*, *not eligible* (plan or blocked), *lookup failed*, *eligible with a "can import up to N more" line*, *file larger than the remaining room* (Import disabled, contact-support line; Task 7 replaces that line with the request form).

- [ ] **Step 1: Update the test file first**

In `src/components/admin/PatientImportDialog.test.tsx`:

1. Add this block after the existing `const csvFile = ...` line, and delete the old `inserts` helper:

```tsx
const ACCESS_OK = { eligible: true, reason: "ok", cap: 2000, patient_count: 10, remaining: 1990, max_rows: 1000 };
const importCalls = () =>
  mock.current.rpc.mock.calls.filter((c: any[]) => c[0] === "import_patients").map((c: any[]) => c[1]);
```

2. The "View plans" link needs a router. Change `renderDialog` so it wraps the dialog:

```tsx
import { MemoryRouter } from "react-router-dom";

const renderDialog = () =>
  render(
    <MemoryRouter>
      <PatientImportDialog open onOpenChange={onOpenChange} doctorId="doc-1" onImported={onImported} />
    </MemoryRouter>,
  );
```

3. In `beforeEach`, after `mock.current = createTableMock();` add:

```tsx
    mock.current.rpcs.get_patient_import_access = () => ({ data: ACCESS_OK, error: null });
    mock.current.rpcs.import_patients = (args: any) => ({
      data: { ok: true, inserted: args._rows.length, duplicates: 0, rejected: [], rejected_count: 0 },
      error: null,
    });
```

4. Replace the expectations that read `inserts()` (the test "imports only the new rows for this doctor, then reports the result and refreshes the list") with:

```tsx
    expect(await screen.findByText("Imported 1 patient")).toBeInTheDocument();
    expect(importCalls()).toHaveLength(1);
    expect(importCalls()[0]._file_name).toBe("patients.csv");
    expect(importCalls()[0]._rows).toEqual([
      { name: "Ravi Kumar", phone: "9876543210", email: null, age: 40, gender: "male", weight: 72.5, notes: null, patient_since: null, first_visit: null, last_visit: null, total_visits: 0 },
    ]);
    expect(onImported).toHaveBeenCalledTimes(1);
```

(Keep the file-choose and click steps the test already performs; the existing preview of that test has one fresh row.)

5. Add these tests inside the `describe`:

```tsx
  it("tells a clinic on the wrong plan that import is a Pro and Premium feature, and offers no file picker", async () => {
    mock.current.rpcs.get_patient_import_access = () => ({ data: { eligible: false, reason: "plan" }, error: null });
    renderDialog();
    expect(await screen.findByText(/available on the pro and premium plans/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view plans/i })).toHaveAttribute("href", "/admin/settings?tab=subscription");
    expect(screen.queryByLabelText(/csv file/i)).not.toBeInTheDocument();
  });

  it("tells a blocked clinic to contact support", async () => {
    mock.current.rpcs.get_patient_import_access = () => ({ data: { eligible: false, reason: "blocked" }, error: null });
    renderDialog();
    expect(await screen.findByText(/turned off for your clinic/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/csv file/i)).not.toBeInTheDocument();
  });

  it("does not guess when the access lookup fails", async () => {
    mock.current.rpcs.get_patient_import_access = () => ({ data: null, error: { message: "down" } });
    renderDialog();
    expect(await screen.findByText(/could not check your import access/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/csv file/i)).not.toBeInTheDocument();
  });

  it("shows how many more patients the clinic can import", async () => {
    renderDialog();
    expect(await screen.findByText(/you can import up to 1,990 more patients/i)).toBeInTheDocument();
  });

  it("disables Import when the file is bigger than the room left, and says why", async () => {
    mock.current.rpcs.get_patient_import_access = () => ({ data: { ...ACCESS_OK, remaining: 1 }, error: null });
    renderDialog();
    await chooseFile(csvFile(GOOD));
    expect(await screen.findByText(/this file adds 2 patients but your limit allows 1 more/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^import \d+ patient/i })).toBeDisabled();
  });

  it("shows the server's reason when the import is refused", async () => {
    mock.current.rpcs.import_patients = () => ({ data: { ok: false, error: "CAP_EXCEEDED", cap: 10, current: 9, incoming: 2 }, error: null });
    renderDialog();
    await chooseFile(csvFile(GOOD));
    fireEvent.click(await screen.findByRole("button", { name: /^import 2 patients/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/11 patients, above your limit of 10/);
    expect(onImported).not.toHaveBeenCalled();
  });

  it("lists rows the server rejected with their file line", async () => {
    mock.current.rpcs.import_patients = () => ({
      data: { ok: true, inserted: 1, duplicates: 0, rejected: [{ index: 2, error: "PHONE" }], rejected_count: 1 },
      error: null,
    });
    renderDialog();
    await chooseFile(csvFile(GOOD));
    fireEvent.click(await screen.findByRole("button", { name: /^import 2 patients/i }));
    expect(await screen.findByText("Imported 1 patient")).toBeInTheDocument();
    expect(screen.getByText(/Line 3 · Meena Sharma/)).toBeInTheDocument();
  });
```

Also change the existing test "says so when the existing patient list cannot be checked..." only if it breaks; it should still pass.

- [ ] **Step 2: Run the dialog tests to verify they fail**

Run: `npx vitest run src/components/admin/PatientImportDialog.test.tsx`
Expected: FAIL (the dialog still calls `from("patients").insert`, no access states).

- [ ] **Step 3: Update the dialog**

In `src/components/admin/PatientImportDialog.tsx`:

1. Replace the `importPatients, type ImportResult, type InsertFn` import with:

```tsx
import { importPatients, type ImportOutcome, type SendImportFn } from "@/lib/patientImport";
import { usePatientImportAccess } from "@/hooks/usePatientImportAccess";
import { Link } from "react-router-dom";
```

(keep the other imports; add `Link` only if `react-router-dom` is not already imported there.)

2. Replace the `insertPatients: InsertFn` constant with:

```tsx
const sendImport: SendImportFn = async (rows, fileName) => {
  const { data, error } = await supabase.rpc("import_patients" as any, { _rows: rows, _file_name: fileName });
  return { data, error };
};
```

3. Inside the component, replace the `result` state and add the access hook. Change

```tsx
  const [result, setResult] = useState<ImportResult | null>(null);
```
to
```tsx
  const [result, setResult] = useState<Extract<ImportOutcome, { ok: true }> | null>(null);
  const { access, failed: accessFailed, refresh: refreshAccess } = usePatientImportAccess(open);
```

4. Replace `startImport` with:

```tsx
  const startImport = async () => {
    if (!preview || preview.fresh.length === 0) return;
    setBusy("importing");
    setMessage(null);
    setProgress({ done: 0, total: preview.fresh.length });
    try {
      const res = await importPatients(preview.fresh, sendImport, preview.fileName);
      if (!res.ok) {
        setMessage(res.message);
        void refreshAccess();
        return;
      }
      setResult(res);
      onImported();
      void refreshAccess();
    } finally {
      setBusy(null);
    }
  };
```

5. Add after `skippedExisting`:

```tsx
  const remaining = access?.remaining ?? 0;
  const overLimit = !!preview && preview.fresh.length > remaining;
  const locked = !!access && !access.eligible;
```

6. In the JSX, replace the opening of the content ternary `{result ? (` with the new leading branches, so the chain reads `{!access && !accessFailed ? (...) : accessFailed ? (...) : locked ? (...) : result ? (` (the first branch covers both the first render and the lookup in progress, so the file picker never flashes before the plan check) and the rest of the existing chain follows unchanged:

```tsx
        {!access && !accessFailed ? (
          <p className="py-6 text-center text-sm text-muted-foreground" role="status">Checking your plan…</p>
        ) : accessFailed ? (
          <div className="space-y-3 text-sm">
            <p className="text-destructive" role="alert">Could not check your import access. Please try again.</p>
            <Button variant="outline" onClick={() => void refreshAccess()}>Try again</Button>
          </div>
        ) : locked ? (
          <div className="space-y-3 text-sm">
            {access?.reason === "blocked" ? (
              <p className="text-foreground">Import is turned off for your clinic. Please contact support.</p>
            ) : (
              <>
                <p className="text-foreground">Importing patients is available on the Pro and Premium plans.</p>
                <Button asChild className="bg-royal hover:bg-royal/90">
                  <Link to="/admin/settings?tab=subscription">View plans</Link>
                </Button>
              </>
            )}
          </div>
        ) : result ? (
```

7. In the "ready" file-picker branch (the last `else` branch with the `Input type="file"`), add under the `<Label>`/`<Input>` block:

```tsx
            {access && (
              <p className="text-xs text-muted-foreground">
                You can import up to {remaining.toLocaleString("en-IN")} more patients (limit {Number(access.cap ?? 0).toLocaleString("en-IN")}).
              </p>
            )}
```

8. In the preview branch, directly after the `<div className="space-y-1">` summary block, add:

```tsx
            {overLimit && (
              <p className="text-sm text-destructive" role="alert">
                This file adds {preview.fresh.length} patients but your limit allows {remaining} more. Import fewer patients, or contact support to raise your limit.
              </p>
            )}
            {message && <p className="text-sm text-destructive" role="alert">{message}</p>}
```

and change the Import button's `disabled` to `disabled={preview.fresh.length === 0 || overLimit}`.

9. In the result branch, replace the `result.failed` block with the rejected list:

```tsx
            {result.rejected.length > 0 && (
              <div className="space-y-1">
                <p className="text-destructive">{plural(result.rejected.length, "row")} could not be saved:</p>
                <ul className="text-xs text-muted-foreground list-disc pl-5">
                  {result.rejected.slice(0, MAX_ERRORS_SHOWN).map((f) => <li key={f.line}>Line {f.line} · {f.name}: {f.message}</li>)}
                </ul>
              </div>
            )}
```

and change `Imported {plural(result.imported, "patient")}` to keep using `result.imported` and `skippedExisting` to use `result?.duplicates` (unchanged names).

- [ ] **Step 4: Run the dialog tests, the page tests and the type-check**

Run: `npx vitest run src/components/admin/PatientImportDialog.test.tsx src/components/admin/PatientsPage.test.tsx src/lib && npx tsc --noEmit -p tsconfig.app.json`
Expected: all tests PASS; no new type errors (old errors only in `SADoctorDetail.tsx`, `NotFound.tsx`, `useCustomPlan.test.tsx`).

- [ ] **Step 5: Manual check, then commit**

Open the Patients page on a Pro clinic and import `C:\Users\user\Desktop\demo-patients-import.csv` (12 patients). On a trial clinic confirm the "Pro and Premium" message. Then:

```bash
git add src/components/admin/PatientImportDialog.tsx src/components/admin/PatientImportDialog.test.tsx
git commit -m "feat: import dialog enforces plan gate and import limits"
```

**Phase 1 is now complete and releasable.** The abuse path is closed: free and trial clinics cannot import, Pro and Premium are capped, and direct inserts are throttled.

---

# Phase 2: requests, approval and overrides

### Task 6: Request, review and override functions

**Files:**
- Create: `supabase/migrations/20261123120000_patient_import_requests_and_overrides.sql`
- Create: `supabase/tests/patient-import/03_requests.sql`

**Interfaces:**
- Consumes: tables and helpers from Task 1.
- Produces: `request_patient_import_limit(_requested integer, _note text default null) -> jsonb` (`{ok:true, id}` or `{ok:false, error}` with `NOT_ELIGIBLE | BAD_NUMBER (+cap, ceiling) | ALREADY_PENDING | COOLDOWN (+until)`); `review_patient_import_request(_request_id uuid, _decision text, _approved_cap integer default null, _note text default null) -> void` (raises on bad input); `set_patient_import_override(_doctor_id uuid, _mode text, _until timestamptz default null, _reason text default null) -> void`; `get_doctor_import_access(_doctor_id uuid) -> jsonb` with keys `eligible`, `cap`, `patient_count`, `override` (`{mode, until, reason, set_at}` or null).

- [ ] **Step 1: Write the failing SQL check**

Create `supabase/tests/patient-import/03_requests.sql`:

```sql
BEGIN;
DO $$
DECLARE
  d uuid := gen_random_uuid();
  d_free uuid := gen_random_uuid();
  sa uuid := gen_random_uuid();
  r jsonb;
  req uuid;
  a jsonb;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{}'::jsonb FROM unnest(ARRAY[d, d_free, sa]) AS u;
  EXECUTE format('UPDATE public.profiles SET plan_tier=%L, plan_status=%L WHERE id=%L', 'pro', 'active', d);
  EXECUTE format('UPDATE public.profiles SET plan_tier=%L, plan_status=%L WHERE id=%L', 'free', 'trial', d_free);
  INSERT INTO public.user_roles (user_id, role) VALUES (sa, 'admin');  -- owner: holds every superadmin permission

  -- a clinic asks for a higher limit
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', d::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r := public.request_patient_import_limit(1500, 'too low');          -- not above the 2000 cap
  IF r->>'error' <> 'BAD_NUMBER' THEN RAISE EXCEPTION 'expected BAD_NUMBER, got %', r; END IF;
  r := public.request_patient_import_limit(999999, 'too high');       -- over the 100000 ceiling
  IF r->>'error' <> 'BAD_NUMBER' THEN RAISE EXCEPTION 'expected BAD_NUMBER for ceiling, got %', r; END IF;
  r := public.request_patient_import_limit(5000, 'big clinic');
  IF (r->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'request should be accepted: %', r; END IF;
  req := (r->>'id')::uuid;
  r := public.request_patient_import_limit(6000, 'again');
  IF r->>'error' <> 'ALREADY_PENDING' THEN RAISE EXCEPTION 'expected ALREADY_PENDING, got %', r; END IF;
  EXECUTE 'RESET ROLE';

  -- a trial clinic cannot ask
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d_free, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', d_free::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r := public.request_patient_import_limit(5000, 'x');
  IF r->>'error' <> 'NOT_ELIGIBLE' THEN RAISE EXCEPTION 'expected NOT_ELIGIBLE, got %', r; END IF;
  EXECUTE 'RESET ROLE';

  -- a clinic cannot review its own request
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', d::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.review_patient_import_request(req, 'approve', 5000, NULL);
    RAISE EXCEPTION 'a doctor must not be able to approve';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'not authorized' THEN RAISE; END IF;
  END;
  EXECUTE 'RESET ROLE';

  -- superadmin: a decline needs a note, then the clinic waits 7 days
  PERFORM set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', sa::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.review_patient_import_request(req, 'reject', NULL, '  ');
    RAISE EXCEPTION 'reject without a note must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'A reason is required%' THEN RAISE; END IF;
  END;
  PERFORM public.review_patient_import_request(req, 'reject', NULL, 'Please import in smaller batches');
  EXECUTE 'RESET ROLE';
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE doctor_id = d AND source_type = 'plan_request') THEN
    RAISE EXCEPTION 'doctor was not notified of the decline';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', d::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r := public.request_patient_import_limit(5000, 'try again');
  IF r->>'error' <> 'COOLDOWN' THEN RAISE EXCEPTION 'expected COOLDOWN, got %', r; END IF;
  EXECUTE 'RESET ROLE';

  -- after the wait, a new request can be approved, and the cap rises
  UPDATE public.patient_import_requests SET decided_at = now() - interval '8 days' WHERE id = req;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', d::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r := public.request_patient_import_limit(5000, 'second try');
  req := (r->>'id')::uuid;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', sa::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.review_patient_import_request(req, 'approve', 1500, NULL);   -- not above the current 2000
    RAISE EXCEPTION 'an approval at or below the current cap must fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'The approved limit must be above%' THEN RAISE; END IF;
  END;
  PERFORM public.review_patient_import_request(req, 'approve', 4000, 'ok');
  EXECUTE 'RESET ROLE';
  IF public.patient_import_cap(d) <> 4000 THEN RAISE EXCEPTION 'approval should raise the cap to 4000'; END IF;

  -- overrides: needs a reason, blocks a Pro clinic, and is visible to superadmin
  PERFORM set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', sa::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.set_patient_import_override(d, 'blocked', NULL, '');
    RAISE EXCEPTION 'an override needs a reason';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'A reason is required%' THEN RAISE; END IF;
  END;
  PERFORM public.set_patient_import_override(d, 'blocked', NULL, 'abuse');
  a := public.get_doctor_import_access(d);
  EXECUTE 'RESET ROLE';
  IF (a->>'eligible')::boolean IS NOT FALSE OR a->'override'->>'mode' <> 'blocked' THEN
    RAISE EXCEPTION 'blocked override not reflected: %', a;
  END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.set_patient_import_override(d, 'clear', NULL, NULL);
  EXECUTE 'RESET ROLE';
  IF NOT public.patient_import_eligible(d) THEN RAISE EXCEPTION 'clearing the override should restore the plan rule'; END IF;
  IF (SELECT count(*) FROM public.admin_audit_log WHERE admin_user_id = sa) < 3 THEN RAISE EXCEPTION 'decisions were not audited'; END IF;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx supabase db query --linked -f supabase/tests/patient-import/03_requests.sql`
Expected: error that `request_patient_import_limit` does not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261123120000_patient_import_requests_and_overrides.sql`:

```sql
-- Patient import limits, part 3: the clinic's request for a higher limit, the superadmin's
-- decision, and the superadmin's allow/block override for one clinic.

CREATE OR REPLACE FUNCTION public.request_patient_import_limit(_requested integer, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clinic uuid := public.patient_import_clinic();
  ceil integer := public.platform_int_setting('patient_import_cap_ceiling', 100000);
  v_cap integer;
  v_count integer;
  v_cooldown timestamptz;
  new_id uuid;
BEGIN
  IF clinic IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF NOT public.patient_import_eligible(clinic) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_ELIGIBLE');
  END IF;

  v_cap := public.patient_import_cap(clinic);
  IF _requested IS NULL OR _requested <= v_cap OR _requested > ceil THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BAD_NUMBER', 'cap', v_cap, 'ceiling', ceil);
  END IF;
  IF length(COALESCE(_note, '')) > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BAD_NOTE');
  END IF;
  IF EXISTS (SELECT 1 FROM public.patient_import_requests WHERE doctor_id = clinic AND status = 'pending') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ALREADY_PENDING');
  END IF;

  SELECT max(decided_at) + interval '7 days' INTO v_cooldown
    FROM public.patient_import_requests WHERE doctor_id = clinic AND status = 'rejected';
  IF v_cooldown IS NOT NULL AND v_cooldown > now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'COOLDOWN', 'until', v_cooldown);
  END IF;

  SELECT count(*) INTO v_count FROM public.patients WHERE doctor_id = clinic;
  BEGIN
    INSERT INTO public.patient_import_requests (doctor_id, requested_cap, doctor_note, patient_count, cap_at_request)
    VALUES (clinic, _requested, NULLIF(btrim(COALESCE(_note, '')), ''), v_count, v_cap)
    RETURNING id INTO new_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ALREADY_PENDING');
  END;
  RETURN jsonb_build_object('ok', true, 'id', new_id);
END;
$$;
REVOKE ALL ON FUNCTION public.request_patient_import_limit(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_patient_import_limit(integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_patient_import_request(
  _request_id uuid, _decision text, _approved_cap integer DEFAULT NULL, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  r public.patient_import_requests%ROWTYPE;
  ceil integer := public.platform_int_setting('patient_import_cap_ceiling', 100000);
  cur integer;
BEGIN
  IF NOT public.sa_has_permission(uid, 'plan_requests.manage') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'decision must be approve or reject';
  END IF;

  SELECT * INTO r FROM public.patient_import_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'This request was already % — refresh to see the latest', r.status;
  END IF;

  IF _decision = 'reject' THEN
    IF _note IS NULL OR btrim(_note) = '' THEN
      RAISE EXCEPTION 'A reason is required when declining';
    END IF;
    UPDATE public.patient_import_requests
       SET status = 'rejected', reviewer_id = uid, reviewer_note = btrim(_note), decided_at = now()
     WHERE id = _request_id;
    INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
    VALUES (uid, 'reject_patient_import_request', 'patient_import_requests', r.id, jsonb_build_object('doctor_id', r.doctor_id));
    INSERT INTO public.notifications (doctor_id, source_type, title, message)
    VALUES (r.doctor_id, 'plan_request', 'Patient import limit request not approved',
            'Your request was not approved. Reason: ' || btrim(_note) || ' You can ask again after 7 days.');
    RETURN;
  END IF;

  cur := public.patient_import_cap(r.doctor_id);
  IF _approved_cap IS NULL OR _approved_cap <= cur OR _approved_cap > ceil THEN
    RAISE EXCEPTION 'The approved limit must be above the current limit (%) and at most %', cur, ceil;
  END IF;
  UPDATE public.patient_import_requests
     SET status = 'approved', approved_cap = _approved_cap, reviewer_id = uid,
         reviewer_note = NULLIF(btrim(COALESCE(_note, '')), ''), decided_at = now()
   WHERE id = _request_id;
  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
  VALUES (uid, 'approve_patient_import_request', 'patient_import_requests', r.id,
          jsonb_build_object('doctor_id', r.doctor_id, 'approved_cap', _approved_cap));
  INSERT INTO public.notifications (doctor_id, source_type, title, message)
  VALUES (r.doctor_id, 'plan_request', 'Patient import limit raised',
          'You can now hold up to ' || _approved_cap || ' patients when importing.');
END;
$$;
REVOKE ALL ON FUNCTION public.review_patient_import_request(uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_patient_import_request(uuid, text, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_patient_import_override(
  _doctor_id uuid, _mode text, _until timestamptz DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF NOT public.sa_has_permission(uid, 'plan_requests.manage') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _mode NOT IN ('allowed', 'blocked', 'clear') THEN
    RAISE EXCEPTION 'mode must be allowed, blocked or clear';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _doctor_id) THEN
    RAISE EXCEPTION 'Doctor not found';
  END IF;

  IF _mode = 'clear' THEN
    DELETE FROM public.patient_import_overrides WHERE doctor_id = _doctor_id;
  ELSE
    IF _reason IS NULL OR btrim(_reason) = '' THEN
      RAISE EXCEPTION 'A reason is required for an override';
    END IF;
    IF _until IS NOT NULL AND _until <= now() THEN
      RAISE EXCEPTION 'The end date must be in the future';
    END IF;
    INSERT INTO public.patient_import_overrides (doctor_id, mode, until, reason, set_by, set_at)
    VALUES (_doctor_id, _mode, _until, btrim(_reason), uid, now())
    ON CONFLICT (doctor_id) DO UPDATE
       SET mode = EXCLUDED.mode, until = EXCLUDED.until, reason = EXCLUDED.reason,
           set_by = EXCLUDED.set_by, set_at = EXCLUDED.set_at;
  END IF;

  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
  VALUES (uid, 'set_patient_import_override', 'patient_import_overrides', _doctor_id,
          jsonb_build_object('mode', _mode, 'until', _until, 'reason', _reason));
END;
$$;
REVOKE ALL ON FUNCTION public.set_patient_import_override(uuid, text, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_patient_import_override(uuid, text, timestamptz, text) TO authenticated;

-- Superadmin's view of one clinic's import access (for the doctor detail page).
CREATE OR REPLACE FUNCTION public.get_doctor_import_access(_doctor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.patient_import_overrides%ROWTYPE;
BEGIN
  IF NOT public.sa_has_any_permission(auth.uid(), ARRAY['doctors.view', 'plan_requests.view']) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT * INTO o FROM public.patient_import_overrides WHERE doctor_id = _doctor_id AND (until IS NULL OR until > now());
  RETURN jsonb_build_object(
    'eligible', public.patient_import_eligible(_doctor_id),
    'cap', public.patient_import_cap(_doctor_id),
    'patient_count', (SELECT count(*) FROM public.patients WHERE doctor_id = _doctor_id),
    'override', CASE WHEN FOUND THEN jsonb_build_object('mode', o.mode, 'until', o.until, 'reason', o.reason, 'set_at', o.set_at) END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_doctor_import_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_doctor_import_access(uuid) TO authenticated;
```

- [ ] **Step 4: Apply and run all three checks**

Run:
```
npx supabase db push --yes
npx supabase db query --linked -f supabase/tests/patient-import/03_requests.sql
npx supabase db query --linked -f supabase/tests/patient-import/02_import.sql
npx supabase db query --linked -f supabase/tests/patient-import/01_access.sql
```
Expected: each returns one row `pass`. Note on 03: the test inserts into `user_roles` to make `sa` an owner; if `sa_has_permission` also needs the user to exist in another table, read `sa_has_permission` in the `superadmin_team` migration and add that row.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261123120000_patient_import_requests_and_overrides.sql supabase/tests/patient-import/03_requests.sql
git commit -m "feat: patient import limit requests, review and override functions"
```

---

### Task 7: Request form in the import dialog

**Files:**
- Create: `src/components/admin/ImportLimitRequestForm.tsx`, `src/components/admin/ImportLimitRequestForm.test.tsx`
- Modify: `src/components/admin/PatientImportDialog.tsx`, `src/components/admin/PatientImportDialog.test.tsx`

**Interfaces:**
- Consumes: `ImportAccess` (Task 3), `request_patient_import_limit` (Task 6), `refresh` from `usePatientImportAccess` (Task 4).
- Produces: `<ImportLimitRequestForm access={ImportAccess} needed={number} onRequested={() => void} />`. `needed` is the number of new patients in the chosen file; the number field defaults to `patient_count + needed`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/admin/ImportLimitRequestForm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ImportLimitRequestForm from "./ImportLimitRequestForm";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));

const access = { eligible: true, reason: "ok" as const, cap: 2000, patient_count: 1900, remaining: 100 };
const onRequested = vi.fn();

describe("ImportLimitRequestForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.current = createTableMock();
    mock.current.rpcs.request_patient_import_limit = () => ({ data: { ok: true, id: "r1" }, error: null });
  });

  it("starts from what this file needs and sends the request with the note", async () => {
    render(<ImportLimitRequestForm access={access} needed={300} onRequested={onRequested} />);
    const number = screen.getByLabelText(/patients you need to hold/i) as HTMLInputElement;
    expect(number.value).toBe("2200");
    fireEvent.change(number, { target: { value: "2500" } });
    fireEvent.change(screen.getByLabelText(/why do you need/i), { target: { value: "Moving my old clinic list" } });
    fireEvent.click(screen.getByRole("button", { name: /send request/i }));
    await waitFor(() => expect(onRequested).toHaveBeenCalled());
    expect(mock.current.rpc).toHaveBeenCalledWith("request_patient_import_limit", { _requested: 2500, _note: "Moving my old clinic list" });
  });

  it("will not send a number that is not above the current limit", async () => {
    render(<ImportLimitRequestForm access={access} needed={300} onRequested={onRequested} />);
    fireEvent.change(screen.getByLabelText(/patients you need to hold/i), { target: { value: "1500" } });
    fireEvent.click(screen.getByRole("button", { name: /send request/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/above your current limit of 2,000/);
    expect(mock.current.rpc).not.toHaveBeenCalled();
  });

  it("explains a refusal from the server", async () => {
    mock.current.rpcs.request_patient_import_limit = () => ({ data: { ok: false, error: "COOLDOWN", until: "2026-12-01T00:00:00Z" }, error: null });
    render(<ImportLimitRequestForm access={access} needed={300} onRequested={onRequested} />);
    fireEvent.click(screen.getByRole("button", { name: /send request/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/ask again/i);
    expect(onRequested).not.toHaveBeenCalled();
  });

  it("shows a pending request instead of the form", () => {
    render(<ImportLimitRequestForm access={{ ...access, pending_request: true }} needed={300} onRequested={onRequested} />);
    expect(screen.getByText(/request is waiting for review/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send request/i })).not.toBeInTheDocument();
  });

  it("shows when the clinic can ask again after a decline", () => {
    render(<ImportLimitRequestForm access={{ ...access, cooldown_until: "2026-12-01T00:00:00Z" }} needed={300} onRequested={onRequested} />);
    expect(screen.getByText(/you can ask again on/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send request/i })).not.toBeInTheDocument();
  });
});
```

Add to `PatientImportDialog.test.tsx`:

```tsx
  it("offers the request form when the file is bigger than the room left", async () => {
    mock.current.rpcs.get_patient_import_access = () => ({ data: { ...ACCESS_OK, remaining: 1 }, error: null });
    renderDialog();
    await chooseFile(csvFile(GOOD));
    expect(await screen.findByRole("button", { name: /send request/i })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/admin/ImportLimitRequestForm.test.tsx src/components/admin/PatientImportDialog.test.tsx`
Expected: FAIL (component does not exist; the dialog shows the contact-support line).

- [ ] **Step 3: Write the form and use it in the dialog**

Create `src/components/admin/ImportLimitRequestForm.tsx`:

```tsx
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { ImportAccess } from "@/lib/patientImportApi";

const fmt = (v: number) => v.toLocaleString("en-IN");
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

const REFUSALS: Record<string, string> = {
  NOT_ELIGIBLE: "Importing patients is available on the Pro and Premium plans.",
  ALREADY_PENDING: "You already have a request waiting for review.",
  BAD_NOTE: "Please keep the reason under 1,000 characters.",
};

type Props = { access: ImportAccess; needed: number; onRequested: () => void };

// Shown when a file is bigger than the clinic's remaining import room. The decision is a
// person's: nothing here raises a limit by itself.
const ImportLimitRequestForm = ({ access, needed, onRequested }: Props) => {
  const cap = Number(access.cap ?? 0);
  const [requested, setRequested] = useState(String(Number(access.patient_count ?? 0) + needed));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (access.pending_request) {
    return <p className="text-sm text-muted-foreground">Your request is waiting for review. We will notify you when it is decided.</p>;
  }
  if (access.cooldown_until) {
    return <p className="text-sm text-muted-foreground">Your last request was not approved. You can ask again on {fmtDate(access.cooldown_until)}.</p>;
  }

  const send = async () => {
    setError(null);
    const n = Number(requested);
    if (!Number.isInteger(n) || n <= cap) {
      setError(`Enter a number above your current limit of ${fmt(cap)}.`);
      return;
    }
    setBusy(true);
    const { data, error: rpcError } = await supabase.rpc("request_patient_import_limit" as any, { _requested: n, _note: note.trim() || null });
    setBusy(false);
    const r = data as { ok?: boolean; error?: string; until?: string; ceiling?: number } | null;
    if (rpcError || !r) { setError("Could not send the request. Please try again."); return; }
    if (!r.ok) {
      if (r.error === "COOLDOWN") setError(`Your last request was not approved. You can ask again on ${fmtDate(r.until ?? "")}.`);
      else if (r.error === "BAD_NUMBER") setError(`Enter a number above ${fmt(cap)} and up to ${fmt(r.ceiling ?? 100000)}.`);
      else setError(REFUSALS[r.error ?? ""] ?? "Could not send the request. Please try again.");
      return;
    }
    toast.success("Request sent. We will notify you when it is decided.");
    onRequested();
  };

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <p className="text-sm font-medium text-foreground">Request a higher limit</p>
      <div className="space-y-1.5">
        <Label htmlFor="import-limit-number">Patients you need to hold</Label>
        <Input id="import-limit-number" inputMode="numeric" value={requested} onChange={(e) => setRequested(e.target.value.replace(/\D/g, ""))} className="h-9" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="import-limit-note">Why do you need this?</Label>
        <Textarea id="import-limit-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="button" size="sm" disabled={busy} onClick={send} className="bg-royal hover:bg-royal/90">
        {busy ? "Sending…" : "Send request"}
      </Button>
    </div>
  );
};

export default ImportLimitRequestForm;
```

In `PatientImportDialog.tsx`: add `import ImportLimitRequestForm from "./ImportLimitRequestForm";` and, in the preview branch, replace the Task 5 `overLimit` paragraph's last sentence so it reads `... your limit allows {remaining} more.` (drop "Import fewer patients, or contact support to raise your limit.") and add directly under it:

```tsx
            {overLimit && access && (
              <ImportLimitRequestForm access={access} needed={preview.fresh.length} onRequested={() => void refreshAccess()} />
            )}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/admin/ImportLimitRequestForm.test.tsx src/components/admin/PatientImportDialog.test.tsx`
Expected: PASS. (The Task 5 test that expects the text "this file adds 2 patients but your limit allows 1 more" still passes because that sentence is kept.)

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/ImportLimitRequestForm.tsx src/components/admin/ImportLimitRequestForm.test.tsx src/components/admin/PatientImportDialog.tsx src/components/admin/PatientImportDialog.test.tsx
git commit -m "feat: request a higher import limit from the import dialog"
```

---

### Task 8: Superadmin "Import limits" tab

**Files:**
- Create: `src/components/superadmin/SAImportRequests.tsx`, `src/components/superadmin/SAImportRequests.test.tsx`
- Modify: `src/components/superadmin/SAPlanRequests.tsx` (the `<Tabs>` at about line 154)

**Interfaces:**
- Consumes: table `patient_import_requests` (columns `id, doctor_id, requested_cap, doctor_note, patient_count, cap_at_request, status, approved_cap, reviewer_note, decided_at, created_at` plus the embedded `profiles:doctor_id(full_name, clinic_name, plan_tier)`), RPC `review_patient_import_request` (Task 6).
- Produces: default export `SAImportRequests` (no props). Uses `toast` from `@/hooks/use-toast` like `SAPlanRequests.tsx`.

- [ ] **Step 1: Write the failing test**

Create `src/components/superadmin/SAImportRequests.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SAImportRequests from "./SAImportRequests";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ toast }));

const ROWS = [
  { id: "r1", doctor_id: "d1", requested_cap: 5000, doctor_note: "Moving my old list", patient_count: 1900, cap_at_request: 2000,
    status: "pending", approved_cap: null, reviewer_note: null, decided_at: null, created_at: "2026-11-20T10:00:00Z",
    profiles: { full_name: "Asha Rao", clinic_name: "Rao Clinic", plan_tier: "pro" } },
  { id: "r2", doctor_id: "d2", requested_cap: 9000, doctor_note: null, patient_count: 100, cap_at_request: 2000,
    status: "rejected", approved_cap: null, reviewer_note: "Too large", decided_at: "2026-11-19T10:00:00Z", created_at: "2026-11-18T10:00:00Z",
    profiles: { full_name: "Ravi K", clinic_name: null, plan_tier: "pro" } },
];

describe("SAImportRequests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.current = createTableMock();
    mock.current.tables.patient_import_requests = { data: ROWS };
    mock.current.rpcs.review_patient_import_request = () => ({ data: null, error: null });
  });

  it("lists pending requests with the numbers a reviewer needs, and earlier decisions below", async () => {
    render(<SAImportRequests />);
    expect(await screen.findByText("Asha Rao")).toBeInTheDocument();
    expect(screen.getByText(/1,900 patients now/)).toBeInTheDocument();
    expect(screen.getByText(/asks for 5,000/i)).toBeInTheDocument();
    expect(screen.getByText(/Moving my old list/)).toBeInTheDocument();
    expect(screen.getByText("Ravi K")).toBeInTheDocument();
    expect(screen.getByText(/Too large/)).toBeInTheDocument();
  });

  it("approves with the cap the reviewer enters", async () => {
    render(<SAImportRequests />);
    fireEvent.click(await screen.findByRole("button", { name: /review/i }));
    const cap = screen.getByLabelText(/approved limit/i) as HTMLInputElement;
    expect(cap.value).toBe("5000");
    fireEvent.change(cap, { target: { value: "4000" } });
    fireEvent.click(screen.getByRole("button", { name: /^approve$/i }));
    await waitFor(() =>
      expect(mock.current.rpc).toHaveBeenCalledWith("review_patient_import_request", { _request_id: "r1", _decision: "approve", _approved_cap: 4000, _note: null }),
    );
  });

  it("will not decline without a reason", async () => {
    render(<SAImportRequests />);
    fireEvent.click(await screen.findByRole("button", { name: /review/i }));
    fireEvent.click(screen.getByRole("button", { name: /^decline$/i }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Add a reason" }));
    expect(mock.current.rpc).not.toHaveBeenCalledWith("review_patient_import_request", expect.anything());
  });

  it("declines with the reason the doctor will see", async () => {
    render(<SAImportRequests />);
    fireEvent.click(await screen.findByRole("button", { name: /review/i }));
    fireEvent.change(screen.getByLabelText(/note to the doctor/i), { target: { value: "Please import in smaller batches" } });
    fireEvent.click(screen.getByRole("button", { name: /^decline$/i }));
    await waitFor(() =>
      expect(mock.current.rpc).toHaveBeenCalledWith("review_patient_import_request", { _request_id: "r1", _decision: "reject", _approved_cap: null, _note: "Please import in smaller batches" }),
    );
  });

  it("shows the server's message when a decision fails", async () => {
    mock.current.rpcs.review_patient_import_request = () => ({ data: null, error: { message: "The approved limit must be above the current limit (2000) and at most 100000" } });
    render(<SAImportRequests />);
    fireEvent.click(await screen.findByRole("button", { name: /review/i }));
    fireEvent.click(screen.getByRole("button", { name: /^approve$/i }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Could not save decision", variant: "destructive" })));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/superadmin/SAImportRequests.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the component and add the tab**

Create `src/components/superadmin/SAImportRequests.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Row = {
  id: string;
  doctor_id: string;
  requested_cap: number;
  doctor_note: string | null;
  patient_count: number;
  cap_at_request: number;
  status: "pending" | "approved" | "rejected";
  approved_cap: number | null;
  reviewer_note: string | null;
  decided_at: string | null;
  created_at: string;
  profiles: { full_name: string | null; clinic_name: string | null; plan_tier: string | null } | null;
};

const fmt = (v: number) => v.toLocaleString("en-IN");
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

const Who = ({ r }: { r: Row }) => (
  <div>
    <div className="font-medium text-foreground">{r.profiles?.full_name || "Doctor"}</div>
    <div className="text-xs text-muted-foreground">{[r.profiles?.clinic_name, r.profiles?.plan_tier].filter(Boolean).join(" · ")}</div>
  </div>
);

const SAImportRequests = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<Row | null>(null);
  const [cap, setCap] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("patient_import_requests" as any)
      .select("*, profiles:doctor_id(full_name, clinic_name, plan_tier)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast({ title: "Failed to load requests", description: error.message, variant: "destructive" });
    setRows((data as unknown as Row[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const open = (r: Row) => { setReviewing(r); setCap(String(r.requested_cap)); setNote(""); };

  const decide = async (decision: "approve" | "reject") => {
    if (!reviewing) return;
    if (decision === "reject" && !note.trim()) {
      toast({ title: "Add a reason", description: "The doctor sees this reason.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("review_patient_import_request" as any, {
      _request_id: reviewing.id,
      _decision: decision,
      _approved_cap: decision === "approve" ? Number(cap) : null,
      _note: note.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Could not save decision", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: decision === "approve" ? "Approved — live for the clinic now" : "Request declined" });
    setReviewing(null);
    void load();
  };

  const pending = rows.filter((r) => r.status === "pending");
  const decided = rows.filter((r) => r.status !== "pending");

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="font-heading font-semibold text-foreground">Waiting for review{pending.length ? ` (${pending.length})` : ""}</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No limit requests waiting.</p>
        ) : pending.map((r) => (
          <Card key={r.id}><CardContent className="p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <Who r={r} />
              <p className="text-xs text-muted-foreground">{fmt(r.patient_count)} patients now · limit {fmt(r.cap_at_request)} · asks for {fmt(r.requested_cap)} · {fmtDate(r.created_at)}</p>
              {r.doctor_note && <p className="text-xs text-muted-foreground">“{r.doctor_note}”</p>}
            </div>
            <Button size="sm" onClick={() => open(r)}>Review</Button>
          </CardContent></Card>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-heading font-semibold text-foreground">Earlier decisions</h2>
        {decided.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing decided yet.</p>
        ) : decided.map((r) => (
          <Card key={r.id}><CardContent className="p-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Who r={r} />
              <Badge variant={r.status === "approved" ? "default" : "secondary"}>
                {r.status === "approved" ? `Approved ${fmt(r.approved_cap ?? 0)}` : "Declined"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">Asked for {fmt(r.requested_cap)}{r.decided_at ? ` · decided ${fmtDate(r.decided_at)}` : ""}</p>
            {r.reviewer_note && <p className="text-xs text-muted-foreground">Note: {r.reviewer_note}</p>}
          </CardContent></Card>
        ))}
      </section>

      <Dialog open={!!reviewing} onOpenChange={(o) => { if (!o && !saving) setReviewing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Review limit request</DialogTitle>
            <DialogDescription>
              {reviewing && `${reviewing.profiles?.full_name || "Doctor"} has ${fmt(reviewing.patient_count)} patients and asks for ${fmt(reviewing.requested_cap)} (limit was ${fmt(reviewing.cap_at_request)}).`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sa-import-cap">Approved limit</Label>
              <Input id="sa-import-cap" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sa-import-note">Note to the doctor (required to decline)</Label>
              <Textarea id="sa-import-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" disabled={saving} onClick={() => decide("reject")}>Decline</Button>
            <Button disabled={saving} onClick={() => decide("approve")}>Approve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SAImportRequests;
```

In `src/components/superadmin/SAPlanRequests.tsx`: add `import SAImportRequests from "./SAImportRequests";` with the other imports; add `<TabsTrigger value="import">Import limits</TabsTrigger>` after the `history` trigger inside `<TabsList>`; and add, directly before the closing `</Tabs>`:

```tsx
        <TabsContent value="import">
          <SAImportRequests />
        </TabsContent>
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/superadmin`
Expected: PASS, including the existing `SAPlanRequests.test.tsx`. If that file's snapshot or tab-count assertions fail, update them to include the new tab and confirm nothing else changed.

- [ ] **Step 5: Commit**

```bash
git add src/components/superadmin/SAImportRequests.tsx src/components/superadmin/SAImportRequests.test.tsx src/components/superadmin/SAPlanRequests.tsx
git commit -m "feat: superadmin review of patient import limit requests"
```

---

### Task 9: Override card on the doctor detail page

**Files:**
- Create: `src/components/superadmin/SAImportAccessCard.tsx`, `src/components/superadmin/SAImportAccessCard.test.tsx`
- Modify: `src/components/superadmin/SADoctorDetail.tsx` (mount the card)

**Interfaces:**
- Consumes: RPCs `get_doctor_import_access(_doctor_id)` and `set_patient_import_override(_doctor_id, _mode, _until, _reason)` (Task 6).
- Produces: `<SAImportAccessCard doctorId={string} canManage={boolean} />`. `canManage` hides the buttons for superadmins who can only view (pass the same boolean the page already uses for `plan_requests.manage`; if the page has none, pass `true` and rely on the server check).

- [ ] **Step 1: Write the failing test**

Create `src/components/superadmin/SAImportAccessCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SAImportAccessCard from "./SAImportAccessCard";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ toast }));

const PLAN_ONLY = { eligible: true, cap: 2000, patient_count: 40, override: null };

describe("SAImportAccessCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.current = createTableMock();
    mock.current.rpcs.get_doctor_import_access = () => ({ data: PLAN_ONLY, error: null });
    mock.current.rpcs.set_patient_import_override = () => ({ data: null, error: null });
  });

  it("shows the clinic's access, limit and patient count", async () => {
    render(<SAImportAccessCard doctorId="d1" canManage />);
    expect(await screen.findByText(/import is on/i)).toBeInTheDocument();
    expect(screen.getByText(/40 of 2,000 patients/)).toBeInTheDocument();
  });

  it("shows an active override with its reason", async () => {
    mock.current.rpcs.get_doctor_import_access = () => ({
      data: { eligible: false, cap: 2000, patient_count: 40, override: { mode: "blocked", until: null, reason: "abuse", set_at: "2026-11-20T00:00:00Z" } },
      error: null,
    });
    render(<SAImportAccessCard doctorId="d1" canManage />);
    expect(await screen.findByText(/import is off/i)).toBeInTheDocument();
    expect(screen.getByText(/blocked by superadmin/i)).toBeInTheDocument();
    expect(screen.getByText(/abuse/)).toBeInTheDocument();
  });

  it("will not save an override without a reason", async () => {
    render(<SAImportAccessCard doctorId="d1" canManage />);
    fireEvent.click(await screen.findByRole("button", { name: /^block import$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Add a reason" }));
    expect(mock.current.rpc).not.toHaveBeenCalledWith("set_patient_import_override", expect.anything());
  });

  it("saves a block with its reason", async () => {
    render(<SAImportAccessCard doctorId="d1" canManage />);
    fireEvent.click(await screen.findByRole("button", { name: /^block import$/i }));
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "Scripted bulk inserts" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(mock.current.rpc).toHaveBeenCalledWith("set_patient_import_override", { _doctor_id: "d1", _mode: "blocked", _until: null, _reason: "Scripted bulk inserts" }),
    );
  });

  it("clears an override", async () => {
    mock.current.rpcs.get_doctor_import_access = () => ({
      data: { eligible: true, cap: 2000, patient_count: 40, override: { mode: "allowed", until: null, reason: "support", set_at: "2026-11-20T00:00:00Z" } },
      error: null,
    });
    render(<SAImportAccessCard doctorId="d1" canManage />);
    fireEvent.click(await screen.findByRole("button", { name: /clear override/i }));
    await waitFor(() =>
      expect(mock.current.rpc).toHaveBeenCalledWith("set_patient_import_override", { _doctor_id: "d1", _mode: "clear", _until: null, _reason: null }),
    );
  });

  it("hides the buttons when the viewer cannot manage", async () => {
    render(<SAImportAccessCard doctorId="d1" canManage={false} />);
    await screen.findByText(/import is on/i);
    expect(screen.queryByRole("button", { name: /block import/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/superadmin/SAImportAccessCard.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the card and mount it**

Create `src/components/superadmin/SAImportAccessCard.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

type Access = {
  eligible: boolean;
  cap: number;
  patient_count: number;
  override: { mode: "allowed" | "blocked"; until: string | null; reason: string; set_at: string } | null;
};

const fmt = (v: number) => v.toLocaleString("en-IN");
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

type Props = { doctorId: string; canManage: boolean };

const SAImportAccessCard = ({ doctorId, canManage }: Props) => {
  const [access, setAccess] = useState<Access | null>(null);
  const [mode, setMode] = useState<"allowed" | "blocked" | null>(null);
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_doctor_import_access" as any, { _doctor_id: doctorId });
    if (error) toast({ title: "Could not load import access", description: error.message, variant: "destructive" });
    setAccess((data as unknown as Access) ?? null);
  }, [doctorId]);

  useEffect(() => { void load(); }, [load]);

  const save = async (m: "allowed" | "blocked" | "clear") => {
    if (m !== "clear" && !reason.trim()) {
      toast({ title: "Add a reason", description: "It is recorded in the audit log.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("set_patient_import_override" as any, {
      _doctor_id: doctorId,
      _mode: m,
      _until: m !== "clear" && until ? new Date(`${until}T23:59:59`).toISOString() : null,
      _reason: m === "clear" ? null : reason.trim(),
    });
    setSaving(false);
    if (error) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: m === "clear" ? "Override cleared" : "Override saved" });
    setMode(null); setReason(""); setUntil("");
    void load();
  };

  if (!access) return null;
  const o = access.override;

  return (
    <Card><CardContent className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-heading font-semibold text-foreground">Patient import</h3>
        <span className={`text-xs font-medium ${access.eligible ? "text-success" : "text-destructive"}`}>
          {access.eligible ? "Import is on" : "Import is off"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{fmt(access.patient_count)} of {fmt(access.cap)} patients (import limit)</p>
      {o && (
        <p className="text-xs text-muted-foreground">
          {o.mode === "blocked" ? "Blocked by superadmin" : "Allowed by superadmin"}{o.until ? ` until ${fmtDate(o.until)}` : ""}: {o.reason}
        </p>
      )}

      {canManage && mode === null && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setMode("blocked")}>Block import</Button>
          <Button size="sm" variant="outline" onClick={() => setMode("allowed")}>Allow import</Button>
          {o && <Button size="sm" variant="ghost" disabled={saving} onClick={() => save("clear")}>Clear override</Button>}
        </div>
      )}

      {canManage && mode !== null && (
        <div className="space-y-2">
          <div className="space-y-1.5">
            <Label htmlFor="sa-override-reason">Reason</Label>
            <Input id="sa-override-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sa-override-until">Ends on (optional)</Label>
            <Input id="sa-override-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={saving} onClick={() => save(mode)}>Save</Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => setMode(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </CardContent></Card>
  );
};

export default SAImportAccessCard;
```

In `src/components/superadmin/SADoctorDetail.tsx`: add `import SAImportAccessCard from "./SAImportAccessCard";` next to the `SAFeatureAccess` import (line 17), and add this line directly under `<SAFeatureAccess doctorId={id!} />` (about line 260):

```tsx
      <SAImportAccessCard doctorId={id!} canManage />
```

The page has no permission boolean (`SAFeatureAccess` also relies on the server check), so `canManage` is simply `true`; `set_patient_import_override` refuses anyone without `plan_requests.manage` and the card shows the server's message.

- [ ] **Step 4: Run the tests and the type-check**

Run: `npx vitest run src/components/superadmin && npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS; no new type errors beyond the old ones in `SADoctorDetail.tsx` and `NotFound.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/components/superadmin/SAImportAccessCard.tsx src/components/superadmin/SAImportAccessCard.test.tsx src/components/superadmin/SADoctorDetail.tsx
git commit -m "feat: superadmin allow/block override for patient import"
```

---

### Task 10: Documentation and full verification

**Files:**
- Modify: `CLAUDE.md` (the "Patient CSV import/export" bullet)

- [ ] **Step 1: Update CLAUDE.md**

In the patient CSV bullet, replace the final sentence `Limits: 1000 rows, 2 MB. Import needs \`patients.add\`.` with:

```
Limits: 1000 rows and 2 MB per file in the browser; the real enforcement is in the database. Import is **Pro/Premium only** (`plan_status = 'active'`; free, trial, expired and cancelled clinics are refused) and the browser calls the single `import_patients(rows jsonb, file_name text)` function (clinic taken from `auth.uid()`; doctor or staff with `patients.add`). It is all-or-nothing, rejects bad rows with codes, skips duplicates, and refuses with `NOT_ELIGIBLE`, `PAYLOAD_INVALID`, `DAILY_LIMIT` (5 imports and 2,000 rows per 24 h) or `CAP_EXCEEDED` (Pro 2,000 / Premium 10,000 patients held when the import runs). All numbers live in `platform_settings` (`patient_import_*`). A trigger on `patients` (`trg_a0_guard_patient_direct_inserts`) limits direct inserts to 100 per clinic per hour; it exempts inserts made by other triggers, by `import_patients` (`app.patient_import` flag) and with no JWT. A clinic needing more requests a higher limit (`patient_import_requests`, one open request, 7-day wait after a decline); superadmin approves or declines it on the Plan Requests "Import limits" tab (reuses `plan_requests.view/manage`), and can allow or block one clinic through `patient_import_overrides` (card on the doctor detail page). `get_patient_import_access()` only feeds the UI. DB checks live in `supabase/tests/patient-import/*.sql` and run with `npx supabase db query --linked -f <file>` (each rolls back).
```

- [ ] **Step 2: Run everything**

Run:
```
npx supabase db query --linked -f supabase/tests/patient-import/01_access.sql
npx supabase db query --linked -f supabase/tests/patient-import/02_import.sql
npx supabase db query --linked -f supabase/tests/patient-import/03_requests.sql
npx tsc --noEmit -p tsconfig.app.json
npx vitest run src/components src/lib src/pages src/hooks
```
Expected: three `pass` rows; no new type errors; all tests PASS.

- [ ] **Step 3: Manual end-to-end check**

1. Trial clinic: Import shows "available on the Pro and Premium plans" and no file picker.
2. Pro clinic: import `demo-patients-import.csv` (12 patients), then import `demo-patients-import-with-errors.csv` and confirm rejected rows list their file lines.
3. Lower `patient_import_cap_pro` in `platform_settings` to a small number, import a larger file, confirm Import is disabled and the request form appears; send a request.
4. As superadmin: approve it on Plan Requests, Import limits; the clinic receives a notification and can import.
5. Block the clinic from its doctor detail page; Import shows "turned off for your clinic". Clear the override. Reset the setting afterwards.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: patient import limits and approval"
```
