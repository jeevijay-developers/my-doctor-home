-- Custom plan integrity.
--
-- A custom plan is "a feature set + a monthly price negotiated on top of ONE paid tier"
-- (doctor_custom_plans.base_tier). Its price and its feature changes apply only while the
-- doctor is on that same tier: the pricing cards, the checkout (create-plan-upgrade-order)
-- and doctor_active_custom_plan() all compare base_tier with the tier being used/bought.
--
-- Gaps this closes:
--   1. A plan could be approved for a doctor whose plan_tier was 'free' (status 'active'),
--      i.e. "built on" a tier that has no card and can never be bought. Such a plan shows as
--      "active" but never changes a price or a feature. Requests and approvals now need a
--      Pro or Premium doctor.
--   2. When a doctor's tier later changed (upgrade, downgrade, scheduled plan activating,
--      superadmin change) the plan silently stopped applying while still showing as active.
--      It now ends, with an event and a notification, so nobody is left on a zombie plan.
--   3. Plans already stuck in that state can be moved to the doctor's current tier by a
--      superadmin in one step (rebase_custom_plan), keeping the approved feature set
--      and price, instead of re-doing the whole request.

-- ---------------------------------------------------------------------------
-- 1. Requests and approvals need a paid tier (patched in place; fails loudly if the
--    expected text is missing)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  d text;
  d2 text;
BEGIN
  d := replace(pg_get_functiondef('public.submit_plan_request(text[],text[],text)'::regprocedure), E'\r', '');
  d2 := replace(d,
    '  SELECT max(decided_at) INTO last_rejected FROM public.plan_requests',
    '  IF COALESCE(p.plan_tier, ''free'') NOT IN (''pro'', ''premium'') THEN' || E'\n' ||
    '    RAISE EXCEPTION ''Custom plans are built on the Pro or Premium plan. Choose a plan first'';' || E'\n' ||
    '  END IF;' || E'\n\n' ||
    '  SELECT max(decided_at) INTO last_rejected FROM public.plan_requests');
  IF d2 = d THEN RAISE EXCEPTION 'submit_plan_request patch did not apply'; END IF;
  EXECUTE d2;

  d := replace(pg_get_functiondef('public.review_plan_request(uuid,text,text[],numeric,timestamptz,timestamptz,text)'::regprocedure), E'\r', '');
  d2 := replace(d,
    '  -- Translate the final feature set into deltas against the tier default.',
    '  IF COALESCE(p.plan_tier, ''free'') NOT IN (''pro'', ''premium'') THEN' || E'\n' ||
    '    RAISE EXCEPTION ''This doctor is on the % tier. Custom plans are priced against Pro or Premium, so change their plan first'', COALESCE(p.plan_tier, ''free'');' || E'\n' ||
    '  END IF;' || E'\n\n' ||
    '  -- Translate the final feature set into deltas against the tier default.');
  IF d2 = d THEN RAISE EXCEPTION 'review_plan_request patch did not apply'; END IF;
  EXECUTE d2;
END $$;

-- ---------------------------------------------------------------------------
-- 2. A tier change ends a custom plan that was built on the old tier
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.end_custom_plan_on_tier_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ended_base text;
BEGIN
  IF NEW.plan_tier IS NOT DISTINCT FROM OLD.plan_tier THEN
    RETURN NEW;
  END IF;

  UPDATE public.doctor_custom_plans
     SET status = 'cancelled', cancelled_by = NULL
   WHERE doctor_id = NEW.id AND status = 'active' AND base_tier <> NEW.plan_tier
  RETURNING base_tier INTO ended_base;

  IF FOUND THEN
    INSERT INTO public.plan_request_events (doctor_id, event, details)
    VALUES (NEW.id, 'ended_by_tier_change', jsonb_build_object('from_tier', ended_base, 'to_tier', NEW.plan_tier));
    INSERT INTO public.notifications (doctor_id, recipient_user_id, source_type, title, message)
    VALUES (NEW.id, NEW.id, 'plan_request', 'Custom plan ended',
      'Your custom plan was built on the ' || INITCAP(ended_base) || ' plan, so it ended when you moved to the ' ||
      INITCAP(NEW.plan_tier) || ' plan. You can request a new custom plan from Settings > Subscription.');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.end_custom_plan_on_tier_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_end_custom_plan_on_tier_change ON public.profiles;
CREATE TRIGGER trg_end_custom_plan_on_tier_change
AFTER UPDATE OF plan_tier ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.end_custom_plan_on_tier_change();

