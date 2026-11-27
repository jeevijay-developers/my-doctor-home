-- patients_with_doctors view (20261127120000): doctors per patient, cancelled ignored, RLS still applies,
-- anon refused. Rolled back; prints one 'pass' row.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/20_patients_with_doctors.sql
BEGIN;
DO $$
DECLARE
  d uuid; pa uuid; pb uuid; pt uuid; pt2 uuid; n int; r record; stranger uuid;
BEGIN
  -- a clinic with a patient and two practitioners (primary + one more), all inside this transaction
  SELECT doctor_id INTO d FROM public.practitioners WHERE is_primary LIMIT 1;
  IF d IS NULL THEN RAISE NOTICE 'no clinic to rehearse'; RETURN; END IF;
  SELECT id INTO pa FROM public.practitioners WHERE doctor_id = d AND is_primary;
  SET LOCAL session_replication_role = replica; -- skip seat/guard triggers for this synthetic second doctor
  INSERT INTO public.practitioners (doctor_id, slug, display_name, is_active, is_primary, sort_order)
    VALUES (d, 'test-b-view', 'Test B', true, false, 99) RETURNING id INTO pb;
  INSERT INTO public.patients (doctor_id, name, phone, age, gender)
    VALUES (d, 'View Test One', '9000000091', 30, 'male') RETURNING id INTO pt;
  INSERT INTO public.patients (doctor_id, name, phone, age, gender)
    VALUES (d, 'View Test Two', '9000000092', 30, 'male') RETURNING id INTO pt2;
  INSERT INTO public.patient_visits (doctor_id, created_by, updated_by, patient_id, practitioner_id, visit_date) VALUES (d, d, d, pt, pa, CURRENT_DATE - 5);
  INSERT INTO public.patient_visits (doctor_id, created_by, updated_by, patient_id, practitioner_id, visit_date) VALUES (d, d, d, pt, pb, CURRENT_DATE - 1);
  INSERT INTO public.patient_visits (doctor_id, created_by, updated_by, patient_id, practitioner_id, visit_date) VALUES (d, d, d, pt2, pb, CURRENT_DATE);
  UPDATE public.patient_visits SET deleted_at = now() WHERE patient_id = pt2;

  SET LOCAL session_replication_role = origin;
  SELECT * INTO r FROM public.patients_with_doctors WHERE id = pt;
  IF r.practitioner_ids IS NULL OR NOT (r.practitioner_ids @> ARRAY[pa, pb]) OR cardinality(r.practitioner_ids) <> 2 THEN
    RAISE EXCEPTION 'expected both doctors, got %', r.practitioner_ids;
  END IF;
  IF r.last_practitioner_id IS DISTINCT FROM pb THEN RAISE EXCEPTION 'last doctor wrong: %', r.last_practitioner_id; END IF;

  SELECT * INTO r FROM public.patients_with_doctors WHERE id = pt2;
  IF cardinality(r.practitioner_ids) <> 0 OR r.last_practitioner_id IS NOT NULL THEN
    RAISE EXCEPTION 'deleted visit must not count: %', r.practitioner_ids;
  END IF;

  -- the owner sees the rows, a stranger sees nothing
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.patients_with_doctors WHERE id IN (pt, pt2);
  IF n <> 2 THEN RAISE EXCEPTION 'owner should see 2 rows, saw %', n; END IF;
  stranger := gen_random_uuid();
  PERFORM set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO n FROM public.patients_with_doctors WHERE id IN (pt, pt2);
  IF n <> 0 THEN RAISE EXCEPTION 'stranger saw % rows', n; END IF;

  -- anon has no access at all
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM public.patients_with_doctors LIMIT 1;
    RAISE EXCEPTION 'anon could read the view';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
