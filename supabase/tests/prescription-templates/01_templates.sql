-- Prescription templates (20261127190000_prescription_templates.sql): config validation, RLS for the
-- owner / a doctor login / reception / strangers, one default per scope, the per-clinic limit, the new
-- prescriptions columns, and the patient's /rx page. Rolled back; prints 'pass'.
--   npx supabase db query --linked -f supabase/tests/prescription-templates/01_templates.sql
BEGIN;
DO $$
DECLARE
  d   uuid := gen_random_uuid();   -- clinic owner (Dr A, the primary)
  ub  uuid := gen_random_uuid();   -- Dr B's own login (role 'doctor')
  ur  uuid := gen_random_uuid();   -- reception at d (role 'staff', has prescriptions.edit)
  stranger uuid := gen_random_uuid();
  pa uuid; pb uuid;
  t1 uuid; t2 uuid; t_b1 uuid; t_b2 uuid; t_new uuid;
  rx uuid; tok text; r jsonb;
  n int;
  i int;
  bad text[];
  good jsonb := '{"version":1,"accent":"#1d4ed8","title":"OPD CARD","letterhead":"standard","preprintedTopMm":45,"preprintedBottomMm":25,
    "header":{"qualifications":true,"registration":true,"contact":true},"footer":{"address":true,"qr":true},
    "blocks":[{"id":"patient_info","type":"patient_info","enabled":true,"fields":["patient_name","age","diagnosis"]},
              {"id":"cf_opd","type":"custom","enabled":true,"label":"OPD No.","fieldType":"text","options":[],"required":false},
              {"id":"cf_mlc","type":"custom","enabled":true,"label":"MLC","fieldType":"select","options":["No","Yes"],"required":true},
              {"id":"signature","type":"signature","enabled":true}]}'::jsonb;
