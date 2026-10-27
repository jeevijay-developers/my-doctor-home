-- ============================================
-- CUSTOM PLAN REQUESTS
-- ============================================
-- A doctor asks for specific features to be added to / removed from their plan
-- (never a price). Superadmin (owner, or a Team member holding
-- plan_requests.manage) approves with the final feature set, a monthly price
-- and a validity period. Approval applies immediately: doctor_has_feature()
-- layers the active custom plan between manual per-doctor overrides and the
-- tier default, so cards/gates/public site update at once. The approved price
-- applies from the doctor's NEXT payment (create-plan-upgrade-order reads it);
-- nothing is charged on approval. When the validity period ends the doctor
-- reverts to the standard plan for their tier.
--
-- Entitlement precedence (highest first):
--   1. manual per-doctor override  (doctor_feature_overrides)
--   2. active custom plan          (doctor_custom_plans)
--   3. tier default                (features.default_min_tier)

-- ============================================
-- 1. Lock down plan/billing columns on a doctor's own profile row
-- ============================================
-- "Users can update own profile" (RLS) lets a doctor UPDATE any column of
-- their own row, and guard_staff_profile_update only protects the doctor from
-- STAFF. Without this, a doctor could set plan_tier / custom_plan_price from
-- the browser. Server-side paths (service_role edge functions, cron, SECURITY
-- DEFINER RPCs run with auth.uid() NULL or as another user) are unaffected.
CREATE OR REPLACE FUNCTION public.guard_doctor_plan_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.uid() = OLD.id
     AND NOT public.has_role(auth.uid(), 'admin')
     AND current_setting('app.plan_write_ok', true) IS DISTINCT FROM 'on' THEN
    IF NEW.plan_tier IS DISTINCT FROM OLD.plan_tier
       OR NEW.plan_status IS DISTINCT FROM OLD.plan_status
       OR NEW.plan_end IS DISTINCT FROM OLD.plan_end
       OR NEW.trial_start IS DISTINCT FROM OLD.trial_start
       OR NEW.trial_end IS DISTINCT FROM OLD.trial_end
       OR NEW.custom_plan_price IS DISTINCT FROM OLD.custom_plan_price THEN
      RAISE EXCEPTION 'Plan and billing settings can only be changed through checkout or by support';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_doctor_plan_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_doctor_plan_columns();

-- Replaces the client-side `profiles.update({ plan_status: 'active' })` in
-- Settings → "Resume Subscription", which the trigger above now blocks.
CREATE OR REPLACE FUNCTION public.resume_subscription()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF p.plan_status NOT IN ('cancelled', 'expired') OR p.plan_end IS NULL OR p.plan_end <= now() THEN
    RAISE EXCEPTION 'Nothing to resume: your paid period has already ended';
  END IF;
  PERFORM set_config('app.plan_write_ok', 'on', true);
  UPDATE public.profiles SET plan_status = 'active' WHERE id = p.id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.resume_subscription() TO authenticated;

-- ============================================
-- 2. Extend features + notifications
-- ============================================
ALTER TABLE public.features
  ADD COLUMN IF NOT EXISTS is_requestable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_source_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_source_type_check
  CHECK (source_type IN ('ticket_reply','direct_message','broadcast','trial_warning','cap_warning','plan_warning','plan_request'));

-- ============================================
-- 3. Tables
-- ============================================
CREATE TABLE public.plan_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  base_tier text NOT NULL,
  add_features text[] NOT NULL DEFAULT '{}',
  remove_features text[] NOT NULL DEFAULT '{}',
  doctor_note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  reviewer_id uuid,
  reviewer_note text,
  -- Final effective set of ENABLED requestable feature keys the reviewer approved.
  approved_features text[],
  approved_price numeric CHECK (approved_price IS NULL OR approved_price >= 0),
  valid_from timestamptz,
  valid_until timestamptz,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_requests_has_change CHECK (cardinality(add_features) + cardinality(remove_features) > 0),
  CONSTRAINT plan_requests_valid_range CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from)
);
CREATE UNIQUE INDEX idx_plan_requests_one_pending ON public.plan_requests (doctor_id) WHERE status = 'pending';
CREATE INDEX idx_plan_requests_status ON public.plan_requests (status, created_at DESC);
CREATE INDEX idx_plan_requests_doctor ON public.plan_requests (doctor_id, created_at DESC);

