-- Multi-doctor P1 part 1: launch gate, seats, within-seat rank. Rolled back; prints 'pass'.
BEGIN;
DO $$
DECLARE
  d uuid := gen_random_uuid();
  pa uuid; pb uuid; pc uuid;
  n int; r jsonb;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  VALUES (d, 'authenticated', 'authenticated', d::text || '@example.test', '{"full_name":"Dr Seats"}'::jsonb);
  UPDATE public.profiles SET plan_tier = 'premium', plan_status = 'active', plan_end = now() + interval '30 days' WHERE id = d;
  pa := public.primary_practitioner_id(d);

  -- 1. Off by default: not enabled, one seat, a second bookable doctor is refused.
  IF public.clinic_multi_doctor_enabled(d) THEN RAISE EXCEPTION 'enabled without flag or override'; END IF;
  IF public.clinic_doctor_seat_limit(d) <> 1 THEN RAISE EXCEPTION 'seat limit should be 1 when disabled'; END IF;
  BEGIN
    INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (d, 'Dr B', 'dr-b');
    RAISE EXCEPTION 'second bookable doctor accepted while disabled';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'SEAT_LIMIT' THEN RAISE; END IF;
  END;
  -- A non-bookable doctor uses no seat.
  INSERT INTO public.practitioners (doctor_id, display_name, slug, is_bookable) VALUES (d, 'Dr Manager', 'dr-manager', false)
  RETURNING id INTO pc;

  -- 2. Pilot override enables it; extra seats raise the limit.
  INSERT INTO public.doctor_feature_overrides (doctor_id, feature_key, enabled, reason, granted_by)
  VALUES (d, 'multi_doctor', true, 'pilot', d);  -- granted_by is NOT NULL (stamped only when a JWT is present)
  IF NOT public.clinic_multi_doctor_enabled(d) THEN RAISE EXCEPTION 'override did not enable'; END IF;
  IF public.clinic_doctor_seat_limit(d) <> 1 THEN RAISE EXCEPTION 'no extra seats yet: limit should be 1'; END IF;
  INSERT INTO public.clinic_doctor_seats (doctor_id, extra_seats, reason) VALUES (d, 1, 'test');
  IF public.clinic_doctor_seat_limit(d) <> 2 THEN RAISE EXCEPTION 'extra seat not counted'; END IF;
  INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (d, 'Dr B', 'dr-b') RETURNING id INTO pb;

  -- 3. Within seats: both bookable; a multi-doctor booking without a doctor still raises REQUIRED.
  IF NOT public.practitioner_within_seats(pb) THEN RAISE EXCEPTION 'B should be within seats'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status)
    VALUES (d, 'X', '9000000501', 'Visit', 'clinic', today, 100, 'SE01', 'pending');
    RAISE EXCEPTION 'ambiguous booking accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PRACTITIONER_REQUIRED' THEN RAISE; END IF;
  END;

  -- 4. Downgrade (seats back to 0): B is outside seats, the primary is auto-filled, booking B is refused.
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.clinic_doctor_seats SET extra_seats = 0 WHERE doctor_id = d;
  IF public.practitioner_within_seats(pb) THEN RAISE EXCEPTION 'B should be outside seats after downgrade'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status)
  VALUES (d, 'Y', '9000000502', 'Visit', 'clinic', today, 100, 'SE02', 'pending')
  RETURNING practitioner_id INTO pc;
  IF pc IS DISTINCT FROM pa THEN RAISE EXCEPTION 'downgraded clinic did not auto-fill the primary'; END IF;
  BEGIN
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status, practitioner_id)
    VALUES (d, 'Z', '9000000503', 'Visit', 'clinic', today, 100, 'SE03', 'pending', pb);
    RAISE EXCEPTION 'booking outside seats accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'SEAT_LIMIT' THEN RAISE; END IF;
  END;

  -- 5. The access summary, for the clinic, and refused for a stranger.
  r := public.get_clinic_doctor_access(d);
  IF (r->>'enabled')::boolean IS DISTINCT FROM true OR (r->>'seat_limit')::int <> 1 OR (r->>'seats_used')::int <> 2 THEN
    RAISE EXCEPTION 'access summary wrong: %', r;
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  r := public.get_clinic_doctor_access(d);
  IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'stranger read access summary: %', r; END IF;

  -- 6. Only platform admins set seats.
  r := public.set_clinic_doctor_seats(d, 3, 'self-grant');
  IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'non-admin set seats: %', r; END IF;

  -- 7. Clinic users can read, not write, their seats row.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.clinic_doctor_seats SET extra_seats = 9 WHERE doctor_id = d;
  GET DIAGNOSTICS n = ROW_COUNT;
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'clinic edited its own seats'; END IF;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
