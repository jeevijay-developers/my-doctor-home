-- Monthly appointment limit as part of a custom plan.
--
-- Until now the monthly appointment limit was a property of the TIER only (Pro: a platform
-- cap, Premium: unlimited), so a custom plan could add or remove features but never give a
-- Pro doctor "300 a month" or "unlimited". It is a number, not an on/off switch, so it does
-- not live in the `features` table; it is stored next to the price on the custom plan.
--
-- Representation (same on requests and plans):
--   NULL  = the tier's standard limit (platform_settings.basic_appointment_cap)
--   -1    = unlimited
--   1..N  = that many non-cancelled appointments per month
--
-- Precedence: Premium / trial are unlimited, then an APPLYING custom plan's value, then the
-- platform standard. One function, doctor_monthly_appointment_limit(), answers it, and the
-- booking trigger, the usage meter and the warnings all read that function so they cannot
-- disagree. The same-tier rule from custom plans applies: the value counts only while the
-- doctor is on the plan's base tier (doctor_active_custom_plan).

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.doctor_custom_plans
  ADD COLUMN IF NOT EXISTS monthly_appointments_limit integer;
ALTER TABLE public.plan_requests
  ADD COLUMN IF NOT EXISTS requested_appointments_limit integer,
  ADD COLUMN IF NOT EXISTS approved_appointments_limit integer;

ALTER TABLE public.doctor_custom_plans DROP CONSTRAINT IF EXISTS doctor_custom_plans_appt_limit;
ALTER TABLE public.doctor_custom_plans ADD CONSTRAINT doctor_custom_plans_appt_limit
  CHECK (monthly_appointments_limit IS NULL OR monthly_appointments_limit = -1 OR monthly_appointments_limit BETWEEN 1 AND 100000);
ALTER TABLE public.plan_requests DROP CONSTRAINT IF EXISTS plan_requests_requested_appt_limit;
ALTER TABLE public.plan_requests ADD CONSTRAINT plan_requests_requested_appt_limit
  CHECK (requested_appointments_limit IS NULL OR requested_appointments_limit = -1 OR requested_appointments_limit BETWEEN 1 AND 100000);
ALTER TABLE public.plan_requests DROP CONSTRAINT IF EXISTS plan_requests_approved_appt_limit;
ALTER TABLE public.plan_requests ADD CONSTRAINT plan_requests_approved_appt_limit
  CHECK (approved_appointments_limit IS NULL OR approved_appointments_limit = -1 OR approved_appointments_limit BETWEEN 1 AND 100000);

