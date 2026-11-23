-- Patient import limits, part 1 check. Rolled back; leaves no data. Prints one row 'pass'.
BEGIN;
DO $$
DECLARE
  d_pro uuid := gen_random_uuid();
  d_free uuid := gen_random_uuid();
  d_trial uuid := gen_random_uuid();
  d_prem uuid := gen_random_uuid();
  d_lapsed uuid := gen_random_uuid();
  s_ok uuid := gen_random_uuid();
  s_no uuid := gen_random_uuid();
  s_off uuid := gen_random_uuid();
  nobody uuid := gen_random_uuid();
  a jsonb;
  n integer;
  fn text;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{}'::jsonb
  FROM unnest(ARRAY[d_pro, d_free, d_trial, d_prem, d_lapsed]) AS u;
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"account_type":"staff"}'::jsonb
  FROM unnest(ARRAY[s_ok, s_no, s_off]) AS u;
  EXECUTE format('UPDATE public.profiles SET plan_tier=%L, plan_status=%L WHERE id=%L', 'pro', 'active', d_pro);
  EXECUTE format('UPDATE public.profiles SET plan_tier=%L, plan_status=%L WHERE id=%L', 'free', 'active', d_free);
  EXECUTE format('UPDATE public.profiles SET plan_tier=%L, plan_status=%L WHERE id=%L', 'free', 'trial', d_trial);
  EXECUTE format('UPDATE public.profiles SET plan_tier=%L, plan_status=%L WHERE id=%L', 'premium', 'active', d_prem);
  EXECUTE format('UPDATE public.profiles SET plan_tier=%L, plan_status=%L WHERE id=%L', 'pro', 'active', d_lapsed);
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status)
  VALUES (s_ok,  d_pro, 'Staff Ok',  'ok-'  || s_ok,  '+1555' || lpad((floor(random()*1e7))::int::text, 7, '0'), '{"patients.add": true}'::jsonb, d_pro, 'active'),
         (s_no,  d_pro, 'Staff No',  'no-'  || s_no,  '+1556' || lpad((floor(random()*1e7))::int::text, 7, '0'), '{"patients.view": true}'::jsonb, d_pro, 'active'),
         (s_off, d_pro, 'Staff Off', 'off-' || s_off, '+1557' || lpad((floor(random()*1e7))::int::text, 7, '0'), '{"patients.add": true}'::jsonb, d_pro, 'inactive');

  -- eligibility by plan
  IF NOT public.patient_import_eligible(d_pro) THEN RAISE EXCEPTION 'pro/active should be eligible'; END IF;
  IF NOT public.patient_import_eligible(d_prem) THEN RAISE EXCEPTION 'premium/active should be eligible'; END IF;
  IF public.patient_import_eligible(d_free) THEN RAISE EXCEPTION 'free must not be eligible'; END IF;
  IF public.patient_import_eligible(d_trial) THEN RAISE EXCEPTION 'trial must not be eligible'; END IF;
  IF public.patient_import_eligible(nobody) THEN RAISE EXCEPTION 'unknown doctor must not be eligible'; END IF;
  IF public.patient_import_eligible(NULL) IS NOT FALSE THEN RAISE EXCEPTION 'NULL doctor must be false, not null'; END IF;
  EXECUTE format('UPDATE public.profiles SET plan_status=%L WHERE id=%L', 'expired', d_pro);
  IF public.patient_import_eligible(d_pro) THEN RAISE EXCEPTION 'expired pro must not be eligible'; END IF;
  EXECUTE format('UPDATE public.profiles SET plan_status=%L WHERE id=%L', 'cancelled', d_pro);
  IF public.patient_import_eligible(d_pro) THEN RAISE EXCEPTION 'cancelled pro must not be eligible'; END IF;
  EXECUTE format('UPDATE public.profiles SET plan_status=%L WHERE id=%L', 'active', d_pro);
  -- active on paper but the paid period has ended (the expiry job may lag)
  UPDATE public.profiles SET plan_end = now() - interval '2 days' WHERE id = d_lapsed;
  IF public.patient_import_eligible(d_lapsed) THEN RAISE EXCEPTION 'active pro past plan_end must not be eligible'; END IF;
  UPDATE public.profiles SET plan_end = now() + interval '20 days' WHERE id = d_lapsed;
  IF NOT public.patient_import_eligible(d_lapsed) THEN RAISE EXCEPTION 'active pro before plan_end should be eligible'; END IF;

  -- overrides: blocked beats premium, allowed beats free, an ended override falls back to the plan
  INSERT INTO public.patient_import_overrides (doctor_id, mode, reason, set_by) VALUES (d_prem, 'blocked', 'abuse', d_prem);
  IF public.patient_import_eligible(d_prem) THEN RAISE EXCEPTION 'blocked premium must not be eligible'; END IF;
  INSERT INTO public.patient_import_overrides (doctor_id, mode, reason, set_by) VALUES (d_free, 'allowed', 'support', d_free);
  IF NOT public.patient_import_eligible(d_free) THEN RAISE EXCEPTION 'allowed free should be eligible'; END IF;
  UPDATE public.patient_import_overrides SET until = now() - interval '1 day' WHERE doctor_id = d_free;
  IF public.patient_import_eligible(d_free) THEN RAISE EXCEPTION 'ended override must fall back to the plan'; END IF;
  -- a blocked override reports reason=blocked in the summary (checked below)
  DELETE FROM public.patient_import_overrides WHERE doctor_id IN (d_free, d_prem);

  -- caps
  IF public.patient_import_cap(d_pro) <> 2000 THEN RAISE EXCEPTION 'pro cap should be 2000'; END IF;
  IF public.patient_import_cap(d_prem) <> 10000 THEN RAISE EXCEPTION 'premium cap should be 10000'; END IF;
  IF public.patient_import_cap(nobody) <> 2000 THEN RAISE EXCEPTION 'unknown doctor cap should fall back to the pro default'; END IF;
  INSERT INTO public.patient_import_requests (doctor_id, requested_cap, status, approved_cap, decided_at)
  VALUES (d_pro, 5000, 'approved', 5000, now());
  IF public.patient_import_cap(d_pro) <> 5000 THEN RAISE EXCEPTION 'approved cap should raise the cap'; END IF;
  -- a LATER smaller approval is "the latest approved" but the cap never drops below the tier
  INSERT INTO public.patient_import_requests (doctor_id, requested_cap, status, approved_cap, decided_at)
  VALUES (d_pro, 3000, 'approved', 3000, now() + interval '1 minute');
  IF public.patient_import_cap(d_pro) <> 3000 THEN RAISE EXCEPTION 'latest approval (3000) should win, got %', public.patient_import_cap(d_pro); END IF;
  DELETE FROM public.patient_import_requests WHERE doctor_id = d_pro AND approved_cap = 3000;

  -- one open request per clinic
  INSERT INTO public.patient_import_requests (doctor_id, requested_cap) VALUES (d_pro, 7000);
  BEGIN
    INSERT INTO public.patient_import_requests (doctor_id, requested_cap) VALUES (d_pro, 8000);
    RAISE EXCEPTION 'a second pending request must be refused';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  DELETE FROM public.patient_import_requests WHERE doctor_id = d_pro AND status = 'pending';

  -- the access summary, read as the doctor
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d_pro, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', d_pro::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  a := public.get_patient_import_access();
  EXECUTE 'RESET ROLE';
  IF (a->>'eligible')::boolean IS NOT TRUE OR a->>'reason' <> 'ok' OR (a->>'cap')::int <> 5000
     OR (a->>'patient_count')::int <> 0 OR (a->>'remaining')::int <> 5000
     OR (a->>'max_rows')::int <> 1000 OR (a->>'pending_request')::boolean IS NOT FALSE
     OR a->'cooldown_until' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'unexpected access summary for pro: %', a;
  END IF;

  -- trial: reason=plan
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d_trial, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', d_trial::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  a := public.get_patient_import_access();
  EXECUTE 'RESET ROLE';
  IF (a->>'eligible')::boolean IS NOT FALSE OR a->>'reason' <> 'plan' THEN
    RAISE EXCEPTION 'trial should be reason=plan, got %', a;
  END IF;

  -- blocked premium: reason=blocked; a recent decline shows a cooldown
  INSERT INTO public.patient_import_overrides (doctor_id, mode, reason, set_by) VALUES (d_prem, 'blocked', 'abuse', d_prem);
  INSERT INTO public.patient_import_requests (doctor_id, requested_cap, status, decided_at)
  VALUES (d_prem, 20000, 'rejected', now() - interval '1 day');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d_prem, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', d_prem::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  a := public.get_patient_import_access();
  EXECUTE 'RESET ROLE';
  IF a->>'reason' <> 'blocked' OR (a->>'eligible')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'blocked premium summary wrong: %', a; END IF;
  IF a->>'cooldown_until' IS NULL THEN RAISE EXCEPTION 'cooldown missing after a recent decline: %', a; END IF;
  -- the doctor can see neither the override nor the superadmin-only rows
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.patient_import_overrides;
  EXECUTE 'RESET ROLE';
  IF n <> 0 THEN RAISE EXCEPTION 'a doctor must not read import overrides (saw %)', n; END IF;
  DELETE FROM public.patient_import_overrides WHERE doctor_id = d_prem;

  -- a doctor reads only their own requests
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d_pro, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', d_pro::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.patient_import_requests WHERE doctor_id = d_prem;
  EXECUTE 'RESET ROLE';
  IF n <> 0 THEN RAISE EXCEPTION 'a doctor must not read another clinic''s import requests'; END IF;

  -- staff: with patients.add -> summary for the doctor's clinic; without, inactive, or unrelated -> no_permission
  PERFORM set_config('request.jwt.claims', json_build_object('sub', s_ok, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', s_ok::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  a := public.get_patient_import_access();
  EXECUTE 'RESET ROLE';
  IF a->>'reason' <> 'ok' OR (a->>'cap')::int <> 5000 THEN RAISE EXCEPTION 'staff with patients.add should see the clinic summary: %', a; END IF;
  FOREACH fn IN ARRAY ARRAY[s_no::text, s_off::text, nobody::text] LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', fn, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', fn, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    a := public.get_patient_import_access();
    EXECUTE 'RESET ROLE';
    IF a->>'reason' <> 'no_permission' OR (a->>'eligible')::boolean IS NOT FALSE THEN
      RAISE EXCEPTION 'caller % should be no_permission, got %', fn, a;
    END IF;
  END LOOP;

  -- no JWT at all: no_permission (not an error, not another clinic)
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  a := public.get_patient_import_access();
  EXECUTE 'RESET ROLE';
  IF a->>'reason' <> 'no_permission' THEN RAISE EXCEPTION 'no-JWT summary should be no_permission: %', a; END IF;

  -- anonymous callers cannot reach the summary
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM public.get_patient_import_access();
    RAISE EXCEPTION 'anon must not execute get_patient_import_access';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  EXECUTE 'RESET ROLE';

  -- privileges: helpers are not callable by anon/authenticated
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d_pro, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', d_pro::text, true);
  FOREACH fn IN ARRAY ARRAY['authenticated', 'anon'] LOOP
    EXECUTE format('SET LOCAL ROLE %I', fn);
    BEGIN PERFORM public.patient_import_eligible(d_pro); RAISE EXCEPTION '% can call patient_import_eligible', fn;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM public.patient_import_cap(d_pro); RAISE EXCEPTION '% can call patient_import_cap', fn;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM public.patient_import_clinic(); RAISE EXCEPTION '% can call patient_import_clinic', fn;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM public.platform_int_setting('patient_import_max_rows', 1); RAISE EXCEPTION '% can call platform_int_setting', fn;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    EXECUTE 'RESET ROLE';
  END LOOP;

  -- privileges: no client writes (and no reads for anon / the counters table)
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN INSERT INTO public.patient_import_overrides (doctor_id, mode, reason, set_by) VALUES (d_pro, 'allowed', 'x', d_pro);
    RAISE EXCEPTION 'authenticated can INSERT overrides'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.patient_import_overrides SET mode = 'allowed';
    RAISE EXCEPTION 'authenticated can UPDATE overrides'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM public.patient_import_overrides;
    RAISE EXCEPTION 'authenticated can DELETE overrides'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.patient_imports (doctor_id, user_id, rows_received, rows_inserted, rows_duplicate, rows_rejected) VALUES (d_pro, d_pro, 1, 1, 0, 0);
    RAISE EXCEPTION 'authenticated can INSERT imports'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.patient_imports SET rows_inserted = 0;
    RAISE EXCEPTION 'authenticated can UPDATE imports'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM public.patient_imports;
    RAISE EXCEPTION 'authenticated can DELETE imports'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.patient_import_requests (doctor_id, requested_cap, status, approved_cap) VALUES (d_pro, 99999, 'approved', 99999);
    RAISE EXCEPTION 'authenticated can INSERT requests'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.patient_import_requests SET approved_cap = 99999;
    RAISE EXCEPTION 'authenticated can UPDATE requests'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM public.patient_import_requests;
    RAISE EXCEPTION 'authenticated can DELETE requests'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN SELECT count(*) INTO n FROM public.patient_insert_counters;
    RAISE EXCEPTION 'authenticated can SELECT counters'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.patient_insert_counters (doctor_id, window_start, n) VALUES (d_pro, now(), 0);
    RAISE EXCEPTION 'authenticated can INSERT counters'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  EXECUTE 'RESET ROLE';
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN SELECT count(*) INTO n FROM public.patient_import_requests;
    RAISE EXCEPTION 'anon can SELECT requests'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN SELECT count(*) INTO n FROM public.patient_imports;
    RAISE EXCEPTION 'anon can SELECT imports'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN SELECT count(*) INTO n FROM public.patient_import_overrides;
    RAISE EXCEPTION 'anon can SELECT overrides'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  EXECUTE 'RESET ROLE';

  -- every new table has RLS on
  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
   WHERE s.nspname = 'public' AND c.relname IN ('patient_import_overrides','patient_imports','patient_import_requests','patient_insert_counters')
     AND c.relrowsecurity;
  IF n <> 4 THEN RAISE EXCEPTION 'RLS must be enabled on all 4 new tables (found %)', n; END IF;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
