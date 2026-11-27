-- (a) The InitPlan rewrite of the read policies (20261127140000) changed nothing about WHO sees what, and
-- (b) what a doctor login sees through patients_with_doctors in 'shared' and 'treating' mode.
-- Rolled back; prints 'pass'.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/22_rls_initplan_visibility.sql
-- Documented behaviour (not a bug): patients are clinic-level, so in 'treating' mode a doctor login still
-- reads every patient ROW; the restrictive clinical policies narrow visits / prescriptions / documents only.
BEGIN;
CREATE FUNCTION pg_temp.as_user(u uuid, r text DEFAULT 'authenticated') RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', CASE WHEN u IS NULL THEN '' ELSE json_build_object('sub', u, 'role', r)::text END, true)
$$;
DO $$
DECLARE
  d uuid := gen_random_uuid(); s_doc uuid := gen_random_uuid(); s_rec uuid := gen_random_uuid(); s_none uuid := gen_random_uuid();
  s_admin uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
  pa uuid; pb uuid; p1 uuid; p2 uuid; p3 uuid; n int; r record;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  VALUES (d, 'authenticated', 'authenticated', d::text || '@example.test', '{"full_name":"Dr Vis"}'::jsonb);
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"account_type":"staff"}'::jsonb
    FROM unnest(ARRAY[s_doc, s_rec, s_none, s_admin]) AS u;
  UPDATE public.profiles SET plan_tier = 'premium', plan_status = 'active', plan_end = now() + interval '30 days' WHERE id = d;
  INSERT INTO public.doctor_feature_overrides (doctor_id, feature_key, enabled, reason, granted_by) VALUES (d, 'multi_doctor', true, 'test', d);
  INSERT INTO public.clinic_doctor_seats (doctor_id, extra_seats, reason) VALUES (d, 2, 'test');
  INSERT INTO public.website_settings (doctor_id) VALUES (d) ON CONFLICT DO NOTHING;
  pa := public.primary_practitioner_id(d);
  INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (d, 'Dr Bee', 'dr-bee-vis') RETURNING id INTO pb;
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status, role, practitioner_id)
  VALUES (s_doc, d, 'Dr Bee', 'drb-' || s_doc, '+1601' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"patients.view": true, "appointments.view": true, "patients.medical_records": true, "prescriptions.view": true}'::jsonb, d, 'active', 'doctor', pb);
  UPDATE public.practitioners SET user_id = s_doc WHERE id = pb;
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status)
  VALUES (s_rec, d, 'Reception', 'rec-' || s_rec, '+1602' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"patients.view": true, "appointments.view": true, "patients.medical_records": true, "prescriptions.view": true}'::jsonb, d, 'active'),
         (s_none, d, 'Nothing', 'non-' || s_none, '+1603' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"website.view": true}'::jsonb, d, 'active');
  INSERT INTO public.user_roles (user_id, role) VALUES (s_admin, 'admin');

  SET LOCAL session_replication_role = replica;
  INSERT INTO public.patients (doctor_id, name, phone, age, gender) VALUES (d, 'Vis One', '9000000701', 30, 'male') RETURNING id INTO p1;
  INSERT INTO public.patients (doctor_id, name, phone, age, gender) VALUES (d, 'Vis Two', '9000000702', 30, 'male') RETURNING id INTO p2;
  INSERT INTO public.patients (doctor_id, name, phone, age, gender) VALUES (d, 'Vis Three', '9000000703', 30, 'male') RETURNING id INTO p3;
  -- p1: only Dr A; p2: only Dr Bee; p3: both (visits)
  INSERT INTO public.patient_visits (doctor_id, created_by, updated_by, patient_id, practitioner_id, visit_date) VALUES
    (d, d, d, p1, pa, today), (d, d, d, p2, pb, today), (d, d, d, p3, pa, today), (d, d, d, p3, pb, today - 1);
  SET LOCAL session_replication_role = origin;

  -- ---- shared mode: the doctor login sees all patients and all their doctors ----
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user(s_doc);
  SELECT count(*) INTO n FROM public.patients_with_doctors WHERE doctor_id = d;
  IF n <> 3 THEN RAISE EXCEPTION 'shared: doctor login should see 3 patients, saw %', n; END IF;
  SELECT * INTO r FROM public.patients_with_doctors WHERE id = p3;
  IF cardinality(r.practitioner_ids) <> 2 THEN RAISE EXCEPTION 'shared: p3 doctors %', r.practitioner_ids; END IF;
  -- the doctor filter the screen uses
  SELECT count(*) INTO n FROM public.patients_with_doctors WHERE doctor_id = d AND practitioner_ids @> ARRAY[pb];
  IF n <> 2 THEN RAISE EXCEPTION 'shared: own-doctor filter should give 2, gave %', n; END IF;

  -- ---- treating mode ----
  RESET ROLE;
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.website_settings SET clinical_visibility = 'treating' WHERE doctor_id = d;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user(s_doc);
  SELECT count(*) INTO n FROM public.patients_with_doctors WHERE doctor_id = d AND practitioner_ids @> ARRAY[pb];
  IF n <> 2 THEN RAISE EXCEPTION 'treating: own-doctor filter should give 2 (p2, p3), gave %', n; END IF;
  IF EXISTS (SELECT 1 FROM public.patients_with_doctors WHERE id = p1 AND practitioner_ids @> ARRAY[pb]) THEN
    RAISE EXCEPTION 'treating: p1 wrongly listed under Dr Bee';
  END IF;
  -- patient rows are clinic-level (documented): still 3 rows, but the OTHER doctor's visit on p1 is hidden
  SELECT count(*) INTO n FROM public.patients_with_doctors WHERE doctor_id = d;
  IF n <> 3 THEN RAISE EXCEPTION 'treating: patient rows are clinic-level, expected 3, saw %', n; END IF;
  SELECT * INTO r FROM public.patients_with_doctors WHERE id = p1;
  IF cardinality(r.practitioner_ids) <> 0 THEN RAISE EXCEPTION 'treating: another doctor visit leaked into the chips: %', r.practitioner_ids; END IF;
  SELECT * INTO r FROM public.patients_with_doctors WHERE id = p3;
  IF r.practitioner_ids <> ARRAY[pb] THEN RAISE EXCEPTION 'treating: p3 should show only Dr Bee, got %', r.practitioner_ids; END IF;
  -- the owner still sees everything
  PERFORM pg_temp.as_user(d);
  SELECT * INTO r FROM public.patients_with_doctors WHERE id = p3;
  IF cardinality(r.practitioner_ids) <> 2 THEN RAISE EXCEPTION 'treating: owner should see both doctors on p3'; END IF;
  SELECT count(*) INTO n FROM public.patients_with_doctors WHERE doctor_id = d;
  IF n <> 3 THEN RAISE EXCEPTION 'treating: owner should see 3 patients, saw %', n; END IF;

  -- ---- who sees what (the InitPlan rewrite must not change this) ----
  PERFORM pg_temp.as_user(s_rec);
  SELECT count(*) INTO n FROM public.patients WHERE doctor_id = d;
  IF n <> 3 THEN RAISE EXCEPTION 'reception with patients.view should see 3, saw %', n; END IF;
  SELECT count(*) INTO n FROM public.patient_visits WHERE doctor_id = d;
  IF n <> 4 THEN RAISE EXCEPTION 'reception with medical_records should see 4 visits, saw %', n; END IF;
  PERFORM pg_temp.as_user(s_none);
  SELECT count(*) INTO n FROM public.patients WHERE doctor_id = d;
  IF n <> 0 THEN RAISE EXCEPTION 'staff without patients.view saw % patients', n; END IF;
  SELECT count(*) INTO n FROM public.patient_visits WHERE doctor_id = d;
  IF n <> 0 THEN RAISE EXCEPTION 'staff without medical_records saw % visits', n; END IF;
  PERFORM pg_temp.as_user(stranger);
  SELECT count(*) INTO n FROM public.patients WHERE doctor_id = d;
  IF n <> 0 THEN RAISE EXCEPTION 'stranger saw % patients', n; END IF;
  SELECT count(*) INTO n FROM public.patients_with_doctors WHERE doctor_id = d;
  IF n <> 0 THEN RAISE EXCEPTION 'stranger saw % view rows', n; END IF;
  SELECT count(*) INTO n FROM public.appointments WHERE doctor_id = d;
  IF n <> 0 THEN RAISE EXCEPTION 'stranger saw appointments'; END IF;
  SELECT count(*) INTO n FROM public.prescriptions WHERE doctor_id = d;
  IF n <> 0 THEN RAISE EXCEPTION 'stranger saw prescriptions'; END IF;
  PERFORM pg_temp.as_user(s_admin);
  SELECT count(*) INTO n FROM public.patients WHERE doctor_id = d;
  IF n <> 3 THEN RAISE EXCEPTION 'platform admin should see 3 patients, saw %', n; END IF;
  RESET ROLE;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
