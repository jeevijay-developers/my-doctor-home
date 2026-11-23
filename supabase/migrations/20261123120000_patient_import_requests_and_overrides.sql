-- Patient import limits, part 3: the clinic's request for a higher limit, the superadmin's
-- decision, and the superadmin's allow/block override for one clinic.
-- Clients have no write access to the request/override tables; these functions are the only way in.

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
  v_note text := NULLIF(regexp_replace(COALESCE(_note, ''), '^\s+|\s+$', '', 'g'), '');
  new_id uuid;
BEGIN
  IF clinic IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF NOT public.patient_import_eligible(clinic) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_ELIGIBLE');
  END IF;

  v_cap := public.patient_import_cap(clinic);
  IF _requested IS NULL OR _requested <= v_cap OR _requested > ceil THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BAD_NUMBER', 'cap', v_cap, 'ceiling', ceil);
  END IF;
  IF length(COALESCE(v_note, '')) > 1000 THEN
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
    VALUES (clinic, _requested, v_note, v_count, v_cap)
    RETURNING id INTO new_id;
  EXCEPTION WHEN unique_violation THEN
    -- two requests raced past the EXISTS check; the partial unique index let only one in
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
  v_note text := NULLIF(regexp_replace(COALESCE(_note, ''), '^\s+|\s+$', '', 'g'), '');
BEGIN
  IF NOT public.sa_has_permission(uid, 'plan_requests.manage') THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- NULL must be refused explicitly: NULL NOT IN (...) is NULL, not true.
  IF _decision IS NULL OR _decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'decision must be approve or reject';
  END IF;
  IF length(COALESCE(v_note, '')) > 1000 THEN
    RAISE EXCEPTION 'The note is too long (1000 characters at most)';
  END IF;

  SELECT * INTO r FROM public.patient_import_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'This request was already % — refresh to see the latest', r.status;
  END IF;

  IF _decision = 'reject' THEN
    IF v_note IS NULL THEN
      RAISE EXCEPTION 'A reason is required when declining';
    END IF;
    UPDATE public.patient_import_requests
       SET status = 'rejected', reviewer_id = uid, reviewer_note = v_note, decided_at = now()
     WHERE id = _request_id;
    INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
    VALUES (uid, 'reject_patient_import_request', 'patient_import_requests', r.id, jsonb_build_object('doctor_id', r.doctor_id));
    INSERT INTO public.notifications (doctor_id, source_type, title, message)
    VALUES (r.doctor_id, 'plan_request', 'Patient import limit request not approved',
            'Your request was not approved. Reason: ' || v_note || ' You can ask again after 7 days.');
    RETURN;
  END IF;

  -- Approving a clinic that can no longer import (downgraded, blocked, plan ended) would raise a
  -- number that does nothing and tell the doctor it was raised. Refuse; the reviewer can decline,
  -- or set an 'allowed' override first. (Declining is always possible.)
  IF NOT public.patient_import_eligible(r.doctor_id) THEN
    RAISE EXCEPTION 'The clinic is not eligible to import right now. Decline the request, or allow the clinic first.';
  END IF;

  -- The cap is GREATEST(tier, newest approval). Every approval must beat the cap held at the time,
  -- so approvals only ever go up and "newest" is also "highest". Keeps the core migration's rule.
  cur := public.patient_import_cap(r.doctor_id);
  IF _approved_cap IS NULL OR _approved_cap <= cur OR _approved_cap > ceil THEN
    RAISE EXCEPTION 'The approved limit must be above the current limit (%) and at most %', cur, ceil;
  END IF;
  UPDATE public.patient_import_requests
     SET status = 'approved', approved_cap = _approved_cap, reviewer_id = uid,
         reviewer_note = v_note, decided_at = now()
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
  v_reason text := NULLIF(regexp_replace(COALESCE(_reason, ''), '^\s+|\s+$', '', 'g'), '');
BEGIN
  IF NOT public.sa_has_permission(uid, 'plan_requests.manage') THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _mode IS NULL OR _mode NOT IN ('allowed', 'blocked', 'clear') THEN
    RAISE EXCEPTION 'mode must be allowed, blocked or clear';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _doctor_id) THEN
    RAISE EXCEPTION 'Doctor not found';
  END IF;

  IF _mode = 'clear' THEN
    DELETE FROM public.patient_import_overrides WHERE doctor_id = _doctor_id;
  ELSE
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'A reason is required for an override';
    END IF;
    IF length(v_reason) > 1000 THEN
      RAISE EXCEPTION 'The reason is too long (1000 characters at most)';
    END IF;
    IF _until IS NOT NULL AND _until <= now() THEN
      RAISE EXCEPTION 'The end date must be in the future';
    END IF;
    INSERT INTO public.patient_import_overrides (doctor_id, mode, until, reason, set_by, set_at)
    VALUES (_doctor_id, _mode, _until, v_reason, uid, now())
    ON CONFLICT (doctor_id) DO UPDATE
       SET mode = EXCLUDED.mode, until = EXCLUDED.until, reason = EXCLUDED.reason,
           set_by = EXCLUDED.set_by, set_at = EXCLUDED.set_at;
  END IF;

  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
  VALUES (uid, 'set_patient_import_override', 'patient_import_overrides', _doctor_id,
          jsonb_build_object('mode', _mode, 'until', _until, 'reason', v_reason));
END;
$$;
REVOKE ALL ON FUNCTION public.set_patient_import_override(uuid, text, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_patient_import_override(uuid, text, timestamptz, text) TO authenticated;

-- Superadmin's view of one clinic's import access (for the doctor detail page).
-- reason: ok_override | blocked_override (an override that has not ended) | ok_plan | plan_not_eligible,
-- derived exactly like patient_import_eligible (override first, then paid tier + active + plan_end).
CREATE OR REPLACE FUNCTION public.get_doctor_import_access(_doctor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.patient_import_overrides%ROWTYPE;
  p public.profiles%ROWTYPE;
  has_o boolean;
  elig boolean;
  v_reason text;
BEGIN
  IF NOT public.sa_has_any_permission(auth.uid(), ARRAY['doctors.view', 'plan_requests.view']) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO p FROM public.profiles WHERE id = _doctor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Doctor not found'; END IF;

  SELECT * INTO o FROM public.patient_import_overrides WHERE doctor_id = _doctor_id AND (until IS NULL OR until > now());
  has_o := FOUND;
  elig := public.patient_import_eligible(_doctor_id);
  v_reason := CASE WHEN has_o AND o.mode = 'allowed' THEN 'ok_override'
                   WHEN has_o THEN 'blocked_override'
                   WHEN elig THEN 'ok_plan'
                   ELSE 'plan_not_eligible' END;

  RETURN jsonb_build_object(
    'eligible', elig,
    'reason', v_reason,
    'plan_tier', p.plan_tier::text,
    'plan_status', p.plan_status::text,
    'plan_end', p.plan_end,
    'cap', public.patient_import_cap(_doctor_id),
    'patient_count', (SELECT count(*) FROM public.patients WHERE doctor_id = _doctor_id),
    'override', CASE WHEN has_o THEN jsonb_build_object('mode', o.mode, 'until', o.until, 'reason', o.reason, 'set_at', o.set_at) END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_doctor_import_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_doctor_import_access(uuid) TO authenticated;
