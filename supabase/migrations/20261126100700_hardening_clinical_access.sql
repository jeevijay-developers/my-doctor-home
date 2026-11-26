-- Multi-doctor hardening 2: clinical access in "own patients only" (treating) mode.
-- Treating mode, as defined by clinical_row_visible: a doctor login sees a row if it is theirs, or
-- the patient has a NON-CANCELLED booking with them. Doctor logins can no longer create or move
-- bookings (20261126100600), so a booking cannot be used to widen access.
-- Check: npx supabase db query --linked -f supabase/tests/multi-doctor/12_hardening_clinical.sql

-- ---- 1. A cancelled booking does not make a patient "mine" ----
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
                WHERE a.doctor_id = _doctor_id AND a.patient_id = _patient_id AND a.practitioner_id = v_mine
                  AND a.status::text <> 'cancelled'),
    false);
END;
$$;

-- ---- 2. The same rule on the rest of the patient's clinical record ----
-- RESTRICTIVE and true for anyone who is not a doctor login, so owners and reception keep today's access.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['patient_vitals', 'patient_allergies', 'patient_conditions',
                           'patient_medications', 'patient_surgeries', 'patient_family_history'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Clinical visibility between doctors" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Clinical visibility between doctors" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (public.clinical_row_visible(doctor_id, patient_id, NULL)) '
      'WITH CHECK (public.clinical_row_visible(doctor_id, patient_id, NULL))', t);
  END LOOP;
END $$;

-- ---- 3. Prescription shares follow the prescription ----
-- True when the caller may see the prescription (false for a missing one).
CREATE OR REPLACE FUNCTION public.prescription_row_visible(_prescription_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT public.clinical_row_visible(rx.doctor_id, rx.patient_id, rx.practitioner_id)
       FROM public.prescriptions rx WHERE rx.id = _prescription_id),
    false)
$$;
REVOKE ALL ON FUNCTION public.prescription_row_visible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prescription_row_visible(uuid) TO authenticated;

DROP POLICY IF EXISTS "Shares follow prescription visibility" ON public.prescription_shares;
CREATE POLICY "Shares follow prescription visibility" ON public.prescription_shares
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.prescription_row_visible(prescription_id));

