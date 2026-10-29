-- Custom plan integrity regression checks (run AFTER 20261029160000 is applied).
--   npx supabase db query --linked -f supabase/tests/custom_plan_integrity.sql
-- One transaction, rolled back; any failed check raises an exception.
BEGIN;

DO $$
DECLARE
  d uuid;
  st text;
  msg text := '';
  n int;
  n_events int;
  n_notes int;
  rejected boolean := false;
BEGIN
  SELECT id INTO d FROM public.profiles WHERE onboarding_completed = true LIMIT 1;
  IF d IS NULL THEN SELECT id INTO d FROM public.profiles LIMIT 1; END IF;
  IF d IS NULL THEN RAISE EXCEPTION 'no doctor profile to test with'; END IF;

  -- trusted context (no JWT) so the plan-column guard lets the setup through
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('app.plan_write_ok', 'on', true);
  DELETE FROM public.pending_plans WHERE doctor_id = d;
  DELETE FROM public.doctor_custom_plans WHERE doctor_id = d;
  DELETE FROM public.plan_requests WHERE doctor_id = d AND status = 'pending';
  UPDATE public.profiles SET plan_tier = 'free', plan_status = 'active', plan_end = now() + interval '20 days' WHERE id = d;

  -- 1. A doctor on the Free tier cannot request a custom plan (it could never be priced or applied)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.submit_plan_request(ARRAY['online_consultation'], '{}'::text[], 'test');
  EXCEPTION WHEN raise_exception THEN
    rejected := true;
    msg := SQLERRM;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'a free-tier doctor was allowed to submit a custom plan request'; END IF;
  IF msg NOT LIKE '%Pro or Premium%' THEN RAISE EXCEPTION 'unexpected message: %', msg; END IF;

  -- 2. Changing tier ends a custom plan built on the old tier, and tells the doctor
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('app.plan_write_ok', 'on', true);
  UPDATE public.profiles SET plan_tier = 'pro' WHERE id = d;
  INSERT INTO public.doctor_custom_plans (doctor_id, base_tier, extra_features, removed_features, monthly_price, valid_from, valid_until, status)
  VALUES (d, 'pro', ARRAY['online_consultation'], '{}', 2000, now() - interval '1 hour', now() + interval '60 days', 'active');

  -- same tier again: nothing happens
  UPDATE public.profiles SET plan_tier = 'pro' WHERE id = d;
  SELECT status INTO st FROM public.doctor_custom_plans WHERE doctor_id = d;
  IF st <> 'active' THEN RAISE EXCEPTION 'custom plan ended without a tier change: %', st; END IF;

  -- counts before and after, so older real rows cannot make the checks pass vacuously
  SELECT count(*) INTO n_events FROM public.plan_request_events WHERE doctor_id = d AND event = 'ended_by_tier_change';
  SELECT count(*) INTO n_notes FROM public.notifications WHERE doctor_id = d AND source_type = 'plan_request' AND title = 'Custom plan ended';
  UPDATE public.profiles SET plan_tier = 'premium' WHERE id = d;
  SELECT status INTO st FROM public.doctor_custom_plans WHERE doctor_id = d;
  IF st <> 'cancelled' THEN RAISE EXCEPTION 'custom plan survived a tier change: %', st; END IF;
  SELECT count(*) INTO n FROM public.plan_request_events WHERE doctor_id = d AND event = 'ended_by_tier_change';
  IF n <> n_events + 1 THEN RAISE EXCEPTION 'expected exactly one new ended_by_tier_change event, got %', n - n_events; END IF;
  SELECT count(*) INTO n FROM public.notifications WHERE doctor_id = d AND source_type = 'plan_request' AND title = 'Custom plan ended';
  IF n <> n_notes + 1 THEN RAISE EXCEPTION 'expected the doctor to get exactly one new notification, got %', n - n_notes; END IF;

  -- 3. A plan built on the tier the doctor is already on is left alone when the tier is re-saved
  UPDATE public.doctor_custom_plans SET status = 'active', base_tier = 'premium' WHERE doctor_id = d;
  UPDATE public.profiles SET plan_tier = 'premium' WHERE id = d;
  SELECT status INTO st FROM public.doctor_custom_plans WHERE doctor_id = d;
  IF st <> 'active' THEN RAISE EXCEPTION 'custom plan ended although the tier did not change: %', st; END IF;

  RAISE NOTICE 'custom_plan_integrity checks passed';
END $$;

ROLLBACK;
