-- Multi-doctor P1 part 2: managing doctors, doctor logins, per-doctor hours. Rolled back; prints 'pass'.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/06_management.sql
BEGIN;
DO $$
DECLARE
  d  uuid := gen_random_uuid();   -- clinic owner (premium, pilot override, 3 seats)
  d2 uuid := gen_random_uuid();   -- premium clinic without the pilot override
  s_mgr  uuid := gen_random_uuid();  -- staff with practitioners.manage (+ staff.create)
  s_no   uuid := gen_random_uuid();  -- staff without practitioners.manage
  s_doc  uuid := gen_random_uuid();  -- Dr B's own login (role 'doctor')
  s_new  uuid := gen_random_uuid();  -- account a staff member tries to make a doctor login
  stranger uuid := gen_random_uuid();
  pa uuid; pb uuid; pb2 uuid; px uuid;
  a_conf uuid; a_past uuid; a_fut uuid; a_tgt uuid;
  r jsonb;
  n int;
  rec public.appointments%ROWTYPE;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  tmr   date := (now() AT TIME ZONE 'Asia/Kolkata')::date + 1;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"full_name":"Dr Owner"}'::jsonb
  FROM unnest(ARRAY[d, d2]) AS u;
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"account_type":"staff"}'::jsonb
  FROM unnest(ARRAY[s_mgr, s_no, s_doc, s_new]) AS u;
  UPDATE public.profiles SET plan_tier = 'premium', plan_status = 'active', plan_end = now() + interval '30 days'
   WHERE id IN (d, d2);
  -- If the platform launch flag is ever on, d2 must still lack the feature for check 3.
  IF EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'multi_doctor_enabled' AND value = 'true'::jsonb) THEN
    UPDATE public.profiles SET plan_tier = 'free' WHERE id = d2;
  END IF;
  INSERT INTO public.doctor_feature_overrides (doctor_id, feature_key, enabled, reason, granted_by)
  VALUES (d, 'multi_doctor', true, 'test: management', d);
  INSERT INTO public.clinic_doctor_seats (doctor_id, extra_seats, reason) VALUES (d, 2, 'test');
  pa := public.primary_practitioner_id(d);
  -- The primary has a full week of hours (the signup may already have made them).
  IF (SELECT count(*) FROM public.working_hours WHERE practitioner_id = pa) = 0 THEN
    INSERT INTO public.working_hours (doctor_id, practitioner_id, day_of_week, is_open, start_time, end_time)
    SELECT d, pa, g, g <> 0, '09:00', '17:00' FROM generate_series(0, 6) g;
  END IF;
  IF (SELECT count(*) FROM public.working_hours WHERE practitioner_id = pa) <> 7 THEN
    RAISE EXCEPTION 'setup: primary should have 7 working_hours rows';
  END IF;
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status)
  VALUES (s_mgr, d, 'Mgr', 'mgr-' || s_mgr, '+1558' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"practitioners.manage": true, "staff.create": true, "staff.edit": true, "staff.disable": true, "appointments.edit": true}'::jsonb, d, 'active'),
         (s_no,  d, 'NoMgr', 'nomgr-' || s_no, '+1559' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"staff.create": true, "appointments.edit": true}'::jsonb, d, 'active');

  -- 1. The owner creates Dr B: slug from the name, hours copied from the primary, unique slugs.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  r := public.upsert_practitioner(NULL, '{"display_name":"Dr Priya Shah","specialization":"Dermatology","consultation_fee":800}');
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION 'create Dr B failed: %', r; END IF;
  pb := (r->>'id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.practitioners
                  WHERE id = pb AND doctor_id = d AND slug = 'dr-priya-shah' AND display_name = 'Dr Priya Shah'
                    AND specialization = 'Dermatology' AND consultation_fee = 800 AND NOT is_primary) THEN
    RAISE EXCEPTION 'Dr B row wrong';
  END IF;
  SELECT count(*) INTO n FROM public.working_hours wb
    JOIN public.working_hours wa ON wa.practitioner_id = pa AND wa.day_of_week = wb.day_of_week
   WHERE wb.practitioner_id = pb AND wb.doctor_id = d
     AND wb.is_open = wa.is_open AND wb.start_time IS NOT DISTINCT FROM wa.start_time
     AND wb.end_time IS NOT DISTINCT FROM wa.end_time;
  IF n <> 7 THEN RAISE EXCEPTION 'Dr B should have 7 hours rows copied from the primary, got %', n; END IF;
  r := public.upsert_practitioner(NULL, '{"display_name":"Dr Priya Shah"}');
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION 'second Dr Priya Shah failed: %', r; END IF;
  pb2 := (r->>'id')::uuid;
  IF (SELECT slug FROM public.practitioners WHERE id = pb2) IS DISTINCT FROM 'dr-priya-shah-2' THEN
    RAISE EXCEPTION 'second slug should be dr-priya-shah-2';
  END IF;
  -- All three seats are used: a fourth bookable doctor is refused cleanly.
  r := public.upsert_practitioner(NULL, '{"display_name":"Dr Four"}');
  IF r->>'error' IS DISTINCT FROM 'SEAT_LIMIT' THEN RAISE EXCEPTION 'fourth doctor: %', r; END IF;
  -- A bad value is refused, not raised.
  r := public.upsert_practitioner(pb, '{"consultation_fee":-5}');
  IF r->>'error' IS DISTINCT FROM 'INVALID' THEN RAISE EXCEPTION 'negative fee: %', r; END IF;
  -- The slug never changes on rename.
  r := public.upsert_practitioner(pb2, '{"display_name":"Dr Priya S Two"}');
  IF NOT COALESCE((r->>'ok')::boolean, false)
     OR (SELECT slug FROM public.practitioners WHERE id = pb2) IS DISTINCT FROM 'dr-priya-shah-2'
     OR (SELECT display_name FROM public.practitioners WHERE id = pb2) IS DISTINCT FROM 'Dr Priya S Two' THEN
    RAISE EXCEPTION 'rename changed the slug or did not rename: %', r;
  END IF;

  -- 2. Who may manage: stranger and staff without the permission are refused; staff with it are not.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  r := public.upsert_practitioner(NULL, '{"display_name":"Dr Stranger"}');
  IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'stranger create: %', r; END IF;
  r := public.upsert_practitioner(pb, '{"consultation_fee":1}');
  IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'stranger edit: %', r; END IF;
  r := public.set_practitioner_status(pb, false, false);
  IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'stranger set_practitioner_status: %', r; END IF;
  r := public.set_primary_practitioner(pb);
  IF r->>'error' IS DISTINCT FROM 'OWNER_ONLY' THEN RAISE EXCEPTION 'stranger set_primary_practitioner: %', r; END IF;
  r := public.reassign_practitioner_appointments(pb, pa);
  IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'stranger reassign: %', r; END IF;
  IF public.my_practitioner_id(d) IS NOT NULL THEN RAISE EXCEPTION 'stranger has a practitioner in the clinic'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', s_no, 'role', 'authenticated')::text, true);
  r := public.upsert_practitioner(pb, '{"consultation_fee":1}');
  IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'staff without permission edit: %', r; END IF;
  r := public.set_practitioner_status(pb, false, false);
  IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'staff without permission status: %', r; END IF;
  r := public.reassign_practitioner_appointments(pb, pa);
  IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'staff without permission reassign: %', r; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', s_mgr, 'role', 'authenticated')::text, true);
  r := public.upsert_practitioner(pb, '{"consultation_fee":850}');
  IF NOT COALESCE((r->>'ok')::boolean, false) OR (SELECT consultation_fee FROM public.practitioners WHERE id = pb) <> 850 THEN
    RAISE EXCEPTION 'staff with practitioners.manage edit: %', r;
  END IF;
  -- Another clinic's doctor is not found for this clinic's manager.
  r := public.upsert_practitioner(public.primary_practitioner_id(d2), '{"consultation_fee":1}');
  IF r->>'error' IS DISTINCT FROM 'PRACTITIONER_NOT_FOUND' THEN RAISE EXCEPTION 'cross-clinic edit: %', r; END IF;

  -- 3. Flag off and no override: no new doctors.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d2, 'role', 'authenticated')::text, true);
  r := public.upsert_practitioner(NULL, '{"display_name":"Dr Nope"}');
  IF r->>'error' IS DISTINCT FROM 'MULTI_DOCTOR_NOT_ENABLED' THEN RAISE EXCEPTION 'create while disabled: %', r; END IF;

  -- 4. The owner's own row: booking fields change, personal fields do not.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  r := public.upsert_practitioner(pa, '{"display_name":"X","consultation_fee":700}');
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION 'owner row edit failed: %', r; END IF;
  IF (SELECT consultation_fee FROM public.practitioners WHERE id = pa) IS DISTINCT FROM 700::numeric THEN
    RAISE EXCEPTION 'owner fee not changed';
  END IF;
  IF (SELECT display_name FROM public.practitioners WHERE id = pa) = 'X' THEN
    RAISE EXCEPTION 'owner display_name changed through upsert_practitioner';
  END IF;
  IF public.my_practitioner_id(d) IS DISTINCT FROM pa THEN RAISE EXCEPTION 'owner my_practitioner_id wrong'; END IF;

  -- Dr B's own login (made by a trusted service call, no JWT).
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status, role, practitioner_id)
  VALUES (s_doc, d, 'Dr Priya Shah', 'drb-' || s_doc, '+1560' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{}'::jsonb, d, 'active', 'doctor', pb);
  UPDATE public.practitioners SET user_id = s_doc WHERE id = pb;
  -- A doctor-role row needs a practitioner.
  BEGIN
    INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status, role)
    VALUES (s_new, d, 'No Prac', 'np-' || s_new, '+1561' || lpad((floor(random()*1e7))::int::text, 7, '0'),
            '{}'::jsonb, d, 'active', 'doctor');
    RAISE EXCEPTION 'doctor role without practitioner accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%staff_members_doctor_role_needs_practitioner%' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', s_doc, 'role', 'authenticated')::text, true);
  IF public.my_practitioner_id(d) IS DISTINCT FROM pb THEN RAISE EXCEPTION 'doctor login my_practitioner_id wrong'; END IF;

  -- Bookings. Dr A holds tomorrow 10:00; Dr B2 has a clashing tomorrow 10:00 and a today booking
  -- whose time has passed; Dr B has one future booking.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, time_slot, practitioner_id)
  VALUES (d, 'M Tgt', '9000000601', 'Visit', 'clinic', tmr, 300, 'MG01', 'pending', '10:00', pa)
  RETURNING id INTO a_tgt;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, time_slot, practitioner_id)
  VALUES (d, 'M Conf', '9000000602', 'Visit', 'clinic', tmr, 300, 'MG02', 'pending', '10:00', pb2)
  RETURNING id INTO a_conf;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, time_slot, practitioner_id)
  VALUES (d, 'M Fut', '9000000603', 'Visit', 'clinic', tmr, 300, 'MG03', 'pending', '11:00', pb)
  RETURNING id INTO a_fut;
  -- A past slot cannot be booked through the triggers, so this one row is written with triggers off
  -- (as a booking made this morning would look now).
  SET LOCAL session_replication_role = replica;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, status, time_slot, sort_time,
                                   practitioner_id, queue_number)
  VALUES (d, 'M Past', '9000000604', 'Visit', 'clinic', today, 300, 'MG04', 'pending', 'pending', '00:00', '00:00',
          pb2, 1)
  RETURNING id INTO a_past;
  SET LOCAL session_replication_role = origin;

  -- 5 (staff part). Deactivating a doctor who has a login is the owner's call.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', s_mgr, 'role', 'authenticated')::text, true);
  r := public.set_practitioner_status(pb, false, true);
  IF r->>'error' IS DISTINCT FROM 'OWNER_ONLY' THEN RAISE EXCEPTION 'staff deactivating a doctor login: %', r; END IF;

  -- 6. Reassign: the clash stays with Dr B2 (reported); the past today booking moves to the end of Dr A's line.
  r := public.reassign_practitioner_appointments(pb2, pa);
  IF NOT COALESCE((r->>'ok')::boolean, false) OR (r->>'moved')::int <> 1
     OR NOT (r->'skipped') @> to_jsonb(ARRAY[a_conf]) OR jsonb_array_length(r->'skipped') <> 1 THEN
    RAISE EXCEPTION 'reassign with a clash: %', r;
  END IF;
  IF (SELECT practitioner_id FROM public.appointments WHERE id = a_conf) IS DISTINCT FROM pb2 THEN
    RAISE EXCEPTION 'clashing booking was moved';
  END IF;
  SELECT * INTO rec FROM public.appointments WHERE id = a_past;
  IF rec.practitioner_id IS DISTINCT FROM pa OR rec.time_slot IS NOT NULL
     OR rec.sort_time IS DISTINCT FROM (now() AT TIME ZONE 'Asia/Kolkata')::time THEN
    RAISE EXCEPTION 'past today booking not moved to the end of the line: %', row_to_json(rec);
  END IF;
  r := public.reassign_practitioner_appointments(pb2, pb2);
  IF r->>'error' IS DISTINCT FROM 'INVALID' THEN RAISE EXCEPTION 'reassign to self: %', r; END IF;

  -- 5. Deactivating Dr B: refused while B has open future bookings, fine after they move.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  r := public.set_practitioner_status(pb, false, true);
  IF r->>'error' IS DISTINCT FROM 'HAS_FUTURE_APPOINTMENTS' OR (r->>'count')::int <> 1 THEN
    RAISE EXCEPTION 'deactivate with a future booking: %', r;
  END IF;
  r := public.reassign_practitioner_appointments(pb, pa);
  IF NOT COALESCE((r->>'ok')::boolean, false) OR (r->>'moved')::int <> 1 OR jsonb_array_length(r->'skipped') <> 0 THEN
    RAISE EXCEPTION 'reassign B to A: %', r;
  END IF;
  IF (SELECT practitioner_id FROM public.appointments WHERE id = a_fut) IS DISTINCT FROM pa THEN
    RAISE EXCEPTION 'future booking not moved';
  END IF;
  r := public.set_practitioner_status(pb, false, true);
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION 'deactivate after reassign: %', r; END IF;
  IF EXISTS (SELECT 1 FROM public.practitioners WHERE id = pb AND (is_active OR is_bookable)) THEN
    RAISE EXCEPTION 'Dr B still active or bookable';
  END IF;
  IF (SELECT status FROM public.staff_members WHERE id = s_doc) IS DISTINCT FROM 'inactive' THEN
    RAISE EXCEPTION 'Dr B login not disabled';
  END IF;
  -- The primary cannot be deactivated.
  r := public.set_practitioner_status(pa, false, false);
  IF r->>'error' IS DISTINCT FROM 'PRIMARY_PRACTITIONER_REQUIRED' THEN RAISE EXCEPTION 'deactivate primary: %', r; END IF;

  -- 7. Primary doctor: owner only, exactly one afterwards.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', s_mgr, 'role', 'authenticated')::text, true);
  r := public.set_primary_practitioner(pb2);
  IF r->>'error' IS DISTINCT FROM 'OWNER_ONLY' THEN RAISE EXCEPTION 'staff set primary: %', r; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  r := public.set_primary_practitioner(pb);
  IF r->>'error' IS DISTINCT FROM 'PRACTITIONER_NOT_BOOKABLE' THEN RAISE EXCEPTION 'inactive doctor made primary: %', r; END IF;
  r := public.set_primary_practitioner(pb2);
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION 'owner set primary: %', r; END IF;
  SET CONSTRAINTS ALL IMMEDIATE;
  SELECT count(*) INTO n FROM public.practitioners WHERE doctor_id = d AND is_primary;
  IF n <> 1 OR public.primary_practitioner_id(d) IS DISTINCT FROM pb2 THEN
    RAISE EXCEPTION 'primary after change: % primaries', n;
  END IF;

  -- 8. Two doctors' hours on the same weekday coexist.
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM public.working_hours WHERE practitioner_id = pb2 AND day_of_week = 1;
  INSERT INTO public.working_hours (doctor_id, practitioner_id, day_of_week, is_open, start_time, end_time)
  VALUES (d, pb2, 1, true, '14:00', '18:00');
  SELECT count(*) INTO n FROM public.working_hours WHERE doctor_id = d AND day_of_week = 1;
  IF n < 2 THEN RAISE EXCEPTION 'per-doctor hours for the same day did not coexist'; END IF;

  -- 9. Doctor logins: only the owner. Staff with staff.create cannot make or change one.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', s_mgr, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status, role, practitioner_id)
    VALUES (s_new, d, 'Fake Doc', 'fd-' || s_new, '+1562' || lpad((floor(random()*1e7))::int::text, 7, '0'),
            '{}'::jsonb, s_mgr, 'active', 'doctor', pb2);
    RAISE EXCEPTION 'staff created a doctor login';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'OWNER_ONLY' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.staff_members SET status = 'active' WHERE id = s_doc;
    RAISE EXCEPTION 'staff re-enabled a doctor login';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'OWNER_ONLY' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.staff_members SET practitioner_id = pb2 WHERE id = s_no;
    RAISE EXCEPTION 'staff linked a login to a doctor';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'OWNER_ONLY' THEN RAISE; END IF;
  END;
  -- Ordinary staff rows are unaffected by the guard.
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status)
  VALUES (s_new, d, 'New Staff', 'ns-' || s_new, '+1563' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"staff.create": true}'::jsonb, s_mgr, 'active');
  -- The owner can.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  UPDATE public.staff_members SET status = 'active' WHERE id = s_doc;
  IF (SELECT status FROM public.staff_members WHERE id = s_doc) <> 'active' THEN RAISE EXCEPTION 'owner could not re-enable'; END IF;

  -- Realtime carries practitioners.
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'practitioners') THEN
    RAISE EXCEPTION 'practitioners not in supabase_realtime';
  END IF;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
