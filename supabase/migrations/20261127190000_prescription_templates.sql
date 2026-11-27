-- Prescription templates: each clinic (or each doctor of a multi-doctor clinic) builds its own
-- slip layout and extra fields. See docs/superpowers/specs/2026-11-27-prescription-templates-design.md.
--
--  * prescription_templates   the saved templates (config = TemplateConfig v1, see
--                             src/lib/prescriptionTemplate/types.ts: keep the limits below in sync)
--  * prescriptions.extra      answers to a template's custom fields, keyed by block id
--  * prescriptions.template_snapshot  the config the prescription was issued with (NULL = the
--                             built-in standard slip), so editing a template never changes old slips
--  * get_shared_prescription  also returns extra + template_snapshot for the patient's /rx page

-- Fail fast instead of queueing behind a long transaction and stalling every writer of prescriptions.
SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Config validation (shape and limits). IMMUTABLE: depends only on its argument.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prescription_template_config_valid(_c jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  b jsonb;
  o jsonb;
  f jsonb;
  t text;
  bid text;
  ids text[] := ARRAY[]::text[];
  builtins text[] := ARRAY[]::text[];
  n int := 0;
  customs int := 0;
  k text;
BEGIN
  IF _c IS NULL OR jsonb_typeof(_c) <> 'object' THEN RETURN false; END IF;
  IF octet_length(_c::text) > 65536 THEN RETURN false; END IF;
  IF _c -> 'version' IS DISTINCT FROM '1'::jsonb THEN RETURN false; END IF;
  IF COALESCE(_c ->> 'accent', '') !~ '^#[0-9a-fA-F]{6}$' THEN RETURN false; END IF;
  IF _c -> 'title' IS NOT NULL THEN
    IF jsonb_typeof(_c -> 'title') <> 'string' THEN RETURN false; END IF;
    IF char_length(_c ->> 'title') > 40 THEN RETURN false; END IF;
  END IF;
  IF _c -> 'letterhead' IS NOT NULL AND COALESCE(_c ->> 'letterhead', '') NOT IN ('standard', 'preprinted') THEN
    RETURN false;
  END IF;
  FOREACH k IN ARRAY ARRAY['preprintedTopMm', 'preprintedBottomMm'] LOOP
    IF _c -> k IS NOT NULL THEN
      IF jsonb_typeof(_c -> k) <> 'number' THEN RETURN false; END IF;
      IF (_c ->> k)::numeric < 0 OR (_c ->> k)::numeric > 80 THEN RETURN false; END IF;
    END IF;
  END LOOP;
  IF COALESCE(jsonb_typeof(_c -> 'blocks'), '') <> 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(_c -> 'blocks') > 40 THEN RETURN false; END IF;

  FOR b IN SELECT value FROM jsonb_array_elements(_c -> 'blocks') LOOP
    n := n + 1;
    IF jsonb_typeof(b) <> 'object' THEN RETURN false; END IF;
    IF COALESCE(jsonb_typeof(b -> 'enabled'), '') <> 'boolean' THEN RETURN false; END IF;
    IF COALESCE(jsonb_typeof(b -> 'id'), '') <> 'string' OR COALESCE(jsonb_typeof(b -> 'type'), '') <> 'string' THEN RETURN false; END IF;
    t := b ->> 'type';
    bid := b ->> 'id';
    IF bid IS NULL OR bid !~ '^[a-z][a-z0-9_]{0,31}$' OR bid = ANY (ids) THEN RETURN false; END IF;
    ids := ids || bid;

    IF t IN ('patient_info', 'vitals', 'medicines', 'advice', 'follow_up', 'signature') THEN
      IF bid <> t OR t = ANY (builtins) THEN RETURN false; END IF;
      builtins := builtins || t;
      IF t = 'patient_info' AND b -> 'fields' IS NOT NULL THEN
        IF jsonb_typeof(b -> 'fields') <> 'array' THEN RETURN false; END IF;
        IF jsonb_array_length(b -> 'fields') > 10 THEN RETURN false; END IF;
        FOR f IN SELECT value FROM jsonb_array_elements(b -> 'fields') LOOP
          IF jsonb_typeof(f) <> 'string' THEN RETURN false; END IF;
          IF (f #>> '{}') NOT IN
             ('patient_name', 'age', 'gender', 'weight', 'diagnosis', 'complaint', 'symptoms', 'date', 'rx_id', 'patient_id')
          THEN RETURN false; END IF;
        END LOOP;
      END IF;
    ELSIF t = 'custom' THEN
      customs := customs + 1;
      IF customs > 30 THEN RETURN false; END IF;
      IF COALESCE(jsonb_typeof(b -> 'label'), '') <> 'string' THEN RETURN false; END IF;
      IF char_length(btrim(b ->> 'label')) < 1 OR char_length(btrim(b ->> 'label')) > 60 THEN RETURN false; END IF;
      IF COALESCE(b ->> 'fieldType', '') NOT IN
         ('text', 'textarea', 'number', 'select', 'multiselect', 'checkbox', 'date', 'tooth_chart', 'pain_scale')
      THEN RETURN false; END IF;
      IF b -> 'required' IS NOT NULL AND jsonb_typeof(b -> 'required') <> 'boolean' THEN RETURN false; END IF;
      IF (b ->> 'fieldType') IN ('select', 'multiselect')
         AND (COALESCE(jsonb_typeof(b -> 'options'), '') <> 'array' OR jsonb_array_length(COALESCE(b -> 'options', '[]'::jsonb)) < 2) THEN
        RETURN false;
      END IF;
      IF b -> 'options' IS NOT NULL THEN
        IF jsonb_typeof(b -> 'options') <> 'array' THEN RETURN false; END IF;
        IF jsonb_array_length(b -> 'options') > 20 THEN RETURN false; END IF;
        FOR o IN SELECT value FROM jsonb_array_elements(b -> 'options') LOOP
          IF jsonb_typeof(o) <> 'string' THEN RETURN false; END IF;
          IF char_length(o #>> '{}') < 1 OR char_length(o #>> '{}') > 40 THEN RETURN false; END IF;
        END LOOP;
      END IF;
    ELSE
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------------
CREATE TABLE public.prescription_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- NULL = the whole clinic; otherwise that doctor's own template.
  practitioner_id uuid,
  name text NOT NULL,
  preset text,
  config jsonb NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prescription_templates_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  CONSTRAINT prescription_templates_preset_len CHECK (preset IS NULL OR char_length(preset) <= 30),
  CONSTRAINT prescription_templates_config_valid CHECK (public.prescription_template_config_valid(config)),
  CONSTRAINT prescription_templates_practitioner_fk
    FOREIGN KEY (practitioner_id, doctor_id) REFERENCES public.practitioners (id, doctor_id) ON DELETE CASCADE
);

REVOKE ALL ON public.prescription_templates FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescription_templates TO authenticated;

CREATE INDEX idx_prescription_templates_doctor ON public.prescription_templates (doctor_id);
-- One default per scope (the clinic, or one doctor).
CREATE UNIQUE INDEX uq_prescription_templates_clinic_default
  ON public.prescription_templates (doctor_id) WHERE is_default AND practitioner_id IS NULL;
CREATE UNIQUE INDEX uq_prescription_templates_doctor_default
  ON public.prescription_templates (doctor_id, practitioner_id) WHERE is_default AND practitioner_id IS NOT NULL;

CREATE TRIGGER update_prescription_templates_updated_at BEFORE UPDATE ON public.prescription_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- At most 20 templates per clinic; a new default demotes the previous default of its scope first
-- (BEFORE, so the unique indexes above are never violated). SECURITY DEFINER: the count and the
-- demotion must not depend on which rows the caller can see.
CREATE OR REPLACE FUNCTION public.prescription_templates_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Row-level security runs AFTER this trigger. A caller who may not write this clinic's templates
  -- gets no side effects and no information here (no cap error, no demotion): RLS refuses the row.
  IF auth.uid() IS NOT NULL
     AND auth.uid() IS DISTINCT FROM NEW.doctor_id
     AND NOT (public.staff_doctor_id(auth.uid()) IS NOT DISTINCT FROM NEW.doctor_id) THEN
    RETURN NEW;
  END IF;
  -- One writer at a time per clinic: the cap and the one-default rule are checked under this lock.
  PERFORM pg_advisory_xact_lock(hashtextextended('prescription_templates:' || NEW.doctor_id::text, 0));
  IF TG_OP = 'INSERT' THEN
    IF (SELECT count(*) FROM public.prescription_templates WHERE doctor_id = NEW.doctor_id) >= 20 THEN
      RAISE EXCEPTION 'TEMPLATE_LIMIT' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.is_default THEN
    UPDATE public.prescription_templates
       SET is_default = false
     WHERE doctor_id = NEW.doctor_id
       AND practitioner_id IS NOT DISTINCT FROM NEW.practitioner_id
       AND is_default
       AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prescription_templates_before_write() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_prescription_templates_before_write
  BEFORE INSERT OR UPDATE ON public.prescription_templates
  FOR EACH ROW EXECUTE FUNCTION public.prescription_templates_before_write();

ALTER TABLE public.prescription_templates ENABLE ROW LEVEL SECURITY;

-- Read: the owner, and any login that issues or views prescriptions (they need the template to
-- fill the form and print the slip). `staff_doctor_id` is NULL for strangers, so the chain is
-- wrapped in COALESCE and a stranger is refused.
CREATE POLICY "Clinic reads its prescription templates" ON public.prescription_templates
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = doctor_id
    OR COALESCE(
      public.staff_doctor_id((SELECT auth.uid())) = doctor_id
      AND (public.staff_has_permission((SELECT auth.uid()), 'prescriptions.view')
           OR public.staff_has_permission((SELECT auth.uid()), 'prescriptions.create')),
      false)
  );

-- Write: the owner (any template), or a doctor login with prescriptions.edit (only templates
-- scoped to their own doctor row).
CREATE POLICY "Owner or the doctor writes prescription templates (insert)" ON public.prescription_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = doctor_id
    OR COALESCE(
      practitioner_id IS NOT NULL
      AND practitioner_id = public.my_practitioner_id(doctor_id)
      AND public.staff_doctor_id((SELECT auth.uid())) = doctor_id
      AND public.staff_has_permission((SELECT auth.uid()), 'prescriptions.edit'),
      false)
  );

