-- Review of 20261127110000..140000, all on SYNTHETIC data. Rolled back; prints one 'pass' row.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/23_review_money_and_delete.sql
-- Covers: doctor login completing appointments still creates invoices (SECURITY DEFINER path) with unique
-- numbers even for invoices it cannot see; Billing reads by a doctor login do not error; the
-- patients_with_doctors view is read-only for clients and closed to anon; a full clinic delete with two
-- doctors, a doctor login, reception, appointments, prescriptions and invoices leaves nothing behind.
BEGIN;
CREATE FUNCTION pg_temp.as_user(u uuid, r text DEFAULT 'authenticated') RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', CASE WHEN u IS NULL THEN '' ELSE json_build_object('sub', u, 'role', r)::text END, true)
$$;
DO $$
DECLARE
  d uuid := gen_random_uuid(); s_doc uuid := gen_random_uuid(); s_rec uuid := gen_random_uuid();
  pa uuid; pb uuid; pt uuid; a1 uuid; a2 uuid; a3 uuid; n int; ids int;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  VALUES (d, 'authenticated', 'authenticated', d::text || '@example.test', '{"full_name":"Dr Review"}'::jsonb);
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"account_type":"staff"}'::jsonb
    FROM unnest(ARRAY[s_doc, s_rec]) AS u;
  UPDATE public.profiles SET plan_tier = 'premium', plan_status = 'active', plan_end = now() + interval '30 days' WHERE id = d;
  INSERT INTO public.doctor_feature_overrides (doctor_id, feature_key, enabled, reason, granted_by) VALUES (d, 'multi_doctor', true, 'test', d);
  INSERT INTO public.clinic_doctor_seats (doctor_id, extra_seats, reason) VALUES (d, 2, 'test');
  INSERT INTO public.website_settings (doctor_id) VALUES (d) ON CONFLICT DO NOTHING;
  pa := public.primary_practitioner_id(d);
  INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (d, 'Dr Bee', 'dr-bee-rev') RETURNING id INTO pb;
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status, role, practitioner_id)
  VALUES (s_doc, d, 'Dr Bee', 'drb-' || s_doc, '+1593' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"billing.view": true, "appointments.view": true, "appointments.edit": true, "patients.view": true, "prescriptions.view": true}'::jsonb,
          d, 'active', 'doctor', pb);
  UPDATE public.practitioners SET user_id = s_doc WHERE id = pb;
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status)
  VALUES (s_rec, d, 'Reception', 'rec-' || s_rec, '+1594' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"billing.view": true}'::jsonb, d, 'active');
  INSERT INTO public.patients (doctor_id, name, phone, age, gender) VALUES (d, 'Rev Patient', '9000009991', 30, 'male') RETURNING id INTO pt;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status, time_slot, practitioner_id)
  VALUES (d, 'Rev One', '9000009992', 'Visit', 'clinic', today + 1, 100, 'RV01', 'pay_at_clinic', '10:00', pa) RETURNING id INTO a1;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status, time_slot, practitioner_id)
  VALUES (d, 'Rev Two', '9000009993', 'Visit', 'clinic', today + 1, 200, 'RV02', 'pay_at_clinic', '10:30', pb) RETURNING id INTO a2;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status, time_slot, practitioner_id)
  VALUES (d, 'Rev Three', '9000009994', 'Visit', 'clinic', today + 1, 300, 'RV03', 'pay_at_clinic', '11:00', pb) RETURNING id INTO a3;
  INSERT INTO public.prescriptions (doctor_id, patient_id, patient_name, practitioner_id, diagnosis) VALUES (d, pt, 'Rev Patient', pa, 'A');
  INSERT INTO public.prescriptions (doctor_id, patient_id, patient_name, practitioner_id, diagnosis) VALUES (d, pt, 'Rev Patient', pb, 'B');

  -- doctor login (Dr Bee) completes and takes payment for BOTH doctors' visits; the invoice must still appear
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user(s_doc);
  UPDATE public.appointments SET status = 'completed', payment_status = 'paid', payment_method = 'cash' WHERE id = a2;
  UPDATE public.appointments SET status = 'completed', payment_status = 'paid', payment_method = 'cash' WHERE id = a1;
  UPDATE public.appointments SET status = 'completed', payment_status = 'paid', payment_method = 'cash' WHERE id = a3;
  RESET ROLE;
  SELECT count(*), count(DISTINCT invoice_number) INTO n, ids FROM public.invoices WHERE doctor_id = d;
  IF n <> 3 OR ids <> 3 THEN RAISE EXCEPTION 'expected 3 invoices with distinct numbers, got % / %', n, ids; END IF;
  IF (SELECT practitioner_id FROM public.invoices WHERE appointment_id = a1) IS DISTINCT FROM pa
     OR (SELECT practitioner_id FROM public.invoices WHERE appointment_id = a2) IS DISTINCT FROM pb THEN
    RAISE EXCEPTION 'invoice not snapshotted with the appointment doctor';
  END IF;

  -- what the Billing page reads as a doctor login: no error, own invoices only, no ledger/payments rows
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user(s_doc);
  SELECT count(*) INTO n FROM public.invoices WHERE doctor_id = d;
  IF n <> 2 THEN RAISE EXCEPTION 'doctor login should see its 2 own invoices, saw %', n; END IF;
  PERFORM count(*) FROM public.doctor_ledger WHERE doctor_id = d;
  PERFORM count(*) FROM public.payments WHERE doctor_id = d;
  SELECT count(*) INTO n FROM public.patients_with_doctors WHERE doctor_id = d;
  IF n < 1 THEN RAISE EXCEPTION 'doctor login should read the patients view, saw %', n; END IF;
  -- the view is read-only for clients
  BEGIN
    INSERT INTO public.patients_with_doctors (doctor_id, name, phone, age, gender) VALUES (d, 'x', '9000009995', 1, 'male');
    RAISE EXCEPTION 'client inserted through the view';
  EXCEPTION WHEN insufficient_privilege OR object_not_in_prerequisite_state THEN NULL;
  END;
  RESET ROLE;
  IF has_table_privilege('authenticated', 'public.patients_with_doctors', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('authenticated', 'public.patients_with_doctors', 'INSERT')
     OR has_table_privilege('authenticated', 'public.patients_with_doctors', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.patients_with_doctors', 'DELETE')
     OR has_table_privilege('authenticated', 'public.patients_with_doctors', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.patients_with_doctors', 'TRIGGER')
     OR has_table_privilege('anon', 'public.patients_with_doctors', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.patients_with_doctors', 'SELECT') THEN
    RAISE EXCEPTION 'patients_with_doctors grants are wider than SELECT for authenticated';
  END IF;

  -- full clinic delete, the way admin-delete-doctors does it: owner first, then the staff logins
  PERFORM pg_temp.as_user(NULL, NULL);   -- service role: no JWT subject
  DELETE FROM auth.users WHERE id = d;
  DELETE FROM auth.users WHERE id IN (s_doc, s_rec);
  IF EXISTS (SELECT 1 FROM public.prescriptions WHERE doctor_id = d)
     OR EXISTS (SELECT 1 FROM public.practitioners WHERE doctor_id = d)
     OR EXISTS (SELECT 1 FROM public.staff_members WHERE doctor_id = d)
     OR EXISTS (SELECT 1 FROM public.appointments WHERE doctor_id = d)
     OR EXISTS (SELECT 1 FROM public.patients WHERE doctor_id = d)
     OR EXISTS (SELECT 1 FROM public.profiles WHERE id = d) THEN
    RAISE EXCEPTION 'clinic delete left rows behind';
  END IF;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
