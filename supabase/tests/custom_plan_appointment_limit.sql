-- Custom plan appointment-limit regression checks (run AFTER 20261029170000 is applied).
--   npx supabase db query --linked -f supabase/tests/custom_plan_appointment_limit.sql
-- One transaction, rolled back; any failed check raises an exception.
BEGIN;

DO $$
DECLARE
  d uuid;
  std int;
  lim int;
  rid uuid;
  rejected boolean;
  msg text;
  usage_row record;
  month_day date := date '2031-03-10';   -- a month with no real appointments
  i int;
BEGIN
  SELECT id INTO d FROM public.profiles WHERE onboarding_completed = true ORDER BY created_at LIMIT 1;
  IF d IS NULL THEN SELECT id INTO d FROM public.profiles ORDER BY created_at LIMIT 1; END IF;
  IF d IS NULL THEN RAISE EXCEPTION 'no doctor profile to test with'; END IF;

  -- trusted context for the setup
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('app.plan_write_ok', 'on', true);
  DELETE FROM public.pending_plans WHERE doctor_id = d;
  DELETE FROM public.doctor_custom_plans WHERE doctor_id = d;
  DELETE FROM public.plan_requests WHERE doctor_id = d AND status IN ('pending', 'rejected');
  DELETE FROM public.appointments WHERE doctor_id = d AND date >= date '2031-03-01' AND date < date '2031-04-01';
  UPDATE public.profiles SET plan_tier = 'pro', plan_status = 'active', plan_end = now() + interval '20 days', trial_end = NULL WHERE id = d;

  SELECT COALESCE((value)::int, 500) INTO std FROM public.platform_settings WHERE key = 'basic_appointment_cap';
  std := COALESCE(std, 500);

  -- 1. No custom plan: the standard limit applies
  lim := public.doctor_monthly_appointment_limit(d);
  IF lim IS DISTINCT FROM std THEN RAISE EXCEPTION 'standard limit wrong: % (expected %)', lim, std; END IF;

  -- 2. A custom plan built on Pro with a limit of 3 replaces it
  INSERT INTO public.doctor_custom_plans (doctor_id, base_tier, extra_features, removed_features, monthly_price, monthly_appointments_limit, valid_from, status)
  VALUES (d, 'pro', '{}', '{}', 1800, 3, now() - interval '1 hour', 'active');
  lim := public.doctor_monthly_appointment_limit(d);
  IF lim IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'custom limit not applied: %', lim; END IF;

  -- the booking trigger enforces it: three fit, the fourth is refused with the known code
  FOR i IN 1..3 LOOP
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number)
    VALUES (d, 'Cap Test ' || i, '', 'Visit', 'clinic', month_day, 100, 'CAP' || i);
  END LOOP;
  rejected := false;
  BEGIN
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number)
    VALUES (d, 'Cap Test 4', '', 'Visit', 'clinic', month_day, 100, 'CAP4');
  EXCEPTION WHEN OTHERS THEN
    rejected := SQLERRM LIKE 'MONTHLY_APPOINTMENT_CAP_REACHED%';
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'the fourth appointment was not refused at a limit of 3'; END IF;

  -- 3. The usage meter reports the same effective limit
  SELECT * INTO usage_row FROM public.get_appointment_cap_usage(d);
  IF usage_row.appointments_cap <> 3 OR usage_row.appointments_unlimited OR usage_row.standard_cap <> std THEN
    RAISE EXCEPTION 'usage meter disagrees with the limit: %', usage_row;
  END IF;

  -- 4. Unlimited (-1) removes the cap
  UPDATE public.doctor_custom_plans SET monthly_appointments_limit = -1 WHERE doctor_id = d;
  IF public.doctor_monthly_appointment_limit(d) IS NOT NULL THEN RAISE EXCEPTION 'unlimited should be NULL (no cap)'; END IF;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number)
  VALUES (d, 'Cap Test 4', '', 'Visit', 'clinic', month_day, 100, 'CAP4');
  SELECT * INTO usage_row FROM public.get_appointment_cap_usage(d);
  IF NOT usage_row.appointments_unlimited THEN RAISE EXCEPTION 'usage meter should say unlimited'; END IF;

  -- 5. The limit counts only while the plan applies: another tier means the standard limit again
  UPDATE public.doctor_custom_plans SET monthly_appointments_limit = 3, base_tier = 'premium' WHERE doctor_id = d;
  IF public.doctor_monthly_appointment_limit(d) IS DISTINCT FROM std THEN
    RAISE EXCEPTION 'a plan built on another tier must not change the limit';
  END IF;
  UPDATE public.doctor_custom_plans SET base_tier = 'pro', valid_until = now() - interval '1 minute', valid_from = now() - interval '2 days' WHERE doctor_id = d;
  IF public.doctor_monthly_appointment_limit(d) IS DISTINCT FROM std THEN
    RAISE EXCEPTION 'an expired plan must not change the limit';
  END IF;
  UPDATE public.doctor_custom_plans SET valid_until = NULL WHERE doctor_id = d;

  -- 6. Premium is unlimited whatever the plan says
  UPDATE public.profiles SET plan_tier = 'premium' WHERE id = d;
  IF public.doctor_monthly_appointment_limit(d) IS NOT NULL THEN RAISE EXCEPTION 'premium must be unlimited'; END IF;
  UPDATE public.profiles SET plan_tier = 'pro' WHERE id = d;
  DELETE FROM public.doctor_custom_plans WHERE doctor_id = d;

  -- 7. Requests: a limit-only request is accepted for a Pro doctor, and bad values are refused
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  rid := public.submit_plan_request('{}'::text[], '{}'::text[], 'more please', std + 200);
  IF NOT EXISTS (SELECT 1 FROM public.plan_requests WHERE id = rid AND requested_appointments_limit = std + 200) THEN
    RAISE EXCEPTION 'limit-only request was not stored';
  END IF;
  PERFORM public.withdraw_plan_request(rid);

  rejected := false; msg := '';
  BEGIN
    PERFORM public.submit_plan_request('{}'::text[], '{}'::text[], NULL, 0);
  EXCEPTION WHEN raise_exception THEN rejected := true; msg := SQLERRM;
  END;
  IF NOT rejected OR msg NOT LIKE '%from 1 to 100000%' THEN RAISE EXCEPTION 'a limit of 0 was not refused for the right reason: %', msg; END IF;

  rejected := false; msg := '';
  BEGIN
    PERFORM public.submit_plan_request('{}'::text[], '{}'::text[], NULL, std);
  EXCEPTION WHEN raise_exception THEN rejected := true; msg := SQLERRM;
  END;
  IF NOT rejected OR msg NOT LIKE '%already has that appointment limit%' THEN RAISE EXCEPTION 'asking for the current limit was not refused for the right reason: %', msg; END IF;

  rejected := false; msg := '';
  BEGIN
    PERFORM public.submit_plan_request('{}'::text[], '{}'::text[], NULL, NULL);
  EXCEPTION WHEN raise_exception THEN rejected := true; msg := SQLERRM;
  END;
  IF NOT rejected OR msg NOT LIKE '%at least one feature or a new appointment limit%' THEN RAISE EXCEPTION 'an empty request was not refused for the right reason: %', msg; END IF;

  -- 8. A Premium doctor cannot ask for a limit (they already have unlimited)
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('app.plan_write_ok', 'on', true);
  UPDATE public.profiles SET plan_tier = 'premium' WHERE id = d;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  rejected := false;
  msg := '';
  BEGIN
    PERFORM public.submit_plan_request('{}'::text[], '{}'::text[], NULL, 500);
  EXCEPTION WHEN raise_exception THEN rejected := true; msg := SQLERRM;
  END;
  IF NOT rejected OR msg NOT LIKE '%unlimited%' THEN RAISE EXCEPTION 'premium doctor was allowed to request a limit: %', msg; END IF;

  -- 9. Nobody but the doctor (or their staff) can read another doctor's usage / effective limit
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  rejected := false; msg := '';
  BEGIN
    PERFORM * FROM public.get_appointment_cap_usage(d);
  EXCEPTION WHEN raise_exception THEN rejected := true; msg := SQLERRM;
  END;
  IF NOT rejected OR msg NOT LIKE '%not authorized%' THEN RAISE EXCEPTION 'another user could read this doctor''s usage: %', msg; END IF;

  RAISE NOTICE 'custom_plan_appointment_limit checks passed';
END $$;

ROLLBACK;