BEGIN
  -- ---- setup (same shape as multi-doctor/07b) ----
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  VALUES (d, 'authenticated', 'authenticated', d::text || '@example.test', '{"full_name":"Dr Owner"}'::jsonb);
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"account_type":"staff"}'::jsonb
  FROM unnest(ARRAY[ub, ur]) AS u;
  UPDATE public.profiles SET plan_tier = 'premium', plan_status = 'active', plan_end = now() + interval '30 days'
   WHERE id = d;
  INSERT INTO public.doctor_feature_overrides (doctor_id, feature_key, enabled, reason, granted_by)
  VALUES (d, 'multi_doctor', true, 'test: prescription templates', d);
  INSERT INTO public.clinic_doctor_seats (doctor_id, extra_seats, reason) VALUES (d, 2, 'test');
  INSERT INTO public.website_settings (doctor_id) VALUES (d) ON CONFLICT DO NOTHING;
  pa := public.primary_practitioner_id(d);
  INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (d, 'Dr B', 'dr-b-tpl') RETURNING id INTO pb;
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status, role, practitioner_id)
  VALUES (ub, d, 'Dr B', 'drb-' || ub, '+1581' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"prescriptions.view": true, "prescriptions.create": true, "prescriptions.edit": true}'::jsonb,
          d, 'active', 'doctor', pb);
  UPDATE public.practitioners SET user_id = ub WHERE id = pb;
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status)
  VALUES (ur, d, 'Reception', 'rec-' || ur, '+1582' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"prescriptions.view": true, "prescriptions.create": true, "prescriptions.edit": true}'::jsonb,
          d, 'active');

  -- ---- 1. The config validator: one good config, many bad ones (never raises, always false) ----
  IF NOT public.prescription_template_config_valid(good) THEN RAISE EXCEPTION 'good config rejected'; END IF;
  bad := ARRAY[
    '{"version":2,"accent":"#1d4ed8","blocks":[]}',
    '{"version":1,"accent":"red","blocks":[]}',
    '{"version":1,"accent":"#1d4ed8","blocks":{}}',
    '{"version":1,"accent":"#1d4ed8"}',
    '{"version":1,"accent":"#1d4ed8","blocks":[{"id":"x","type":"script","enabled":true}]}',
    '{"version":1,"accent":"#1d4ed8","blocks":[{"id":"cf_a","type":"custom","enabled":true,"label":"A","fieldType":"text"},{"id":"cf_a","type":"custom","enabled":true,"label":"B","fieldType":"text"}]}',
    '{"version":1,"accent":"#1d4ed8","blocks":[{"id":"x","type":"medicines","enabled":true}]}',
    '{"version":1,"accent":"#1d4ed8","blocks":[{"id":"medicines","type":"medicines","enabled":true},{"id":"medicines","type":"medicines","enabled":true}]}',
    '{"version":1,"accent":"#1d4ed8","blocks":[{"id":"cf_a","type":"custom","enabled":true,"label":"  ","fieldType":"text"}]}',
    '{"version":1,"accent":"#1d4ed8","blocks":[{"id":"cf_a","type":"custom","enabled":true,"label":"A","fieldType":"weird"}]}',
    '{"version":1,"accent":"#1d4ed8","blocks":[{"id":"signature","type":"signature"}]}',
    '{"version":1,"accent":"#1d4ed8","blocks":[{"id":"cf_a","type":"custom","enabled":true,"label":"A","fieldType":"select","options":"x"}]}',
    '{"version":1,"accent":"#1d4ed8","blocks":[{"id":"cf_a","type":"custom","enabled":true,"label":"A","fieldType":"select","options":["' || repeat('x', 41) || '"]}]}',
    '{"version":1,"accent":"#1d4ed8","title":"' || repeat('x', 41) || '","blocks":[]}',
    '{"version":1,"accent":"#1d4ed8","letterhead":"banner","blocks":[]}',
    '{"version":1,"accent":"#1d4ed8","preprintedTopMm":81,"blocks":[]}',
    '{"version":1,"accent":"#1d4ed8","preprintedTopMm":"abc","blocks":[]}',
    '{"version":1,"accent":"#1d4ed8","blocks":[{"id":"patient_info","type":"patient_info","enabled":true,"fields":["bogus"]}]}',
    '{"version":1,"accent":"#1d4ed8","blocks":[{"id":"Bad Id","type":"custom","enabled":true,"label":"A","fieldType":"text"}]}',
    '{"version":1,"accent":"#1d4ed8","blocks":[{"id":true,"type":"signature","enabled":true}]}',
    '{"version":1,"accent":"#1d4ed8","blocks":[{"id":"cf_a","type":"custom","enabled":true,"label":"A","fieldType":"select"}]}',
    '{"version":1,"accent":"#1d4ed8","blocks":[{"id":"cf_a","type":"custom","enabled":true,"label":"A","fieldType":"multiselect","options":["Only"]}]}',
    'null', '[]', '"x"'];
  FOR i IN 1..array_length(bad, 1) LOOP
    IF public.prescription_template_config_valid(bad[i]::jsonb) THEN RAISE EXCEPTION 'bad config % accepted: %', i, bad[i]; END IF;
  END LOOP;
  IF public.prescription_template_config_valid(NULL) THEN RAISE EXCEPTION 'NULL config accepted'; END IF;
  -- 31 custom fields, and an oversized document.
  IF public.prescription_template_config_valid(jsonb_build_object('version', 1, 'accent', '#1d4ed8', 'blocks',
       (SELECT jsonb_agg(jsonb_build_object('id', 'cf_' || g, 'type', 'custom', 'enabled', true, 'label', 'F' || g, 'fieldType', 'text'))
          FROM generate_series(1, 31) g))) THEN RAISE EXCEPTION '31 custom fields accepted'; END IF;
  IF public.prescription_template_config_valid(jsonb_build_object('version', 1, 'accent', '#1d4ed8', 'blocks', '[]'::jsonb,
       'pad', repeat('a', 70000))) THEN RAISE EXCEPTION 'oversized config accepted'; END IF;

  -- ---- 2. The owner writes clinic templates; the table refuses a bad config ----
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.prescription_templates (doctor_id, name, preset, config, is_default)
  VALUES (d, 'Dental', 'dental', good, true) RETURNING id INTO t1;
  BEGIN
    INSERT INTO public.prescription_templates (doctor_id, name, config) VALUES (d, 'Bad', '{"version":2}'::jsonb);
    RAISE EXCEPTION 'owner stored an invalid config';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.prescription_templates (doctor_id, name, config) VALUES (d, '   ', good);
    RAISE EXCEPTION 'owner stored a blank name';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  EXECUTE 'RESET ROLE';

  -- ---- 3. One default per scope: a new default demotes the old one, scopes do not interfere ----
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.prescription_templates (doctor_id, name, config, is_default) VALUES (d, 'General', good, true) RETURNING id INTO t2;
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO n FROM public.prescription_templates WHERE doctor_id = d AND practitioner_id IS NULL AND is_default;
  IF n <> 1 OR NOT (SELECT is_default FROM public.prescription_templates WHERE id = t2)
     OR (SELECT is_default FROM public.prescription_templates WHERE id = t1) THEN
    RAISE EXCEPTION 'new clinic default did not replace the old one (% defaults)', n;
  END IF;
  -- Making the old one default again by UPDATE swaps them back.
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.prescription_templates SET is_default = true WHERE id = t1;
  EXECUTE 'RESET ROLE';
  IF NOT (SELECT is_default FROM public.prescription_templates WHERE id = t1)
     OR (SELECT is_default FROM public.prescription_templates WHERE id = t2) THEN
    RAISE EXCEPTION 'default swap by UPDATE failed';
  END IF;
  -- A doctor-scoped default coexists with the clinic default.
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.prescription_templates (doctor_id, practitioner_id, name, config, is_default) VALUES (d, pb, 'B slip', good, true) RETURNING id INTO t_b1;
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO n FROM public.prescription_templates WHERE doctor_id = d AND is_default;
  IF n <> 2 THEN RAISE EXCEPTION 'clinic and doctor defaults should coexist (% defaults)', n; END IF;

  -- ---- 4. Dr B (doctor login): own scope only ----
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.prescription_templates WHERE doctor_id = d;
  IF n < 3 THEN RAISE EXCEPTION 'doctor login cannot read the clinic templates (% rows)', n; END IF;
  INSERT INTO public.prescription_templates (doctor_id, practitioner_id, name, config, is_default) VALUES (d, pb, 'B second', good, true) RETURNING id INTO t_b2;
  UPDATE public.prescription_templates SET name = 'B second renamed' WHERE id = t_b2;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'doctor login could not edit own template'; END IF;
  -- cannot write a clinic template, a template for Dr A, or move one out of their scope
  BEGIN
    INSERT INTO public.prescription_templates (doctor_id, name, config) VALUES (d, 'B forges clinic', good);
    RAISE EXCEPTION 'doctor login created a clinic template';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.prescription_templates (doctor_id, practitioner_id, name, config) VALUES (d, pa, 'B forges A', good);
    RAISE EXCEPTION 'doctor login created a template for Dr A';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.prescription_templates SET practitioner_id = NULL WHERE id = t_b2;
    RAISE EXCEPTION 'doctor login promoted own template to the clinic';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.prescription_templates SET name = 'hijack' WHERE id = t1;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'doctor login edited the clinic template'; END IF;
  DELETE FROM public.prescription_templates WHERE id = t1;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'doctor login deleted the clinic template'; END IF;
  EXECUTE 'RESET ROLE';
  -- Dr B's new default demoted only Dr B's old default; the clinic default is untouched.
  IF (SELECT is_default FROM public.prescription_templates WHERE id = t_b1)
     OR NOT (SELECT is_default FROM public.prescription_templates WHERE id = t_b2)
     OR NOT (SELECT is_default FROM public.prescription_templates WHERE id = t1) THEN
    RAISE EXCEPTION 'defaults after Dr B''s change are wrong';
  END IF;

  -- ---- 5. Reception reads (to issue prescriptions) but never writes ----
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ur, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.prescription_templates WHERE doctor_id = d;
  IF n < 3 THEN RAISE EXCEPTION 'reception cannot read templates (% rows)', n; END IF;
  BEGIN
    INSERT INTO public.prescription_templates (doctor_id, name, config) VALUES (d, 'Rec', good);
    RAISE EXCEPTION 'reception created a template';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.prescription_templates (doctor_id, practitioner_id, name, config) VALUES (d, pb, 'Rec as B', good);
    RAISE EXCEPTION 'reception created a template for Dr B';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.prescription_templates SET name = 'rec edit' WHERE id IN (t1, t_b2);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'reception edited a template'; END IF;
  DELETE FROM public.prescription_templates WHERE id IN (t1, t_b2);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'reception deleted a template'; END IF;
  EXECUTE 'RESET ROLE';

  -- ---- 6. A stranger and anon see and write nothing ----
  PERFORM set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.prescription_templates;
  IF n <> 0 THEN RAISE EXCEPTION 'stranger sees % templates', n; END IF;
  BEGIN
    INSERT INTO public.prescription_templates (doctor_id, name, config) VALUES (d, 'Stranger', good);
    RAISE EXCEPTION 'stranger created a template';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.prescription_templates SET name = 'x';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'stranger edited templates'; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  n := 0;
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    SELECT count(*) INTO n FROM public.prescription_templates;
  EXCEPTION WHEN insufficient_privilege THEN n := 0;
  END;
  EXECUTE 'RESET ROLE';
  IF n <> 0 THEN RAISE EXCEPTION 'anon sees % templates', n; END IF;

  -- ---- 7. At most 20 templates per clinic ----
  SELECT count(*) INTO n FROM public.prescription_templates WHERE doctor_id = d;
  WHILE n < 20 LOOP
    INSERT INTO public.prescription_templates (doctor_id, name, config) VALUES (d, 'Filler ' || n, good);
    n := n + 1;
  END LOOP;
  BEGIN
    INSERT INTO public.prescription_templates (doctor_id, name, config) VALUES (d, 'One too many', good);
    RAISE EXCEPTION 'a 21st template was accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'TEMPLATE_LIMIT' THEN RAISE EXCEPTION 'wrong limit error: %', SQLERRM; END IF;
  END;

  -- A stranger cannot probe another clinic's template count: even at the cap the answer is the plain
  -- RLS refusal (42501), never TEMPLATE_LIMIT (23514).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO public.prescription_templates (doctor_id, name, config) VALUES (d, 'Probe', good);
    RAISE EXCEPTION 'stranger inserted into a full clinic';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN check_violation THEN RAISE EXCEPTION 'stranger learned the template count (TEMPLATE_LIMIT leaked)';
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);

  -- ---- 8. prescriptions: answers and the layout snapshot ----
  INSERT INTO public.prescriptions (doctor_id, patient_name, practitioner_id, diagnosis, extra, template_id, template_snapshot)
  VALUES (d, 'Tpl Patient', pa, 'Pulpitis', '{"cf_opd":"14023","cf_teeth":{"16":"decayed"}}'::jsonb, t1, good)
  RETURNING id INTO rx;
  BEGIN
    INSERT INTO public.prescriptions (doctor_id, patient_name, practitioner_id, extra) VALUES (d, 'X', pa, '[]'::jsonb);
    RAISE EXCEPTION 'extra accepted an array';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.prescriptions (doctor_id, patient_name, practitioner_id, extra)
    VALUES (d, 'X', pa, jsonb_build_object('a', repeat('x', 40000)));
    RAISE EXCEPTION 'extra accepted 40 kB';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.prescriptions (doctor_id, patient_name, practitioner_id, template_snapshot)
    VALUES (d, 'X', pa, '{"version":9,"blocks":[]}'::jsonb);
    RAISE EXCEPTION 'snapshot accepted an invalid config';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- Without the new columns a prescription is exactly what it was: empty answers, no snapshot.
  INSERT INTO public.prescriptions (doctor_id, patient_name, practitioner_id) VALUES (d, 'Plain', pa) RETURNING id INTO t_new;
  IF (SELECT extra FROM public.prescriptions WHERE id = t_new) <> '{}'::jsonb
     OR (SELECT template_snapshot FROM public.prescriptions WHERE id = t_new) IS NOT NULL THEN
    RAISE EXCEPTION 'defaults of the new prescription columns are wrong';
  END IF;

  -- ---- 9. The patient's /rx page returns the answers and the snapshot ----
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  tok := public.create_prescription_share(rx) ->> 'token';
  PERFORM set_config('request.jwt.claims', '', true);
  r := public.get_shared_prescription(tok, '');
  IF NOT COALESCE((r ->> 'ok')::boolean, false) THEN RAISE EXCEPTION 'shared rx not ok: %', r ->> 'error'; END IF;
  IF r #>> '{prescription,extra,cf_opd}' IS DISTINCT FROM '14023'
     OR r #>> '{prescription,extra,cf_teeth,16}' IS DISTINCT FROM 'decayed'
     OR r #>> '{prescription,template_snapshot,title}' IS DISTINCT FROM 'OPD CARD' THEN
    RAISE EXCEPTION 'shared rx misses the template data: %', r -> 'prescription';
  END IF;
  IF r #>> '{prescription,diagnosis}' IS DISTINCT FROM 'Pulpitis' THEN RAISE EXCEPTION 'shared rx lost its diagnosis'; END IF;

  -- ---- 10. Deleting a template keeps the prescriptions issued with it (and their layout) ----
  DELETE FROM public.prescription_templates WHERE id = t1;
  IF (SELECT template_id FROM public.prescriptions WHERE id = rx) IS NOT NULL
     OR (SELECT template_snapshot FROM public.prescriptions WHERE id = rx) IS NULL THEN
    RAISE EXCEPTION 'deleting a template changed the prescription''s snapshot';
  END IF;

  -- ---- 11. Dr B's own templates can be removed without touching the clinic's ----
  DELETE FROM public.prescription_templates WHERE practitioner_id = pb;
  SELECT count(*) INTO n FROM public.prescription_templates WHERE doctor_id = d AND practitioner_id IS NOT NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'doctor-scoped templates remain'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.prescription_templates WHERE doctor_id = d AND practitioner_id IS NULL) THEN
    RAISE EXCEPTION 'clinic templates were removed with the doctor''s';
  END IF;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
