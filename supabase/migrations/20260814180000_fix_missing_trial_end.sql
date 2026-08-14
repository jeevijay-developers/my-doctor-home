-- Backfill any trial rows that lost their trial_end value and ensure future rows
-- always get a valid expiry when they are in trial mode.

UPDATE public.profiles
SET trial_end = COALESCE(trial_end, created_at + interval '7 days')
WHERE plan_status = 'trial' AND trial_end IS NULL;

-- Keep trial_end null for non-trial plans, but auto-populate it for trial plans.
CREATE OR REPLACE FUNCTION public.sync_profile_trial_end()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.plan_status = 'trial' AND NEW.trial_end IS NULL THEN
    NEW.trial_end = COALESCE(NEW.created_at, now()) + interval '7 days';
  ELSIF NEW.plan_status <> 'trial' THEN
    NEW.trial_end = NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_trial_end_on_profiles ON public.profiles;

CREATE TRIGGER ensure_trial_end_on_profiles
BEFORE INSERT OR UPDATE OF plan_status, trial_end, created_at
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_trial_end();

-- Keep the bootstrap insert in sync too, so newly created doctor profiles always
-- start with a valid trial_end.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.raw_user_meta_data->>'account_type' = 'staff' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, full_name, trial_end)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    now() + interval '7 days'
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'doctor');

  RETURN NEW;
END;
$$;
