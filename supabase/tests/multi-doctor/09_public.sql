-- Multi-doctor P2 part 1: the public doctor list and the doctor on the appointment lookup.
-- Rolled back; prints one row 'pass'.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/09_public.sql
BEGIN;
DO $$
DECLARE
  d  uuid := gen_random_uuid();   -- onboarded multi-doctor clinic
  d2 uuid := gen_random_uuid();   -- clinic that has not finished onboarding
  pa uuid; pb uuid; pc uuid;
  n int;
  b boolean;
  nm text;
  tmr date := (now() AT TIME ZONE 'Asia/Kolkata')::date + 1;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"full_name":"Dr Public"}'::jsonb
  FROM unnest(ARRAY[d, d2]) AS u;
  UPDATE public.profiles SET plan_tier = 'premium', plan_status = 'active', plan_end = now() + interval '30 days',
                             onboarding_completed = true
   WHERE id = d;
  UPDATE public.profiles SET onboarding_completed = false WHERE id = d2;
  INSERT INTO public.doctor_feature_overrides (doctor_id, feature_key, enabled, reason, granted_by)
  VALUES (d, 'multi_doctor', true, 'test: public list', d);
  INSERT INTO public.clinic_doctor_seats (doctor_id, extra_seats, reason) VALUES (d, 1, 'test');
  pa := public.primary_practitioner_id(d);
  INSERT INTO public.practitioners (doctor_id, display_name, slug, consultation_fee)
  VALUES (d, 'Dr B', 'dr-b', 900) RETURNING id INTO pb;
  INSERT INTO public.practitioners (doctor_id, display_name, slug, is_active, is_bookable)
  VALUES (d, 'Dr Gone', 'dr-gone', false, false) RETURNING id INTO pc;

  -- 1. Anonymous visitors see the clinic's active doctors, primary first; both bookable.
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  SELECT count(*), bool_and(bookable) INTO n, b FROM public.get_public_practitioners(d);
  RESET ROLE;
  IF n <> 2 THEN RAISE EXCEPTION 'anon sees % doctors (want 2: the inactive one hidden)', n; END IF;
  IF NOT b THEN RAISE EXCEPTION 'both doctors should be bookable'; END IF;
  IF (SELECT id FROM public.get_public_practitioners(d) LIMIT 1) IS DISTINCT FROM pa THEN
    RAISE EXCEPTION 'the primary doctor must come first';
  END IF;
  IF (SELECT consultation_fee FROM public.get_public_practitioners(d) WHERE id = pb) <> 900 THEN
    RAISE EXCEPTION 'Dr B fee not returned';
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_public_practitioners(d) WHERE id = pc) THEN
    RAISE EXCEPTION 'inactive doctor listed';
  END IF;

  -- 2. Online booking off: still listed, not bookable.
  UPDATE public.practitioners SET online_booking = false WHERE id = pb;
  SELECT bookable INTO b FROM public.get_public_practitioners(d) WHERE id = pb;
  IF b IS DISTINCT FROM false THEN RAISE EXCEPTION 'online-off doctor bookable = %', b; END IF;
  UPDATE public.practitioners SET online_booking = true WHERE id = pb;

  -- 3. After a downgrade (no extra seats) Dr B falls outside the seats: listed, not bookable.
  UPDATE public.clinic_doctor_seats SET extra_seats = 0 WHERE doctor_id = d;
  SELECT bookable INTO b FROM public.get_public_practitioners(d) WHERE id = pb;
  IF b IS DISTINCT FROM false THEN RAISE EXCEPTION 'doctor outside seats bookable = %', b; END IF;
  SELECT bookable INTO b FROM public.get_public_practitioners(d) WHERE id = pa;
  IF b IS DISTINCT FROM true THEN RAISE EXCEPTION 'primary must stay bookable after a downgrade'; END IF;
  UPDATE public.clinic_doctor_seats SET extra_seats = 1 WHERE doctor_id = d;

  -- 4. A clinic that has not finished onboarding shows nobody.
  SELECT count(*) INTO n FROM public.get_public_practitioners(d2);
  IF n <> 0 THEN RAISE EXCEPTION 'non-onboarded clinic lists % doctors', n; END IF;

  -- 5. A cancelled clinic shows nobody.
  UPDATE public.profiles SET plan_status = 'cancelled' WHERE id = d;
  SELECT count(*) INTO n FROM public.get_public_practitioners(d);
  IF n <> 0 THEN RAISE EXCEPTION 'cancelled clinic lists % doctors', n; END IF;
  UPDATE public.profiles SET plan_status = 'active' WHERE id = d;

  -- 6. The appointment lookup names the patient's own doctor.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type,
                                   date, amount, token_number, payment_status, practitioner_id, time_slot)
  VALUES (d, 'Lookup Pat', '9000000901', 'Visit', 'clinic', tmr, 300, 'PB01', 'pending', pb, '10:00');
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SELECT practitioner_name INTO nm FROM public.get_appointment_by_token(d, 'PB01', '9000000901');
  IF nm IS DISTINCT FROM 'Dr B' THEN RAISE EXCEPTION 'lookup practitioner_name = %', nm; END IF;
  IF (SELECT practitioner_id FROM public.get_appointment_by_token(d, 'PB01', '9000000901')) IS DISTINCT FROM pb THEN
    RAISE EXCEPTION 'lookup practitioner_id wrong';
  END IF;
  -- A wrong phone still returns nothing.
  SELECT count(*) INTO n FROM public.get_appointment_by_token(d, 'PB01', '9000000999');
  IF n <> 0 THEN RAISE EXCEPTION 'lookup with wrong phone returned a row'; END IF;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
