-- Shared prescription (/rx): make the author doctor's block match the printed slip.
-- Mirrors src/lib/practitioners/slipDoctor.ts (keep the two in sync):
--  * the slip and share text print "Dr. " themselves, so a typed "Dr."/"Dr " prefix is dropped
--    from the practitioner's display_name ("Drake" is untouched: the prefix needs a dot or space);
--  * a clinic without a clinic_name is shown as "Dr. <owner name> Clinic" when the author is another
--    doctor, so the slip does not name the clinic after the author. Owner-authored rows (no
--    practitioner overlay) are unchanged.
-- Otherwise identical to the live definition from 20261126100200_clinical_visibility.sql.
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
           'full_name', COALESCE(NULLIF(btrim(regexp_replace(regexp_replace(pr.display_name, '^\s+|\s+$', '', 'g'), '^dr\.?\s+', '', 'i')), ''), p.full_name),
           'qualifications', COALESCE(pr.qualifications, p.qualifications),
           'specialization', COALESCE(pr.specialization, p.specialization),
           'registration_number', COALESCE(pr.registration_number, p.registration_number),
           'clinic_name', CASE
             WHEN pr.id IS NOT NULL AND btrim(COALESCE(p.clinic_name, '')) = '' AND btrim(COALESCE(p.full_name, '')) <> ''
             THEN 'Dr. ' || p.full_name || ' Clinic'
             ELSE p.clinic_name END,
           'address', p.address,
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
