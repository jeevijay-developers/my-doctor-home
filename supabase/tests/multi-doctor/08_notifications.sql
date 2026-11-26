-- Multi-doctor P1 part 4: "new booking" notification for doctors who have their own login.
-- Rolled back; prints one row 'pass'.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/08_notifications.sql
BEGIN;
DO $$
DECLARE
  d   uuid := gen_random_uuid();   -- multi-doctor clinic owner (Dr A, the primary)
  d2  uuid := gen_random_uuid();   -- single-doctor clinic
  ub  uuid := gen_random_uuid();   -- Dr B's own login
  pa uuid; pb uuid; pc uuid;
  n int;
  msg text;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  tmr   date := (now() AT TIME ZONE 'Asia/Kolkata')::date + 1;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"full_name":"Dr Owner"}'::jsonb
  FROM unnest(ARRAY[d, d2]) AS u;
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  VALUES (ub, 'authenticated', 'authenticated', ub::text || '@example.test', '{"account_type":"staff"}'::jsonb);
  UPDATE public.profiles SET plan_tier = 'premium', plan_status = 'active', plan_end = now() + interval '30 days'
   WHERE id IN (d, d2);
  INSERT INTO public.doctor_feature_overrides (doctor_id, feature_key, enabled, reason, granted_by)
  VALUES (d, 'multi_doctor', true, 'test: booking notifications', d);
  INSERT INTO public.clinic_doctor_seats (doctor_id, extra_seats, reason) VALUES (d, 2, 'test');
  pa := public.primary_practitioner_id(d);
  INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (d, 'Dr B', 'dr-b') RETURNING id INTO pb;
  INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (d, 'Dr C', 'dr-c') RETURNING id INTO pc;
  IF NOT public.clinic_multi_doctor_enabled(d) THEN RAISE EXCEPTION 'setup: d must be multi-doctor'; END IF;
  IF public.clinic_multi_doctor_enabled(d2) THEN RAISE EXCEPTION 'setup: d2 must be single-doctor'; END IF;

  -- Dr B's login (trusted service call, no JWT), as create-staff-account makes it.
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status, role, practitioner_id)
  VALUES (ub, d, 'Dr B', 'drb-' || ub, '+1575' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"appointments.view": true, "appointments.create": true, "appointments.edit": true}'::jsonb,
          d, 'active', 'doctor', pb);
  UPDATE public.practitioners SET user_id = ub WHERE id = pb;

  -- 1. The owner books for Dr B: Dr B is told, once.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id, time_slot)
  VALUES (d, 'Note One', '9000000801', 'Visit', 'clinic', tmr, 300, 'NB01', 'pending', pb, '10:00');
  SELECT count(*) INTO n FROM public.notifications WHERE recipient_user_id = ub AND source_type = 'new_booking';
  IF n <> 1 THEN RAISE EXCEPTION 'owner booking for Dr B: % notifications (want 1)', n; END IF;
  SELECT message INTO msg FROM public.notifications WHERE recipient_user_id = ub AND source_type = 'new_booking';
  IF msg NOT LIKE 'Note One booked for % at 10:00 AM' THEN RAISE EXCEPTION 'message text: %', msg; END IF;

  -- 2. A booking for the owner's own practitioner notifies nobody.
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id)
  VALUES (d, 'Note Two', '9000000802', 'Visit', 'clinic', today, 300, 'NB02', 'pending', pa);
  SELECT count(*) INTO n FROM public.notifications WHERE doctor_id = d AND source_type = 'new_booking';
  IF n <> 1 THEN RAISE EXCEPTION 'booking for the owner created a notification (% total)', n; END IF;

  -- 3. A booking for a doctor without a login notifies nobody.
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id)
  VALUES (d, 'Note Three', '9000000803', 'Visit', 'clinic', today, 300, 'NB03', 'pending', pc);
  SELECT count(*) INTO n FROM public.notifications WHERE doctor_id = d AND source_type = 'new_booking';
  IF n <> 1 THEN RAISE EXCEPTION 'booking for a doctor without login created a notification (% total)', n; END IF;

  -- 4. Dr B cannot book for themselves any more (20261126100600: doctor logins do not book,
  --    reception does), so nothing is created and nobody is told.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                     date, amount, token_number, payment_status, practitioner_id)
    VALUES (d, 'Note Four', '9000000804', 'Visit', 'clinic', today, 300, 'NB04', 'pending', pb);
    RAISE EXCEPTION 'Dr B created a booking';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'DOCTOR_LOGIN_FORBIDDEN' THEN RAISE; END IF;
  END;
  SELECT count(*) INTO n FROM public.notifications WHERE recipient_user_id = ub AND source_type = 'new_booking';
  IF n <> 1 THEN RAISE EXCEPTION 'Dr B refused booking changed the notifications (% total)', n; END IF;

  -- 5. A booking made without a JWT (paid online booking via the edge function) DOES tell Dr B.
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id, time_slot)
  VALUES (d, 'Note Five', '9000000805', 'Visit', 'clinic', tmr, 300, 'NB05', 'pending', pb, '11:00');
  SELECT count(*) INTO n FROM public.notifications WHERE recipient_user_id = ub AND source_type = 'new_booking';
  IF n <> 2 THEN RAISE EXCEPTION 'no-JWT booking for Dr B: % notifications (want 2)', n; END IF;

  -- 6. Single-doctor clinics get no booking notifications at all.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d2, 'role', 'authenticated')::text, true);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status)
  VALUES (d2, 'Note Six', '9000000806', 'Visit', 'clinic', today, 300, 'NB06', 'pending');
  SELECT count(*) INTO n FROM public.notifications WHERE doctor_id = d2 AND source_type = 'new_booking';
  IF n <> 0 THEN RAISE EXCEPTION 'single-doctor clinic got % booking notifications', n; END IF;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
