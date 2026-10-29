-- Feature access, pricing and notification-delivery hardening.

-- 1. Pro-level features required nothing at all.
--
-- doctor_tier_default() returned true for every non-premium feature, so an expired
-- or suspended doctor (and any made-up doctor id) still passed doctor_has_feature()
-- for the AI blog writer and billing/invoices. A doctor now needs a live plan:
-- a running trial, or an active plan that has not lapsed (1 day of slack, matching
-- doctor_has_premium_access).

CREATE OR REPLACE FUNCTION public.doctor_has_live_plan(_doctor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _doctor_id
      AND (
        (plan_status = 'trial' AND (trial_end IS NULL OR trial_end > now()))
        OR (plan_status = 'active' AND (plan_end IS NULL OR plan_end > now() - interval '1 day'))
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.doctor_has_live_plan(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.doctor_tier_default(_doctor_id uuid, _feature_key text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE f.default_min_tier
    WHEN 'premium' THEN public.doctor_has_premium_access(_doctor_id)
    ELSE public.doctor_has_live_plan(_doctor_id)
  END
  FROM public.features f WHERE f.key = _feature_key
$$;

REVOKE EXECUTE ON FUNCTION public.doctor_tier_default(uuid, text) FROM PUBLIC, anon, authenticated;

-- 2. Downgrading a doctor switched online consultation off even when an override or
-- custom plan still entitles them to it.

DO $$
DECLARE
  def text;
  patched text;
BEGIN
  def := pg_get_functiondef('public.auto_disable_online_consultation_on_downgrade()'::regprocedure);
  patched := replace(def, 'IF was_premium AND NOT is_premium THEN',
                          'IF was_premium AND NOT is_premium AND NOT public.doctor_has_feature(NEW.id, ''online_consultation'') THEN');
  IF patched = def THEN
    RAISE EXCEPTION 'auto_disable_online_consultation_on_downgrade condition not found; refusing to continue';
  END IF;
  EXECUTE patched;
END $$;

-- 3. Override audit fields come from the session, not the client.

CREATE OR REPLACE FUNCTION public.stamp_feature_override_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.granted_by := auth.uid();
    NEW.granted_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_feature_override_actor ON public.doctor_feature_overrides;
CREATE TRIGGER stamp_feature_override_actor
BEFORE INSERT OR UPDATE ON public.doctor_feature_overrides
FOR EACH ROW EXECUTE FUNCTION public.stamp_feature_override_actor();

-- 4. Price and setting bounds, enforced where the data lives.

CREATE OR REPLACE FUNCTION public.validate_platform_setting()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  n numeric;
BEGIN
  IF NEW.key IN ('pro_default_price', 'premium_default_price') THEN
    IF jsonb_typeof(NEW.value) <> 'number' THEN RAISE EXCEPTION '% must be a number', NEW.key; END IF;
    n := (NEW.value #>> '{}')::numeric;
    IF n <> trunc(n) OR n < 1 OR n > 100000 THEN
      RAISE EXCEPTION '% must be a whole number of rupees between 1 and 100000', NEW.key;
    END IF;
  ELSIF NEW.key = 'default_commission_percent' THEN
    IF jsonb_typeof(NEW.value) <> 'number' THEN RAISE EXCEPTION '% must be a number', NEW.key; END IF;
    n := (NEW.value #>> '{}')::numeric;
    IF n < 0 OR n > 100 THEN RAISE EXCEPTION '% must be between 0 and 100', NEW.key; END IF;
  ELSIF NEW.key = 'default_trial_days' THEN
    IF jsonb_typeof(NEW.value) <> 'number' THEN RAISE EXCEPTION '% must be a number', NEW.key; END IF;
    n := (NEW.value #>> '{}')::numeric;
    IF n <> trunc(n) OR n < 0 OR n > 365 THEN RAISE EXCEPTION '% must be a whole number of days between 0 and 365', NEW.key; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_platform_setting ON public.platform_settings;
CREATE TRIGGER validate_platform_setting
BEFORE INSERT OR UPDATE ON public.platform_settings
FOR EACH ROW EXECUTE FUNCTION public.validate_platform_setting();

-- A zero price cannot be charged (Razorpay refuses a 0 order), so it would only
-- block the doctor's next renewal. NOT VALID: existing rows are untouched, every
-- new or changed row is checked.
ALTER TABLE public.doctor_custom_plans DROP CONSTRAINT IF EXISTS doctor_custom_plans_price_positive;
ALTER TABLE public.doctor_custom_plans
  ADD CONSTRAINT doctor_custom_plans_price_positive CHECK (monthly_price > 0) NOT VALID;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_custom_plan_price_range;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_custom_plan_price_range
  CHECK (custom_plan_price IS NULL OR (custom_plan_price > 0 AND custom_plan_price <= 100000)) NOT VALID;

-- 5. The notification bell listens for changes, so the table must be published.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- 6. Staff sessions need plan_end to compute the grace window of a lapsed paid plan.

DROP FUNCTION IF EXISTS public.get_doctor_plan_details(uuid);
CREATE FUNCTION public.get_doctor_plan_details(_doctor_id uuid)
RETURNS TABLE(plan_status text, trial_end timestamptz, plan_end timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.plan_status::text, p.trial_end, p.plan_end FROM public.profiles p
  WHERE p.id = _doctor_id AND public.staff_doctor_id(auth.uid()) = _doctor_id
$$;
REVOKE EXECUTE ON FUNCTION public.get_doctor_plan_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_doctor_plan_details(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