-- A request may now ask ONLY for a different appointment limit.
ALTER TABLE public.plan_requests DROP CONSTRAINT IF EXISTS plan_requests_has_change;
ALTER TABLE public.plan_requests ADD CONSTRAINT plan_requests_has_change
  CHECK (cardinality(add_features) + cardinality(remove_features) > 0 OR requested_appointments_limit IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 2. The one place that decides a doctor's monthly limit (NULL = unlimited)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.doctor_monthly_appointment_limit(_doctor_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cp public.doctor_custom_plans;
  std integer;
BEGIN
  IF public.doctor_has_premium_access(_doctor_id) THEN
    RETURN NULL;
  END IF;

  cp := public.doctor_active_custom_plan(_doctor_id);
  IF cp.doctor_id IS NOT NULL AND cp.monthly_appointments_limit IS NOT NULL THEN
    RETURN CASE WHEN cp.monthly_appointments_limit = -1 THEN NULL ELSE cp.monthly_appointments_limit END;
  END IF;

  SELECT COALESCE((value)::int, 500) INTO std FROM public.platform_settings WHERE key = 'basic_appointment_cap';
  RETURN COALESCE(std, 500);
END;
$$;
REVOKE ALL ON FUNCTION public.doctor_monthly_appointment_limit(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The booking trigger enforces the effective limit
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_monthly_appointment_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cap integer;
  taken integer;
  new_total integer;
  month_start date := make_date(extract(year FROM NEW.date)::int, extract(month FROM NEW.date)::int, 1);
  month_label text := to_char(NEW.date, 'Mon YYYY');
  warn_title text;
BEGIN
  cap := public.doctor_monthly_appointment_limit(NEW.doctor_id);
  IF cap IS NULL THEN
    RETURN NEW;   -- unlimited
  END IF;

  -- The count below and the insert are one step: serialise them per doctor and month.
  PERFORM pg_advisory_xact_lock(hashtext('cap:' || NEW.doctor_id::text || to_char(NEW.date, 'YYYY-MM')));

  SELECT COUNT(*) INTO taken
  FROM public.appointments
  WHERE doctor_id = NEW.doctor_id
    AND status <> 'cancelled'
    AND date >= month_start
    AND date < (month_start + interval '1 month')::date;

  IF taken >= cap THEN
    RAISE EXCEPTION 'MONTHLY_APPOINTMENT_CAP_REACHED: Your plan is limited to % appointments per month', cap
      USING ERRCODE = 'P0001';
  END IF;

  new_total := taken + 1;
  warn_title := 'Approaching your monthly appointment limit (' || month_label || ')';
  IF new_total::numeric / cap >= 0.8 AND NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE doctor_id = NEW.doctor_id AND source_type = 'cap_warning' AND title = warn_title
  ) THEN
    INSERT INTO public.notifications (doctor_id, recipient_user_id, source_type, title, message)
    VALUES (
      NEW.doctor_id, NEW.doctor_id, 'cap_warning', warn_title,
      format('You''ve used %s of %s appointments for %s. Upgrade to Premium, or request a custom plan with a higher limit.', new_total, cap, month_label)
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. The usage meter the doctor sees reads the same function
--    (signature changes, so it is dropped and recreated)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_appointment_cap_usage(uuid);
CREATE FUNCTION public.get_appointment_cap_usage(_doctor_id uuid)
RETURNS TABLE(is_premium boolean, appointments_used int, appointments_cap int, appointments_unlimited boolean, standard_cap int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  premium boolean;
  lim integer;
  std integer;
  used_val int;
BEGIN
  -- Only the doctor, or staff working for that doctor, may read this (it reveals whether a custom plan exists).
  -- Internal callers (no JWT) are trusted.
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM _doctor_id
     AND public.staff_doctor_id(auth.uid()) IS DISTINCT FROM _doctor_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  premium := public.doctor_has_premium_access(_doctor_id);
  SELECT COALESCE((value)::int, 500) INTO std FROM public.platform_settings WHERE key = 'basic_appointment_cap';
  std := COALESCE(std, 500);

  IF premium THEN
    RETURN QUERY SELECT true, 0, 0, true, std;
    RETURN;
  END IF;

  lim := public.doctor_monthly_appointment_limit(_doctor_id);

  SELECT COUNT(*)::int INTO used_val
  FROM public.appointments
  WHERE doctor_id = _doctor_id
    AND status <> 'cancelled'
    AND date >= date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')::date)::date
    AND date <  (date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')::date) + interval '1 month')::date;

  RETURN QUERY SELECT false, used_val, COALESCE(lim, 0), (lim IS NULL), std;
END;
$$;
REVOKE ALL ON FUNCTION public.get_appointment_cap_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_appointment_cap_usage(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Requesting: submit_plan_request gains an optional limit (full body: it already carried
--    two in-place patches, so it is restated whole rather than patched again)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.submit_plan_request(text[], text[], text);

CREATE FUNCTION public.submit_plan_request(
  _add text[], _remove text[], _note text DEFAULT NULL, _appointments_limit integer DEFAULT NULL
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
BEGIN
  -- Staff have no profiles row, so this also blocks staff sessions.
  SELECT * INTO p FROM public.profiles WHERE id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the doctor can request plan changes'; END IF;

  _add := COALESCE(_add, '{}');
  _remove := COALESCE(_remove, '{}');
  IF cardinality(_add) + cardinality(_remove) = 0 AND _appointments_limit IS NULL THEN
    RAISE EXCEPTION 'Select at least one feature or a new appointment limit';
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
    INSERT INTO public.plan_requests (doctor_id, base_tier, add_features, remove_features, doctor_note, requested_appointments_limit)
    VALUES (uid, COALESCE(p.plan_tier, 'pro'), _add, _remove, NULLIF(btrim(_note), ''), _appointments_limit)
    RETURNING id INTO new_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'You already have a request under review. Withdraw it to submit a new one';
  END;

  INSERT INTO public.plan_request_events (request_id, doctor_id, actor_id, event, details)
  VALUES (new_id, uid, uid, 'submitted', jsonb_build_object('add', _add, 'remove', _remove, 'appointments_limit', _appointments_limit));

  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_plan_request(text[], text[], text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_plan_request(text[], text[], text, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Approving: review_plan_request gains the FINAL limit (NULL = standard). Restated whole
--    with the two earlier in-place patches (active-paid-plan check, Pro/Premium check) folded in.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.review_plan_request(uuid, text, text[], numeric, timestamptz, timestamptz, text);

CREATE FUNCTION public.review_plan_request(
  _request_id uuid,
  _decision text,
  _approved_features text[] DEFAULT NULL,
  _price numeric DEFAULT NULL,
  _valid_from timestamptz DEFAULT NULL,
  _valid_until timestamptz DEFAULT NULL,
  _note text DEFAULT NULL,
  -- NULL = not specified: keep the plan's current limit (so an old screen, or a features-only approval,
  --        can never silently reset it).  0 = reset to the standard limit.  -1 = unlimited.  n = n per month.
  _appointments_limit integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  r public.plan_requests%ROWTYPE;
  p public.profiles%ROWTYPE;
  f RECORD;
  v_from timestamptz;
  v_extra text[] := '{}';
  v_removed text[] := '{}';
  v_tier_on boolean;
  v_want boolean;
  v_summary text;
  v_limit integer;
BEGIN
  IF NOT public.sa_has_permission(uid, 'plan_requests.manage') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'decision must be approve or reject';
  END IF;

  SELECT * INTO r FROM public.plan_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'This request was already % — refresh to see the latest', r.status;
  END IF;

  IF _decision = 'reject' THEN
    IF _note IS NULL OR btrim(_note) = '' THEN
      RAISE EXCEPTION 'A reason is required when rejecting';
    END IF;
    UPDATE public.plan_requests
      SET status = 'rejected', reviewer_id = uid, reviewer_note = btrim(_note), decided_at = now()
      WHERE id = _request_id;
    INSERT INTO public.plan_request_events (request_id, doctor_id, actor_id, event, details)
    VALUES (_request_id, r.doctor_id, uid, 'rejected', jsonb_build_object('reason', btrim(_note)));
    INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
    VALUES (uid, 'reject_plan_request', 'plan_requests', r.id, jsonb_build_object('doctor_id', r.doctor_id));
    INSERT INTO public.notifications (doctor_id, source_type, title, message)
    VALUES (r.doctor_id, 'plan_request', 'Plan change request not approved',
      'Your request was not approved. Reason: ' || btrim(_note));
    RETURN;
  END IF;

  -- approve
  IF _approved_features IS NULL OR _price IS NULL THEN
    RAISE EXCEPTION 'Approved features and a monthly price are required';
  END IF;
  IF _price < 0 THEN RAISE EXCEPTION 'Price cannot be negative'; END IF;
  IF _appointments_limit IS NOT NULL AND NOT (_appointments_limit IN (0, -1) OR _appointments_limit BETWEEN 1 AND 100000) THEN
    RAISE EXCEPTION 'The monthly appointment limit must be a number from 1 to 100000, or unlimited';
  END IF;
  v_from := COALESCE(_valid_from, now());
  IF _valid_until IS NOT NULL AND _valid_until <= GREATEST(v_from, now()) THEN
    RAISE EXCEPTION 'End date must be in the future and after the start date';
  END IF;

  SELECT * INTO p FROM public.profiles WHERE id = r.doctor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Doctor not found'; END IF;
  IF p.plan_status <> 'active' OR (p.plan_end IS NOT NULL AND p.plan_end <= now()) THEN
    RAISE EXCEPTION 'Doctor is not on an active paid plan — custom plans need a paid plan';
  END IF;
  IF COALESCE(p.plan_tier, 'free') NOT IN ('pro', 'premium') THEN
    RAISE EXCEPTION 'This doctor is on the % tier. Custom plans are priced against Pro or Premium, so change their plan first', COALESCE(p.plan_tier, 'free');
  END IF;
  IF _appointments_limit IS NOT NULL AND _appointments_limit <> 0 AND p.plan_tier <> 'pro' THEN
    RAISE EXCEPTION 'Appointment limits apply to Pro-based plans only: Premium already has unlimited appointments';
  END IF;

  -- What the plan will carry: an explicit choice wins (0 = standard); otherwise the current limit is kept.
  IF p.plan_tier <> 'pro' THEN
    v_limit := NULL;
  ELSIF _appointments_limit IS NULL THEN
    SELECT monthly_appointments_limit INTO v_limit FROM public.doctor_custom_plans
     WHERE doctor_id = r.doctor_id AND status = 'active';
  ELSE
    v_limit := NULLIF(_appointments_limit, 0);
  END IF;

  -- Translate the final feature set into deltas against the tier default.
  FOR f IN SELECT key FROM public.features WHERE is_active AND is_requestable LOOP
    v_tier_on := COALESCE(public.doctor_tier_default(r.doctor_id, f.key), false);
    v_want := f.key = ANY (_approved_features);
    IF v_want AND NOT v_tier_on THEN v_extra := array_append(v_extra, f.key); END IF;
    IF NOT v_want AND v_tier_on THEN v_removed := array_append(v_removed, f.key); END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM unnest(_approved_features) a WHERE NOT EXISTS (
    SELECT 1 FROM public.features WHERE key = a AND is_active AND is_requestable)) THEN
    RAISE EXCEPTION 'Approved features contain an unknown or non-requestable feature';
  END IF;

  INSERT INTO public.doctor_custom_plans AS cp
    (doctor_id, request_id, base_tier, extra_features, removed_features, monthly_price, monthly_appointments_limit,
     valid_from, valid_until, status, cancelled_by)
  VALUES
    (r.doctor_id, r.id, COALESCE(p.plan_tier, 'pro'), v_extra, v_removed, _price, v_limit,
     v_from, _valid_until, 'active', NULL)
  ON CONFLICT (doctor_id) DO UPDATE SET
    request_id = EXCLUDED.request_id,
    base_tier = EXCLUDED.base_tier,
    extra_features = EXCLUDED.extra_features,
    removed_features = EXCLUDED.removed_features,
    monthly_price = EXCLUDED.monthly_price,
    monthly_appointments_limit = EXCLUDED.monthly_appointments_limit,
    valid_from = EXCLUDED.valid_from,
    valid_until = EXCLUDED.valid_until,
    status = 'active',
    cancelled_by = NULL;

  UPDATE public.plan_requests SET
    status = 'approved', reviewer_id = uid, reviewer_note = NULLIF(btrim(COALESCE(_note, '')), ''),
    approved_features = _approved_features, approved_price = _price, approved_appointments_limit = v_limit,
    valid_from = v_from, valid_until = _valid_until, decided_at = now()
  WHERE id = _request_id;

  INSERT INTO public.plan_request_events (request_id, doctor_id, actor_id, event, details)
  VALUES (_request_id, r.doctor_id, uid, 'approved', jsonb_build_object(
    'extra', v_extra, 'removed', v_removed, 'price', _price, 'appointments_limit', v_limit,
    'valid_from', v_from, 'valid_until', _valid_until));

  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
  VALUES (uid, 'approve_plan_request', 'plan_requests', r.id, jsonb_build_object(
    'doctor_id', r.doctor_id, 'extra', v_extra, 'removed', v_removed, 'price', _price,
    'appointments_limit', v_limit, 'valid_until', _valid_until));

  v_summary := 'Your custom plan is now active at ₹' || _price::text || '/month'
    || CASE WHEN _valid_until IS NOT NULL THEN ' until ' || to_char(_valid_until AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY') ELSE '' END
    || CASE WHEN v_limit = -1 THEN '. You now have unlimited appointments'
            WHEN v_limit IS NOT NULL THEN '. Your limit is ' || v_limit::text || ' appointments per month'
            ELSE '' END
    || '. The new price applies from your next payment.';
  INSERT INTO public.notifications (doctor_id, source_type, title, message)
  VALUES (r.doctor_id, 'plan_request', 'Plan change approved', v_summary);
END;
$$;
REVOKE ALL ON FUNCTION public.review_plan_request(uuid, text, text[], numeric, timestamptz, timestamptz, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_plan_request(uuid, text, text[], numeric, timestamptz, timestamptz, text, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Changing the limit of a live plan (the superadmin's "Edit terms")
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_custom_plan_appointments_limit(_doctor_id uuid, _limit integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cp public.doctor_custom_plans%ROWTYPE;
  p public.profiles%ROWTYPE;
BEGIN
  IF NOT public.sa_has_permission(auth.uid(), 'plan_requests.manage') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _limit IS NOT NULL AND NOT (_limit = -1 OR _limit BETWEEN 1 AND 100000) THEN
    RAISE EXCEPTION 'The monthly appointment limit must be a number from 1 to 100000, or unlimited';
  END IF;

  -- profile first, then the plan: the same lock order as every other path
  SELECT * INTO p FROM public.profiles WHERE id = _doctor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Doctor not found'; END IF;
  SELECT * INTO cp FROM public.doctor_custom_plans
   WHERE doctor_id = _doctor_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No active custom plan'; END IF;
  -- Same conditions as doctor_active_custom_plan: otherwise "limit updated" would be a promise nothing keeps.
  IF cp.base_tier <> p.plan_tier OR p.plan_status <> 'active'
     OR cp.valid_from > now() OR (cp.valid_until IS NOT NULL AND cp.valid_until <= now()) THEN
    RAISE EXCEPTION 'This custom plan does not currently apply to the doctor (different plan, outside its dates, or not active). Apply it to their current plan first';
  END IF;
  IF _limit IS NOT NULL AND cp.base_tier <> 'pro' THEN
    RAISE EXCEPTION 'Appointment limits apply to Pro-based plans only: Premium already has unlimited appointments';
  END IF;
  IF cp.monthly_appointments_limit IS NOT DISTINCT FROM _limit THEN
    RETURN;
  END IF;

  UPDATE public.doctor_custom_plans SET monthly_appointments_limit = _limit WHERE doctor_id = _doctor_id;

  INSERT INTO public.plan_request_events (request_id, doctor_id, actor_id, event, details)
  VALUES (cp.request_id, _doctor_id, auth.uid(), 'limit_updated',
    jsonb_build_object('from', cp.monthly_appointments_limit, 'to', _limit));
  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
  VALUES (auth.uid(), 'set_custom_plan_appointments_limit', 'doctor_custom_plans', _doctor_id,
    jsonb_build_object('from', cp.monthly_appointments_limit, 'to', _limit));
  INSERT INTO public.notifications (doctor_id, recipient_user_id, source_type, title, message)
  VALUES (_doctor_id, _doctor_id, 'plan_request', 'Appointment limit updated',
    CASE WHEN _limit = -1 THEN 'You now have unlimited appointments.'
         WHEN _limit IS NULL THEN 'Your appointment limit is back to the standard limit for your plan.'
         ELSE 'Your limit is now ' || _limit::text || ' appointments per month.' END);
END;
$$;
REVOKE ALL ON FUNCTION public.set_custom_plan_appointments_limit(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_custom_plan_appointments_limit(uuid, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