CREATE POLICY "Owner or the doctor writes prescription templates (update)" ON public.prescription_templates
  FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = doctor_id
    OR COALESCE(
      practitioner_id IS NOT NULL
      AND practitioner_id = public.my_practitioner_id(doctor_id)
      AND public.staff_doctor_id((SELECT auth.uid())) = doctor_id
      AND public.staff_has_permission((SELECT auth.uid()), 'prescriptions.edit'),
      false)
  )
  WITH CHECK (
    (SELECT auth.uid()) = doctor_id
    OR COALESCE(
      practitioner_id IS NOT NULL
      AND practitioner_id = public.my_practitioner_id(doctor_id)
      AND public.staff_doctor_id((SELECT auth.uid())) = doctor_id
      AND public.staff_has_permission((SELECT auth.uid()), 'prescriptions.edit'),
      false)
  );

CREATE POLICY "Owner or the doctor writes prescription templates (delete)" ON public.prescription_templates
  FOR DELETE TO authenticated
  USING (
    (SELECT auth.uid()) = doctor_id
    OR COALESCE(
      practitioner_id IS NOT NULL
      AND practitioner_id = public.my_practitioner_id(doctor_id)
      AND public.staff_doctor_id((SELECT auth.uid())) = doctor_id
      AND public.staff_has_permission((SELECT auth.uid()), 'prescriptions.edit'),
      false)
  );

