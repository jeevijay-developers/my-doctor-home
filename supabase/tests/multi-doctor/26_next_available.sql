-- Multi-doctor public site phase 5: get_public_next_available (next free clinic slot per doctor).
-- Rolled back; prints one row 'pass'.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/26_next_available.sql
BEGIN;
DO $$
DECLARE
  d  uuid := gen_random_uuid();
  pa uuid; pb uuid; pc uuid; pe uuid; pi uuid;
  r record;
  n int;
  da date; ta time; db date; tb time;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  istnow timestamp := now() AT TIME ZONE 'Asia/Kolkata';
  i int;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  VALUES (d, 'authenticated', 'authenticated', d::text || '@example.test', '{"full_name":"Dr Next"}'::jsonb);
  UPDATE public.profiles SET plan_tier = 'premium', plan_status = 'active', plan_end = now() + interval '30 days',
                             onboarding_completed = true WHERE id = d;
  INSERT INTO public.doctor_feature_overrides (doctor_id, feature_key, enabled, reason, granted_by)
  VALUES (d, 'multi_doctor', true, 'test: next available', d);
  INSERT INTO public.clinic_doctor_seats (doctor_id, extra_seats, reason) VALUES (d, 3, 'test');
  pa := public.primary_practitioner_id(d);
  INSERT INTO public.practitioners (doctor_id, display_name, slug, sort_order) VALUES (d, 'Dr B', 'dr-b', 1) RETURNING id INTO pb;
  INSERT INTO public.practitioners (doctor_id, display_name, slug, sort_order) VALUES (d, 'Dr NoHours', 'dr-e', 2) RETURNING id INTO pe;
  INSERT INTO public.practitioners (doctor_id, display_name, slug, sort_order) VALUES (d, 'Dr Out', 'dr-out', 3) RETURNING id INTO pc;
  INSERT INTO public.practitioners (doctor_id, display_name, slug, is_active, is_bookable, sort_order)
  VALUES (d, 'Dr Gone', 'dr-gone', false, false, 4) RETURNING id INTO pi;
  UPDATE public.practitioners SET slot_duration_minutes = 20 WHERE id = pb;
  UPDATE public.clinic_doctor_seats SET extra_seats = 2 WHERE doctor_id = d;  -- seats: pa, pb, pe; pc is outside

  DELETE FROM public.working_hours WHERE doctor_id = d;
  FOR i IN 0..6 LOOP
    -- A: two sessions, 30-min default: 09:00, 09:30 and 16:00, 16:30
    INSERT INTO public.working_hours (doctor_id, practitioner_id, day_of_week, is_open, start_time, end_time, start_time_2, end_time_2)
    VALUES (d, pa, i, true, '09:00', '10:00', '16:00', '17:00');
    -- B: 14:00-15:00 at its own 20 minutes: 14:00, 14:20, 14:40
    INSERT INTO public.working_hours (doctor_id, practitioner_id, day_of_week, is_open, start_time, end_time)
    VALUES (d, pb, i, true, '14:00', '15:00');
    -- the doctor outside the seats and the inactive one have hours too: still not returned
    INSERT INTO public.working_hours (doctor_id, practitioner_id, day_of_week, is_open, start_time, end_time)
    VALUES (d, pc, i, true, '09:00', '10:00'), (d, pi, i, true, '09:00', '10:00');
  END LOOP;

  -- 1. Anonymous: one row per bookable doctor; excluded doctors absent; no hours -> NULLs.
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM public.get_public_next_available(d);
  RESET ROLE;
  IF n <> 3 THEN RAISE EXCEPTION 'expected rows for pa, pb, pe only, got %', n; END IF;
  IF EXISTS (SELECT 1 FROM public.get_public_next_available(d) WHERE practitioner_id IN (pc, pi)) THEN
    RAISE EXCEPTION 'outside-seats or inactive doctor returned';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_public_next_available(d) WHERE practitioner_id = pe AND next_date IS NULL AND next_time IS NULL) THEN
    RAISE EXCEPTION 'doctor without hours must have a row with NULLs';
  END IF;

  SELECT next_date, next_time INTO da, ta FROM public.get_public_next_available(d) WHERE practitioner_id = pa;
  SELECT next_date, next_time INTO db, tb FROM public.get_public_next_available(d) WHERE practitioner_id = pb;
  IF da IS NULL OR db IS NULL THEN RAISE EXCEPTION 'pa/pb should have a slot (da=%, db=%)', da, db; END IF;

  -- 2. Each doctor's own hours and grid, never in the past (IST now).
  IF ta NOT IN ('09:00', '09:30', '16:00', '16:30') THEN RAISE EXCEPTION 'pa slot % is not one of its slots', ta; END IF;
  IF tb NOT IN ('14:00', '14:20', '14:40') THEN RAISE EXCEPTION 'pb slot % is not on its own 20-min grid', tb; END IF;
  IF (da + ta) <= istnow OR (db + tb) <= istnow THEN RAISE EXCEPTION 'a past slot was returned'; END IF;

  -- 3. Parity with get_slot_counts: the returned slot is free; once booked it is skipped; cancelled frees it.
  SELECT count(*) INTO n FROM public.get_slot_counts(d, da, 'clinic', pa) s WHERE s.time_slot::time = ta;
  IF n <> 0 THEN RAISE EXCEPTION 'returned slot is already booked per get_slot_counts'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id, time_slot)
  VALUES (d, 'Full Slot', '9000000926', 'Visit', 'clinic', da, 300, 'NA001', 'pending', pa, ta);
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SELECT count(*) INTO n FROM public.get_slot_counts(d, da, 'clinic', pa) s WHERE s.time_slot::time = ta AND s.booked >= 1;
  IF n <> 1 THEN RAISE EXCEPTION 'booking not visible in get_slot_counts'; END IF;
  SELECT next_date, next_time INTO r FROM public.get_public_next_available(d) WHERE practitioner_id = pa;
  IF r.next_date = da AND r.next_time = ta THEN RAISE EXCEPTION 'a full slot was returned'; END IF;
  IF (r.next_date + r.next_time) <= (da + ta) THEN RAISE EXCEPTION 'next slot did not move forward'; END IF;
  SELECT next_date, next_time INTO r FROM public.get_public_next_available(d) WHERE practitioner_id = pb;
  IF r.next_date IS DISTINCT FROM db OR r.next_time IS DISTINCT FROM tb THEN RAISE EXCEPTION 'pb slot changed by pa booking'; END IF;
  UPDATE public.appointments SET status = 'cancelled' WHERE token_number = 'NA001' AND doctor_id = d;
  SELECT next_date, next_time INTO r FROM public.get_public_next_available(d) WHERE practitioner_id = pa;
  IF r.next_date IS DISTINCT FROM da OR r.next_time IS DISTINCT FROM ta THEN RAISE EXCEPTION 'cancelled booking did not free the slot'; END IF;

  -- 4. Past slots today are skipped: hours that ended long ago give tomorrow.
  UPDATE public.working_hours SET start_time = '00:00', end_time = '00:30', start_time_2 = NULL, end_time_2 = NULL
   WHERE practitioner_id = pa;
  SELECT next_date, next_time INTO r FROM public.get_public_next_available(d) WHERE practitioner_id = pa;
  IF (r.next_date + r.next_time) <= istnow THEN RAISE EXCEPTION 'past slot returned'; END IF;
  IF istnow::time > '00:00' AND r.next_date <> today + 1 THEN RAISE EXCEPTION 'expected tomorrow, got %', r.next_date; END IF;

  -- 5. All days closed -> NULL.
  UPDATE public.working_hours SET is_open = false WHERE practitioner_id = pa;
  SELECT next_date INTO da FROM public.get_public_next_available(d) WHERE practitioner_id = pa;
  IF da IS NOT NULL THEN RAISE EXCEPTION 'all-closed doctor returned a date'; END IF;

  -- 6. Hard caps: _days is clamped (0, NULL and 1000 all work, never beyond 14 days).
  SELECT count(*) INTO n FROM public.get_public_next_available(d, 1000);
  IF n <> 3 THEN RAISE EXCEPTION '_days 1000 broke the call'; END IF;
  SELECT count(*) INTO n FROM public.get_public_next_available(d, 0);
  IF n <> 3 THEN RAISE EXCEPTION '_days 0 broke the call'; END IF;
  SELECT count(*) INTO n FROM public.get_public_next_available(d, NULL);
  IF n <> 3 THEN RAISE EXCEPTION '_days NULL broke the call'; END IF;
  SELECT next_date INTO db FROM public.get_public_next_available(d, 1000) WHERE practitioner_id = pb;
  IF db > today + 13 THEN RAISE EXCEPTION 'beyond the 14 day cap'; END IF;
  SELECT next_date INTO db FROM public.get_public_next_available(d, 1) WHERE practitioner_id = pb;
  IF db IS NOT NULL AND db <> today THEN RAISE EXCEPTION '1-day window returned another day'; END IF;

  -- 7. Seat downgrade drops pb; online booking off hides a doctor.
  UPDATE public.clinic_doctor_seats SET extra_seats = 0 WHERE doctor_id = d;
  IF EXISTS (SELECT 1 FROM public.get_public_next_available(d) WHERE practitioner_id <> pa) THEN
    RAISE EXCEPTION 'doctors outside the seats still returned';
  END IF;
  UPDATE public.clinic_doctor_seats SET extra_seats = 2 WHERE doctor_id = d;
  UPDATE public.practitioners SET online_booking = false WHERE id = pb;
  IF EXISTS (SELECT 1 FROM public.get_public_next_available(d) WHERE practitioner_id = pb) THEN
    RAISE EXCEPTION 'online-booking-off doctor returned';
  END IF;
  UPDATE public.practitioners SET online_booking = true WHERE id = pb;

  -- 8. A cancelled or not-onboarded clinic returns nothing; so do unknown and NULL clinics.
  UPDATE public.profiles SET plan_status = 'cancelled' WHERE id = d;
  SELECT count(*) INTO n FROM public.get_public_next_available(d);
  IF n <> 0 THEN RAISE EXCEPTION 'cancelled clinic returned % rows', n; END IF;
  UPDATE public.profiles SET plan_status = 'active', onboarding_completed = false WHERE id = d;
  SELECT count(*) INTO n FROM public.get_public_next_available(d);
  IF n <> 0 THEN RAISE EXCEPTION 'not-onboarded clinic returned % rows', n; END IF;
  SELECT count(*) INTO n FROM public.get_public_next_available(gen_random_uuid());
  IF n <> 0 THEN RAISE EXCEPTION 'unknown clinic returned rows'; END IF;
  SELECT count(*) INTO n FROM public.get_public_next_available(NULL);
  IF n <> 0 THEN RAISE EXCEPTION 'NULL clinic returned rows'; END IF;

  -- 9. Only ids and times come back.
  IF (SELECT pg_get_function_result(p.oid) FROM pg_proc p WHERE p.proname = 'get_public_next_available')
     <> 'TABLE(practitioner_id uuid, next_date date, next_time time without time zone)' THEN
    RAISE EXCEPTION 'unexpected result columns';
  END IF;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
