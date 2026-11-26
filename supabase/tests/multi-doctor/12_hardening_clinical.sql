-- Multi-doctor hardening 2: clinical access in "own patients only" mode, prescription shares, storage.
-- Covers 20261126100700_hardening_clinical_access.sql. Rolled back; prints 'pass'.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/12_hardening_clinical.sql
BEGIN;
CREATE FUNCTION pg_temp.as_user(u uuid, r text DEFAULT 'authenticated') RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', CASE WHEN u IS NULL THEN '' ELSE json_build_object('sub', u, 'role', r)::text END, true)
$$;
DO $$
DECLARE
  d   uuid := gen_random_uuid();   -- multi-doctor clinic owner (Dr A, the primary)
  ub  uuid := gen_random_uuid();   -- Dr B's own login (role 'doctor')
  ur  uuid := gen_random_uuid();   -- reception: medical records + prescriptions + profile.edit
  um  uuid := gen_random_uuid();   -- reception that may also manage doctors
  stranger uuid := gen_random_uuid();
  pa uuid; pb uuid;
  p1 uuid; p2 uuid; p3 uuid;
  v1 uuid; v2 uuid;
  rx_a uuid; rx_b uuid;
  r jsonb;
  n int; m int;
  t text;
  b boolean;
  f_p1 text; f_p2 text; f_prac text; f_other text; f_logo text;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  VALUES (d, 'authenticated', 'authenticated', d::text || '@example.test', '{"full_name":"Dr Owner"}'::jsonb);
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"account_type":"staff"}'::jsonb
  FROM unnest(ARRAY[ub, ur, um]) AS u;
  UPDATE public.profiles SET plan_tier = 'premium', plan_status = 'active', plan_end = now() + interval '30 days'
   WHERE id = d;
  INSERT INTO public.doctor_feature_overrides (doctor_id, feature_key, enabled, reason, granted_by)
  VALUES (d, 'multi_doctor', true, 'test: hardening clinical', d);
  INSERT INTO public.clinic_doctor_seats (doctor_id, extra_seats, reason) VALUES (d, 2, 'test');
  INSERT INTO public.website_settings (doctor_id) VALUES (d) ON CONFLICT DO NOTHING;
  pa := public.primary_practitioner_id(d);
  INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (d, 'Dr B', 'dr-b') RETURNING id INTO pb;
  IF NOT public.clinic_multi_doctor_enabled(d) THEN RAISE EXCEPTION 'setup: d must be multi-doctor'; END IF;

  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status, role, practitioner_id)
  VALUES (ub, d, 'Dr B', 'drb-' || ub, '+1590' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"prescriptions.view": true, "prescriptions.create": true, "prescriptions.edit": true, "patients.medical_records": true}'::jsonb,
          d, 'active', 'doctor', pb);
  UPDATE public.practitioners SET user_id = ub WHERE id = pb;
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status)
  VALUES (ur, d, 'Reception', 'rec-' || ur, '+1591' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"prescriptions.view": true, "patients.medical_records": true, "profile.edit": true}'::jsonb, d, 'active'),
         (um, d, 'Manager', 'mgr-' || um, '+1592' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"prescriptions.view": true, "patients.medical_records": true, "profile.edit": true, "practitioners.manage": true}'::jsonb, d, 'active');

  -- Patients: P1 sees Dr A only. P2 sees Dr B (live booking). P3 sees Dr A (live) and has only a
  -- CANCELLED booking with Dr B.
  PERFORM pg_temp.as_user(d);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id)
  VALUES (d, 'HC Pone', '9000001201', 'Visit', 'clinic', today, 0, 'HC01', 'pending', pa) RETURNING patient_id INTO p1;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id)
  VALUES (d, 'HC Ptwo', '9000001202', 'Visit', 'clinic', today, 0, 'HC02', 'pending', pb) RETURNING patient_id INTO p2;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id)
  VALUES (d, 'HC Pthree', '9000001203', 'Visit', 'clinic', today, 0, 'HC03', 'pending', pa) RETURNING patient_id INTO p3;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id)
  VALUES (d, 'HC Pthree', '9000001203', 'Visit', 'clinic', today + 1, 0, 'HC04', 'pending', pb);
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.appointments SET status = 'cancelled' WHERE doctor_id = d AND token_number = 'HC04';
  IF p1 IS NULL OR p2 IS NULL OR p3 IS NULL THEN RAISE EXCEPTION 'setup: bookings did not create patients'; END IF;
  IF (SELECT patient_id FROM public.appointments WHERE token_number = 'HC04' AND doctor_id = d) IS DISTINCT FROM p3 THEN
    RAISE EXCEPTION 'setup: the cancelled booking is not P3''s';
  END IF;

  -- Clinical rows (trusted, no JWT), one per patient P1 / P2.
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO public.patient_visits (doctor_id, patient_id, practitioner_id, created_by, updated_by) VALUES (d, p1, pa, d, d) RETURNING id INTO v1;
  INSERT INTO public.patient_visits (doctor_id, patient_id, practitioner_id, created_by, updated_by) VALUES (d, p2, pb, d, d) RETURNING id INTO v2;
  INSERT INTO public.patient_vitals (doctor_id, patient_id, visit_id, created_by) VALUES (d, p1, v1, d), (d, p2, v2, d);
  PERFORM pg_temp.as_user(d);   -- created_by is filled from the signed-in user
  INSERT INTO public.patient_allergies (doctor_id, patient_id, allergy_name) VALUES (d, p1, 'A1'), (d, p2, 'A2');
  INSERT INTO public.patient_conditions (doctor_id, patient_id, condition_name) VALUES (d, p1, 'C1'), (d, p2, 'C2');
  INSERT INTO public.patient_medications (doctor_id, patient_id, medicine_name) VALUES (d, p1, 'M1'), (d, p2, 'M2');
  INSERT INTO public.patient_surgeries (doctor_id, patient_id, title) VALUES (d, p1, 'S1'), (d, p2, 'S2');
  INSERT INTO public.patient_family_history (doctor_id, patient_id, family_member, condition) VALUES (d, p1, 'F1', 'x'), (d, p2, 'F2', 'x');
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO public.prescriptions (doctor_id, patient_id, patient_name, practitioner_id, diagnosis)
  VALUES (d, p1, 'HC Pone', pa, 'A for P1') RETURNING id INTO rx_a;
  INSERT INTO public.prescriptions (doctor_id, patient_id, patient_name, practitioner_id, diagnosis)
  VALUES (d, p2, 'HC Ptwo', pb, 'B for P2') RETURNING id INTO rx_b;
  UPDATE public.website_settings SET clinical_visibility = 'treating' WHERE doctor_id = d;

  ---------------------------------------------------------------- 1. a cancelled booking does not make a patient mine
  PERFORM pg_temp.as_user(ub);
  b := public.clinical_row_visible(d, p1, NULL);
  IF b IS DISTINCT FROM false THEN RAISE EXCEPTION '1: P1 visible to Dr B = % (want false)', b; END IF;
  b := public.clinical_row_visible(d, p2, NULL);
  IF b IS DISTINCT FROM true THEN RAISE EXCEPTION '1: P2 visible to Dr B = % (want true)', b; END IF;
  b := public.clinical_row_visible(d, p3, NULL);
  IF b IS DISTINCT FROM false THEN RAISE EXCEPTION '1: P3 (cancelled booking only) visible to Dr B = % (want false)', b; END IF;
  -- Un-cancelling is a booking with Dr B again.
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.appointments SET status = 'pending' WHERE doctor_id = d AND token_number = 'HC04';
  PERFORM pg_temp.as_user(ub);
  b := public.clinical_row_visible(d, p3, NULL);
  IF b IS DISTINCT FROM true THEN RAISE EXCEPTION '1: P3 with a live booking visible = % (want true)', b; END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.appointments SET status = 'cancelled' WHERE doctor_id = d AND token_number = 'HC04';

  ---------------------------------------------------------------- 2. the rest of the clinical record
  FOREACH t IN ARRAY ARRAY['patient_vitals', 'patient_allergies', 'patient_conditions',
                           'patient_medications', 'patient_surgeries', 'patient_family_history'] LOOP
    -- Dr B: own patient's row only.
    PERFORM pg_temp.as_user(ub);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE format('SELECT count(*) FROM public.%I WHERE patient_id = $1', t) INTO n USING p1;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE patient_id = $1', t) INTO m USING p2;
    EXECUTE 'RESET ROLE';
    IF n <> 0 OR m <> 1 THEN RAISE EXCEPTION '2: % Dr B sees P1 % rows, P2 % rows (want 0,1)', t, n, m; END IF;
    -- Reception and owner: both.
    PERFORM pg_temp.as_user(ur);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE format('SELECT count(*) FROM public.%I WHERE patient_id IN ($1, $2)', t) INTO n USING p1, p2;
    EXECUTE 'RESET ROLE';
    IF n <> 2 THEN RAISE EXCEPTION '2: % reception sees % rows (want 2)', t, n; END IF;
    PERFORM pg_temp.as_user(d);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE format('SELECT count(*) FROM public.%I WHERE patient_id IN ($1, $2)', t) INTO n USING p1, p2;
    EXECUTE 'RESET ROLE';
    IF n <> 2 THEN RAISE EXCEPTION '2: % owner sees % rows (want 2)', t, n; END IF;
    -- Stranger: nothing.
    PERFORM pg_temp.as_user(stranger);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE format('SELECT count(*) FROM public.%I WHERE patient_id IN ($1, $2)', t) INTO n USING p1, p2;
    EXECUTE 'RESET ROLE';
    IF n <> 0 THEN RAISE EXCEPTION '2: % stranger sees % rows', t, n; END IF;
  END LOOP;
  -- Writing for a patient Dr B does not treat is refused, for their own patient it works.
  PERFORM pg_temp.as_user(ub);
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO public.patient_allergies (doctor_id, patient_id, allergy_name) VALUES (d, p1, 'sneaky');
    RAISE EXCEPTION '2: Dr B wrote an allergy for a patient they do not treat';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  EXECUTE 'RESET ROLE';
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.patient_allergies (doctor_id, patient_id, allergy_name) VALUES (d, p2, 'fine');
  EXECUTE 'RESET ROLE';

  ---------------------------------------------------------------- 3. prescription shares
  PERFORM pg_temp.as_user(d);
  r := public.create_prescription_share(rx_a);
  IF r->>'token' IS NULL THEN RAISE EXCEPTION '3: owner share for A: %', r; END IF;
  r := public.create_prescription_share(rx_b);
  IF r->>'token' IS NULL THEN RAISE EXCEPTION '3: owner share for B: %', r; END IF;
  PERFORM pg_temp.as_user(ub);
  BEGIN
    r := public.create_prescription_share(rx_a);
    RAISE EXCEPTION '3: Dr B shared a prescription of a patient they do not treat (token %)', left(r->>'token', 4);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'NOT_ALLOWED' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.revoke_prescription_share(rx_a);
    RAISE EXCEPTION '3: Dr B revoked a share of a patient they do not treat';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'NOT_ALLOWED' THEN RAISE; END IF;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.prescription_shares WHERE prescription_id = rx_a AND revoked_at IS NULL) THEN
    RAISE EXCEPTION '3: the share of A was revoked or lost';
  END IF;
  -- Their own prescription: fine.
  r := public.create_prescription_share(rx_b);
  IF r->>'token' IS NULL THEN RAISE EXCEPTION '3: Dr B share for own prescription: %', r; END IF;
  PERFORM public.revoke_prescription_share(rx_b);
  -- Reading shares: Dr B sees only shares of prescriptions they can see.
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.prescription_shares WHERE prescription_id = rx_a;
  SELECT count(*) INTO m FROM public.prescription_shares WHERE prescription_id = rx_b;
  EXECUTE 'RESET ROLE';
  IF n <> 0 OR m < 1 THEN RAISE EXCEPTION '3: Dr B sees % shares of A, % of B (want 0, >=1)', n, m; END IF;
  PERFORM pg_temp.as_user(ur);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.prescription_shares WHERE prescription_id IN (rx_a, rx_b);
  EXECUTE 'RESET ROLE';
  IF n < 2 THEN RAISE EXCEPTION '3: reception sees % shares (want >= 2)', n; END IF;
  PERFORM pg_temp.as_user(d);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.prescription_shares WHERE prescription_id IN (rx_a, rx_b);
  EXECUTE 'RESET ROLE';
  IF n < 2 THEN RAISE EXCEPTION '3: owner sees % shares (want >= 2)', n; END IF;
  PERFORM public.revoke_prescription_share(rx_a);                       -- owner may revoke
  -- A stranger still gets nothing.
  PERFORM pg_temp.as_user(stranger);
  BEGIN
    r := public.create_prescription_share(rx_a);
    RAISE EXCEPTION '3: a stranger got a share token';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'NOT_ALLOWED' THEN RAISE; END IF;
  END;
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.prescription_shares WHERE prescription_id IN (rx_a, rx_b);
  EXECUTE 'RESET ROLE';
  IF n <> 0 THEN RAISE EXCEPTION '3: a stranger sees % shares', n; END IF;
  -- Shared mode: Dr B may share the clinic's prescriptions again (reception-like access).
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.website_settings SET clinical_visibility = 'shared' WHERE doctor_id = d;
  PERFORM pg_temp.as_user(ub);
  r := public.create_prescription_share(rx_a);
  IF r->>'token' IS NULL THEN RAISE EXCEPTION '3: shared mode share: %', r; END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.website_settings SET clinical_visibility = 'treating' WHERE doctor_id = d;

  ---------------------------------------------------------------- 4a. patient documents in storage
  f_p1 := d::text || '/' || p1::text || '/a.pdf';
  f_p2 := d::text || '/' || p2::text || '/b.pdf';
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO storage.objects (bucket_id, name) VALUES ('patient-documents', f_p1), ('patient-documents', f_p2);
  PERFORM public.storage_patient_object_visible('not-a-uuid/x');   -- never raises
  PERFORM pg_temp.as_user(ub);
  IF public.storage_patient_object_visible(f_p1) IS DISTINCT FROM false
     OR public.storage_patient_object_visible(f_p2) IS DISTINCT FROM true
     OR public.storage_patient_object_visible('not-a-uuid/x') IS DISTINCT FROM false
     OR public.storage_patient_object_visible(NULL) IS DISTINCT FROM false THEN
    RAISE EXCEPTION '4a: storage_patient_object_visible answers wrong';
  END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'patient-documents' AND name = f_p1;
  SELECT count(*) INTO m FROM storage.objects WHERE bucket_id = 'patient-documents' AND name = f_p2;
  EXECUTE 'RESET ROLE';
  IF n <> 0 OR m <> 1 THEN RAISE EXCEPTION '4a: Dr B reads P1 file %, P2 file % (want 0,1)', n, m; END IF;
  PERFORM pg_temp.as_user(ur);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'patient-documents' AND name IN (f_p1, f_p2);
  EXECUTE 'RESET ROLE';
  IF n <> 2 THEN RAISE EXCEPTION '4a: reception reads % files (want 2)', n; END IF;
  PERFORM pg_temp.as_user(d);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'patient-documents' AND name IN (f_p1, f_p2);
  EXECUTE 'RESET ROLE';
  IF n <> 2 THEN RAISE EXCEPTION '4a: owner reads % files (want 2)', n; END IF;
  PERFORM pg_temp.as_user(stranger);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'patient-documents' AND name IN (f_p1, f_p2);
  EXECUTE 'RESET ROLE';
  IF n <> 0 THEN RAISE EXCEPTION '4a: a stranger reads % files', n; END IF;
  -- Delete: Dr B only their own patient's file.
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  PERFORM pg_temp.as_user(ub);
  EXECUTE 'SET LOCAL ROLE authenticated';
  DELETE FROM storage.objects WHERE bucket_id = 'patient-documents' AND name = f_p1;
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM storage.objects WHERE bucket_id = 'patient-documents' AND name = f_p2;
  GET DIAGNOSTICS m = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  IF n <> 0 OR m <> 1 THEN RAISE EXCEPTION '4a: Dr B deleted P1 file %, P2 file % (want 0,1)', n, m; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'patient-documents' AND name = f_p1) THEN
    RAISE EXCEPTION '4a: the P1 file is gone';
  END IF;
  -- Reception deletes as before.
  PERFORM pg_temp.as_user(ur);
  EXECUTE 'SET LOCAL ROLE authenticated';
  DELETE FROM storage.objects WHERE bucket_id = 'patient-documents' AND name = f_p1;
  GET DIAGNOSTICS n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  IF n <> 1 THEN RAISE EXCEPTION '4a: reception deleted % P1 files (want 1)', n; END IF;
  -- Shared mode: the helper lets a doctor login through.
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.website_settings SET clinical_visibility = 'shared' WHERE doctor_id = d;
  PERFORM pg_temp.as_user(ub);
  IF public.storage_patient_object_visible(f_p1) IS DISTINCT FROM true THEN RAISE EXCEPTION '4a: shared mode refused'; END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.website_settings SET clinical_visibility = 'treating' WHERE doctor_id = d;

  ---------------------------------------------------------------- 4b. doctor photos in doctor-uploads
  f_prac  := d::text || '/practitioners/' || pb::text || '/photo.png';
  f_other := d::text || '/blog/post.png';
  f_logo  := d::text || '/logo.png';
  -- Reception with profile.edit but without practitioners.manage: other paths yes, doctor photos no.
  PERFORM pg_temp.as_user(ur);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO storage.objects (bucket_id, name) VALUES ('doctor-uploads', f_other);
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('doctor-uploads', f_prac);
    RAISE EXCEPTION '4b: staff without practitioners.manage uploaded a doctor photo';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  EXECUTE 'RESET ROLE';
  -- With practitioners.manage (and profile.edit): allowed.
  PERFORM pg_temp.as_user(um);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO storage.objects (bucket_id, name) VALUES ('doctor-uploads', f_prac);
  EXECUTE 'RESET ROLE';
  -- Update of that object: manager yes, plain reception no.
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE storage.objects SET metadata = '{"v":1}'::jsonb WHERE bucket_id = 'doctor-uploads' AND name = f_prac;
  GET DIAGNOSTICS n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  IF n <> 1 THEN RAISE EXCEPTION '4b: manager updated % doctor photos (want 1)', n; END IF;
  PERFORM pg_temp.as_user(ur);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE storage.objects SET metadata = '{"v":2}'::jsonb WHERE bucket_id = 'doctor-uploads' AND name = f_prac;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE storage.objects SET metadata = '{"v":2}'::jsonb WHERE bucket_id = 'doctor-uploads' AND name = f_other;
  GET DIAGNOSTICS m = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  IF n <> 0 OR m <> 1 THEN RAISE EXCEPTION '4b: plain reception updated doctor photo % (want 0), other file % (want 1)', n, m; END IF;
  -- The owner: insert, update and delete everywhere in their own folder.
  PERFORM pg_temp.as_user(d);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO storage.objects (bucket_id, name) VALUES ('doctor-uploads', f_logo), ('doctor-uploads', d::text || '/practitioners/' || pa::text || '/sig.png');
  UPDATE storage.objects SET metadata = '{"v":3}'::jsonb WHERE bucket_id = 'doctor-uploads' AND name = f_prac;
  GET DIAGNOSTICS n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  IF n <> 1 THEN RAISE EXCEPTION '4b: owner updated % doctor photos (want 1)', n; END IF;
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  DELETE FROM storage.objects WHERE bucket_id = 'doctor-uploads' AND name = f_prac;
  GET DIAGNOSTICS n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  IF n <> 1 THEN RAISE EXCEPTION '4b: owner deleted % doctor photos (want 1)', n; END IF;
  -- A doctor login and a stranger cannot write there (nor in the owner's folder at all).
  PERFORM pg_temp.as_user(ub);
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO storage.objects (bucket_id, name) VALUES ('doctor-uploads', d::text || '/practitioners/' || pb::text || '/mine.png');
    RAISE EXCEPTION '4b: a doctor login uploaded a doctor photo';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.as_user(stranger);
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO storage.objects (bucket_id, name) VALUES ('doctor-uploads', f_prac);
    RAISE EXCEPTION '4b: a stranger uploaded a doctor photo';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  EXECUTE 'RESET ROLE';
END $$;
SELECT 'pass' AS result;
ROLLBACK;
