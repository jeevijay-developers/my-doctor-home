-- A doctor can ask for the social media marketing add-on from "Customize my plan".
--
-- Social media marketing is a service the team delivers, not an on/off feature, so it is NOT a row
-- in `features`. The request just carries a flag; the superadmin sees it on the review screen,
-- starts the add-on (a draft scope) when approving, and agrees scope + fee + agreement with the
-- clinic as before (20261127180000_social_marketing_addon.sql). Nothing is promised by asking.

ALTER TABLE public.plan_requests
  ADD COLUMN IF NOT EXISTS requested_social_marketing boolean NOT NULL DEFAULT false;

-- A request may now ask ONLY for social media marketing.
ALTER TABLE public.plan_requests DROP CONSTRAINT IF EXISTS plan_requests_has_change;
ALTER TABLE public.plan_requests ADD CONSTRAINT plan_requests_has_change
  CHECK (cardinality(add_features) + cardinality(remove_features) > 0
         OR requested_appointments_limit IS NOT NULL
         OR requested_social_marketing);

-- submit_plan_request gains `_social_marketing`. Restated whole (it already carries several patches).
DROP FUNCTION IF EXISTS public.submit_plan_request(text[], text[], text, integer);

CREATE FUNCTION public.submit_plan_request(
  _add text[], _remove text[], _note text DEFAULT NULL, _appointments_limit integer DEFAULT NULL,
  _social_marketing boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  p public.profiles%ROWTYPE;
  k text;
  new_id uuid;
  last_rejected timestamptz;
  v_current integer;
  v_social boolean := COALESCE(_social_marketing, false);
BEGIN
  -- Staff have no profiles row, so this also blocks staff sessions.
  SELECT * INTO p FROM public.profiles WHERE id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the doctor can request plan changes'; END IF;

  _add := COALESCE(_add, '{}');
  _remove := COALESCE(_remove, '{}');
  IF cardinality(_add) + cardinality(_remove) = 0 AND _appointments_limit IS NULL AND NOT v_social THEN
    RAISE EXCEPTION 'Select at least one feature, a new appointment limit or social media marketing';
  END IF;
  IF _add && _remove THEN
    RAISE EXCEPTION 'A feature cannot be both added and removed';
  END IF;
  IF _note IS NOT NULL AND char_length(_note) > 1000 THEN
    RAISE EXCEPTION 'Note is too long (max 1000 characters)';
  END IF;
  IF _appointments_limit IS NOT NULL AND NOT (_appointments_limit = -1 OR _appointments_limit BETWEEN 1 AND 100000) THEN
    RAISE EXCEPTION 'The monthly appointment limit must be a number from 1 to 100000, or unlimited';
  END IF;

  IF p.plan_status = 'trial' THEN
    RAISE EXCEPTION 'Custom plans are available once you are on a paid plan';
  END IF;
  IF p.plan_status <> 'active' THEN
    RAISE EXCEPTION 'Reactivate your subscription before requesting plan changes';
  END IF;
  IF COALESCE(p.plan_tier, 'free') NOT IN ('pro', 'premium') THEN
    RAISE EXCEPTION 'Custom plans are built on the Pro or Premium plan. Choose a plan first';
  END IF;

  IF _appointments_limit IS NOT NULL THEN
    IF p.plan_tier <> 'pro' THEN
      RAISE EXCEPTION 'Your plan already includes unlimited appointments';
    END IF;
    v_current := public.doctor_monthly_appointment_limit(uid);
    IF (_appointments_limit = -1 AND v_current IS NULL) OR _appointments_limit = v_current THEN
      RAISE EXCEPTION 'Your plan already has that appointment limit';
    END IF;
  END IF;

  IF v_social AND EXISTS (
    SELECT 1 FROM public.custom_plan_social_marketing WHERE doctor_id = uid AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Social media marketing is already included in your plan';
  END IF;

  SELECT max(decided_at) INTO last_rejected FROM public.plan_requests
  WHERE doctor_id = uid AND status = 'rejected';
  IF last_rejected IS NOT NULL AND last_rejected > now() - interval '24 hours' THEN
    RAISE EXCEPTION 'Please wait 24 hours after a rejected request before submitting another';
  END IF;

  FOREACH k IN ARRAY _add LOOP
    IF NOT EXISTS (SELECT 1 FROM public.features WHERE key = k AND is_active AND is_requestable) THEN
      RAISE EXCEPTION 'Feature "%" cannot be requested', k;
    END IF;
    IF public.doctor_has_feature(uid, k) THEN
      RAISE EXCEPTION 'Feature "%" is already included in your plan', k;
    END IF;
  END LOOP;
  FOREACH k IN ARRAY _remove LOOP
    IF NOT EXISTS (SELECT 1 FROM public.features WHERE key = k AND is_active AND is_requestable) THEN
      RAISE EXCEPTION 'Feature "%" cannot be requested', k;
    END IF;
    IF NOT public.doctor_has_feature(uid, k) THEN
      RAISE EXCEPTION 'Feature "%" is not part of your plan', k;
    END IF;
  END LOOP;

  BEGIN
    INSERT INTO public.plan_requests
      (doctor_id, base_tier, add_features, remove_features, doctor_note, requested_appointments_limit, requested_social_marketing)
    VALUES
      (uid, COALESCE(p.plan_tier, 'pro'), _add, _remove, NULLIF(btrim(_note), ''), _appointments_limit, v_social)
    RETURNING id INTO new_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'You already have a request under review. Withdraw it to submit a new one';
  END;

  INSERT INTO public.plan_request_events (request_id, doctor_id, actor_id, event, details)
  VALUES (new_id, uid, uid, 'submitted', jsonb_build_object(
    'add', _add, 'remove', _remove, 'appointments_limit', _appointments_limit, 'social_marketing', v_social));

  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_plan_request(text[], text[], text, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_plan_request(text[], text[], text, integer, boolean) TO authenticated;
