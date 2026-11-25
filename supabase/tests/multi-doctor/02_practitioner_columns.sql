-- Multi-doctor P0, part 2: practitioner_id columns and fill_practitioner().
-- Rolled back; prints one row 'pass'.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/02_practitioner_columns.sql
BEGIN;
DO $$
DECLARE
  d  uuid := gen_random_uuid();
  d2 uuid := gen_random_uuid();
  reception uuid := gen_random_uuid();   -- a signed-in user who is not a practitioner
  pa uuid; pb uuid; p_other uuid;
  ap uuid; ap_b uuid; pat uuid; v uuid;
  got uuid; got2 uuid;
  n int;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  tmr   date := (now() AT TIME ZONE 'Asia/Kolkata')::date + 1;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"full_name":"Dr Test"}'::jsonb
  FROM unnest(ARRAY[d, d2]) AS u;
  UPDATE public.profiles SET plan_status = 'trial', trial_end = now() + interval '5 days' WHERE id IN (d, d2);
  pa := public.primary_practitioner_id(d);
  p_other := public.primary_practitioner_id(d2);

  -- 1. Signup working hours carry the primary practitioner; nothing anywhere is missing one.
  SELECT count(*) INTO n FROM public.working_hours WHERE doctor_id = d AND practitioner_id IS DISTINCT FROM pa;
  IF n <> 0 THEN RAISE EXCEPTION 'working hours not on the primary practitioner (%)', n; END IF;

  -- 2. Single-doctor clinic: an old-style insert (no practitioner_id) lands on the only doctor.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status)
  VALUES (d, 'Single Doc', '9000000101', 'Visit', 'clinic', today, 300, 'MD01', 'pending')
  RETURNING id, practitioner_id, patient_id INTO ap, got, pat;
  IF got IS DISTINCT FROM pa THEN RAISE EXCEPTION 'single-doctor booking not filled: %', got; END IF;
  IF pat IS NULL THEN RAISE EXCEPTION 'test setup: staff booking did not create a patient'; END IF;

  -- 3. Second doctor: from now on a booking must name its doctor.
  INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (d, 'Dr Second', 'dr-second')
  RETURNING id INTO pb;
  BEGIN
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                     date, amount, token_number, payment_status)
    VALUES (d, 'No Doc', '9000000102', 'Visit', 'clinic', today, 300, 'MD02', 'pending');
    RAISE EXCEPTION 'multi-doctor booking without practitioner was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PRACTITIONER_REQUIRED' THEN RAISE; END IF;
  END;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id)
  VALUES (d, 'Doc B Patient', '9000000103', 'Visit', 'clinic', today, 300, 'MD03', 'pending', pb)
  RETURNING id INTO ap_b;

  -- 4. A doctor of another clinic is refused.
  BEGIN
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                     date, amount, token_number, payment_status, practitioner_id)
    VALUES (d, 'Wrong Clinic', '9000000104', 'Visit', 'clinic', today, 300, 'MD04', 'pending', p_other);
    RAISE EXCEPTION 'cross-clinic practitioner accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PRACTITIONER_MISMATCH' THEN RAISE; END IF;
  END;

  -- 5a. Online booking switched off: the public is refused, the clinic is not.
  UPDATE public.practitioners SET online_booking = false WHERE id = pb;
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  BEGIN
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                     date, amount, token_number, time_slot, practitioner_id)
    VALUES (d, 'Public', '9000000105', 'Visit', 'clinic', tmr, 0, 'MD05', '10:00', pb);
    RAISE EXCEPTION 'public booking accepted for a doctor with online booking off';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PRACTITIONER_NOT_BOOKABLE' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id)
  VALUES (d, 'Counter Booking', '9000000106', 'Visit', 'clinic', today, 300, 'MD06', 'pending', pb);

  -- 5b. A doctor who is not taking bookings at all is refused for everyone.
  UPDATE public.practitioners SET is_bookable = false, online_booking = true WHERE id = pb;
  BEGIN
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                     date, amount, token_number, payment_status, practitioner_id)
    VALUES (d, 'Not Bookable', '9000000107', 'Visit', 'clinic', today, 300, 'MD07', 'pending', pb);
    RAISE EXCEPTION 'booking accepted for a non-bookable doctor';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PRACTITIONER_NOT_BOOKABLE' THEN RAISE; END IF;
  END;
  UPDATE public.practitioners SET is_bookable = true WHERE id = pb;

  -- 6. Prescriptions: the writer is the author; someone who is not a doctor must name one.
  INSERT INTO public.prescriptions (doctor_id, patient_name, date, medicines)
  VALUES (d, 'Single Doc', today, '[]'::jsonb)
  RETURNING practitioner_id, created_by INTO got, got2;
  IF got IS DISTINCT FROM pa OR got2 IS DISTINCT FROM d THEN
    RAISE EXCEPTION 'owner prescription: author % created_by %', got, got2;
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', reception, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO public.prescriptions (doctor_id, patient_name, date, medicines)
    VALUES (d, 'Single Doc', today, '[]'::jsonb);
    RAISE EXCEPTION 'prescription without author accepted in a multi-doctor clinic';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PRACTITIONER_REQUIRED' THEN RAISE; END IF;
  END;

  -- 7. A visit takes its appointment's doctor; a prescription on that visit follows it.
  INSERT INTO public.patient_visits (doctor_id, patient_id, appointment_id, visit_date, created_by, updated_by)
  VALUES (d, pat, ap_b, today, reception, reception)
  RETURNING id, practitioner_id INTO v, got;
  IF got IS DISTINCT FROM pb THEN RAISE EXCEPTION 'visit did not take its appointment''s doctor: %', got; END IF;
  INSERT INTO public.prescriptions (doctor_id, patient_name, date, medicines, visit_id)
  VALUES (d, 'Doc B Patient', today, '[]'::jsonb, v)
  RETURNING practitioner_id INTO got;
  IF got IS DISTINCT FROM pb THEN RAISE EXCEPTION 'prescription did not follow its visit: %', got; END IF;

  -- 8. Documents: optional. A reception upload without a visit stays unattributed.
  INSERT INTO public.patient_documents (doctor_id, patient_id, document_name, document_type, file_path,
                                        document_date, created_by)
  VALUES (d, pat, 'scan.pdf', (enum_range(NULL::public.medical_document_type))[1], d::text || '/scan.pdf',
          today, reception)
  RETURNING practitioner_id INTO got;
  IF got IS NOT NULL THEN RAISE EXCEPTION 'reception document was attributed to %', got; END IF;

  -- 9. Even a trusted writer (no JWT) cannot point a row at another clinic's doctor:
  --    the trigger refuses first (PRACTITIONER_MISMATCH); the composite FK is the backstop.
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    UPDATE public.working_hours SET practitioner_id = p_other WHERE doctor_id = d;
    RAISE EXCEPTION 'cross-clinic working hours accepted';
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN NULL;
  END;

  -- 10. Clients may omit the column: the generated Insert type depends on this default.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND column_name = 'practitioner_id' AND column_default IS NOT NULL
     AND table_name IN ('appointments', 'working_hours', 'prescriptions', 'patient_visits');
  IF n <> 4 THEN RAISE EXCEPTION 'practitioner_id default missing on % tables', 4 - n; END IF;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
