-- Share a prescription with the patient through a private link.
--
-- The doctor (or staff who can view prescriptions) taps "Share on WhatsApp"; that creates one
-- active link per prescription. The link token is long and random and only its SHA-256 is
-- stored, so a leaked table does not leak working links. Opening the link also asks for the
-- last 4 digits of the patient's phone, and wrong guesses lock the link for 15 minutes.
-- Links expire after 30 days and can be revoked. Nothing is sent automatically.

CREATE TABLE IF NOT EXISTS public.prescription_shares (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id  uuid        NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  doctor_id        uuid        NOT NULL,
  token_hash       text        NOT NULL UNIQUE,
  channel          text        NOT NULL DEFAULT 'whatsapp',
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  revoked_at       timestamptz,
  first_viewed_at  timestamptz,
  last_viewed_at   timestamptz,
  view_count       integer     NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_prescription_shares_rx ON public.prescription_shares (prescription_id, created_at DESC);

ALTER TABLE public.prescription_shares ENABLE ROW LEVEL SECURITY;
-- Read-only for the clinic (to show "Shared / Viewed"); every write goes through the RPCs below.
REVOKE ALL ON public.prescription_shares FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.prescription_shares TO authenticated;

CREATE POLICY "Doctors read own prescription shares" ON public.prescription_shares
  FOR SELECT TO authenticated USING (doctor_id = auth.uid());
CREATE POLICY "Staff read prescription shares with permission" ON public.prescription_shares
  FOR SELECT TO authenticated USING (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'prescriptions.view')
  );

-- Who may share: the doctor, or active staff of that doctor with prescriptions.view.
CREATE OR REPLACE FUNCTION public.can_share_prescription(_doctor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() = _doctor_id
      OR (public.staff_doctor_id(auth.uid()) = _doctor_id
          AND public.staff_has_permission(auth.uid(), 'prescriptions.view'));
$$;
REVOKE ALL ON FUNCTION public.can_share_prescription(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_share_prescription(uuid) TO authenticated;

-- Creates a fresh link (revoking any earlier active one) and returns the plain token ONCE.
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
  IF NOT FOUND OR NOT public.can_share_prescription(rx.doctor_id) THEN
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
REVOKE ALL ON FUNCTION public.create_prescription_share(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_prescription_share(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_prescription_share(_prescription_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  owner uuid;
BEGIN
  SELECT doctor_id INTO owner FROM public.prescriptions WHERE id = _prescription_id;
  IF owner IS NULL OR NOT public.can_share_prescription(owner) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  UPDATE public.prescription_shares
     SET revoked_at = now()
   WHERE prescription_id = _prescription_id AND revoked_at IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_prescription_share(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_prescription_share(uuid) TO authenticated;

-- Public: the patient's page. Answers { ok: false, error } for anything wrong, with the same
-- shape for "no such link" and "wrong digits" so neither can be told apart by probing.
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
           'full_name', p.full_name, 'qualifications', p.qualifications, 'specialization', p.specialization,
           'registration_number', p.registration_number, 'clinic_name', p.clinic_name, 'address', p.address,
           'city', p.city, 'phone', p.phone, 'clinic_email', p.clinic_email, 'signature_url', p.signature_url,
           'slug', p.slug)
    INTO doc FROM public.profiles p WHERE p.id = rx.doctor_id;

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
