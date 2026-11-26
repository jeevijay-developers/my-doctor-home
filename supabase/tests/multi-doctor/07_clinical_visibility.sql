-- Multi-doctor P1 part 3: clinical visibility between doctors and prescription authorship.
-- Rolled back; prints 'pass'.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/07_clinical_visibility.sql
BEGIN;
DO $$
DECLARE
  d   uuid := gen_random_uuid();   -- multi-doctor clinic owner (Dr A, the primary)
  d2  uuid := gen_random_uuid();   -- single-doctor clinic, no pilot override
  ub  uuid := gen_random_uuid();   -- Dr B's own login (role 'doctor')
  ur  uuid := gen_random_uuid();   -- reception at d (role 'staff')
  ur2 uuid := gen_random_uuid();   -- reception at d2
  stranger uuid := gen_random_uuid();
  pa uuid; pb uuid; pa2 uuid;
  p1 uuid; p2 uuid; p3 uuid;
  rx_a uuid; rx_b uuid; rx_d2 uuid; rx_new uuid;
  v_a uuid; doc_p1 uuid; doc_p2 uuid;
  r jsonb; tok text;
  n int; m int; k int;
  b boolean;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"full_name":"Dr Owner"}'::jsonb
  FROM unnest(ARRAY[d, d2]) AS u;
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"account_type":"staff"}'::jsonb
  FROM unnest(ARRAY[ub, ur, ur2]) AS u;
  UPDATE public.profiles SET plan_tier = 'premium', plan_status = 'active', plan_end = now() + interval '30 days',
                             qualifications = 'MBBS (clinic)', registration_number = 'REG-OWNER'
   WHERE id IN (d, d2);
  -- If the platform launch flag is ever on, d2 must still be a single-doctor clinic.
  IF EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'multi_doctor_enabled' AND value = 'true'::jsonb) THEN
    UPDATE public.profiles SET plan_tier = 'free' WHERE id = d2;
  END IF;
  INSERT INTO public.doctor_feature_overrides (doctor_id, feature_key, enabled, reason, granted_by)
  VALUES (d, 'multi_doctor', true, 'test: clinical visibility', d);
  INSERT INTO public.clinic_doctor_seats (doctor_id, extra_seats, reason) VALUES (d, 2, 'test');
  INSERT INTO public.website_settings (doctor_id) VALUES (d), (d2) ON CONFLICT DO NOTHING;
  pa  := public.primary_practitioner_id(d);
  pa2 := public.primary_practitioner_id(d2);
  -- Dr B: no qualifications of their own (falls back to the clinic's), own registration number.
  INSERT INTO public.practitioners (doctor_id, display_name, slug, registration_number, specialization)
  VALUES (d, 'Dr B', 'dr-b', 'REG-B-777', 'Dermatology') RETURNING id INTO pb;
  IF NOT public.clinic_multi_doctor_enabled(d) OR public.clinic_multi_doctor_enabled(d2) THEN
    RAISE EXCEPTION 'setup: d must be multi-doctor and d2 not';
  END IF;

  -- Logins (trusted service call, no JWT), as create-staff-account makes them.
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status, role, practitioner_id)
  VALUES (ub, d, 'Dr B', 'drb-' || ub, '+1570' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"prescriptions.view": true, "prescriptions.create": true, "prescriptions.edit": true, "patients.medical_records": true}'::jsonb,
          d, 'active', 'doctor', pb);
  UPDATE public.practitioners SET user_id = ub WHERE id = pb;
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status)
  VALUES (ur, d, 'Reception', 'rec-' || ur, '+1571' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"prescriptions.view": true, "prescriptions.create": true, "prescriptions.edit": true, "patients.medical_records": true, "website.settings": true}'::jsonb,
          d, 'active'),
         (ur2, d2, 'Reception 2', 'rec2-' || ur2, '+1572' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"prescriptions.view": true, "prescriptions.edit": true}'::jsonb, d2, 'active');

  -- Patients come from bookings: P1 sees Dr A only, P2 sees Dr B only; P3 is in d2.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id)
  VALUES (d, 'CV Pone', '9000000701', 'Visit', 'clinic', today, 300, 'CV01', 'pending', pa)
  RETURNING patient_id INTO p1;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id)
  VALUES (d, 'CV Ptwo', '9000000702', 'Visit', 'clinic', today, 300, 'CV02', 'pending', pb)
  RETURNING patient_id INTO p2;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d2, 'role', 'authenticated')::text, true);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status)
  VALUES (d2, 'CV Pthree', '9000000703', 'Visit', 'clinic', today, 300, 'CV03', 'pending')
  RETURNING patient_id INTO p3;
  IF p1 IS NULL OR p2 IS NULL OR p3 IS NULL THEN RAISE EXCEPTION 'setup: bookings did not create patients'; END IF;

  -- Clinical rows (trusted, no JWT).
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO public.prescriptions (doctor_id, patient_id, patient_name, practitioner_id, diagnosis)
  VALUES (d, p1, 'CV Pone', pa, 'A for P1') RETURNING id INTO rx_a;
  INSERT INTO public.prescriptions (doctor_id, patient_id, patient_name, practitioner_id, diagnosis)
  VALUES (d, p2, 'CV Ptwo', pb, 'B for P2') RETURNING id INTO rx_b;
  INSERT INTO public.prescriptions (doctor_id, patient_id, patient_name, diagnosis)
  VALUES (d2, p3, 'CV Pthree', 'd2 rx') RETURNING id INTO rx_d2;
  INSERT INTO public.patient_visits (doctor_id, patient_id, practitioner_id, created_by, updated_by) VALUES (d, p1, pa, d, d) RETURNING id INTO v_a;
  -- Documents without a doctor (practitioner_id is nullable there).
  INSERT INTO public.patient_documents (doctor_id, patient_id, document_name, file_path, created_by)
  VALUES (d, p1, 'p1.pdf', d::text || '/p1.pdf', d) RETURNING id INTO doc_p1;
  INSERT INTO public.patient_documents (doctor_id, patient_id, document_name, file_path, created_by)
  VALUES (d, p2, 'p2.pdf', d::text || '/p2.pdf', d) RETURNING id INTO doc_p2;
  IF EXISTS (SELECT 1 FROM public.patient_documents WHERE id IN (doc_p1, doc_p2) AND practitioner_id IS NOT NULL) THEN
    RAISE EXCEPTION 'setup: documents should have no doctor';
  END IF;

  -- 1. Shared mode (the default): Dr B reads Dr A's prescription for P1.
  IF (SELECT clinical_visibility FROM public.website_settings WHERE doctor_id = d) <> 'shared' THEN
    RAISE EXCEPTION 'default clinical_visibility should be shared';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.prescriptions WHERE id = rx_a;
  SELECT count(*) INTO m FROM public.patient_visits WHERE id = v_a;
  SELECT count(*) INTO k FROM public.patient_documents WHERE id IN (doc_p1, doc_p2);
  EXECUTE 'RESET ROLE';
  IF n <> 1 OR m <> 1 OR k <> 2 THEN RAISE EXCEPTION 'shared mode: Dr B sees rx %, visits %, docs % (want 1,1,2)', n, m, k; END IF;

  -- 3a. Reception reads both, shared mode.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ur, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.prescriptions WHERE id IN (rx_a, rx_b);
  EXECUTE 'RESET ROLE';
  IF n <> 2 THEN RAISE EXCEPTION 'shared mode: reception sees % prescriptions (want 2)', n; END IF;

  -- 5. Only the owner switches the setting; reception with website.settings gets OWNER_ONLY.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ur, 'role', 'authenticated')::text, true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.website_settings SET clinical_visibility = 'treating' WHERE doctor_id = d;
    RAISE EXCEPTION 'reception changed clinical_visibility';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'OWNER_ONLY' THEN RAISE; END IF;
  END;
  EXECUTE 'RESET ROLE';
  -- ... and reception can still change other settings.
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.website_settings SET buffer_minutes = buffer_minutes WHERE doctor_id = d;
  GET DIAGNOSTICS n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  IF n <> 1 THEN RAISE EXCEPTION 'reception could not update other website settings (% rows)', n; END IF;
  -- Dr B's login cannot switch it either.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  BEGIN
    UPDATE public.website_settings SET clinical_visibility = 'treating' WHERE doctor_id = d;
    RAISE EXCEPTION 'doctor login changed clinical_visibility';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'OWNER_ONLY' THEN RAISE; END IF;
  END;
  -- A bad value is refused by the check constraint.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  BEGIN
    UPDATE public.website_settings SET clinical_visibility = 'nobody' WHERE doctor_id = d;
    RAISE EXCEPTION 'bad clinical_visibility accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  -- The owner switches to treating mode.
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.website_settings SET clinical_visibility = 'treating' WHERE doctor_id = d;
  GET DIAGNOSTICS n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  IF n <> 1 THEN RAISE EXCEPTION 'owner could not switch to treating mode'; END IF;

  -- 2. Treating mode: Dr B no longer sees Dr A's P1 records, still sees their own P2 ones.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.prescriptions WHERE id = rx_a;
  SELECT count(*) INTO m FROM public.prescriptions WHERE id = rx_b;
  SELECT count(*) INTO k FROM public.patient_visits WHERE id = v_a;
  EXECUTE 'RESET ROLE';
  IF n <> 0 OR m <> 1 OR k <> 0 THEN
    RAISE EXCEPTION 'treating mode: Dr B sees A rx %, own rx %, A visit % (want 0,1,0)', n, m, k;
  END IF;
  -- Documents with no doctor follow the patient: P2 (Dr B treats) yes, P1 no.
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.patient_documents WHERE id = doc_p1;
  SELECT count(*) INTO m FROM public.patient_documents WHERE id = doc_p2;
  EXECUTE 'RESET ROLE';
  IF n <> 0 OR m <> 1 THEN RAISE EXCEPTION 'treating mode docs: P1 %, P2 % (want 0,1)', n, m; END IF;
  -- Fail closed: the check answers true or false, never NULL (NULL practitioner, NULL patient).
  b := public.clinical_row_visible(d, p1, NULL);
  IF b IS NULL OR b THEN RAISE EXCEPTION 'clinical_row_visible(P1, no doctor) for Dr B = % (want false)', b; END IF;
  b := public.clinical_row_visible(d, NULL, pa);
  IF b IS NULL OR b THEN RAISE EXCEPTION 'clinical_row_visible(no patient, Dr A) for Dr B = % (want false)', b; END IF;
  b := public.clinical_row_visible(d, NULL, NULL);
  IF b IS NULL OR b THEN RAISE EXCEPTION 'clinical_row_visible(NULL, NULL) for Dr B = % (want false)', b; END IF;

  -- The owner reads both.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.prescriptions WHERE id IN (rx_a, rx_b);
  SELECT count(*) INTO m FROM public.patient_visits WHERE id = v_a;
  SELECT count(*) INTO k FROM public.patient_documents WHERE id IN (doc_p1, doc_p2);
  EXECUTE 'RESET ROLE';
  IF n <> 2 OR m <> 1 OR k <> 2 THEN RAISE EXCEPTION 'treating mode: owner sees rx %, visits %, docs % (want 2,1,2)', n, m, k; END IF;

  -- 3b. Reception is unaffected by the setting.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ur, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.prescriptions WHERE id IN (rx_a, rx_b);
  SELECT count(*) INTO m FROM public.patient_visits WHERE id = v_a;
  SELECT count(*) INTO k FROM public.patient_documents WHERE id IN (doc_p1, doc_p2);
  EXECUTE 'RESET ROLE';
  IF n <> 2 OR m <> 1 OR k <> 2 THEN RAISE EXCEPTION 'treating mode: reception sees rx %, visits %, docs % (want 2,1,2)', n, m, k; END IF;

  -- Stranger sees nothing and changes nothing, in either clinic.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.prescriptions WHERE id IN (rx_a, rx_b, rx_d2);
  SELECT count(*) INTO m FROM public.patient_visits WHERE id = v_a;
  SELECT count(*) INTO k FROM public.patient_documents WHERE id IN (doc_p1, doc_p2);
  EXECUTE 'RESET ROLE';
  IF n <> 0 OR m <> 0 OR k <> 0 THEN RAISE EXCEPTION 'stranger sees rx %, visits %, docs %', n, m, k; END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.prescriptions SET diagnosis = 'stranger' WHERE id IN (rx_a, rx_b, rx_d2);
  GET DIAGNOSTICS n = ROW_COUNT;
  SELECT count(*) INTO m FROM public.clinical_access_log;
  EXECUTE 'RESET ROLE';
  IF n <> 0 THEN RAISE EXCEPTION 'stranger updated % prescriptions', n; END IF;
  IF m <> 0 THEN RAISE EXCEPTION 'stranger reads % access log rows', m; END IF;
  PERFORM public.log_clinical_access(p1);
  IF EXISTS (SELECT 1 FROM public.clinical_access_log WHERE doctor_id = d) THEN
    RAISE EXCEPTION 'stranger wrote an access log row';
  END IF;

  -- 4. Author-only edits in a multi-doctor clinic.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  -- Back to shared mode for this check, so Dr B can see (but not change) Dr A's prescription.
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.website_settings SET clinical_visibility = 'shared' WHERE doctor_id = d;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.prescriptions SET diagnosis = 'B edits A' WHERE id = rx_a;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.prescriptions SET diagnosis = 'B edits own' WHERE id = rx_b;
  GET DIAGNOSTICS m = ROW_COUNT;
  DELETE FROM public.prescriptions WHERE id = rx_a;
  GET DIAGNOSTICS k = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  IF n <> 0 OR m <> 1 OR k <> 0 THEN
    RAISE EXCEPTION 'author-only: B on A rx updated %, own updated %, A deleted % (want 0,1,0)', n, m, k;
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ur, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.prescriptions SET diagnosis = 'reception edits' WHERE id IN (rx_a, rx_b);
  GET DIAGNOSTICS n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  IF n <> 0 THEN RAISE EXCEPTION 'reception updated % prescriptions in a multi-doctor clinic', n; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.prescriptions SET diagnosis = 'owner edits' WHERE id IN (rx_a, rx_b);
  GET DIAGNOSTICS n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  IF n <> 2 THEN RAISE EXCEPTION 'owner updated % prescriptions (want 2)', n; END IF;
  -- Single-doctor clinic: reception with prescriptions.edit edits as today.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ur2, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.prescriptions SET diagnosis = 'd2 reception edits' WHERE id = rx_d2;
  GET DIAGNOSTICS n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  IF n <> 1 THEN RAISE EXCEPTION 'single-doctor reception updated % prescriptions (want 1)', n; END IF;

  -- Writing in treating mode: Dr B adds a prescription for P2 (authored as Dr B), reception
  -- adds one for P1 choosing Dr A as the author.
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.website_settings SET clinical_visibility = 'treating' WHERE doctor_id = d;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.prescriptions (doctor_id, patient_id, patient_name, diagnosis)
  VALUES (d, p2, 'CV Ptwo', 'B new for P2') RETURNING id INTO rx_new;
  EXECUTE 'RESET ROLE';
  IF (SELECT practitioner_id FROM public.prescriptions WHERE id = rx_new) IS DISTINCT FROM pb THEN
    RAISE EXCEPTION 'Dr B''s new prescription not authored as Dr B';
  END IF;
  -- Dr B cannot add a prescription attributed to Dr A for a patient Dr B does not treat.
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO public.prescriptions (doctor_id, patient_id, patient_name, practitioner_id, diagnosis)
    VALUES (d, p1, 'CV Pone', pa, 'B writes as A for P1');
    RAISE EXCEPTION 'Dr B wrote a hidden prescription';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ur, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.prescriptions (doctor_id, patient_id, patient_name, practitioner_id, diagnosis)
  VALUES (d, p1, 'CV Pone', pa, 'reception for A') RETURNING id INTO rx_new;
  EXECUTE 'RESET ROLE';
  IF (SELECT practitioner_id FROM public.prescriptions WHERE id = rx_new) IS DISTINCT FROM pa THEN
    RAISE EXCEPTION 'reception prescription not authored as Dr A';
  END IF;

  -- 6. Access log: a doctor login in treating mode leaves one row; the owner leaves none.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  PERFORM public.log_clinical_access(p1);
  -- A patient of another clinic is not logged.
  PERFORM public.log_clinical_access(p3);
  SELECT count(*) INTO n FROM public.clinical_access_log WHERE doctor_id = d AND viewer_user_id = ub AND patient_id = p1;
  SELECT count(*) INTO m FROM public.clinical_access_log WHERE patient_id = p3;
  IF n <> 1 OR m <> 0 THEN RAISE EXCEPTION 'access log as Dr B: P1 %, other clinic % (want 1,0)', n, m; END IF;
  -- Dr B cannot read the log; the owner can.
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.clinical_access_log;
  EXECUTE 'RESET ROLE';
  IF n <> 0 THEN RAISE EXCEPTION 'Dr B reads % access log rows', n; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  PERFORM public.log_clinical_access(p1);
  SELECT count(*) INTO n FROM public.clinical_access_log WHERE doctor_id = d;
  IF n <> 1 THEN RAISE EXCEPTION 'owner access was logged (% rows)', n; END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.clinical_access_log;
  EXECUTE 'RESET ROLE';
  IF n <> 1 THEN RAISE EXCEPTION 'owner reads % access log rows (want 1)', n; END IF;
  -- Shared mode: no log.
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.website_settings SET clinical_visibility = 'shared' WHERE doctor_id = d;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  PERFORM public.log_clinical_access(p1);
  IF (SELECT count(*) FROM public.clinical_access_log WHERE doctor_id = d) <> 1 THEN
    RAISE EXCEPTION 'shared mode access was logged';
  END IF;

  -- 7. Shared prescription carries the author doctor; clinic fields stay the clinic's.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  r := public.create_prescription_share(rx_b);
  tok := r->>'token';
  PERFORM set_config('request.jwt.claims', '', true);
  r := public.get_shared_prescription(tok, '0702');
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION 'shared prescription: %', r; END IF;
  IF r->'doctor'->>'full_name' IS DISTINCT FROM 'B'  -- the typed "Dr " is dropped (20261126100500)
     OR r->'doctor'->>'registration_number' IS DISTINCT FROM 'REG-B-777'
     OR r->'doctor'->>'specialization' IS DISTINCT FROM 'Dermatology'
     OR r->'doctor'->>'qualifications' IS DISTINCT FROM 'MBBS (clinic)'
     OR r->'doctor'->>'slug' IS DISTINCT FROM (SELECT slug FROM public.profiles WHERE id = d)
     OR r->'doctor'->>'clinic_name' IS DISTINCT FROM (SELECT CASE WHEN btrim(COALESCE(clinic_name, '')) = '' THEN 'Dr. ' || full_name || ' Clinic' ELSE clinic_name END FROM public.profiles WHERE id = d) THEN
    RAISE EXCEPTION 'shared prescription doctor block wrong: %', r->'doctor';
  END IF;
  -- The owner's own prescription reads exactly as before (from profiles).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  r := public.create_prescription_share(rx_a);
  tok := r->>'token';
  PERFORM set_config('request.jwt.claims', '', true);
  r := public.get_shared_prescription(tok, '0701');
  IF NOT COALESCE((r->>'ok')::boolean, false)
     OR r->'doctor'->>'full_name' IS DISTINCT FROM (SELECT full_name FROM public.profiles WHERE id = d)
     OR r->'doctor'->>'registration_number' IS DISTINCT FROM 'REG-OWNER' THEN
    RAISE EXCEPTION 'owner shared prescription wrong: %', r->'doctor';
  END IF;
  -- Wrong digits are still refused.
  r := public.get_shared_prescription(tok, '9999');
  IF r->>'error' IS DISTINCT FROM 'PHONE_REQUIRED' THEN RAISE EXCEPTION 'wrong digits: %', r; END IF;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
