-- Multi-doctor P0, part 4: queue_action per doctor + transfer. Rolled back; prints 'pass'.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/04_queue_action.sql
BEGIN;
DO $$
DECLARE
  d  uuid := gen_random_uuid();
  d2 uuid := gen_random_uuid();
  pa uuid; pb uuid; pc uuid; p_other uuid;
  a1 uuid; a2 uuid; b1 uuid; s1 uuid;
  r jsonb;
  rec public.appointments%ROWTYPE;
  n int;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"full_name":"Dr Queue"}'::jsonb
  FROM unnest(ARRAY[d, d2]) AS u;
  UPDATE public.profiles SET plan_status = 'trial', trial_end = now() + interval '5 days' WHERE id IN (d, d2);
  pa := public.primary_practitioner_id(d);
  p_other := public.primary_practitioner_id(d2);
  INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (d, 'Dr B', 'dr-b') RETURNING id INTO pb;
  INSERT INTO public.practitioners (doctor_id, display_name, slug, is_bookable)
  VALUES (d, 'Dr C', 'dr-c', false) RETURNING id INTO pc;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id, created_at)
  VALUES (d, 'Q A1', '9000000301', 'Visit', 'clinic', today, 300, 'QA01', 'pending', pa, now() + interval '1 second')
  RETURNING id INTO a1;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id, created_at)
  VALUES (d, 'Q A2', '9000000302', 'Visit', 'clinic', today, 300, 'QA02', 'pending', pa, now() + interval '2 seconds')
  RETURNING id INTO a2;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id, created_at)
  VALUES (d, 'Q B1', '9000000303', 'Visit', 'clinic', today, 300, 'QB01', 'pending', pb, now() + interval '3 seconds')
  RETURNING id INTO b1;

  -- 1. With several doctors, "call next" must say whose line.
  r := public.queue_action('call_next');
  IF r->>'error' IS DISTINCT FROM 'PRACTITIONER_REQUIRED' THEN RAISE EXCEPTION 'call_next without doctor: %', r; END IF;

  -- 2. Each doctor has their own room, at the same time.
  r := public.queue_action('call_next', _practitioner_id => pb, _expect => 'none');
  IF r->>'serving' IS DISTINCT FROM b1::text THEN RAISE EXCEPTION 'B call_next: %', r; END IF;
  r := public.queue_action('call_next', _practitioner_id => pa, _expect => 'none');
  IF r->>'serving' IS DISTINCT FROM a1::text THEN RAISE EXCEPTION 'A call_next while B serving: %', r; END IF;

  -- 3. The stale-screen check is per doctor.
  r := public.queue_action('call_next', _practitioner_id => pb, _expect => 'none');
  IF r->>'error' IS DISTINCT FROM 'STALE' THEN RAISE EXCEPTION 'B stale check: %', r; END IF;

  -- 4. Transfer: end of the target doctor's line, logged.
  r := public.queue_action('transfer', a2, 'Dr A running late', _practitioner_id => pb);
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION 'transfer failed: %', r; END IF;
  SELECT * INTO rec FROM public.appointments WHERE id = a2;
  IF rec.practitioner_id <> pb OR rec.queue_number <> 2 OR rec.serving_started_at IS NOT NULL THEN
    RAISE EXCEPTION 'transferred row wrong: %', row_to_json(rec);
  END IF;
  -- The line is ordered by sort_time: the transferred patient joins it now (IST clock).
  IF rec.sort_time <> (now() AT TIME ZONE 'Asia/Kolkata')::time THEN
    RAISE EXCEPTION 'transferred row not at the end of the line: sort_time %', rec.sort_time;
  END IF;
  SELECT count(*) INTO n FROM public.queue_events WHERE appointment_id = a2 AND action = 'transfer';
  IF n <> 1 THEN RAISE EXCEPTION 'transfer not logged'; END IF;

  -- 5. Refusals.
  r := public.queue_action('transfer', a1, _practitioner_id => pb);
  IF r->>'error' IS DISTINCT FROM 'PRACTITIONER_IN_SERVICE' THEN RAISE EXCEPTION 'transfer of serving patient: %', r; END IF;
  r := public.queue_action('transfer', a2, _practitioner_id => pc);
  IF r->>'error' IS DISTINCT FROM 'PRACTITIONER_NOT_BOOKABLE' THEN RAISE EXCEPTION 'transfer to non-bookable: %', r; END IF;
  r := public.queue_action('transfer', a2, _practitioner_id => p_other);
  IF r->>'error' IS DISTINCT FROM 'PRACTITIONER_NOT_FOUND' THEN RAISE EXCEPTION 'transfer to other clinic: %', r; END IF;
  r := public.queue_action('transfer', a2);
  IF r->>'error' IS DISTINCT FROM 'PRACTITIONER_REQUIRED' THEN RAISE EXCEPTION 'transfer without target: %', r; END IF;

  -- 6. B's next call finishes B1 and calls the transferred patient.
  r := public.queue_action('call_next', _practitioner_id => pb, _expect => b1::text);
  IF r->>'serving' IS DISTINCT FROM a2::text OR r->>'completed' IS DISTINCT FROM b1::text THEN
    RAISE EXCEPTION 'B call_next after transfer: %', r;
  END IF;

  -- 7. Single-doctor clinic: unchanged behaviour without a practitioner argument.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d2, 'role', 'authenticated')::text, true);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status)
  VALUES (d2, 'Solo', '9000000311', 'Visit', 'clinic', today, 300, 'QS01', 'pending')
  RETURNING id INTO s1;
  r := public.queue_action('call_next', _expect => 'none');
  IF r->>'serving' IS DISTINCT FROM s1::text THEN RAISE EXCEPTION 'single-doctor call_next: %', r; END IF;

  -- 8. No function still locks a queue per clinic.
  SELECT count(*) INTO n
    FROM pg_proc pr JOIN pg_namespace ns ON ns.oid = pr.pronamespace
   WHERE ns.nspname = 'public' AND pr.prokind = 'f'
     AND pg_get_functiondef(pr.oid) ~ '''queue:'' \|\| v_doctor';
  IF n <> 0 THEN RAISE EXCEPTION 'queue still locked per clinic in % functions', n; END IF;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