-- ---------------------------------------------------------------------------
-- Prescriptions: custom-field answers + the layout they were issued with
-- ---------------------------------------------------------------------------
ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS template_id uuid,
  ADD COLUMN IF NOT EXISTS template_snapshot jsonb;

-- Added NOT VALID so this transaction does not scan the whole prescriptions table while holding its
-- lock (every existing row trivially satisfies them: extra = '{}', no snapshot, no template).
-- They are validated in the next migration file, which runs in its own transaction.
ALTER TABLE public.prescriptions
  ADD CONSTRAINT prescriptions_template_fk
    FOREIGN KEY (template_id) REFERENCES public.prescription_templates (id) ON DELETE SET NULL NOT VALID,
  ADD CONSTRAINT prescriptions_extra_shape
    CHECK (jsonb_typeof(extra) = 'object' AND octet_length(extra::text) <= 32768) NOT VALID,
  ADD CONSTRAINT prescriptions_template_snapshot_valid
    CHECK (template_snapshot IS NULL OR public.prescription_template_config_valid(template_snapshot)) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_prescriptions_template_id ON public.prescriptions (template_id) WHERE template_id IS NOT NULL;

COMMENT ON COLUMN public.prescriptions.extra IS
  'Answers to the template''s custom fields, keyed by block id: string | number | boolean | string[] | { "<FDI tooth>": "<status>" }.';
COMMENT ON COLUMN public.prescriptions.template_snapshot IS
  'The template config (TemplateConfig v1) this prescription was issued with. NULL = the built-in standard slip.';

-- ---------------------------------------------------------------------------
-- The patient's /rx page: same function as 20261126100500_shared_rx_doctor_names.sql, plus
-- extra and template_snapshot in the prescription object. Still behind the phone-last-4 check.
-- ---------------------------------------------------------------------------
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
      'patient_gender', pt.gender, 'visit', vis, 'vitals', vit,
      'extra', rx.extra, 'template_snapshot', rx.template_snapshot),
    'expires_at', sh.expires_at);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_shared_prescription(text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