-- The LIVE custom plan: one row per doctor (history lives in plan_requests +
-- plan_request_events). Deltas are relative to base_tier's defaults.
CREATE TABLE public.doctor_custom_plans (
  doctor_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_id uuid REFERENCES public.plan_requests(id) ON DELETE SET NULL,
  base_tier text NOT NULL,
  extra_features text[] NOT NULL DEFAULT '{}',
  removed_features text[] NOT NULL DEFAULT '{}',
  monthly_price numeric NOT NULL CHECK (monthly_price >= 0),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  cancelled_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT doctor_custom_plans_valid_range CHECK (valid_until IS NULL OR valid_until > valid_from)
);
CREATE INDEX idx_doctor_custom_plans_expiry ON public.doctor_custom_plans (valid_until) WHERE status = 'active';

CREATE TRIGGER update_doctor_custom_plans_updated_at BEFORE UPDATE ON public.doctor_custom_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- doctor_id is deliberately NOT a foreign key: the audit trail outlives the doctor.
CREATE TABLE public.plan_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid,
  doctor_id uuid NOT NULL,
  actor_id uuid,
  event text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_plan_request_events_doctor ON public.plan_request_events (doctor_id, created_at DESC);

-- ============================================
-- 4. RLS — all writes go through the SECURITY DEFINER RPCs below
-- ============================================
ALTER TABLE public.plan_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_custom_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_request_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors view own plan requests" ON public.plan_requests
  FOR SELECT USING (auth.uid() = doctor_id);
CREATE POLICY "Plan request reviewers view" ON public.plan_requests
  FOR SELECT USING (public.sa_has_permission(auth.uid(), 'plan_requests.view'));

CREATE POLICY "Doctors view own custom plan" ON public.doctor_custom_plans
  FOR SELECT USING (auth.uid() = doctor_id);
CREATE POLICY "Staff view custom plan" ON public.doctor_custom_plans
  FOR SELECT USING (public.staff_doctor_id(auth.uid()) = doctor_id);
CREATE POLICY "Plan request reviewers view custom plans" ON public.doctor_custom_plans
  FOR SELECT USING (public.sa_has_any_permission(auth.uid(), ARRAY['plan_requests.view', 'subscriptions.view', 'doctors.view']));

CREATE POLICY "Doctors view own plan request events" ON public.plan_request_events
  FOR SELECT USING (auth.uid() = doctor_id);
CREATE POLICY "Plan request reviewers view events" ON public.plan_request_events
  FOR SELECT USING (public.sa_has_permission(auth.uid(), 'plan_requests.view'));

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.plan_requests;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.doctor_custom_plans;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.doctor_feature_overrides;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================
-- 5. Entitlement resolution
-- ============================================
-- The doctor's ACTIVE custom plan, or no row. "Active" is evaluated lazily on
-- read, so a plan stops applying the instant valid_until passes even if the
-- expiry cron hasn't run yet.
CREATE OR REPLACE FUNCTION public.doctor_active_custom_plan(_doctor_id uuid)
RETURNS public.doctor_custom_plans
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.doctor_custom_plans
  WHERE doctor_id = _doctor_id
    AND status = 'active'
    AND valid_from <= now()
    AND (valid_until IS NULL OR valid_until > now())
$$;

