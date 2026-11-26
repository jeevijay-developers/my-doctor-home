-- Multi-doctor P1 part 3b: a doctor login files prescriptions only under their own name.
-- Rolled back; prints 'pass'.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/07b_prescription_author.sql
BEGIN;
DO $$
DECLARE
  d   uuid := gen_random_uuid();   -- multi-doctor clinic owner (Dr A, the primary)
  ub  uuid := gen_random_uuid();   -- Dr B's own login (role 'doctor')
  ur  uuid := gen_random_uuid();   -- reception at d (role 'staff')
  stranger uuid := gen_random_uuid();
  pa uuid; pb uuid;
  p1 uuid; p2 uuid;
  rx_b uuid; rx_new uuid;
  n int;
  b boolean;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  VALUES (d, 'authenticated', 'authenticated', d::text || '@example.test', '{"full_name":"Dr Owner"}'::jsonb);
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"account_type":"staff"}'::jsonb
  FROM unnest(ARRAY[ub, ur]) AS u;
  UPDATE public.profiles SET plan_tier = 'premium', plan_status = 'active', plan_end = now() + interval '30 days'
   WHERE id = d;
  INSERT INTO public.doctor_feature_overrides (doctor_id, feature_key, enabled, reason, granted_by)
  VALUES (d, 'multi_doctor', true, 'test: prescription author', d);
  INSERT INTO public.clinic_doctor_seats (doctor_id, extra_seats, reason) VALUES (d, 2, 'test');
  INSERT INTO public.website_settings (doctor_id) VALUES (d) ON CONFLICT DO NOTHING;
  pa := public.primary_practitioner_id(d);
  INSERT INTO public.practitioners (doctor_id, display_name, slug)
  VALUES (d, 'Dr B', 'dr-b') RETURNING id INTO pb;
  IF NOT public.clinic_multi_doctor_enabled(d) THEN RAISE EXCEPTION 'setup: d must be multi-doctor'; END IF;

  -- Logins (trusted service call, no JWT), as create-staff-account makes them.
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status, role, practitioner_id)
  VALUES (ub, d, 'Dr B', 'drb-' || ub, '+1573' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"prescriptions.view": true, "prescriptions.create": true, "prescriptions.edit": true, "patients.medical_records": true}'::jsonb,
          d, 'active', 'doctor', pb);
  UPDATE public.practitioners SET user_id = ub WHERE id = pb;
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status)
  VALUES (ur, d, 'Reception', 'rec-' || ur, '+1574' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"prescriptions.view": true, "prescriptions.create": true, "prescriptions.edit": true, "patients.medical_records": true}'::jsonb,
          d, 'active');

  -- Patients from bookings: P1 with Dr A, P2 with Dr B. The clinic stays in shared mode.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id)
  VALUES (d, 'RA Pone', '9000000711', 'Visit', 'clinic', today, 300, 'RA01', 'pending', pa)
  RETURNING patient_id INTO p1;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id)
  VALUES (d, 'RA Ptwo', '9000000712', 'Visit', 'clinic', today, 300, 'RA02', 'pending', pb)
  RETURNING patient_id INTO p2;
  IF p1 IS NULL OR p2 IS NULL THEN RAISE EXCEPTION 'setup: bookings did not create patients'; END IF;

  -- The helper answers true or false, never NULL.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  b := public.is_doctor_login(d);
  IF b IS NULL OR NOT b THEN RAISE EXCEPTION 'is_doctor_login for Dr B = % (want true)', b; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ur, 'role', 'authenticated')::text, true);
  b := public.is_doctor_login(d);
  IF b IS NULL OR b THEN RAISE EXCEPTION 'is_doctor_login for reception = % (want false)', b; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  b := public.is_doctor_login(d);
  IF b IS NULL OR b THEN RAISE EXCEPTION 'is_doctor_login for stranger = % (want false)', b; END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  b := public.is_doctor_login(d);
  IF b IS NULL OR b THEN RAISE EXCEPTION 'is_doctor_login with no JWT = % (want false)', b; END IF;
  IF has_function_privilege('anon', 'public.is_doctor_login(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute is_doctor_login';
  END IF;

  -- 1. Dr B cannot file a prescription under Dr A's name (even for Dr B's own patient).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO public.prescriptions (doctor_id, patient_id, patient_name, practitioner_id, diagnosis)
    VALUES (d, p2, 'RA Ptwo', pa, 'B forges A');
    RAISE EXCEPTION 'Dr B filed a prescription as Dr A';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  EXECUTE 'RESET ROLE';

  -- 2. Without an author it is filed under Dr B.
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.prescriptions (doctor_id, patient_id, patient_name, diagnosis)
  VALUES (d, p2, 'RA Ptwo', 'B own') RETURNING id INTO rx_b;
  EXECUTE 'RESET ROLE';
  IF (SELECT practitioner_id FROM public.prescriptions WHERE id = rx_b) IS DISTINCT FROM pb THEN
    RAISE EXCEPTION 'Dr B''s prescription not filed under Dr B';
  END IF;
  -- Naming themselves explicitly is fine too.
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.prescriptions (doctor_id, patient_id, patient_name, practitioner_id, diagnosis)
  VALUES (d, p2, 'RA Ptwo', pb, 'B own explicit') RETURNING id INTO rx_new;
  EXECUTE 'RESET ROLE';
  IF rx_new IS NULL THEN RAISE EXCEPTION 'Dr B could not name themselves as author'; END IF;

  -- 3. Dr B edits their own prescription, but cannot hand it to Dr A.
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.prescriptions SET diagnosis = 'B edits own' WHERE id = rx_b;
  GET DIAGNOSTICS n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  IF n <> 1 THEN RAISE EXCEPTION 'Dr B could not edit own prescription (% rows)', n; END IF;
  n := 0;
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.prescriptions SET practitioner_id = pa WHERE id = rx_b;
    GET DIAGNOSTICS n = ROW_COUNT;
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN insufficient_privilege THEN
    n := 0;
  END;
  EXECUTE 'RESET ROLE';
  IF n <> 0 OR (SELECT practitioner_id FROM public.prescriptions WHERE id = rx_b) IS DISTINCT FROM pb THEN
    RAISE EXCEPTION 'Dr B moved own prescription to Dr A (% rows)', n;
  END IF;
  -- Also when the clinic is no longer multi-doctor (override switched off): the author stays.
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.doctor_feature_overrides SET enabled = false WHERE doctor_id = d AND feature_key = 'multi_doctor';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  n := 0;
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.prescriptions SET practitioner_id = pa WHERE id = rx_b;
    GET DIAGNOSTICS n = ROW_COUNT;
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN insufficient_privilege THEN
    n := 0;
  END;
  EXECUTE 'RESET ROLE';
  IF n <> 0 OR (SELECT practitioner_id FROM public.prescriptions WHERE id = rx_b) IS DISTINCT FROM pb THEN
    RAISE EXCEPTION 'Dr B moved own prescription to Dr A with multi-doctor off (% rows)', n;
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.doctor_feature_overrides SET enabled = true WHERE doctor_id = d AND feature_key = 'multi_doctor';

  -- 4. The owner files a prescription under Dr B.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  rx_new := NULL;
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.prescriptions (doctor_id, patient_id, patient_name, practitioner_id, diagnosis)
  VALUES (d, p2, 'RA Ptwo', pb, 'owner for B') RETURNING id INTO rx_new;
  EXECUTE 'RESET ROLE';
  IF (SELECT practitioner_id FROM public.prescriptions WHERE id = rx_new) IS DISTINCT FROM pb THEN
    RAISE EXCEPTION 'owner prescription not filed under Dr B';
  END IF;

  -- 5. Reception files a prescription naming Dr B as the author.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ur, 'role', 'authenticated')::text, true);
  rx_new := NULL;
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.prescriptions (doctor_id, patient_id, patient_name, practitioner_id, diagnosis)
  VALUES (d, p1, 'RA Pone', pb, 'reception for B') RETURNING id INTO rx_new;
  EXECUTE 'RESET ROLE';
  IF (SELECT practitioner_id FROM public.prescriptions WHERE id = rx_new) IS DISTINCT FROM pb THEN
    RAISE EXCEPTION 'reception prescription not filed under Dr B';
  END IF;

  -- 6. A stranger writes nothing and changes nothing.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO public.prescriptions (doctor_id, patient_id, patient_name, practitioner_id, diagnosis)
    VALUES (d, p1, 'RA Pone', pa, 'stranger');
    RAISE EXCEPTION 'stranger filed a prescription';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  EXECUTE 'RESET ROLE';
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.prescriptions SET practitioner_id = pa, diagnosis = 'stranger' WHERE doctor_id = d;
  GET DIAGNOSTICS n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  IF n <> 0 THEN RAISE EXCEPTION 'stranger updated % prescriptions', n; END IF;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
