-- A doctor asking for social media marketing from "Customize my plan" (run AFTER 20261128100000).
--   npx supabase db query --linked -f supabase/tests/social_marketing_request.sql
-- One transaction, rolled back; any failed check raises an exception.
BEGIN;

DO $$
DECLARE
  d uuid;
  a uuid;
  rid uuid;
  refused boolean;
  flagged boolean;
BEGIN
  SELECT user_id INTO a FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF a IS NULL THEN RAISE EXCEPTION 'no superadmin to test with'; END IF;
  SELECT id INTO d FROM public.profiles WHERE id <> a ORDER BY created_at LIMIT 1;
  IF d IS NULL THEN RAISE EXCEPTION 'no doctor profile to test with'; END IF;

  -- trusted setup: a paid Pro doctor with nothing pending and no custom plan
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('app.plan_write_ok', 'on', true);
  DELETE FROM public.pending_plans WHERE doctor_id = d;
  DELETE FROM public.doctor_custom_plans WHERE doctor_id = d;
  DELETE FROM public.plan_requests WHERE doctor_id = d AND status IN ('pending', 'rejected');
  UPDATE public.profiles SET plan_tier = 'pro', plan_status = 'active', plan_end = now() + interval '20 days', trial_end = NULL WHERE id = d;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);

  -- 1. Asking for nothing at all is still refused
  refused := false;
  BEGIN PERFORM public.submit_plan_request('{}'::text[], '{}'::text[], NULL, NULL, false);
  EXCEPTION WHEN raise_exception THEN refused := true; END;
  IF NOT refused THEN RAISE EXCEPTION 'an empty request was accepted'; END IF;

  -- 2. A request for ONLY social media marketing is accepted and flagged
  rid := public.submit_plan_request('{}'::text[], '{}'::text[], 'please', NULL, true);
  SELECT requested_social_marketing INTO flagged FROM public.plan_requests WHERE id = rid;
  IF flagged IS DISTINCT FROM true THEN RAISE EXCEPTION 'social marketing flag not stored'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.plan_request_events WHERE request_id = rid AND event = 'submitted' AND (details->>'social_marketing')::boolean) THEN
    RAISE EXCEPTION 'submit event does not record the social marketing ask';
  END IF;

  -- 3. A second request while one is pending is refused (unchanged rule)
  refused := false;
  BEGIN PERFORM public.submit_plan_request('{}'::text[], '{}'::text[], NULL, NULL, true);
  EXCEPTION WHEN raise_exception THEN refused := true; END;
  IF NOT refused THEN RAISE EXCEPTION 'two pending requests allowed'; END IF;

  -- 4. Asking is not a promise: no social marketing record exists yet
  IF EXISTS (SELECT 1 FROM public.custom_plan_social_marketing WHERE doctor_id = d) THEN
    RAISE EXCEPTION 'a request created a social marketing record';
  END IF;

  -- 5. The old 4-argument call shape still works (flag defaults to false)
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM public.plan_requests WHERE doctor_id = d AND status = 'pending';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  rid := public.submit_plan_request('{}'::text[], '{}'::text[], NULL, 5000);
  SELECT requested_social_marketing INTO flagged FROM public.plan_requests WHERE id = rid;
  IF flagged IS DISTINCT FROM false THEN RAISE EXCEPTION 'flag should default to false'; END IF;

  -- 6. Already running: the doctor cannot ask again
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM public.plan_requests WHERE doctor_id = d AND status = 'pending';
  INSERT INTO public.doctor_custom_plans (doctor_id, base_tier, extra_features, removed_features, monthly_price, valid_from, status)
  VALUES (d, 'pro', '{}', '{}', 1800, now() - interval '1 hour', 'active');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  PERFORM public.save_social_marketing_scope(d, ARRAY['instagram'], 8, ARRAY['reel'], true, true, 'company', false, false, NULL, 'monthly', 5000, 'each_post', NULL, true, true, current_date, 'email');
  PERFORM public.activate_social_marketing(d);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  refused := false;
  BEGIN PERFORM public.submit_plan_request('{}'::text[], '{}'::text[], NULL, NULL, true);
  EXCEPTION WHEN raise_exception THEN refused := true; END;
  IF NOT refused THEN RAISE EXCEPTION 'asked for an add-on that is already active'; END IF;
END $$;

SELECT 'pass' AS social_marketing_request;
ROLLBACK;
