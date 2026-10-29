-- Review-hardening regression checks (run AFTER 20261029140000 is applied).
--   npx supabase db query --linked -f supabase/tests/review_hardening.sql
-- One transaction, rolled back; any failed check raises an exception.
BEGIN;

DO $$
DECLARE
  d uuid;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  a1 uuid; a2 uuid; a3 uuid;
  r jsonb;
  rec public.appointments%ROWTYPE;
  pat public.patients%ROWTYPE;
  n int;
  v_status text;
  v_auto boolean;
BEGIN
  SELECT id INTO d FROM public.profiles WHERE onboarding_completed = true LIMIT 1;
  IF d IS NULL THEN SELECT id INTO d FROM public.profiles LIMIT 1; END IF;
  IF d IS NULL THEN RAISE EXCEPTION 'no doctor profile to test with'; END IF;
  UPDATE public.profiles SET plan_status = 'trial', trial_end = now() + interval '5 days' WHERE id = d;
  DELETE FROM public.appointments WHERE doctor_id = d AND date = today;
  DELETE FROM public.patients WHERE doctor_id = d AND phone IN ('9333333301', '9333333302');

  -- 1. Public booking without a time slot is refused (it would skip every slot rule)
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  BEGIN
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number)
    VALUES (d, 'No Slot', '9333333301', 'Visit', 'clinic', today, 100, 'R001');
    RAISE EXCEPTION 'anon booking without a time slot was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 2. Public booking cannot choose its own arrival time
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, time_slot, created_at)
  VALUES (d, 'Time Traveller', '9333333301', 'Visit', 'clinic', today, 100, 'R002', '23:58', '2000-01-01T00:00:00+05:30')
  RETURNING id INTO a1;
  SELECT * INTO rec FROM public.appointments WHERE id = a1;
  IF rec.created_at < now() - interval '1 minute' THEN RAISE EXCEPTION 'anon created_at was kept: %', rec.created_at; END IF;

  -- 3. Nobody can edit the line directly: priority, order and arrival time are queue_action-only
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  BEGIN
    UPDATE public.appointments SET priority = 1 WHERE id = a1;
    RAISE EXCEPTION 'direct priority update was allowed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.appointments SET created_at = '2000-01-01' WHERE id = a1;
    RAISE EXCEPTION 'direct created_at update was allowed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.appointments SET serving_started_at = now() WHERE id = a1;
    RAISE EXCEPTION 'direct serving update was allowed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  r := public.queue_action('set_priority', a1, 'Test reason');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'queue_action priority failed: %', r; END IF;
  r := public.queue_action('clear_priority', a1);
  UPDATE public.appointments SET status = 'cancelled' WHERE id = a1;

  -- 4. Stale-screen protection on call_next
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status)
  VALUES (d, 'Stale One', '9333333302', 'Visit', 'clinic', today, 100, 'R003', 'paid') RETURNING id INTO a2;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status, created_at)
  VALUES (d, 'Stale Two', '', 'Visit', 'clinic', today, 100, 'R004', 'paid', now() + interval '1 second') RETURNING id INTO a3;

  r := public.queue_action('call_next', NULL, NULL, NULL, 'none');
  IF NOT (r->>'ok')::boolean OR (r->>'serving')::uuid <> a2 THEN RAISE EXCEPTION 'call_next (expect none) failed: %', r; END IF;
  -- another device thinks nobody is in the room: refused, nobody gets completed
  r := public.queue_action('call_next', NULL, NULL, NULL, 'none');
  IF (r->>'ok')::boolean OR r->>'error' <> 'STALE' THEN RAISE EXCEPTION 'stale call_next was accepted: %', r; END IF;
  SELECT status::text INTO v_status FROM public.appointments WHERE id = a2;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'stale call_next completed the patient in the room: %', v_status; END IF;
  -- wrong expected id is refused too
  r := public.queue_action('call_next', NULL, NULL, NULL, a3::text);
  IF (r->>'ok')::boolean OR r->>'error' <> 'STALE' THEN RAISE EXCEPTION 'wrong expected id was accepted: %', r; END IF;
  -- the right one works
  r := public.queue_action('call_next', NULL, NULL, NULL, a2::text);
  IF NOT (r->>'ok')::boolean OR (r->>'serving')::uuid <> a3 THEN RAISE EXCEPTION 'call_next (expect id) failed: %', r; END IF;

  -- 5. A booking inserted already cancelled leaves no provisional patient behind
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, status)
  VALUES (d, 'Born Cancelled', '9333333301', 'Visit', 'clinic', today, 100, 'R005', 'cancelled') RETURNING id INTO a1;
  SELECT * INTO rec FROM public.appointments WHERE id = a1;
  IF rec.patient_id IS NOT NULL THEN RAISE EXCEPTION 'cancelled insert created a patient'; END IF;

  -- 6. Editing a provisional patient by hand takes it out of automatic release
  SELECT p.* INTO pat FROM public.patients p JOIN public.appointments a ON a.patient_id = p.id WHERE a.id = a2;
  IF NOT pat.auto_created THEN RAISE EXCEPTION 'expected an auto-created patient'; END IF;
  UPDATE public.patients SET age = 41 WHERE id = pat.id;
  SELECT auto_created INTO v_auto FROM public.patients WHERE id = pat.id;
  IF v_auto THEN RAISE EXCEPTION 'hand-edited patient is still marked auto_created'; END IF;

  -- 7. The nightly job closes the whole backlog row by row and reports a count
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, status)
  VALUES (d, 'Old One', '9333333301', 'Visit', 'clinic', today - 2, 100, 'R006', 'pending'),
         (d, 'Old Two', '9333333302', 'Visit', 'clinic', today - 1, 100, 'R007', 'pending');
  n := public.expire_overdue_appointments();
  IF n < 2 THEN RAISE EXCEPTION 'nightly job closed % rows, expected at least 2', n; END IF;

  RAISE NOTICE 'review_hardening checks passed';
END $$;

ROLLBACK;
