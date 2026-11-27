-- Multi-doctor P3 DB3b: clinical_access_log retention (rows older than 1 year purged daily).
-- Rolled back; prints 'pass'. Synthetic rows only.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/16_housekeeping.sql
BEGIN;
DO $$
DECLARE
  d uuid := gen_random_uuid();
  viewer uuid := gen_random_uuid();
  pat uuid := gen_random_uuid();
  n int; kept int; v_priv boolean;
  j record;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  VALUES (d, 'authenticated', 'authenticated', d::text || '@example.test', '{"full_name":"Dr Housekeeping"}'::jsonb);
  INSERT INTO public.clinical_access_log (doctor_id, viewer_user_id, patient_id, created_at) VALUES
    (d, viewer, pat, now() - interval '2 years'),
    (d, viewer, pat, now() - interval '13 months'),
    (d, viewer, pat, now() - interval '366 days'),
    (d, viewer, pat, now() - interval '364 days'),
    (d, viewer, pat, now() - interval '11 months'),
    (d, viewer, pat, now() - interval '1 day'),
    (d, viewer, pat, now());

  -- Only the service role (and the owner of the cron job) may run it.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_priv := false;
  BEGIN
    n := public.purge_clinical_access_log();
  EXCEPTION WHEN insufficient_privilege THEN v_priv := true;
  END;
  RESET ROLE;
  IF NOT v_priv THEN RAISE EXCEPTION 'authenticated can purge the access log'; END IF;
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  v_priv := false;
  BEGIN
    n := public.purge_clinical_access_log();
  EXCEPTION WHEN insufficient_privilege THEN v_priv := true;
  END;
  RESET ROLE;
  IF NOT v_priv THEN RAISE EXCEPTION 'anon can purge the access log'; END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  IF (SELECT count(*) FROM public.clinical_access_log WHERE doctor_id = d) <> 7 THEN RAISE EXCEPTION 'a refused call changed the log'; END IF;

  -- Rows older than one year go; everything newer stays.
  n := public.purge_clinical_access_log();
  IF n < 3 THEN RAISE EXCEPTION 'purge reported % rows, expected at least the 3 synthetic old ones', n; END IF;
  SELECT count(*) INTO kept FROM public.clinical_access_log WHERE doctor_id = d;
  IF kept <> 4 THEN RAISE EXCEPTION 'expected 4 recent rows to survive, got %', kept; END IF;
  IF EXISTS (SELECT 1 FROM public.clinical_access_log WHERE created_at < now() - interval '1 year') THEN
    RAISE EXCEPTION 'old rows remain';
  END IF;
  -- Idempotent: nothing left to purge.
  IF public.purge_clinical_access_log() <> 0 THEN RAISE EXCEPTION 'second run purged rows'; END IF;
  IF (SELECT count(*) FROM public.clinical_access_log WHERE doctor_id = d) <> 4 THEN RAISE EXCEPTION 'second run changed the log'; END IF;

  -- The daily job exists exactly once and runs the function.
  SELECT count(*) INTO n FROM cron.job WHERE jobname = 'purge-clinical-access-log';
  IF n <> 1 THEN RAISE EXCEPTION 'expected one purge-clinical-access-log cron job, found %', n; END IF;
  SELECT * INTO j FROM cron.job WHERE jobname = 'purge-clinical-access-log';
  IF j.schedule !~ '^\d+ \d+ \* \* \*$' THEN RAISE EXCEPTION 'job is not daily: %', j.schedule; END IF;
  IF j.command NOT LIKE '%public.purge_clinical_access_log()%' THEN RAISE EXCEPTION 'job runs the wrong command: %', j.command; END IF;
  -- The other plan/expiry jobs are untouched.
  IF (SELECT count(*) FROM cron.job WHERE jobname IN ('activate-scheduled-plans', 'expire-paid-plans', 'expire-trials',
        'expire-custom-plans', 'expire-abandoned-plan-orders', 'expire-overdue-appointments')) <> 6 THEN
    RAISE EXCEPTION 'an existing cron job disappeared';
  END IF;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
