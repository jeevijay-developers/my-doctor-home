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
  -- A missing, non-numeric or absurdly long value falls back to the default instead of erroring.
  SELECT COALESCE((SELECT CASE WHEN (value #>> '{}') ~ '^[0-9]{1,9}$' THEN (value #>> '{}')::integer END
                     FROM public.platform_settings WHERE key = _key), _default)
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
  FOR SELECT TO authenticated USING (doctor_id = auth.uid()
    OR (public.staff_doctor_id(auth.uid()) = doctor_id AND public.staff_has_permission(auth.uid(), 'patients.add')));
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
  FOR SELECT TO authenticated USING (doctor_id = auth.uid()
    OR (public.staff_doctor_id(auth.uid()) = doctor_id AND public.staff_has_permission(auth.uid(), 'patients.add')));
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
  -- 'active' with a paid period that has already ended (the expiry job can lag) is not paid.
  RETURN COALESCE(p.plan_tier::text IN ('pro', 'premium'), false)
     AND p.plan_status::text = 'active'
     AND (p.plan_end IS NULL OR p.plan_end > now());
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
