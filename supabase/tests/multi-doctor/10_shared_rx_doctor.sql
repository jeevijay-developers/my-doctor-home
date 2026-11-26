-- Shared prescription (/rx): the doctor block matches the printed slip for a non-owner author.
-- Mirrors src/lib/practitioners/slipDoctor.ts. Rolled back; prints 'pass'.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/10_shared_rx_doctor.sql
BEGIN;
DO $$
DECLARE
  d   uuid := gen_random_uuid();   -- clinic owner (Dr A, the primary)
  pa uuid; pb uuid;
  p1 uuid; p2 uuid;
  rx_a uuid; rx_b uuid;
  r jsonb; tok text; last4 text;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  expected text[][] := ARRAY[
    ['Dr. Meera Shah', 'Meera Shah'],
    ['dr meera shah',  'meera shah'],
    ['Dr Meera Shah',  'Meera Shah'],
    ['DR.  Meera Shah ', 'Meera Shah'],
    ['Drake Patel',    'Drake Patel'],
    ['Dr.Meera',       'Dr.Meera'],
    ['Meera Shah',     'Meera Shah']];
  i int;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  VALUES (d, 'authenticated', 'authenticated', d::text || '@example.test', '{"full_name":"Asha Owner"}'::jsonb);
  UPDATE public.profiles SET plan_tier = 'premium', plan_status = 'active', plan_end = now() + interval '30 days',
         full_name = 'Asha Owner', clinic_name = NULL, registration_number = 'REG-OWNER'
   WHERE id = d;
  INSERT INTO public.doctor_feature_overrides (doctor_id, feature_key, enabled, reason, granted_by)
  VALUES (d, 'multi_doctor', true, 'test: shared rx doctor', d);
  INSERT INTO public.clinic_doctor_seats (doctor_id, extra_seats, reason) VALUES (d, 2, 'test');
  INSERT INTO public.website_settings (doctor_id) VALUES (d) ON CONFLICT DO NOTHING;
  pa := public.primary_practitioner_id(d);
  INSERT INTO public.practitioners (doctor_id, display_name, slug, registration_number)
  VALUES (d, 'Dr. Meera Shah', 'dr-meera', 'REG-B-555') RETURNING id INTO pb;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id)
  VALUES (d, 'SR Pone', '9000000801', 'Visit', 'clinic', today, 300, 'SR01', 'pending', pa)
  RETURNING patient_id INTO p1;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id)
  VALUES (d, 'SR Ptwo', '9000000802', 'Visit', 'clinic', today, 300, 'SR02', 'pending', pb)
  RETURNING patient_id INTO p2;
  IF p1 IS NULL OR p2 IS NULL THEN RAISE EXCEPTION 'setup: bookings did not create patients'; END IF;

  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO public.prescriptions (doctor_id, patient_id, patient_name, practitioner_id, diagnosis)
  VALUES (d, p1, 'SR Pone', pa, 'A') RETURNING id INTO rx_a;
  INSERT INTO public.prescriptions (doctor_id, patient_id, patient_name, practitioner_id, diagnosis)
  VALUES (d, p2, 'SR Ptwo', pb, 'B') RETURNING id INTO rx_b;
  SELECT right(regexp_replace(phone, '\D', '', 'g'), 4) INTO last4 FROM public.patients WHERE id = p2;

  -- Dr B's prescription: name stripped for every typed form, own registration number,
  -- blank clinic name becomes the OWNER's.
  FOR i IN 1..array_length(expected, 1) LOOP
    UPDATE public.practitioners SET display_name = expected[i][1] WHERE id = pb;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
    tok := public.create_prescription_share(rx_b) ->> 'token';
    PERFORM set_config('request.jwt.claims', '', true);
    r := public.get_shared_prescription(tok, last4);
    IF NOT COALESCE((r ->> 'ok')::boolean, false) THEN RAISE EXCEPTION 'share % not ok: %', i, r ->> 'error'; END IF;
    IF r #>> '{doctor,full_name}' IS DISTINCT FROM trim(expected[i][2]) THEN
      RAISE EXCEPTION 'display_name % -> full_name % (want %)', expected[i][1], r #>> '{doctor,full_name}', expected[i][2];
    END IF;
    IF r #>> '{doctor,registration_number}' IS DISTINCT FROM 'REG-B-555' THEN
      RAISE EXCEPTION 'registration number % (want REG-B-555)', r #>> '{doctor,registration_number}';
    END IF;
    IF r #>> '{doctor,clinic_name}' IS DISTINCT FROM 'Dr. Asha Owner Clinic' THEN
      RAISE EXCEPTION 'blank clinic_name -> % (want Dr. Asha Owner Clinic)', r #>> '{doctor,clinic_name}';
    END IF;
  END LOOP;

  -- A bare "Dr." is not a prefix (nothing follows it), so it stays, as in the slip.
  UPDATE public.practitioners SET display_name = 'Dr.' WHERE id = pb;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  tok := public.create_prescription_share(rx_b) ->> 'token';
  PERFORM set_config('request.jwt.claims', '', true);
  r := public.get_shared_prescription(tok, last4);
  IF r #>> '{doctor,full_name}' IS DISTINCT FROM 'Dr.' THEN
    RAISE EXCEPTION 'bare Dr. -> % (want Dr.)', r #>> '{doctor,full_name}';
  END IF;

  -- A clinic WITH a name keeps it.
  UPDATE public.profiles SET clinic_name = 'Owner Care Clinic' WHERE id = d;
  UPDATE public.practitioners SET display_name = 'Dr. Meera Shah' WHERE id = pb;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  tok := public.create_prescription_share(rx_b) ->> 'token';
  PERFORM set_config('request.jwt.claims', '', true);
  r := public.get_shared_prescription(tok, last4);
  IF r #>> '{doctor,clinic_name}' IS DISTINCT FROM 'Owner Care Clinic' THEN
    RAISE EXCEPTION 'named clinic -> % (want Owner Care Clinic)', r #>> '{doctor,clinic_name}';
  END IF;

  -- Owner-authored prescription: nothing changes (full_name as on the profile, clinic_name as stored).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  tok := public.create_prescription_share(rx_a) ->> 'token';
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT right(regexp_replace(phone, '\D', '', 'g'), 4) INTO last4 FROM public.patients WHERE id = p1;
  r := public.get_shared_prescription(tok, last4);
  IF r #>> '{doctor,full_name}' IS DISTINCT FROM 'Asha Owner' OR r #>> '{doctor,clinic_name}' IS DISTINCT FROM 'Owner Care Clinic'
     OR r #>> '{doctor,registration_number}' IS DISTINCT FROM 'REG-OWNER' THEN
    RAISE EXCEPTION 'owner rx changed: %', r -> 'doctor';
  END IF;
  -- ... with a blank clinic name the owner's rx still returns it blank (the slip names it itself).
  UPDATE public.profiles SET clinic_name = NULL WHERE id = d;
  r := public.get_shared_prescription(tok, last4);
  IF r #>> '{doctor,clinic_name}' IS NOT NULL THEN
    RAISE EXCEPTION 'owner rx with blank clinic -> % (want null)', r #>> '{doctor,clinic_name}';
  END IF;
  -- The owner's own profile name is never altered (the slip does not strip it either).
  UPDATE public.profiles SET full_name = 'Dr. Asha Owner' WHERE id = d;
  r := public.get_shared_prescription(tok, last4);
  IF r #>> '{doctor,full_name}' IS DISTINCT FROM 'Dr. Asha Owner' THEN
    RAISE EXCEPTION 'owner full_name altered: %', r #>> '{doctor,full_name}';
  END IF;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
