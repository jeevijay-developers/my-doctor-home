-- Multi-doctor P0, part 3: per-doctor slots, queue numbers and public RPCs.
-- Rolled back; prints one row 'pass'.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/03_slots_and_queue.sql
BEGIN;
DO $$
DECLARE
  d  uuid := gen_random_uuid();
  pa uuid; pb uuid;
  a_t uuid; b_t uuid; a1 uuid; b1 uuid; a2 uuid; pub_b uuid; pub_a uuid;
  q int; n int; amt numeric;
  r jsonb;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  tmr   date := (now() AT TIME ZONE 'Asia/Kolkata')::date + 1;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  VALUES (d, 'authenticated', 'authenticated', d::text || '@example.test', '{"full_name":"Dr Slot"}'::jsonb);
  UPDATE public.profiles
     SET plan_status = 'trial', trial_end = now() + interval '5 days',
         onboarding_completed = true, consultation_fee = 400
   WHERE id = d;
  pa := public.primary_practitioner_id(d);
  INSERT INTO public.practitioners (doctor_id, display_name, slug, consultation_fee)
  VALUES (d, 'Dr B', 'dr-b', 900) RETURNING id INTO pb;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);

  -- 1. Two doctors may hold the same slot; one doctor may not hold it twice.
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, time_slot, practitioner_id)
  VALUES (d, 'Slot A', '9000000201', 'Visit', 'clinic', tmr, 300, 'MS01', 'pending', '10:00', pa)
  RETURNING id, queue_number INTO a_t, q;
  IF q <> 1 THEN RAISE EXCEPTION 'A tomorrow queue number %', q; END IF;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, time_slot, practitioner_id)
  VALUES (d, 'Slot B', '9000000202', 'Visit', 'clinic', tmr, 300, 'MS02', 'pending', '10:00', pb)
  RETURNING id, queue_number INTO b_t, q;
  IF q <> 1 THEN RAISE EXCEPTION 'queue numbers are not per doctor (B got %)', q; END IF;
  BEGIN
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                     date, amount, token_number, payment_status, time_slot, practitioner_id)
    VALUES (d, 'Slot A2', '9000000203', 'Visit', 'clinic', tmr, 300, 'MS03', 'pending', '10:00', pa);
    RAISE EXCEPTION 'same doctor double-booked';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'SLOT_FULL' THEN RAISE; END IF;
  END;

  -- 2. Slot counts are per doctor; no doctor given = the primary.
  SELECT count(*) INTO n FROM public.get_slot_counts(d, tmr, 'clinic', pb) WHERE time_slot::time = '10:00' AND booked = 1;
  IF n <> 1 THEN RAISE EXCEPTION 'slot count for B wrong'; END IF;
  SELECT count(*) INTO n FROM public.get_slot_counts(d, tmr) WHERE time_slot::time = '10:00' AND booked = 1;
  IF n <> 1 THEN RAISE EXCEPTION 'default slot count is not the primary''s'; END IF;

  -- 3. Moving a booking to a doctor whose slot is taken is refused; to a free time it is
  --    renumbered at the end of that doctor's line.
  BEGIN
    UPDATE public.appointments SET practitioner_id = pa WHERE id = b_t;
    RAISE EXCEPTION 'moved onto a taken slot';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'SLOT_FULL' THEN RAISE; END IF;
  END;
  UPDATE public.appointments SET practitioner_id = pa, time_slot = '11:00' WHERE id = b_t
  RETURNING queue_number INTO q;
  IF q <> 2 THEN RAISE EXCEPTION 'moved booking not renumbered in A''s line (got %)', q; END IF;

  -- 4. Today's line: numbers per doctor; a plain update cannot move a patient today.
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id, created_at)
  VALUES (d, 'Today A1', '9000000211', 'Visit', 'clinic', today, 300, 'MQ01', 'pending', pa, now() + interval '1 second')
  RETURNING id INTO a1;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id, created_at)
  VALUES (d, 'Today B1', '9000000212', 'Visit', 'clinic', today, 300, 'MQ02', 'pending', pb, now() + interval '2 seconds')
  RETURNING id, queue_number INTO b1, q;
  IF q <> 1 THEN RAISE EXCEPTION 'today B1 number %', q; END IF;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id, created_at)
  VALUES (d, 'Today A2', '9000000213', 'Visit', 'clinic', today, 300, 'MQ03', 'pending', pa, now() + interval '3 seconds')
  RETURNING id, queue_number INTO a2, q;
  IF q <> 2 THEN RAISE EXCEPTION 'today A2 number %', q; END IF;
  BEGIN
    UPDATE public.appointments SET practitioner_id = pb WHERE id = a2;
    RAISE EXCEPTION 'same-day doctor change outside queue_action accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'USE_QUEUE_TRANSFER' THEN RAISE; END IF;
  END;

  -- 5. Public queue screen and "my status" only count the patient's own doctor.
  r := public.get_public_queue(d, pb);
  IF (r->>'waiting')::int <> 1 THEN RAISE EXCEPTION 'B public queue: %', r; END IF;
  r := public.get_public_queue(d);
  IF (r->>'waiting')::int <> 2 THEN RAISE EXCEPTION 'default public queue is not the primary''s: %', r; END IF;
  r := public.get_my_queue_status(d, 'MQ03', '9000000213');
  IF (r->>'ahead')::int <> 1 THEN RAISE EXCEPTION 'A2 should have 1 ahead (own doctor only): %', r; END IF;

  -- 6. The public price uses the chosen doctor's fee, else the clinic's.
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, time_slot, practitioner_id)
  VALUES (d, 'Public B', '9000000221', 'No Such Service', 'clinic', tmr, 1, 'MP01', '12:00', pb)
  RETURNING id, amount INTO pub_b, amt;
  IF amt <> 900 THEN RAISE EXCEPTION 'public price for B should be 900, got %', amt; END IF;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, time_slot, practitioner_id)
  VALUES (d, 'Public A', '9000000222', 'No Such Service', 'clinic', tmr, 1, 'MP02', '12:30', pa)
  RETURNING id, amount INTO pub_a, amt;
  IF amt <> 400 THEN RAISE EXCEPTION 'public price for A should be the clinic fee 400, got %', amt; END IF;

  -- 7. A patient's own reschedule checks their own doctor's slots only.
  r := public.reschedule_appointment_by_token(d, 'MP01', '9000000221', tmr, '10:00');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'B reschedule onto a slot only A holds was refused: %', r; END IF;
  r := public.reschedule_appointment_by_token(d, 'MP02', '9000000222', tmr, '11:00');
  IF r->>'error' IS DISTINCT FROM 'SLOT_FULL' THEN RAISE EXCEPTION 'A reschedule onto A''s taken slot: %', r; END IF;

  -- 8. No function still builds a slot or queue-number lock from the clinic id
  --    (the 'queue:' lock of queue_action is checked in 04_queue_action.sql).
  SELECT count(*) INTO n
    FROM pg_proc pr JOIN pg_namespace ns ON ns.oid = pr.pronamespace
   WHERE ns.nspname = 'public' AND pr.prokind = 'f'
     AND pg_get_functiondef(pr.oid) ~ '(hashtextextended\(\s*(NEW\.doctor_id|_doctor_id)|''queue_number:'' \|\| NEW\.doctor_id)';
  IF n <> 0 THEN RAISE EXCEPTION '% functions still lock slots/queue numbers per clinic', n; END IF;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