-- What the doctor's tier alone grants for one feature (no overrides/custom plan).
CREATE OR REPLACE FUNCTION public.doctor_tier_default(_doctor_id uuid, _feature_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE f.default_min_tier
    WHEN 'premium' THEN public.doctor_has_premium_access(_doctor_id)
    ELSE true
  END
  FROM public.features f WHERE f.key = _feature_key
$$;

CREATE OR REPLACE FUNCTION public.doctor_has_feature(_doctor_id uuid, _feature_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  override_enabled boolean;
  plan public.doctor_custom_plans;
  feat_active boolean;
BEGIN
  SELECT is_active INTO feat_active FROM public.features WHERE key = _feature_key;
  IF feat_active IS NULL OR feat_active = false THEN
    RETURN false;
  END IF;

  SELECT enabled INTO override_enabled
  FROM public.doctor_feature_overrides
  WHERE doctor_id = _doctor_id AND feature_key = _feature_key
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;
  IF override_enabled IS NOT NULL THEN
    RETURN override_enabled;
  END IF;

  plan := public.doctor_active_custom_plan(_doctor_id);
  IF plan.doctor_id IS NOT NULL THEN
    IF _feature_key = ANY (plan.removed_features) THEN RETURN false; END IF;
    IF _feature_key = ANY (plan.extra_features) THEN RETURN true; END IF;
  END IF;

  RETURN COALESCE(public.doctor_tier_default(_doctor_id, _feature_key), false);
END;
$$;
GRANT EXECUTE ON FUNCTION public.doctor_has_feature(uuid, text) TO authenticated, anon;

-- Same output as before plus `source` and `custom_plan_effect`, so the return
-- type changes and the function must be dropped first.
DROP FUNCTION IF EXISTS public.get_doctor_feature_access(uuid);
CREATE FUNCTION public.get_doctor_feature_access(_doctor_id uuid)
RETURNS TABLE(
  feature_key text,
  label text,
  description text,
  default_min_tier text,
  included_by_plan boolean,
  override_enabled boolean,
  override_granted_by uuid,
  override_granted_at timestamptz,
  override_reason text,
  override_expires_at timestamptz,
  override_active boolean,
  effective_enabled boolean,
  source text,
  custom_plan_effect text,
  is_requestable boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  plan public.doctor_custom_plans;
BEGIN
  IF auth.uid() IS DISTINCT FROM _doctor_id
     AND public.staff_doctor_id(auth.uid()) IS DISTINCT FROM _doctor_id
     AND NOT public.sa_has_any_permission(auth.uid(), ARRAY['doctors.view', 'plan_requests.view', 'subscriptions.view']) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  plan := public.doctor_active_custom_plan(_doctor_id);

  RETURN QUERY
  SELECT
    f.key,
    f.label,
    f.description,
    f.default_min_tier,
    public.doctor_tier_default(_doctor_id, f.key) AS included_by_plan,
    o.enabled AS override_enabled,
    o.granted_by AS override_granted_by,
    o.granted_at AS override_granted_at,
    o.reason AS override_reason,
    o.expires_at AS override_expires_at,
    (o.enabled IS NOT NULL AND (o.expires_at IS NULL OR o.expires_at > now())) AS override_active,
    public.doctor_has_feature(_doctor_id, f.key) AS effective_enabled,
    CASE
      WHEN o.enabled IS NOT NULL AND (o.expires_at IS NULL OR o.expires_at > now()) THEN 'override'
      WHEN plan.doctor_id IS NOT NULL AND (f.key = ANY (plan.removed_features) OR f.key = ANY (plan.extra_features)) THEN 'custom_plan'
      ELSE 'plan'
    END AS source,
    CASE
      WHEN plan.doctor_id IS NULL THEN NULL
      WHEN f.key = ANY (plan.removed_features) THEN 'removed'
      WHEN f.key = ANY (plan.extra_features) THEN 'added'
      ELSE NULL
    END AS custom_plan_effect,
    f.is_requestable
  FROM public.features f
  LEFT JOIN public.doctor_feature_overrides o ON o.feature_key = f.key AND o.doctor_id = _doctor_id
  WHERE f.is_active
  ORDER BY f.sort_order;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_doctor_feature_access(uuid) TO authenticated;

-- get_public_feature_flags already fans out over doctor_has_feature; restrict to
-- active features so an archived key never reaches the public site.
CREATE OR REPLACE FUNCTION public.get_public_feature_flags(_doctor_id uuid)
RETURNS TABLE(feature_key text, effective_enabled boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT f.key, public.doctor_has_feature(_doctor_id, f.key)
  FROM public.features f
  WHERE f.is_active;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_feature_flags(uuid) TO authenticated, anon;

-- ============================================
-- 6. RPCs
-- ============================================
CREATE OR REPLACE FUNCTION public.submit_plan_request(_add text[], _remove text[], _note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  p public.profiles%ROWTYPE;
  k text;
  new_id uuid;
  last_rejected timestamptz;
BEGIN
  -- Staff have no profiles row, so this also blocks staff sessions.
  SELECT * INTO p FROM public.profiles WHERE id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the doctor can request plan changes'; END IF;

  _add := COALESCE(_add, '{}');
  _remove := COALESCE(_remove, '{}');
  IF cardinality(_add) + cardinality(_remove) = 0 THEN
    RAISE EXCEPTION 'Select at least one feature to add or remove';
  END IF;
  IF _add && _remove THEN
    RAISE EXCEPTION 'A feature cannot be both added and removed';
  END IF;
  IF _note IS NOT NULL AND char_length(_note) > 1000 THEN
    RAISE EXCEPTION 'Note is too long (max 1000 characters)';
  END IF;

  IF p.plan_status = 'trial' THEN
    RAISE EXCEPTION 'Custom plans are available once you are on a paid plan';
  END IF;
  IF p.plan_status <> 'active' THEN
    RAISE EXCEPTION 'Reactivate your subscription before requesting plan changes';
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
    INSERT INTO public.plan_requests (doctor_id, base_tier, add_features, remove_features, doctor_note)
    VALUES (uid, COALESCE(p.plan_tier, 'pro'), _add, _remove, NULLIF(btrim(_note), ''))
    RETURNING id INTO new_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'You already have a request under review. Withdraw it to submit a new one';
  END;

  INSERT INTO public.plan_request_events (request_id, doctor_id, actor_id, event, details)
  VALUES (new_id, uid, uid, 'submitted', jsonb_build_object('add', _add, 'remove', _remove));

  RETURN new_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_plan_request(text[], text[], text) TO authenticated;

CREATE OR REPLACE FUNCTION public.withdraw_plan_request(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.plan_requests%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.plan_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND OR r.doctor_id <> auth.uid() THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'This request was already %', r.status;
  END IF;
  UPDATE public.plan_requests SET status = 'withdrawn', decided_at = now() WHERE id = _request_id;
  INSERT INTO public.plan_request_events (request_id, doctor_id, actor_id, event)
  VALUES (_request_id, r.doctor_id, auth.uid(), 'withdrawn');
END;
$$;
GRANT EXECUTE ON FUNCTION public.withdraw_plan_request(uuid) TO authenticated;

-- Approve (applies immediately, atomically) or reject.
--   _approved_features = the FINAL set of enabled requestable feature keys.
CREATE OR REPLACE FUNCTION public.review_plan_request(
  _request_id uuid,
  _decision text,
  _approved_features text[] DEFAULT NULL,
  _price numeric DEFAULT NULL,
  _valid_from timestamptz DEFAULT NULL,
  _valid_until timestamptz DEFAULT NULL,
  _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_from := COALESCE(_valid_from, now());
  IF _valid_until IS NOT NULL AND _valid_until <= GREATEST(v_from, now()) THEN
    RAISE EXCEPTION 'End date must be in the future and after the start date';
  END IF;

  SELECT * INTO p FROM public.profiles WHERE id = r.doctor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Doctor not found'; END IF;
  IF p.plan_status = 'trial' THEN
    RAISE EXCEPTION 'Doctor is still on a trial — custom plans need a paid plan';
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
    (doctor_id, request_id, base_tier, extra_features, removed_features, monthly_price, valid_from, valid_until, status, cancelled_by)
  VALUES
    (r.doctor_id, r.id, COALESCE(p.plan_tier, 'pro'), v_extra, v_removed, _price, v_from, _valid_until, 'active', NULL)
  ON CONFLICT (doctor_id) DO UPDATE SET
    request_id = EXCLUDED.request_id,
    base_tier = EXCLUDED.base_tier,
    extra_features = EXCLUDED.extra_features,
    removed_features = EXCLUDED.removed_features,
    monthly_price = EXCLUDED.monthly_price,
    valid_from = EXCLUDED.valid_from,
    valid_until = EXCLUDED.valid_until,
    status = 'active',
    cancelled_by = NULL;

  UPDATE public.plan_requests SET
    status = 'approved', reviewer_id = uid, reviewer_note = NULLIF(btrim(COALESCE(_note, '')), ''),
    approved_features = _approved_features, approved_price = _price,
    valid_from = v_from, valid_until = _valid_until, decided_at = now()
  WHERE id = _request_id;

  INSERT INTO public.plan_request_events (request_id, doctor_id, actor_id, event, details)
  VALUES (_request_id, r.doctor_id, uid, 'approved', jsonb_build_object(
    'extra', v_extra, 'removed', v_removed, 'price', _price, 'valid_from', v_from, 'valid_until', _valid_until));

  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
  VALUES (uid, 'approve_plan_request', 'plan_requests', r.id, jsonb_build_object(
    'doctor_id', r.doctor_id, 'extra', v_extra, 'removed', v_removed, 'price', _price, 'valid_until', _valid_until));

  v_summary := 'Your custom plan is now active at ₹' || _price::text || '/month'
    || CASE WHEN _valid_until IS NOT NULL THEN ' until ' || to_char(_valid_until AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY') ELSE '' END
    || '. The new price applies from your next payment.';
  INSERT INTO public.notifications (doctor_id, source_type, title, message)
  VALUES (r.doctor_id, 'plan_request', 'Plan change approved', v_summary);
END;
$$;
GRANT EXECUTE ON FUNCTION public.review_plan_request(uuid, text, text[], numeric, timestamptz, timestamptz, text) TO authenticated;

-- Doctor self-serve cancel (back to the standard plan) or Superadmin cancel.
CREATE OR REPLACE FUNCTION public.cancel_custom_plan(_doctor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  is_reviewer boolean;
BEGIN
  is_reviewer := public.sa_has_permission(uid, 'plan_requests.manage');
  IF uid IS DISTINCT FROM _doctor_id AND NOT is_reviewer THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.doctor_custom_plans SET status = 'cancelled', cancelled_by = uid
  WHERE doctor_id = _doctor_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'No active custom plan'; END IF;

  INSERT INTO public.plan_request_events (doctor_id, actor_id, event)
  VALUES (_doctor_id, uid, CASE WHEN uid = _doctor_id THEN 'cancelled_by_doctor' ELSE 'cancelled_by_admin' END);

  IF uid IS DISTINCT FROM _doctor_id THEN
    INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
    VALUES (uid, 'cancel_custom_plan', 'doctor_custom_plans', _doctor_id, '{}'::jsonb);
    INSERT INTO public.notifications (doctor_id, source_type, title, message)
    VALUES (_doctor_id, 'plan_request', 'Custom plan ended',
      'Your custom plan was ended by support. You are back on the standard plan for your tier.');
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cancel_custom_plan(uuid) TO authenticated;

-- Superadmin edits the price/period of an ACTIVE plan without a new request.
CREATE OR REPLACE FUNCTION public.update_custom_plan_terms(_doctor_id uuid, _price numeric, _valid_until timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.sa_has_permission(auth.uid(), 'plan_requests.manage') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _price IS NULL OR _price < 0 THEN RAISE EXCEPTION 'Price must be zero or more'; END IF;
  IF _valid_until IS NOT NULL AND _valid_until <= now() THEN
    RAISE EXCEPTION 'End date must be in the future';
  END IF;
  UPDATE public.doctor_custom_plans SET monthly_price = _price, valid_until = _valid_until
  WHERE doctor_id = _doctor_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'No active custom plan'; END IF;
  INSERT INTO public.plan_request_events (doctor_id, actor_id, event, details)
  VALUES (_doctor_id, auth.uid(), 'terms_updated', jsonb_build_object('price', _price, 'valid_until', _valid_until));
  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
  VALUES (auth.uid(), 'update_custom_plan_terms', 'doctor_custom_plans', _doctor_id,
    jsonb_build_object('price', _price, 'valid_until', _valid_until));
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_custom_plan_terms(uuid, numeric, timestamptz) TO authenticated;

-- ============================================
-- 7. Expiry + warnings (daily cron)
-- ============================================
CREATE OR REPLACE FUNCTION public.expire_custom_plans()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT doctor_id FROM public.doctor_custom_plans
    WHERE status = 'active' AND valid_until IS NOT NULL AND valid_until <= now()
  LOOP
    UPDATE public.doctor_custom_plans SET status = 'expired' WHERE doctor_id = rec.doctor_id;
    INSERT INTO public.plan_request_events (doctor_id, event) VALUES (rec.doctor_id, 'expired');
    INSERT INTO public.notifications (doctor_id, source_type, title, message)
    VALUES (rec.doctor_id, 'plan_request', 'Custom plan ended',
      'Your custom plan period has ended. You are back on the standard plan for your tier.');
  END LOOP;

  -- 7 / 3 / 1 day warnings, idempotent per (doctor, title, plan end).
  INSERT INTO public.notifications (doctor_id, source_type, title, message)
  SELECT c.doctor_id, 'plan_request',
    'Custom plan ending in ' || d.days || ' day' || CASE WHEN d.days > 1 THEN 's' ELSE '' END,
    'Your custom plan ends on ' || to_char(c.valid_until AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY')
      || '. After that you return to the standard plan. Request a new custom plan to keep your features.'
  FROM public.doctor_custom_plans c
  JOIN (VALUES (7), (3), (1)) AS d(days)
    ON c.valid_until BETWEEN now() + make_interval(days => d.days - 1) AND now() + make_interval(days => d.days)
  WHERE c.status = 'active' AND c.valid_until IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.doctor_id = c.doctor_id AND n.source_type = 'plan_request'
        AND n.title = 'Custom plan ending in ' || d.days || ' day' || CASE WHEN d.days > 1 THEN 's' ELSE '' END
        AND n.created_at > c.valid_until - make_interval(days => 8)
    );
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('expire-custom-plans'); EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM cron.schedule('expire-custom-plans', '30 3 * * *', 'SELECT public.expire_custom_plans();');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================
-- 8. Fix: activate_scheduled_plans wrote to admin_audit_log columns that do not
-- exist (doctor_id, actor_id), so the audit insert raised and rolled back the
-- whole run — scheduled plans never activated. admin_user_id is nullable.
-- Also sets the app.plan_write_ok flag for parity with the guard trigger
-- (cron runs with auth.uid() NULL, so it is not blocked either way).
-- ============================================
CREATE OR REPLACE FUNCTION public.activate_scheduled_plans()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pending_row RECORD;
BEGIN
  FOR pending_row IN
    SELECT pp.id, pp.doctor_id, pp.target_tier, pp.payment_id
    FROM public.pending_plans pp
    WHERE pp.activation_date <= now()
    ORDER BY pp.activation_date ASC
  LOOP
    UPDATE public.profiles
    SET plan_tier = pending_row.target_tier,
        plan_status = 'active',
        plan_end = now() + interval '30 days'
    WHERE id = pending_row.doctor_id;

    DELETE FROM public.pending_plans WHERE id = pending_row.id;

    INSERT INTO public.notifications (doctor_id, source_type, title, message)
    VALUES (
      pending_row.doctor_id,
      'direct_message',
      'Scheduled Plan Activated!',
      'Your ' || INITCAP(pending_row.target_tier) || ' plan is now active. Enjoy your upgraded features!'
    );

    INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
    VALUES (
      NULL,
      'scheduled_plan_activated',
      'profiles',
      pending_row.doctor_id,
      jsonb_build_object(
        'tier', pending_row.target_tier,
        'payment_id', pending_row.payment_id,
        'activated_at', now()
      )
    );
  END LOOP;
END;
$$;
