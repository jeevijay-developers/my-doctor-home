-- Abuse-limit regression checks (run AFTER 20261029150000 is applied).
--   npx supabase db query --linked -f supabase/tests/abuse_limits.sql
-- One transaction, rolled back; any failed check raises an exception.
BEGIN;

DO $$
DECLARE
  d uuid;
  tomorrow date := (now() AT TIME ZONE 'Asia/Kolkata')::date + 1;
  a1 uuid;
  rec public.appointments%ROWTYPE;
  expected numeric;
  n int;
  blocked boolean := false;
BEGIN
  SELECT id INTO d FROM public.profiles WHERE onboarding_completed = true LIMIT 1;
  IF d IS NULL THEN SELECT id INTO d FROM public.profiles LIMIT 1; END IF;
  IF d IS NULL THEN RAISE EXCEPTION 'no doctor profile to test with'; END IF;
  UPDATE public.profiles SET plan_status = 'trial', trial_end = now() + interval '5 days' WHERE id = d;
  DELETE FROM public.appointments WHERE doctor_id = d AND date = tomorrow;

  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);

  -- 1. A public booking needs a real phone number
  BEGIN
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, time_slot, amount, token_number)
    VALUES (d, 'No Phone', '', 'Clinic Visit', 'clinic', tomorrow, '10:00', 100, 'ZZ001');
    RAISE EXCEPTION 'anon booking without a phone was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 2. The price comes from the clinic's setup, not from the visitor
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, time_slot, amount, token_number)
  VALUES (d, 'Cheap Skate', '9444444401', 'Clinic Visit', 'clinic', tomorrow, '10:00', 1, 'ZZ002')
  RETURNING id INTO a1;
  expected := public.public_booking_price(d, 'Clinic Visit', 'clinic');
  SELECT * INTO rec FROM public.appointments WHERE id = a1;
  IF rec.amount IS DISTINCT FROM expected THEN RAISE EXCEPTION 'forged amount kept: % (expected %)', rec.amount, expected; END IF;

  -- 3. At most 3 open future bookings per phone and clinic
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, time_slot, amount, token_number)
  VALUES (d, 'Cheap Skate', '9444444401', 'Clinic Visit', 'clinic', tomorrow, '10:30', 100, 'ZZ003'),
         (d, 'Cheap Skate', '9444444401', 'Clinic Visit', 'clinic', tomorrow, '11:00', 100, 'ZZ004');
  BEGIN
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, time_slot, amount, token_number)
    VALUES (d, 'Cheap Skate', '9444444401', 'Clinic Visit', 'clinic', tomorrow, '11:30', 100, 'ZZ005');
    RAISE EXCEPTION 'a fourth open booking for one phone was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 4. Guessing tokens locks the phone out after 8 misses, even for the right token
  FOR n IN 1..8 LOOP
    PERFORM * FROM public.get_appointment_by_token(d, 'WRONG' || n, '9444444401');
  END LOOP;
  BEGIN
    PERFORM * FROM public.get_appointment_by_token(d, 'ZZ002', '9444444401');
  EXCEPTION WHEN raise_exception THEN
    blocked := SQLERRM = 'TOO_MANY_ATTEMPTS';
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'lookup was not blocked after 8 failed guesses'; END IF;
  IF (public.cancel_appointment_by_token(d, 'ZZ002', '9444444401')->>'error') <> 'TOO_MANY_ATTEMPTS' THEN
    RAISE EXCEPTION 'cancel was not blocked while locked out';
  END IF;

  -- 5. A different phone is unaffected, and a correct lookup clears its own misses
  PERFORM * FROM public.get_appointment_by_token(d, 'WRONG1', '9444444402');
  SELECT count(*) INTO n FROM public.get_appointment_by_token(d, 'NOPE', '9444444402');
  IF n <> 0 THEN RAISE EXCEPTION 'unknown token returned a row'; END IF;
  IF (public.get_my_queue_status(d, 'ZZ002', '9444444401')->>'found')::boolean THEN
    RAISE EXCEPTION 'queue status answered while locked out';
  END IF;

  RAISE NOTICE 'abuse_limits checks passed';
END $$;

ROLLBACK;
