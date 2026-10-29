-- Appointment -> patient lifecycle regression checks (run AFTER 20261029120000 is applied).
--   npx supabase db query --linked -f supabase/tests/patient_lifecycle.sql
-- One transaction, rolled back; any failed check raises an exception.
BEGIN;

DO $$
DECLARE
  d uuid; d2 uuid;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  a1 uuid; a2 uuid; a3 uuid; a4 uuid;
  pid uuid; other_pid uuid;
  rec public.appointments%ROWTYPE;
  pat public.patients%ROWTYPE;
  n int;
BEGIN
  SELECT id INTO d FROM public.profiles WHERE onboarding_completed = true LIMIT 1;
  IF d IS NULL THEN SELECT id INTO d FROM public.profiles LIMIT 1; END IF;
  IF d IS NULL THEN RAISE EXCEPTION 'no doctor profile to test with'; END IF;
  UPDATE public.profiles SET plan_status = 'trial', trial_end = now() + interval '5 days' WHERE id = d;
  DELETE FROM public.appointments WHERE doctor_id = d AND date = today;
  DELETE FROM public.patients WHERE doctor_id = d AND phone IN ('9111111101','9111111102','9111111103','9111111104');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);

  -- 1. Staff booking -> provisional patient (auto_created, zero visits, no dates)
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status)
  VALUES (d, 'Lifecycle One', '9111111101', 'Visit', 'clinic', today, 300, 'L001', 'pending') RETURNING id INTO a1;
  SELECT * INTO rec FROM public.appointments WHERE id = a1;
  SELECT * INTO pat FROM public.patients WHERE id = rec.patient_id;
  IF pat.id IS NULL OR NOT pat.auto_created OR pat.total_visits <> 0 THEN RAISE EXCEPTION 'booking did not make a provisional patient'; END IF;
  pid := pat.id;

  -- 2. Cancel -> the never-visited patient is released; the appointment survives, unlinked
  UPDATE public.appointments SET status = 'cancelled' WHERE id = a1;
  IF EXISTS (SELECT 1 FROM public.patients WHERE id = pid) THEN RAISE EXCEPTION 'cancelled booking left a ghost patient'; END IF;
  SELECT * INTO rec FROM public.appointments WHERE id = a1;
  IF rec.patient_id IS NOT NULL OR rec.status::text <> 'cancelled' THEN RAISE EXCEPTION 'appointment lost or still linked'; END IF;

  -- 3. Re-opening it brings the patient back
  UPDATE public.appointments SET status = 'pending' WHERE id = a1;
  SELECT * INTO rec FROM public.appointments WHERE id = a1;
  IF rec.patient_id IS NULL THEN RAISE EXCEPTION 'reopened booking did not re-create the patient'; END IF;
  pid := rec.patient_id;

  -- 4. A second live booking for the same person keeps the patient when the first is cancelled
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status)
  VALUES (d, 'Lifecycle One', '9111111101', 'Visit', 'clinic', today, 300, 'L002', 'pending') RETURNING id INTO a2;
  SELECT patient_id INTO other_pid FROM public.appointments WHERE id = a2;
  IF other_pid IS DISTINCT FROM pid THEN RAISE EXCEPTION 'same person got two patient rows'; END IF;
  UPDATE public.appointments SET status = 'cancelled' WHERE id = a1;
  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE id = pid) THEN RAISE EXCEPTION 'patient with another live booking was released'; END IF;

  -- 5. No-show on the last live booking releases it
  UPDATE public.appointments SET status = 'no_show' WHERE id = a2;
  IF EXISTS (SELECT 1 FROM public.patients WHERE id = pid) THEN RAISE EXCEPTION 'no-show left a ghost patient'; END IF;

  -- 6. Notes written on a provisional patient make it real: never auto-released
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status)
  VALUES (d, 'Lifecycle Two', '9111111102', 'Visit', 'clinic', today, 300, 'L003', 'pending') RETURNING id INTO a3;
  SELECT patient_id INTO pid FROM public.appointments WHERE id = a3;
  UPDATE public.patients SET notes = 'Allergic to penicillin' WHERE id = pid;
  UPDATE public.appointments SET status = 'cancelled' WHERE id = a3;
  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE id = pid) THEN RAISE EXCEPTION 'patient with notes was deleted'; END IF;

  -- 7. A patient with medical history (any table pointing at it) is never released
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status)
  VALUES (d, 'Lifecycle Three', '9111111103', 'Visit', 'clinic', today, 300, 'L004', 'pending') RETURNING id INTO a4;
  SELECT patient_id INTO pid FROM public.appointments WHERE id = a4;
  EXECUTE 'INSERT INTO public.patient_allergies (patient_id, doctor_id, allergy_name) VALUES ($1, $2, $3)' USING pid, d, 'Dust';
  UPDATE public.appointments SET status = 'cancelled' WHERE id = a4;
  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE id = pid) THEN RAISE EXCEPTION 'patient with medical records was deleted'; END IF;

  -- 8. Completed -> cancelled takes the visit back (and releases a patient with nothing else)
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status)
  VALUES (d, 'Lifecycle Four', '9111111104', 'Visit', 'clinic', today, 300, 'L005', 'pending') RETURNING id INTO a1;
  UPDATE public.appointments SET status = 'completed' WHERE id = a1;
  SELECT p.* INTO pat FROM public.patients p JOIN public.appointments a ON a.patient_id = p.id WHERE a.id = a1;
  IF pat.total_visits <> 1 THEN RAISE EXCEPTION 'completion not counted: %', pat.total_visits; END IF;
  UPDATE public.appointments SET status = 'pending' WHERE id = a1;
  SELECT total_visits INTO n FROM public.patients WHERE id = pat.id;
  IF n <> 0 THEN RAISE EXCEPTION 'reopened visit still counted: %', n; END IF;
  UPDATE public.appointments SET status = 'completed' WHERE id = a1;
  SELECT total_visits INTO n FROM public.patients WHERE id = pat.id;
  IF n <> 1 THEN RAISE EXCEPTION 'complete/reopen/complete must count once, got %', n; END IF;
  UPDATE public.appointments SET status = 'cancelled' WHERE id = a1;
  IF EXISTS (SELECT 1 FROM public.patients WHERE id = pat.id) THEN RAISE EXCEPTION 'visit taken back but ghost patient remained'; END IF;

  -- 9. Deleting a never-visited booking releases the patient too
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status)
  VALUES (d, 'Lifecycle Five', '9111111104', 'Visit', 'clinic', today, 300, 'L006', 'pending') RETURNING id INTO a1;
  SELECT patient_id INTO pid FROM public.appointments WHERE id = a1;
  DELETE FROM public.appointments WHERE id = a1;
  IF EXISTS (SELECT 1 FROM public.patients WHERE id = pid) THEN RAISE EXCEPTION 'deleting a booking left a ghost patient'; END IF;

  -- 10. A manually added patient is never auto-released
  INSERT INTO public.patients (doctor_id, name, phone) VALUES (d, 'Manual Person', '9111111101') RETURNING id INTO pid;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status)
  VALUES (d, 'Manual Person', '9111111101', 'Visit', 'clinic', today, 300, 'L007', 'pending') RETURNING id INTO a1;
  UPDATE public.appointments SET status = 'cancelled' WHERE id = a1;
  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE id = pid) THEN RAISE EXCEPTION 'manually added patient was auto-deleted'; END IF;

  -- 11. patient_id can never be pointed at another doctor's patient
  SELECT id INTO d2 FROM public.profiles WHERE id <> d LIMIT 1;
  IF d2 IS NOT NULL THEN
    INSERT INTO public.patients (doctor_id, name, phone, total_visits) VALUES (d2, 'Other Docs Patient', '9222222201', 5) RETURNING id INTO other_pid;
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status)
    VALUES (d, 'Lifecycle Six', '9111111103', 'Visit', 'clinic', today, 300, 'L008', 'pending') RETURNING id INTO a1;
    UPDATE public.appointments SET patient_id = other_pid WHERE id = a1;
    UPDATE public.appointments SET status = 'completed' WHERE id = a1;
    SELECT total_visits INTO n FROM public.patients WHERE id = other_pid;
    IF n <> 5 THEN RAISE EXCEPTION 'cross-tenant patient was modified: %', n; END IF;
  END IF;

  RAISE NOTICE 'patient_lifecycle checks passed';
END $$;

ROLLBACK;
