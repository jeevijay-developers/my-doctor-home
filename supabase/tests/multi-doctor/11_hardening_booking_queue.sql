-- Multi-doctor hardening 1: bookings, queue, doctor management, public doctor list.
-- Covers 20261126100600_hardening_booking_queue.sql. Rolled back; prints 'pass'.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/11_hardening_booking_queue.sql
BEGIN;
CREATE FUNCTION pg_temp.as_user(u uuid, r text DEFAULT 'authenticated') RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', CASE WHEN u IS NULL AND r IS NULL THEN ''
                    WHEN u IS NULL THEN json_build_object('role', r)::text
                    ELSE json_build_object('sub', u, 'role', r)::text END, true)
$$;
DO $$
DECLARE
  d   uuid := gen_random_uuid();   -- multi-doctor clinic owner (premium, pilot override, 4 seats)
  d3  uuid := gen_random_uuid();   -- owner of a different, single-doctor clinic
  ub  uuid := gen_random_uuid();   -- Dr B's own login (role 'doctor')
  ur  uuid := gen_random_uuid();   -- reception at d with practitioners.manage
  uf  uuid := gen_random_uuid();   -- a plain auth user later linked to Dr C, then deleted
  stranger uuid := gen_random_uuid();
  pa uuid; pb uuid; pc uuid; pd uuid; p3 uuid;
  ap_up uuid; ap_done uuid; ap_open uuid; ap_new uuid;
  a_tgt uuid; a_conf uuid;
  qa1 uuid; qa2 uuid; qb1 uuid; qq uuid;
  x1 uuid; x2 uuid; y1 uuid; s1 uuid; s2 uuid; s3 uuid;
  rx uuid;
  r jsonb;
  n int; m int;
  b boolean;
  ph text := '9' || lpad((floor(random() * 1e9))::bigint::text, 9, '0');
  photo_ok text;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  tmr   date := (now() AT TIME ZONE 'Asia/Kolkata')::date + 1;
  tmr2  date := (now() AT TIME ZONE 'Asia/Kolkata')::date + 2;
  rec public.appointments%ROWTYPE;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"full_name":"Dr Owner"}'::jsonb
  FROM unnest(ARRAY[d, d3]) AS u;
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"account_type":"staff"}'::jsonb
  FROM unnest(ARRAY[ub, ur, uf]) AS u;
  UPDATE public.profiles SET plan_tier = 'premium', plan_status = 'active', plan_end = now() + interval '30 days',
                             onboarding_completed = true
   WHERE id IN (d, d3);
  IF EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'multi_doctor_enabled' AND value = 'true'::jsonb) THEN
    UPDATE public.profiles SET plan_tier = 'free' WHERE id = d3;   -- d3 stays single-doctor
  END IF;
  INSERT INTO public.doctor_feature_overrides (doctor_id, feature_key, enabled, reason, granted_by)
  VALUES (d, 'multi_doctor', true, 'test: hardening booking/queue', d);
  INSERT INTO public.clinic_doctor_seats (doctor_id, extra_seats, reason) VALUES (d, 3, 'test');
  pa := public.primary_practitioner_id(d);
  p3 := public.primary_practitioner_id(d3);
  INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (d, 'Dr B', 'dr-b') RETURNING id INTO pb;
  INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (d, 'Dr C', 'dr-c') RETURNING id INTO pc;
  INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (d, 'Dr D', 'dr-d') RETURNING id INTO pd;
  -- Seat order is primary, sort_order, created_at, id; created_at ties inside one transaction.
  UPDATE public.practitioners SET sort_order = CASE id WHEN pb THEN 1 WHEN pc THEN 2 WHEN pd THEN 3 END WHERE id IN (pb, pc, pd);
  IF NOT public.clinic_multi_doctor_enabled(d) OR public.clinic_multi_doctor_enabled(d3) THEN
    RAISE EXCEPTION 'setup: d must be multi-doctor and d3 not';
  END IF;
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status, role, practitioner_id)
  VALUES (ub, d, 'Dr B', 'drb-' || ub, '+1580' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"appointments.edit": true}'::jsonb, d, 'active', 'doctor', pb);
  UPDATE public.practitioners SET user_id = ub WHERE id = pb;
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status)
  VALUES (ur, d, 'Reception', 'rec-' || ur, '+1581' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"appointments.edit": true, "practitioners.manage": true}'::jsonb, d, 'active');
  UPDATE public.practitioners SET online_booking = false WHERE id = pc;

  ---------------------------------------------------------------- 1. practitioners.user_id -> auth.users
  UPDATE public.practitioners SET user_id = uf WHERE id = pc;
  BEGIN
    UPDATE public.practitioners SET user_id = gen_random_uuid() WHERE id = pd;
    RAISE EXCEPTION '1: a practitioner login that is not an auth user was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  DELETE FROM auth.users WHERE id = uf;
  IF (SELECT user_id FROM public.practitioners WHERE id = pc) IS NOT NULL THEN
    RAISE EXCEPTION '1: deleting the login did not clear practitioners.user_id';
  END IF;

  ---------------------------------------------------------------- 2. a notification never fails a booking
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL session_replication_role = replica;
  UPDATE public.practitioners SET user_id = gen_random_uuid() WHERE id = pd;   -- dangling login
  SET LOCAL session_replication_role = origin;
  PERFORM pg_temp.as_user(d);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id)
  VALUES (d, 'HB Dangling', '9000001001', 'Visit', 'clinic', tmr, 0, 'HB00', 'pending', pd);
  BEGIN
    INSERT INTO public.notifications (doctor_id, recipient_user_id, source_type, title, message)
    VALUES (d, d, 'booking_refund', 'x', 'y');
    DELETE FROM public.notifications WHERE doctor_id = d AND source_type = 'booking_refund';
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION '2: source_type booking_refund is not allowed';
  END;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'notify_practitioner_booking'
                  AND prosrc ILIKE '%EXCEPTION%WHEN OTHERS%') THEN
    RAISE EXCEPTION '2: notify_practitioner_booking has no catch-all';
  END IF;

  ---------------------------------------------------------------- 3a. online_booking=false: anyone who is not clinic / internal
  PERFORM pg_temp.as_user(d3);
  BEGIN
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                     date, amount, token_number, payment_status, time_slot, practitioner_id)
    VALUES (d, 'HB Member', ph, 'Visit', 'clinic', tmr, 0, 'HB01', 'pay_at_clinic', '12:00', pc);
    RAISE EXCEPTION '3a: a member of another clinic booked an online_booking=false doctor';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PRACTITIONER_NOT_BOOKABLE' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.as_user(NULL, 'anon');
  BEGIN
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                     date, amount, token_number, payment_status, time_slot, practitioner_id)
    VALUES (d, 'HB Anon', ph, 'Visit', 'clinic', tmr, 0, 'HB02', 'pay_at_clinic', '12:00', pc);
    RAISE EXCEPTION '3a: an anonymous visitor booked an online_booking=false doctor';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PRACTITIONER_NOT_BOOKABLE' THEN RAISE; END IF;
  END;
  -- Control: the same member can book a doctor who takes online bookings.
  PERFORM pg_temp.as_user(d3);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, time_slot, practitioner_id)
  VALUES (d, 'HB Member ok', ph, 'Visit', 'clinic', tmr, 0, 'HB03', 'pay_at_clinic', '12:00', pb);
  -- Clinic staff and the owner may book the doctor who is closed to online booking.
  PERFORM pg_temp.as_user(ur);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, time_slot, practitioner_id)
  VALUES (d, 'HB Reception', '9000001002', 'Visit', 'clinic', tmr, 0, 'HB04', 'pending', '12:30', pc);
  PERFORM pg_temp.as_user(d);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, time_slot, practitioner_id)
  VALUES (d, 'HB Owner', '9000001003', 'Visit', 'clinic', tmr, 0, 'HB05', 'pending', '13:00', pc);

  ---------------------------------------------------------------- 3b. paid online bookings (no JWT / service role) are not refused
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.practitioners SET is_bookable = false WHERE id = pc;
  PERFORM pg_temp.as_user(d);
  BEGIN
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                     date, amount, token_number, payment_status, practitioner_id)
    VALUES (d, 'HB Owner nb', '9000001004', 'Visit', 'clinic', tmr, 0, 'HB06', 'pending', pc);
    RAISE EXCEPTION '3b: the owner booked a doctor who is not bookable';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PRACTITIONER_NOT_BOOKABLE' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.as_user(NULL, 'service_role');
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id)
  VALUES (d, 'HB Paid sr', '9000001005', 'Visit', 'clinic', tmr, 500, 'HB07', 'paid', pc);
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id)
  VALUES (d, 'HB Paid nojwt', '9000001006', 'Visit', 'clinic', tmr, 500, 'HB08', 'paid', pc);
  -- The same-clinic check stays for them.
  BEGIN
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                     date, amount, token_number, payment_status, practitioner_id)
    VALUES (d, 'HB Mismatch', '9000001007', 'Visit', 'clinic', tmr, 500, 'HB09', 'paid', p3);
    RAISE EXCEPTION '3b: an internal booking named another clinic''s doctor';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PRACTITIONER_MISMATCH' THEN RAISE; END IF;
  END;
  UPDATE public.practitioners SET is_bookable = true WHERE id = pc;

  ---------------------------------------------------------------- 3c. validation locks the doctor row
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fill_practitioner' AND prosrc ILIKE '%FOR SHARE%') THEN
    RAISE EXCEPTION '3c: fill_practitioner does not lock the doctor row FOR SHARE';
  END IF;

  ---------------------------------------------------------------- 3d. doctor logins neither book nor reassign
  PERFORM pg_temp.as_user(d);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, time_slot, practitioner_id)
  VALUES (d, 'HB Up', '9000001008', 'Visit', 'clinic', tmr, 0, 'HB10', 'pending', '14:00', pa)
  RETURNING id INTO ap_up;
  PERFORM pg_temp.as_user(ub);
  BEGIN
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                     date, amount, token_number, payment_status, time_slot, practitioner_id)
    VALUES (d, 'HB By B', '9000001009', 'Visit', 'clinic', tmr, 0, 'HB11', 'pending', '14:30', pb);
    RAISE EXCEPTION '3d: a doctor login created a booking';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'DOCTOR_LOGIN_FORBIDDEN' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.appointments SET practitioner_id = pb WHERE id = ap_up;
    RAISE EXCEPTION '3d: a doctor login reassigned a booking to itself';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'DOCTOR_LOGIN_FORBIDDEN' THEN RAISE; END IF;
  END;
  -- Still allowed through queue_action (it sets the flag).
  PERFORM set_config('app.queue_rpc', '1', true);
  UPDATE public.appointments SET practitioner_id = pb WHERE id = ap_up;
  PERFORM set_config('app.queue_rpc', '', true);
  IF (SELECT practitioner_id FROM public.appointments WHERE id = ap_up) <> pb THEN
    RAISE EXCEPTION '3d: queue_rpc move did not happen';
  END IF;
  PERFORM pg_temp.as_user(d);
  UPDATE public.appointments SET practitioner_id = pa WHERE id = ap_up;
  IF (SELECT practitioner_id FROM public.appointments WHERE id = ap_up) <> pa THEN
    RAISE EXCEPTION '3d: the owner could not reassign a booking';
  END IF;
  PERFORM pg_temp.as_user(ur);
  UPDATE public.appointments SET practitioner_id = pb WHERE id = ap_up;
  UPDATE public.appointments SET practitioner_id = pa WHERE id = ap_up;

  ---------------------------------------------------------------- 4. a closed visit keeps its doctor and history
  PERFORM pg_temp.as_user(d);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, time_slot, practitioner_id)
  VALUES (d, 'HB Done', '9000001010', 'Visit', 'clinic', tmr, 0, 'HB12', 'pending', '15:00', pa)
  RETURNING id INTO ap_done;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, time_slot, practitioner_id)
  VALUES (d, 'HB Open', '9000001011', 'Visit', 'clinic', tmr, 0, 'HB13', 'pending', '15:30', pa)
  RETURNING id INTO ap_open;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.appointments SET serving_started_at = now(), status = 'completed' WHERE id = ap_done;
  UPDATE public.appointments SET serving_started_at = now(), skipped_at = now() WHERE id = ap_open;
  PERFORM pg_temp.as_user(d);
  BEGIN
    UPDATE public.appointments SET practitioner_id = pb WHERE id = ap_done;
    RAISE EXCEPTION '4: a completed visit was moved to another doctor';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'APPOINTMENT_CLOSED' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('app.queue_rpc', '1', true);
  UPDATE public.appointments SET date = tmr2 WHERE id = ap_done;       -- closed: history survives
  SELECT * INTO rec FROM public.appointments WHERE id = ap_done;
  IF rec.serving_started_at IS NULL THEN RAISE EXCEPTION '4: a completed visit lost serving_started_at'; END IF;
  UPDATE public.appointments SET date = tmr2 WHERE id = ap_open;        -- open: line state restarts
  SELECT * INTO rec FROM public.appointments WHERE id = ap_open;
  IF rec.serving_started_at IS NOT NULL OR rec.skipped_at IS NOT NULL THEN
    RAISE EXCEPTION '4: an open booking kept its old line state after a date change';
  END IF;
  PERFORM set_config('app.queue_rpc', '', true);

  ---------------------------------------------------------------- 5. queue_action: a doctor login works only its own line
  PERFORM pg_temp.as_user(d);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id, created_at)
  VALUES (d, 'Q A1', '9000001021', 'Visit', 'clinic', today, 0, 'HQ01', 'pending', pa, now() + interval '1 second')
  RETURNING id INTO qa1;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id, created_at)
  VALUES (d, 'Q A2', '9000001022', 'Visit', 'clinic', today, 0, 'HQ02', 'pending', pa, now() + interval '2 seconds')
  RETURNING id INTO qa2;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id, created_at)
  VALUES (d, 'Q B1', '9000001023', 'Visit', 'clinic', today, 0, 'HQ03', 'pending', pb, now() + interval '3 seconds')
  RETURNING id INTO qb1;
  PERFORM pg_temp.as_user(ub);
  r := public.queue_action('skip', qa1);
  IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION '5: Dr B skipped Dr A''s patient: %', r; END IF;
  r := public.queue_action('call_next', _practitioner_id => pa);
  IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION '5: Dr B called from Dr A''s line: %', r; END IF;
  r := public.queue_action('transfer', qa2, _practitioner_id => pb);
  IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION '5: Dr B pulled Dr A''s patient: %', r; END IF;
  r := public.queue_action('skip', qb1);
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION '5: Dr B skipping own patient: %', r; END IF;
  r := public.queue_action('recall', qb1);
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION '5: Dr B recalling own patient: %', r; END IF;
  r := public.queue_action('transfer', qb1, _practitioner_id => pa);          -- giving a patient away is fine
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION '5: Dr B transferring own patient: %', r; END IF;
  -- With "see all doctors" the login may act on any line.
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.staff_members SET permissions = permissions || '{"appointments.all_doctors": true}'::jsonb WHERE id = ub;
  PERFORM pg_temp.as_user(ub);
  r := public.queue_action('skip', qa1);
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION '5: Dr B with all_doctors skipping: %', r; END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.staff_members SET permissions = permissions - 'appointments.all_doctors' WHERE id = ub;
  -- Owner and reception are unaffected.
  PERFORM pg_temp.as_user(d);
  r := public.queue_action('recall', qa1);
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION '5: owner recall: %', r; END IF;
  PERFORM pg_temp.as_user(ur);
  r := public.queue_action('skip', qa2);
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION '5: reception skip: %', r; END IF;
  -- A stranger is still refused.
  PERFORM pg_temp.as_user(stranger);
  r := public.queue_action('skip', qa2);
  IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION '5: stranger: %', r; END IF;

  ---------------------------------------------------------------- 6. reassign reports why a booking stayed
  PERFORM pg_temp.as_user(d);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, time_slot, practitioner_id)
  VALUES (d, 'R Tgt', '9000001031', 'Visit', 'clinic', tmr2, 0, 'HR01', 'pending', '10:00', pa)
  RETURNING id INTO a_tgt;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, time_slot, practitioner_id)
  VALUES (d, 'R Conf', '9000001032', 'Visit', 'clinic', tmr2, 0, 'HR02', 'pending', '10:00', pb)
  RETURNING id INTO a_conf;
  r := public.reassign_practitioner_appointments(pb, pa);
  IF NOT COALESCE((r->>'ok')::boolean, false) OR jsonb_typeof(r->'skipped') <> 'array'
     OR NOT (r->'skipped') @> to_jsonb(ARRAY[a_conf]) OR jsonb_array_length(r->'skipped') <> 1 THEN
    RAISE EXCEPTION '6: reassign skipped list: %', r;
  END IF;
  IF jsonb_typeof(r->'skipped_reasons') IS DISTINCT FROM 'array'
     OR jsonb_array_length(r->'skipped_reasons') <> 1
     OR (r->'skipped_reasons'->0->>'id') IS DISTINCT FROM a_conf::text
     OR (r->'skipped_reasons'->0->>'reason') IS DISTINCT FROM 'SLOT_FULL' THEN
    RAISE EXCEPTION '6: reassign skipped_reasons: %', r;
  END IF;
  -- The booking that clashed is the only open one left with Dr B; move it out of the way.
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.appointments SET status = 'cancelled' WHERE id = a_conf;
  PERFORM pg_temp.as_user(d);
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reassign_practitioner_appointments'
                  AND prosrc ILIKE '%slot_lock_key%') THEN
    RAISE EXCEPTION '6: reassign does not take the slot locks';
  END IF;

  ---------------------------------------------------------------- 7. upsert_practitioner
  SELECT count(*) INTO n FROM public.practitioners WHERE doctor_id = d;
  r := public.upsert_practitioner(NULL, '{"display_name":"Dr Photo","photo_url":"https://evil.example/x.png"}');
  IF r->>'error' IS DISTINCT FROM 'INVALID' THEN RAISE EXCEPTION '7: create with a photo: %', r; END IF;
  SELECT count(*) INTO m FROM public.practitioners WHERE doctor_id = d;
  IF m <> n THEN RAISE EXCEPTION '7: a refused create still inserted a doctor'; END IF;
  photo_ok := 'https://x.supabase.co/storage/v1/object/public/doctor-uploads/' || d || '/practitioners/' || pb || '/photo.png';
  r := public.upsert_practitioner(pb, jsonb_build_object('photo_url', 'https://evil.example/x.png'));
  IF r->>'error' IS DISTINCT FROM 'INVALID' THEN RAISE EXCEPTION '7: foreign photo url: %', r; END IF;
  r := public.upsert_practitioner(pb, jsonb_build_object('photo_url',
         'https://x.supabase.co/storage/v1/object/public/doctor-uploads/' || d3 || '/practitioners/' || pb || '/photo.png'));
  IF r->>'error' IS DISTINCT FROM 'INVALID' THEN RAISE EXCEPTION '7: other clinic photo url: %', r; END IF;
  r := public.upsert_practitioner(pb, jsonb_build_object('photo_url',
         'https://x.supabase.co/storage/v1/object/public/doctor-uploads/' || d || '/practitioners/' || pa || '/photo.png'));
  IF r->>'error' IS DISTINCT FROM 'INVALID' THEN RAISE EXCEPTION '7: other doctor photo url: %', r; END IF;
  r := public.upsert_practitioner(pb, jsonb_build_object('signature_url', 'https://evil.example/s.png'));
  IF r->>'error' IS DISTINCT FROM 'INVALID' THEN RAISE EXCEPTION '7: foreign signature url: %', r; END IF;
  IF (SELECT photo_url FROM public.practitioners WHERE id = pb) IS NOT NULL THEN
    RAISE EXCEPTION '7: a refused photo url was stored';
  END IF;
  r := public.upsert_practitioner(pb, jsonb_build_object('photo_url', photo_ok, 'signature_url',
         replace(photo_ok, 'photo.png', 'sig.png')));
  IF NOT COALESCE((r->>'ok')::boolean, false) OR (SELECT photo_url FROM public.practitioners WHERE id = pb) <> photo_ok THEN
    RAISE EXCEPTION '7: own photo url refused: %', r;
  END IF;
  r := public.upsert_practitioner(pb, '{"photo_url":"","signature_url":null}');
  IF NOT COALESCE((r->>'ok')::boolean, false)
     OR (SELECT photo_url FROM public.practitioners WHERE id = pb) IS NOT NULL
     OR (SELECT signature_url FROM public.practitioners WHERE id = pb) IS NOT NULL THEN
    RAISE EXCEPTION '7: clearing photo/signature: %', r;
  END IF;
  r := public.upsert_practitioner(pb, '{"consultation_fee":-5}');
  IF r->>'error' IS DISTINCT FROM 'INVALID' THEN RAISE EXCEPTION '7: negative fee still INVALID: %', r; END IF;
  r := public.upsert_practitioner(NULL, '{"display_name":"Dr Five"}');
  IF r->>'error' IS DISTINCT FROM 'SEAT_LIMIT' THEN RAISE EXCEPTION '7: fifth doctor: %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'upsert_practitioner' AND prosrc ILIKE '%unique_violation%') THEN
    RAISE EXCEPTION '7: upsert_practitioner does not retry a slug clash';
  END IF;

  ---------------------------------------------------------------- 8. status / primary
  -- Dr B has nothing left open in the future: deactivate, then bring back.
  r := public.set_practitioner_status(pb, false, true);
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION '8: deactivate Dr B: %', r; END IF;
  IF (SELECT status FROM public.staff_members WHERE id = ub) <> 'inactive' THEN RAISE EXCEPTION '8: login not disabled'; END IF;
  PERFORM pg_temp.as_user(ur);   -- reception with practitioners.manage: doctor logins are the owner's call
  r := public.set_practitioner_status(pb, true, true);
  IF r->>'error' IS DISTINCT FROM 'OWNER_ONLY' THEN RAISE EXCEPTION '8: staff re-activating a doctor login: %', r; END IF;
  IF (SELECT status FROM public.staff_members WHERE id = ub) <> 'inactive' THEN RAISE EXCEPTION '8: staff re-enabled the login'; END IF;
  PERFORM pg_temp.as_user(d);
  r := public.set_practitioner_status(pb, true, true);
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION '8: re-activate Dr B: %', r; END IF;
  IF (SELECT status FROM public.staff_members WHERE id = ub) <> 'active' THEN
    RAISE EXCEPTION '8: re-activating the doctor did not re-activate the login';
  END IF;
  r := public.set_primary_practitioner(pb);
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION '8: primary to B: %', r; END IF;
  r := public.set_primary_practitioner(pa);
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION '8: primary back to A: %', r; END IF;
  SET CONSTRAINTS ALL IMMEDIATE;
  IF (SELECT count(*) FROM public.practitioners WHERE doctor_id = d AND is_primary) <> 1 THEN
    RAISE EXCEPTION '8: not exactly one primary';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_primary_practitioner' AND prosrc LIKE '%practitioner_primary:%') THEN
    RAISE EXCEPTION '8: set_primary_practitioner takes no lock';
  END IF;

  ---------------------------------------------------------------- 9. prescriptions.created_by never changes
  PERFORM pg_temp.as_user(d);
  INSERT INTO public.prescriptions (doctor_id, patient_name, diagnosis) VALUES (d, 'HB Rx', 'x') RETURNING id INTO rx;
  IF (SELECT created_by FROM public.prescriptions WHERE id = rx) IS DISTINCT FROM d THEN
    RAISE EXCEPTION '9: setup: created_by is not the owner';
  END IF;
  UPDATE public.prescriptions SET created_by = ub, diagnosis = 'y' WHERE id = rx;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.prescriptions SET created_by = ur WHERE id = rx;
  IF (SELECT created_by FROM public.prescriptions WHERE id = rx) IS DISTINCT FROM d
     OR (SELECT diagnosis FROM public.prescriptions WHERE id = rx) <> 'y' THEN
    RAISE EXCEPTION '9: created_by changed (or the rest of the update was lost)';
  END IF;

  ---------------------------------------------------------------- 10. get_queue_position is per doctor
  PERFORM pg_temp.as_user(d);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id, created_at)
  VALUES (d, 'P X1', '9000001041', 'Visit', 'clinic', tmr2 + 1, 0, 'HP01', 'pending', pa, now() + interval '1 second')
  RETURNING id INTO x1;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id, created_at)
  VALUES (d, 'P X2', '9000001042', 'Visit', 'clinic', tmr2 + 1, 0, 'HP02', 'pending', pa, now() + interval '2 seconds')
  RETURNING id INTO x2;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id, created_at)
  VALUES (d, 'P Y1', '9000001043', 'Visit', 'clinic', tmr2 + 1, 0, 'HP03', 'pending', pb, now() + interval '3 seconds')
  RETURNING id INTO y1;
  IF public.get_queue_position(x1) <> 0 OR public.get_queue_position(x2) <> 1 OR public.get_queue_position(y1) <> 0 THEN
    RAISE EXCEPTION '10: positions per doctor are % % % (want 0 1 0)',
      public.get_queue_position(x1), public.get_queue_position(x2), public.get_queue_position(y1);
  END IF;
  -- Single-doctor clinic: the same numbers as before (everyone in one line).
  PERFORM pg_temp.as_user(d3);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, created_at)
  VALUES (d3, 'S 1', '9000001051', 'Visit', 'clinic', today, 0, 'HS01', 'pending', now() + interval '1 second') RETURNING id INTO s1;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, created_at)
  VALUES (d3, 'S 2', '9000001052', 'Visit', 'clinic', today, 0, 'HS02', 'pending', now() + interval '2 seconds') RETURNING id INTO s2;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, created_at)
  VALUES (d3, 'S 3', '9000001053', 'Visit', 'clinic', today, 0, 'HS03', 'pending', now() + interval '3 seconds') RETURNING id INTO s3;
  IF public.get_queue_position(s1) <> 0 OR public.get_queue_position(s2) <> 1 OR public.get_queue_position(s3) <> 2 THEN
    RAISE EXCEPTION '10: single-doctor positions % % % (want 0 1 2)',
      public.get_queue_position(s1), public.get_queue_position(s2), public.get_queue_position(s3);
  END IF;

  ---------------------------------------------------------------- 11. public doctor list says which one is the owner
  PERFORM set_config('request.jwt.claims', '', true);
  IF (SELECT pg_get_function_result('public.get_public_practitioners(uuid)'::regprocedure)) NOT LIKE '%, is_owner boolean)' THEN
    RAISE EXCEPTION '11: is_owner is not the last column: %', pg_get_function_result('public.get_public_practitioners(uuid)'::regprocedure);
  END IF;
  IF (SELECT is_owner FROM public.get_public_practitioners(d) WHERE id = pa) IS DISTINCT FROM true
     OR (SELECT is_owner FROM public.get_public_practitioners(d) WHERE id = pb) IS DISTINCT FROM false THEN
    RAISE EXCEPTION '11: is_owner wrong';
  END IF;
  IF NOT has_function_privilege('anon', 'public.get_public_practitioners(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_public_practitioners(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.get_public_practitioners(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '11: grants on get_public_practitioners lost';
  END IF;

  ---------------------------------------------------------------- 12. phone_owns_clinic
  UPDATE public.profiles SET phone = '+91 ' || substr(ph, 1, 5) || ' ' || substr(ph, 6) WHERE id = d;
  IF NOT public.phone_owns_clinic(ph) OR NOT public.phone_owns_clinic('91' || ph)
     OR NOT public.phone_owns_clinic('+91-' || ph) THEN
    RAISE EXCEPTION '12: a clinic phone was not recognised';
  END IF;
  IF public.phone_owns_clinic('12345') OR public.phone_owns_clinic('') OR public.phone_owns_clinic(NULL)
     OR public.phone_owns_clinic(ph || '1') OR public.phone_owns_clinic('8' || substr(ph, 2)) THEN
    RAISE EXCEPTION '12: a wrong or short number was accepted';
  END IF;
  IF has_function_privilege('anon', 'public.phone_owns_clinic(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.phone_owns_clinic(text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.phone_owns_clinic(text)', 'EXECUTE') THEN
    RAISE EXCEPTION '12: phone_owns_clinic privileges wrong';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
              WHERE p.proname = 'phone_owns_clinic' AND a.grantee = 0) THEN
    RAISE EXCEPTION '12: phone_owns_clinic is executable by PUBLIC';
  END IF;

  ---------------------------------------------------------------- 5b. transfer target outside the seats (last: it lowers the seats)
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.clinic_doctor_seats SET extra_seats = 1 WHERE doctor_id = d;   -- 2 seats: A and B
  PERFORM pg_temp.as_user(d);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id)
  VALUES (d, 'Q New', '9000001061', 'Visit', 'clinic', today, 0, 'HQ04', 'pending', pa)
  RETURNING id INTO qq;
  r := public.queue_action('transfer', qq, _practitioner_id => pc);
  IF r->>'error' IS DISTINCT FROM 'PRACTITIONER_NOT_BOOKABLE' THEN
    RAISE EXCEPTION '5b: transfer to a doctor outside the seats: %', r;
  END IF;
  r := public.queue_action('transfer', qq, _practitioner_id => pb);
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION '5b: transfer within the seats: %', r; END IF;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