-- Bodies are the live definitions plus the visibility check (and COALESCE around the permission
-- check, which is NULL for a stranger).
CREATE OR REPLACE FUNCTION public.create_prescription_share(_prescription_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rx public.prescriptions%ROWTYPE;
  tok text;
  exp timestamptz;
BEGIN
  SELECT * INTO rx FROM public.prescriptions WHERE id = _prescription_id;
  IF NOT FOUND
     OR NOT COALESCE(public.can_share_prescription(rx.doctor_id), false)
     OR NOT COALESCE(public.clinical_row_visible(rx.doctor_id, rx.patient_id, rx.practitioner_id), false) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  UPDATE public.prescription_shares
     SET revoked_at = now()
   WHERE prescription_id = _prescription_id AND revoked_at IS NULL;

  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  exp := now() + interval '30 days';
  INSERT INTO public.prescription_shares (prescription_id, doctor_id, token_hash, created_by, expires_at)
  VALUES (_prescription_id, rx.doctor_id, encode(sha256(convert_to(tok, 'utf8')), 'hex'), auth.uid(), exp);

  RETURN jsonb_build_object('token', tok, 'expires_at', exp);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_prescription_share(_prescription_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rx public.prescriptions%ROWTYPE;
BEGIN
  SELECT * INTO rx FROM public.prescriptions WHERE id = _prescription_id;
  IF NOT FOUND
     OR NOT COALESCE(public.can_share_prescription(rx.doctor_id), false)
     OR NOT COALESCE(public.clinical_row_visible(rx.doctor_id, rx.patient_id, rx.practitioner_id), false) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  UPDATE public.prescription_shares
     SET revoked_at = now()
   WHERE prescription_id = _prescription_id AND revoked_at IS NULL;
END;
$$;

-- ---- 4. Storage ----
-- patient-documents objects live at <clinic uuid>/<patient uuid>/<file>. The helper never raises;
-- an unreadable clinic segment is refused, an unreadable patient segment is treated as "no
-- patient" (visible to everyone but a doctor login in treating mode).
CREATE OR REPLACE FUNCTION public.storage_patient_object_visible(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  f text[];
  v_clinic uuid;
  v_patient uuid;
BEGIN
  f := storage.foldername(_name);
  v_clinic := f[1]::uuid;
  IF v_clinic IS NULL THEN
    RETURN false;
  END IF;
  BEGIN
    v_patient := f[2]::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_patient := NULL;
  END;
  RETURN COALESCE(public.clinical_row_visible(v_clinic, v_patient, NULL), false);
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.storage_patient_object_visible(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_patient_object_visible(text) TO authenticated;

DROP POLICY IF EXISTS "Patient documents follow clinical visibility (read)" ON storage.objects;
CREATE POLICY "Patient documents follow clinical visibility (read)" ON storage.objects
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (bucket_id <> 'patient-documents' OR public.storage_patient_object_visible(name));

DROP POLICY IF EXISTS "Patient documents follow clinical visibility (delete)" ON storage.objects;
CREATE POLICY "Patient documents follow clinical visibility (delete)" ON storage.objects
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (bucket_id <> 'patient-documents' OR public.storage_patient_object_visible(name));

-- A doctor's photo and signature (doctor-uploads/<clinic>/practitioners/<id>/...) are written only
-- by the clinic owner or staff who may manage doctors. Every other doctor-uploads path is unchanged.
DROP POLICY IF EXISTS "Doctor files only by managers (insert)" ON storage.objects;
CREATE POLICY "Doctor files only by managers (insert)" ON storage.objects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'doctor-uploads'
              OR (storage.foldername(name))[2] IS DISTINCT FROM 'practitioners'
              OR (auth.uid())::text = (storage.foldername(name))[1]
              OR ((public.staff_doctor_id(auth.uid()))::text = (storage.foldername(name))[1]
                  AND COALESCE(public.staff_has_permission(auth.uid(), 'practitioners.manage'), false)));

DROP POLICY IF EXISTS "Doctor files only by managers (update)" ON storage.objects;
CREATE POLICY "Doctor files only by managers (update)" ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'doctor-uploads'
         OR (storage.foldername(name))[2] IS DISTINCT FROM 'practitioners'
         OR (auth.uid())::text = (storage.foldername(name))[1]
         OR ((public.staff_doctor_id(auth.uid()))::text = (storage.foldername(name))[1]
             AND COALESCE(public.staff_has_permission(auth.uid(), 'practitioners.manage'), false)))
  WITH CHECK (bucket_id <> 'doctor-uploads'
              OR (storage.foldername(name))[2] IS DISTINCT FROM 'practitioners'
              OR (auth.uid())::text = (storage.foldername(name))[1]
              OR ((public.staff_doctor_id(auth.uid()))::text = (storage.foldername(name))[1]
                  AND COALESCE(public.staff_has_permission(auth.uid(), 'practitioners.manage'), false)));

DROP POLICY IF EXISTS "Doctor files only by managers (delete)" ON storage.objects;
CREATE POLICY "Doctor files only by managers (delete)" ON storage.objects
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (bucket_id <> 'doctor-uploads'
         OR (storage.foldername(name))[2] IS DISTINCT FROM 'practitioners'
         OR (auth.uid())::text = (storage.foldername(name))[1]
         OR ((public.staff_doctor_id(auth.uid()))::text = (storage.foldername(name))[1]
             AND COALESCE(public.staff_has_permission(auth.uid(), 'practitioners.manage'), false)));

NOTIFY pgrst, 'reload schema';