-- ---------------------------------------------------------------------------
-- 3. Move an already-active custom plan onto the doctor's CURRENT tier, keeping what was
--    approved (final feature set + price + dates). Superadmin only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rebase_custom_plan(_doctor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  cp public.doctor_custom_plans%ROWTYPE;
  p public.profiles%ROWTYPE;
  final_set text[];
  f RECORD;
  v_extra text[] := '{}';
  v_removed text[] := '{}';
  v_tier_on boolean;
  v_want boolean;
BEGIN
  IF NOT public.sa_has_permission(uid, 'plan_requests.manage') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Same lock order as every other path (profile first, then the plan): the tier-change
  -- trigger takes the plan row while the profile row is already locked.
  SELECT * INTO p FROM public.profiles WHERE id = _doctor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Doctor not found'; END IF;
  SELECT * INTO cp FROM public.doctor_custom_plans
   WHERE doctor_id = _doctor_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No active custom plan'; END IF;

  -- Only apply it if it would genuinely take effect (the same conditions as
  -- doctor_active_custom_plan), otherwise the doctor is told "now applies" and nothing changes.
  IF p.plan_tier NOT IN ('pro', 'premium') OR p.plan_status <> 'active'
     OR (p.plan_end IS NOT NULL AND p.plan_end <= now() - interval '1 day') THEN
    RAISE EXCEPTION 'The doctor must be on an active (not lapsed) Pro or Premium plan';
  END IF;
  IF cp.valid_from > now() OR (cp.valid_until IS NOT NULL AND cp.valid_until <= now()) THEN
    RAISE EXCEPTION 'This custom plan is not inside its dates, so it would not apply. Edit its terms first';
  END IF;
  IF cp.monthly_price <= 0 THEN
    RAISE EXCEPTION 'This custom plan has no price. Edit its terms first';
  END IF;
  IF cp.base_tier = p.plan_tier THEN
    RAISE EXCEPTION 'This custom plan already applies to the doctor''s current plan';
  END IF;
  -- A scheduled plan on another tier would end the custom plan again the moment it activates.
  IF EXISTS (SELECT 1 FROM public.pending_plans WHERE doctor_id = _doctor_id AND target_tier <> p.plan_tier) THEN
    RAISE EXCEPTION 'The doctor has a scheduled change to another plan, which would end this custom plan again. Cancel that scheduled plan or wait for it to activate first';
  END IF;

  SELECT approved_features INTO final_set FROM public.plan_requests
   WHERE id = cp.request_id AND status = 'approved';
  IF final_set IS NULL THEN
    RAISE EXCEPTION 'The original approval is no longer on record. Approve a new request instead';
  END IF;

  FOR f IN SELECT key FROM public.features WHERE is_active AND is_requestable LOOP
    v_tier_on := COALESCE(public.doctor_tier_default(_doctor_id, f.key), false);
    v_want := f.key = ANY (final_set);
    IF v_want AND NOT v_tier_on THEN v_extra := array_append(v_extra, f.key); END IF;
    IF NOT v_want AND v_tier_on THEN v_removed := array_append(v_removed, f.key); END IF;
  END LOOP;

  UPDATE public.doctor_custom_plans
     SET base_tier = p.plan_tier, extra_features = v_extra, removed_features = v_removed
   WHERE doctor_id = _doctor_id;

  INSERT INTO public.plan_request_events (request_id, doctor_id, actor_id, event, details)
  VALUES (cp.request_id, _doctor_id, uid, 'rebased', jsonb_build_object(
    'from_tier', cp.base_tier, 'to_tier', p.plan_tier, 'extra', v_extra, 'removed', v_removed, 'price', cp.monthly_price));
  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
  VALUES (uid, 'rebase_custom_plan', 'doctor_custom_plans', _doctor_id,
    jsonb_build_object('from_tier', cp.base_tier, 'to_tier', p.plan_tier, 'price', cp.monthly_price));
  INSERT INTO public.notifications (doctor_id, recipient_user_id, source_type, title, message)
  VALUES (_doctor_id, _doctor_id, 'plan_request', 'Custom plan now applies',
    'Your custom plan (₹' || cp.monthly_price::text || '/month) now applies to your ' || INITCAP(p.plan_tier) ||
    ' plan. The price is used from your next payment.');
END;
$$;
REVOKE ALL ON FUNCTION public.rebase_custom_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rebase_custom_plan(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
