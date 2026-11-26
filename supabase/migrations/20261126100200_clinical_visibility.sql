-- Multi-doctor P1 part 3: who sees and edits clinical records when a clinic has several doctors.
-- Everything here is RESTRICTIVE and returns true for anyone who is not a doctor-role login,
-- so owners and reception keep exactly today's access (their permissive policies decide).
-- Check: npx supabase db query --linked -f supabase/tests/multi-doctor/07_clinical_visibility.sql

ALTER TABLE public.website_settings ADD COLUMN IF NOT EXISTS clinical_visibility text NOT NULL DEFAULT 'shared'
  CHECK (clinical_visibility IN ('shared', 'treating'));

-- Only the clinic owner chooses the mode. Calls without a JWT (service role, migrations) are trusted.
CREATE OR REPLACE FUNCTION public.guard_clinical_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() = NEW.doctor_id THEN
    RETURN NEW;
  END IF;
  IF (TG_OP = 'INSERT' AND NEW.clinical_visibility IS DISTINCT FROM 'shared')
     OR (TG_OP = 'UPDATE' AND NEW.clinical_visibility IS DISTINCT FROM OLD.clinical_visibility) THEN
    RAISE EXCEPTION 'OWNER_ONLY' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_clinical_visibility ON public.website_settings;
CREATE TRIGGER trg_guard_clinical_visibility
  BEFORE INSERT OR UPDATE OF clinical_visibility ON public.website_settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_clinical_visibility();

-- True unless the caller is an active doctor-role login of this clinic, the clinic is in
-- "treating" mode, and the row is neither theirs nor about a patient they have a booking with.
-- Always true or false, never NULL (practitioner_id is nullable on patient_documents,
-- patient_id is nullable on prescriptions).
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
  RETURN COALESCE(
    _practitioner_id = v_mine
    OR EXISTS (SELECT 1 FROM public.appointments a
                WHERE a.doctor_id = _doctor_id AND a.patient_id = _patient_id AND a.practitioner_id = v_mine),
    false);
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
-- my_practitioner_id() is NULL for non-doctors: the comparison is then NULL, which RLS refuses.
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

-- get_shared_prescription, copied from 20261120100000_prescription_shares.sql (identical to the
-- live definition). Only change: the doctor block names the prescription's author doctor
-- (practitioner values, falling back to profiles). The owner's own practitioner row is skipped,
-- so the owner's prescriptions (every single-doctor clinic) read exactly as before. Clinic
-- fields always come from profiles.
CREATE OR REPLACE FUNCTION public.get_shared_prescription(_token text, _phone_last4 text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  h text;
  sh public.prescription_shares%ROWTYPE;
  rx public.prescriptions%ROWTYPE;
  pt public.patients%ROWTYPE;
  throttle_key text;
  phone_digits text;
  doc jsonb;
  vis jsonb;
  vit jsonb;
BEGIN
  IF length(COALESCE(_token, '')) < 32 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;
  h := encode(sha256(convert_to(_token, 'utf8')), 'hex');

  SELECT * INTO sh FROM public.prescription_shares WHERE token_hash = h;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;
  IF sh.revoked_at IS NOT NULL OR sh.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'EXPIRED');
  END IF;

  throttle_key := 'rx:' || sh.id::text;
  IF public.token_lookup_blocked(sh.doctor_id, throttle_key) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOO_MANY_ATTEMPTS');
  END IF;

  SELECT * INTO rx FROM public.prescriptions WHERE id = sh.prescription_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;
  IF rx.patient_id IS NOT NULL THEN
    SELECT * INTO pt FROM public.patients WHERE id = rx.patient_id;
  END IF;

  -- The phone check applies whenever the patient has a number on file.
  phone_digits := regexp_replace(COALESCE(pt.phone, ''), '\D', '', 'g');
  IF length(phone_digits) >= 4 THEN
    IF COALESCE(_phone_last4, '') !~ '^\d{4}$' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PHONE_REQUIRED');
    END IF;
    IF right(phone_digits, 4) <> _phone_last4 THEN
      PERFORM public.token_lookup_failed(sh.doctor_id, throttle_key);
      RETURN jsonb_build_object('ok', false, 'error', 'PHONE_REQUIRED');
    END IF;
  END IF;
  PERFORM public.token_lookup_ok(sh.doctor_id, throttle_key);

  UPDATE public.prescription_shares
     SET view_count = view_count + 1,
         first_viewed_at = COALESCE(first_viewed_at, now()),
         last_viewed_at = now()
   WHERE id = sh.id;

  SELECT jsonb_build_object(
           'full_name', COALESCE(pr.display_name, p.full_name),
           'qualifications', COALESCE(pr.qualifications, p.qualifications),
           'specialization', COALESCE(pr.specialization, p.specialization),
           'registration_number', COALESCE(pr.registration_number, p.registration_number),
           'clinic_name', p.clinic_name, 'address', p.address,
           'city', p.city, 'phone', p.phone, 'clinic_email', p.clinic_email,
           'signature_url', COALESCE(pr.signature_url, p.signature_url),
           'slug', p.slug)
    INTO doc FROM public.profiles p
    LEFT JOIN public.practitioners pr
      ON pr.id = rx.practitioner_id AND pr.doctor_id = rx.doctor_id
     AND pr.user_id IS DISTINCT FROM rx.doctor_id
   WHERE p.id = rx.doctor_id;

  IF rx.visit_id IS NOT NULL THEN
    SELECT to_jsonb(v) INTO vis FROM (
      SELECT visit_date, reason_for_visit, symptoms FROM public.patient_visits WHERE id = rx.visit_id) v;
    SELECT to_jsonb(t) INTO vit FROM (
      SELECT blood_pressure, pulse, temperature, respiratory_rate, spo2, height, weight, bmi
        FROM public.patient_vitals WHERE visit_id = rx.visit_id
       ORDER BY recorded_date DESC LIMIT 1) t;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'doctor', COALESCE(doc, '{}'::jsonb),
    'prescription', jsonb_build_object(
      'id', rx.id, 'patient_id', rx.patient_id, 'patient_name', rx.patient_name,
      'diagnosis', rx.diagnosis, 'medications', rx.medications, 'medicines', rx.medicines,
      'advice', rx.advice, 'diet_advice', rx.diet_advice, 'lifestyle_advice', rx.lifestyle_advice,
      'follow_up_date', rx.follow_up_date, 'follow_up_instructions', rx.follow_up_instructions,
      'date', rx.date, 'patient_age', rx.patient_age, 'patient_weight', rx.patient_weight,
      'patient_gender', pt.gender, 'visit', vis, 'vitals', vit),
    'expires_at', sh.expires_at);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_shared_prescription(text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
