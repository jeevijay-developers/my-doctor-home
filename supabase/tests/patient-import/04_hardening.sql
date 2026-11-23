-- Patient import limits, part 4 check (hardening: guard bypass via bookings, daily + total limits,
-- tenant confusion, self-review, payload types, file names).
-- Rolled back; leaves no data. Prints one row 'pass'.
BEGIN;

-- Helpers (temp, gone with the rollback). auth.uid() reads the claims whatever the role is,
-- so every helper ends by clearing the claims AND resetting the role.
CREATE FUNCTION pg_temp.clear() RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $f$;

CREATE FUNCTION pg_temp.act(uid uuid) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN uid IS NULL THEN '' ELSE json_build_object('sub', uid, 'role', 'authenticated')::text END, true);
  PERFORM set_config('request.jwt.claim.sub', COALESCE(uid::text, ''), true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $f$;

CREATE FUNCTION pg_temp.imp(uid uuid, rows jsonb, fname text DEFAULT 'x.csv') RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE r jsonb;
BEGIN
  PERFORM pg_temp.act(uid);
  r := public.import_patients(rows, fname);
  PERFORM pg_temp.clear();
  RETURN r;
END $f$;

-- 'NO_ERROR' or 'SQLSTATE:message'
CREATE FUNCTION pg_temp.imp_err(uid uuid, rows jsonb) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN
    PERFORM pg_temp.act(uid);
    PERFORM public.import_patients(rows, 'e.csv');
    PERFORM pg_temp.clear();
    RETURN 'NO_ERROR';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.clear();
    RETURN SQLSTATE || ':' || SQLERRM;
  END;
END $f$;

-- A direct insert as a user (the Add Patient form); 'OK' or the error message.
CREATE FUNCTION pg_temp.direct(uid uuid, doc uuid, nm text, ph text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN
    PERFORM pg_temp.act(uid);
    INSERT INTO public.patients (doctor_id, name, phone, age, gender) VALUES (doc, nm, ph, 30, 'male');
    PERFORM pg_temp.clear();
    RETURN 'OK';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.clear();
    RETURN SQLERRM;
  END;
END $f$;

CREATE FUNCTION pg_temp.mk(nm text, ph text) RETURNS jsonb LANGUAGE sql AS $f$
  SELECT jsonb_build_object('name', nm, 'phone', ph, 'age', 30, 'gender', 'male')
$f$;

CREATE FUNCTION pg_temp.mkdoc(tier text, st text) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE u uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  VALUES (u, 'authenticated', 'authenticated', u::text || '@example.test', '{}'::jsonb);
  EXECUTE format('UPDATE public.profiles SET plan_tier=%L, plan_status=%L WHERE id=%L', tier, st, u);
  RETURN u;
END $f$;

-- A booking as a user; 'OK' or the error message.
CREATE FUNCTION pg_temp.book(uid uuid, doc uuid, nm text, ph text, d integer) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN
    PERFORM pg_temp.act(uid);
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, patient_age, patient_gender, service_name, date, time_slot, status)
    VALUES (doc, nm, ph, 30, 'male', 'Consultation', current_date + d, '10:00', 'pending');
    PERFORM pg_temp.clear();
    RETURN 'OK';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.clear();
    RETURN SQLERRM;
  END;
END $f$;

CREATE FUNCTION pg_temp.review(uid uuid, req uuid, decision text, cap integer DEFAULT NULL, note text DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN
    PERFORM pg_temp.act(uid);
    PERFORM public.review_patient_import_request(req, decision, cap, note);
    PERFORM pg_temp.clear();
    RETURN 'NO_ERROR';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.clear();
    RETURN SQLSTATE || ':' || SQLERRM;
  END;
END $f$;

CREATE FUNCTION pg_temp.ovr(uid uuid, doc uuid, mode text, reason text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN
    PERFORM pg_temp.act(uid);
    PERFORM public.set_patient_import_override(doc, mode, NULL, reason);
    PERFORM pg_temp.clear();
    RETURN 'NO_ERROR';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.clear();
    RETURN SQLSTATE || ':' || SQLERRM;
  END;
END $f$;

DO $$
DECLARE
  d_t uuid := pg_temp.mkdoc('free', 'trial');   -- trial: cannot import at all
  d_a uuid := pg_temp.mkdoc('pro', 'active');
  d_b uuid := pg_temp.mkdoc('pro', 'active');   -- the victim
  d_c uuid := pg_temp.mkdoc('pro', 'active');
  d_p uuid := pg_temp.mkdoc('pro', 'active');
  d_pay uuid := pg_temp.mkdoc('pro', 'active');
  d_day uuid := pg_temp.mkdoc('pro', 'active');
  d_big uuid := pg_temp.mkdoc('pro', 'active');
  d_dir uuid := pg_temp.mkdoc('pro', 'active');
  d_ok uuid := pg_temp.mkdoc('pro', 'active');
  d_own uuid := pg_temp.mkdoc('pro', 'active');  -- owner who also has a clinic
  d_tm uuid := pg_temp.mkdoc('pro', 'active');   -- team member who also has a clinic
  s_t uuid := gen_random_uuid();
  s_a uuid := gen_random_uuid();
  other_owner uuid := gen_random_uuid();
  r jsonb;
  t text;
  n integer;
  i integer;
  bk integer;
  req uuid;
  v_n integer;
  v_dn integer;
  a_n integer; a_dn integer; a_bk integer;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"account_type":"staff"}'::jsonb FROM unnest(ARRAY[s_t, s_a]) AS u;
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  VALUES (other_owner, 'authenticated', 'authenticated', other_owner::text || '@example.test', '{}'::jsonb);
  DELETE FROM public.profiles WHERE id = other_owner;
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status) VALUES
    (s_t, d_t, 'Staff T', 't-' || s_t, '+1555' || lpad((floor(random()*1e7))::int::text, 7, '0'), '{"appointments.create": true}'::jsonb, d_t, 'active'),
    -- staff WITHOUT patients.add: the booking path must still count them
    (s_a, d_a, 'Staff A', 'a-' || s_a, '+1556' || lpad((floor(random()*1e7))::int::text, 7, '0'), '{"appointments.create": true}'::jsonb, d_a, 'active');
  UPDATE public.platform_settings SET value = '1000'::jsonb WHERE key = 'patient_import_max_per_day';

  -------------------------------------------------------------------------
  -- 1. Bookings can no longer create unlimited patients
  -------------------------------------------------------------------------
  -- Real volume is untouched: 25 bookings by an ineligible (trial) clinic at the default limit
  FOR i IN 1..25 LOOP
    t := pg_temp.book(d_t, d_t, 'Real Person ' || i, '93000000' || lpad(i::text, 2, '0'), 3 + i);
    IF t <> 'OK' THEN RAISE EXCEPTION 'normal-volume booking % refused: %', i, t; END IF;
  END LOOP;
  SELECT count(*) INTO n FROM public.patients WHERE doctor_id = d_t AND auto_created;
  IF n <> 25 THEN RAISE EXCEPTION 'bookings should have created 25 patients, got %', n; END IF;
  SELECT k.bk_n INTO bk FROM public.patient_insert_counters k WHERE k.doctor_id = d_t;
  IF bk <> 25 THEN RAISE EXCEPTION 'booking counter should be 25, is %', bk; END IF;
  SELECT k.n INTO n FROM public.patient_insert_counters k WHERE k.doctor_id = d_t;
  IF n <> 0 THEN RAISE EXCEPTION 'bookings must not touch the direct (hourly) counter, is %', n; END IF;

  -- The loop: with the daily booking limit at 28 the API loop is cut off after 3 more
  UPDATE public.platform_settings SET value = '28'::jsonb WHERE key = 'patient_clinic_booking_inserts_per_day';
  FOR i IN 26..28 LOOP
    t := pg_temp.book(d_t, d_t, 'Loop Person ' || i, '93000000' || lpad(i::text, 2, '0'), 3 + i);
    IF t <> 'OK' THEN RAISE EXCEPTION 'booking % should still pass, got %', i, t; END IF;
  END LOOP;
  t := pg_temp.book(d_t, d_t, 'Loop Person 29', '9300000029', 40);
  IF t <> 'PATIENT_RATE_LIMIT' THEN RAISE EXCEPTION 'booking 29 must be refused with PATIENT_RATE_LIMIT, got %', t; END IF;
  SELECT count(*) INTO n FROM public.patients WHERE doctor_id = d_t;
  IF n <> 28 THEN RAISE EXCEPTION 'the refused booking left a patient (have %)', n; END IF;
  IF EXISTS (SELECT 1 FROM public.appointments WHERE doctor_id = d_t AND patient_name = 'Loop Person 29') THEN
    RAISE EXCEPTION 'the refused booking left an appointment';
  END IF;
  UPDATE public.platform_settings SET value = '1500'::jsonb WHERE key = 'patient_clinic_booking_inserts_per_day';
  -- the day window: 25 hours later it starts again at 1
  UPDATE public.patient_insert_counters SET bk_start = now() - interval '25 hours' WHERE doctor_id = d_t;
  t := pg_temp.book(d_t, d_t, 'Next Day Person', '9300000030', 41);
  IF t <> 'OK' THEN RAISE EXCEPTION 'a new day must reset the booking counter, got %', t; END IF;
  SELECT k.bk_n INTO bk FROM public.patient_insert_counters k WHERE k.doctor_id = d_t;
  IF bk <> 1 THEN RAISE EXCEPTION 'booking counter should restart at 1, is %', bk; END IF;

  -- Staff bookings really succeed (here without patients.add), and are counted for the clinic
  t := pg_temp.book(s_t, d_t, 'Staff Booked T', '9300000031', 42);
  IF t <> 'OK' THEN RAISE EXCEPTION 'staff booking must succeed, got %', t; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE doctor_id = d_t AND name = 'Staff Booked T' AND auto_created) THEN
    RAISE EXCEPTION 'staff booking must create the patient';
  END IF;
  SELECT k.bk_n INTO bk FROM public.patient_insert_counters k WHERE k.doctor_id = d_t;
  IF bk <> 2 THEN RAISE EXCEPTION 'a staff booking counts against the clinic''s booking counter, is %', bk; END IF;
  t := pg_temp.book(s_a, d_a, 'Staff Booked A', '9300000032', 3);
  IF t <> 'OK' THEN RAISE EXCEPTION 'staff booking (no patients.add) must succeed, got %', t; END IF;
  SELECT k.bk_n INTO bk FROM public.patient_insert_counters k WHERE k.doctor_id = d_a;
  IF bk <> 1 THEN RAISE EXCEPTION 'staff without patients.add must still be counted, is %', bk; END IF;
  UPDATE public.platform_settings SET value = '1'::jsonb WHERE key = 'patient_clinic_booking_inserts_per_day';
  t := pg_temp.book(s_a, d_a, 'Staff Booked A2', '9300000033', 4);
  IF t <> 'PATIENT_RATE_LIMIT' THEN RAISE EXCEPTION 'staff booking over the limit must be refused, got %', t; END IF;
  UPDATE public.platform_settings SET value = '1500'::jsonb WHERE key = 'patient_clinic_booking_inserts_per_day';

  -- A booking that matches an existing patient creates none, so it is not counted
  SELECT k.bk_n INTO bk FROM public.patient_insert_counters k WHERE k.doctor_id = d_t;
  t := pg_temp.book(d_t, d_t, 'Real Person 1', '9300000001', 60);
  IF t <> 'OK' THEN RAISE EXCEPTION 'repeat booking refused: %', t; END IF;
  SELECT k.bk_n INTO n FROM public.patient_insert_counters k WHERE k.doctor_id = d_t;
  IF n <> bk THEN RAISE EXCEPTION 'a repeat booking creates no patient and must not be counted'; END IF;

  -- service role / cron / migrations still exempt
  EXECUTE 'SET LOCAL ROLE service_role';
  INSERT INTO public.patients (doctor_id, name, phone, age, gender) VALUES (d_t, 'Service Insert', '9300000099', 30, 'male');
  EXECUTE 'RESET ROLE';
  INSERT INTO public.patients (doctor_id, name, phone, age, gender) VALUES (d_t, 'Postgres Insert', '9300000098', 30, 'male');

  -------------------------------------------------------------------------
  -- 2. Daily limit and total ceiling for direct inserts
  -------------------------------------------------------------------------
  UPDATE public.platform_settings SET value = '3'::jsonb WHERE key = 'patient_direct_insert_per_day';
  FOR i IN 1..3 LOOP
    t := pg_temp.direct(d_dir, d_dir, 'Day ' || i, '9400000' || lpad(i::text, 3, '0'));
    IF t <> 'OK' THEN RAISE EXCEPTION 'daily insert % should pass, got %', i, t; END IF;
  END LOOP;
  t := pg_temp.direct(d_dir, d_dir, 'Day 4', '9400000004');
  IF t <> 'PATIENT_RATE_LIMIT' THEN RAISE EXCEPTION 'the 4th insert of the day must be refused, got %', t; END IF;
  -- after the hourly window has passed, the DAILY limit still holds
  UPDATE public.patient_insert_counters SET window_start = now() - interval '2 hours' WHERE doctor_id = d_dir;
  t := pg_temp.direct(d_dir, d_dir, 'Day 4b', '9400000005');
  IF t <> 'PATIENT_RATE_LIMIT' THEN RAISE EXCEPTION 'a new hour must not reset the DAILY limit, got %', t; END IF;
  SELECT k.day_n INTO v_dn FROM public.patient_insert_counters k WHERE k.doctor_id = d_dir;
  IF v_dn <> 3 THEN RAISE EXCEPTION 'refused inserts must not count (day_n=%)', v_dn; END IF;
  UPDATE public.patient_insert_counters SET day_start = now() - interval '25 hours' WHERE doctor_id = d_dir;
  t := pg_temp.direct(d_dir, d_dir, 'Day Two', '9400000006');
  IF t <> 'OK' THEN RAISE EXCEPTION 'a new day must reset the daily limit, got %', t; END IF;
  SELECT k.day_n INTO v_dn FROM public.patient_insert_counters k WHERE k.doctor_id = d_dir;
  IF v_dn <> 1 THEN RAISE EXCEPTION 'day counter should restart at 1, is %', v_dn; END IF;
  UPDATE public.platform_settings SET value = '300'::jsonb WHERE key = 'patient_direct_insert_per_day';
  -- normal speed is still fine at the defaults (100/h, 300/day)
  FOR i IN 1..30 LOOP
    t := pg_temp.direct(d_ok, d_ok, 'Form ' || i, '9500000' || lpad(i::text, 3, '0'));
    IF t <> 'OK' THEN RAISE EXCEPTION 'normal-speed direct insert % refused: %', i, t; END IF;
  END LOOP;

  -- total ceiling: checked at the first insert of a window
  UPDATE public.platform_settings SET value = '2'::jsonb WHERE key = 'patient_import_cap_ceiling';
  INSERT INTO public.patients (doctor_id, name, phone, age, gender) VALUES
    (d_big, 'Big 1', '9600000001', 30, 'male'), (d_big, 'Big 2', '9600000002', 30, 'male');
  t := pg_temp.direct(d_big, d_big, 'Big 3', '9600000003');
  IF t <> 'PATIENT_TOTAL_LIMIT' THEN RAISE EXCEPTION 'at the ceiling the insert must be refused with PATIENT_TOTAL_LIMIT, got %', t; END IF;
  IF EXISTS (SELECT 1 FROM public.patients WHERE name = 'Big 3') THEN RAISE EXCEPTION 'refused insert left a row'; END IF;
  -- below the ceiling it passes
  INSERT INTO public.patients (doctor_id, name, phone, age, gender) VALUES (d_c, 'C 1', '9600000011', 30, 'male');
  t := pg_temp.direct(d_c, d_c, 'C 2', '9600000012');
  IF t <> 'OK' THEN RAISE EXCEPTION 'below the ceiling the insert should pass, got %', t; END IF;
  -- the ceiling is its own setting, not the clinic's import cap (2000 for pro)
  UPDATE public.platform_settings SET value = '100000'::jsonb WHERE key = 'patient_import_cap_ceiling';
  t := pg_temp.direct(d_big, d_big, 'Big 3', '9600000003');
  IF t <> 'OK' THEN RAISE EXCEPTION 'with the default ceiling the same insert should pass, got %', t; END IF;
  -- imports are not blocked by the direct-insert ceiling (the import cap rules them)
  UPDATE public.platform_settings SET value = '2'::jsonb WHERE key = 'patient_import_cap_ceiling';
  r := pg_temp.imp(d_big, jsonb_build_array(pg_temp.mk('Imported Big', '9600000004')), 'x.csv');
  IF (r->>'inserted')::int <> 1 THEN RAISE EXCEPTION 'import must not hit the direct-insert ceiling: %', r; END IF;
  UPDATE public.platform_settings SET value = '100000'::jsonb WHERE key = 'patient_import_cap_ceiling';

  -------------------------------------------------------------------------
  -- 3. Tenant confusion: naming another clinic touches nothing of theirs
  -------------------------------------------------------------------------
  UPDATE public.platform_settings SET value = '1'::jsonb WHERE key = 'patient_direct_insert_per_hour';
  t := pg_temp.direct(d_b, d_b, 'Victim 1', '9700000001');
  IF t <> 'OK' THEN RAISE EXCEPTION 'victim first insert: %', t; END IF;
  -- the victim is now AT its hourly limit; the oracle would have answered PATIENT_RATE_LIMIT
  SELECT k.n, k.day_n INTO v_n, v_dn FROM public.patient_insert_counters k WHERE k.doctor_id = d_b;
  SELECT k.n, k.day_n, k.bk_n INTO a_n, a_dn, a_bk FROM public.patient_insert_counters k WHERE k.doctor_id = d_a;
  t := pg_temp.direct(d_a, d_b, 'Evil', '9700000002');
  IF t NOT LIKE '%row-level security%' THEN RAISE EXCEPTION 'a cross-tenant insert must fail with the normal RLS error, got %', t; END IF;
  IF EXISTS (SELECT 1 FROM public.patients WHERE name = 'Evil') THEN RAISE EXCEPTION 'cross-tenant insert left a row'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.patient_insert_counters k WHERE k.doctor_id = d_b AND k.n = v_n AND k.day_n = v_dn) THEN
    RAISE EXCEPTION 'the victim counter changed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.patient_insert_counters k WHERE k.doctor_id = d_a AND k.n = a_n AND k.day_n = a_dn AND k.bk_n = a_bk) THEN
    RAISE EXCEPTION 'the attacker counter must not be touched by a cross-tenant attempt';
  END IF;
  -- staff of clinic A naming clinic B: same
  t := pg_temp.direct(s_a, d_b, 'Evil Staff', '9700000003');
  IF t NOT LIKE '%row-level security%' THEN RAISE EXCEPTION 'cross-tenant staff insert must fail with RLS error, got %', t; END IF;
  -- an id that is no clinic at all answers the same way
  t := pg_temp.direct(d_a, gen_random_uuid(), 'Evil 2', '9700000004');
  IF t NOT LIKE '%row-level security%' THEN RAISE EXCEPTION 'unknown clinic id must fail with RLS error, got %', t; END IF;
  UPDATE public.platform_settings SET value = '100'::jsonb WHERE key = 'patient_direct_insert_per_hour';

  -------------------------------------------------------------------------
  -- 4. Nobody reviews their own clinic
  -------------------------------------------------------------------------
  INSERT INTO public.user_roles (user_id, role) VALUES (d_own, 'admin');
  INSERT INTO public.superadmin_team_members (id, name, phone, status, permissions, created_by) VALUES
    (d_tm, 'TM Doc', '+1561' || lpad((floor(random()*1e7))::int::text, 7, '0'), 'active',
     '{"plan_requests.manage": true, "plan_requests.view": true}'::jsonb, d_own);
  INSERT INTO public.user_roles (user_id, role) VALUES (other_owner, 'admin');

  INSERT INTO public.patient_import_requests (doctor_id, requested_cap) VALUES (d_own, 6000) RETURNING id INTO req;
  t := pg_temp.review(d_own, req, 'approve', 6000, 'self');
  IF t NOT LIKE '%You cannot review your own clinic' THEN RAISE EXCEPTION 'owner approving own clinic must be refused, got %', t; END IF;
  t := pg_temp.review(d_own, req, 'reject', NULL, 'self');
  IF t NOT LIKE '%You cannot review your own clinic' THEN RAISE EXCEPTION 'owner rejecting own clinic must be refused, got %', t; END IF;
  IF (SELECT status FROM public.patient_import_requests WHERE id = req) <> 'pending' THEN RAISE EXCEPTION 'own request must stay pending'; END IF;
  t := pg_temp.review(other_owner, req, 'approve', 6000, 'ok');
  IF t <> 'NO_ERROR' THEN RAISE EXCEPTION 'another reviewer must be able to approve, got %', t; END IF;

  INSERT INTO public.patient_import_requests (doctor_id, requested_cap) VALUES (d_tm, 6000) RETURNING id INTO req;
  t := pg_temp.review(d_tm, req, 'approve', 6000, 'self');
  IF t NOT LIKE '%You cannot review your own clinic' THEN RAISE EXCEPTION 'team member approving own clinic must be refused, got %', t; END IF;
  t := pg_temp.review(d_tm, req, 'reject', NULL, 'self');
  IF t NOT LIKE '%You cannot review your own clinic' THEN RAISE EXCEPTION 'team member rejecting own clinic must be refused, got %', t; END IF;

  t := pg_temp.ovr(d_own, d_own, 'allowed', 'self');
  IF t NOT LIKE '%You cannot review your own clinic' THEN RAISE EXCEPTION 'owner overriding own clinic must be refused, got %', t; END IF;
  t := pg_temp.ovr(d_tm, d_tm, 'blocked', 'self');
  IF t NOT LIKE '%You cannot review your own clinic' THEN RAISE EXCEPTION 'team member overriding own clinic must be refused, got %', t; END IF;
  t := pg_temp.ovr(d_tm, d_tm, 'clear', NULL);
  IF t NOT LIKE '%You cannot review your own clinic' THEN RAISE EXCEPTION 'clearing your own override must be refused, got %', t; END IF;
  IF EXISTS (SELECT 1 FROM public.patient_import_overrides WHERE doctor_id IN (d_own, d_tm)) THEN RAISE EXCEPTION 'no self override may exist'; END IF;
  t := pg_temp.ovr(d_tm, d_a, 'allowed', 'support');
  IF t <> 'NO_ERROR' THEN RAISE EXCEPTION 'overriding another clinic still works, got %', t; END IF;

  -------------------------------------------------------------------------
  -- 5a. Payload shapes: never a raw error
  -------------------------------------------------------------------------
  FOR t IN SELECT unnest(ARRAY['{}', '{"a":1}', '"text"', '12', '1.5', 'true', 'false', 'null', '[]']) LOOP
    r := pg_temp.imp(d_p, t::jsonb, 'x.csv');
    IF r->>'error' <> 'PAYLOAD_INVALID' OR (r->>'ok')::boolean IS NOT FALSE THEN
      RAISE EXCEPTION 'payload % must answer PAYLOAD_INVALID, got %', t, r;
    END IF;
  END LOOP;
  t := pg_temp.imp_err(d_p, NULL);
  IF t <> 'NO_ERROR' THEN RAISE EXCEPTION 'a SQL NULL payload must answer PAYLOAD_INVALID, not raise: %', t; END IF;
  r := pg_temp.imp(d_p, NULL, 'x.csv');
  IF r->>'error' <> 'PAYLOAD_INVALID' THEN RAISE EXCEPTION 'SQL NULL payload: %', r; END IF;
  -- an array of non-objects is a row error, not a crash
  r := pg_temp.imp(d_p, '[1, "a", null, true, [], {}]'::jsonb, 'x.csv');
  IF (r->>'ok')::boolean IS NOT TRUE OR (r->>'rejected_count')::int <> 6 THEN RAISE EXCEPTION 'non-object rows: %', r; END IF;

  -------------------------------------------------------------------------
  -- 5b. Cheap daily pre-check comes before row validation
  -------------------------------------------------------------------------
  UPDATE public.platform_settings SET value = '1'::jsonb WHERE key = 'patient_import_max_per_day';
  r := pg_temp.imp(d_day, jsonb_build_array(pg_temp.mk('Day Import', '9800000001')), 'x.csv');
  IF (r->>'inserted')::int <> 1 THEN RAISE EXCEPTION 'first daily import: %', r; END IF;
  r := pg_temp.imp(d_day, jsonb_build_array(pg_temp.mk('Day Import 2', '9800000002')), 'x.csv');
  IF r->>'error' <> 'DAILY_LIMIT' THEN RAISE EXCEPTION 'second import must be DAILY_LIMIT, got %', r; END IF;
  -- a file of nothing but bad rows is refused for the limit first (no validation work is spent)
  r := pg_temp.imp(d_day, '[1,2,3]'::jsonb, 'x.csv');
  IF r->>'error' <> 'DAILY_LIMIT' THEN RAISE EXCEPTION 'over the daily limit the bad file must still be DAILY_LIMIT, got %', r; END IF;
  UPDATE public.platform_settings SET value = '1000'::jsonb WHERE key = 'patient_import_max_per_day';
  UPDATE public.platform_settings SET value = '1'::jsonb WHERE key = 'patient_import_max_rows_per_day';
  r := pg_temp.imp(d_day, jsonb_build_array(pg_temp.mk('Day Import 3', '9800000003')), 'x.csv');
  IF r->>'error' <> 'DAILY_LIMIT' THEN RAISE EXCEPTION 'rows today at the limit must be DAILY_LIMIT, got %', r; END IF;
  UPDATE public.platform_settings SET value = '2'::jsonb WHERE key = 'patient_import_max_rows_per_day';
  -- the exact post-dedupe check still applies: 1 row used, 2 new rows would make 3 > 2
  r := pg_temp.imp(d_day, jsonb_build_array(pg_temp.mk('Day Import 4', '9800000004'), pg_temp.mk('Day Import 5', '9800000005')), 'x.csv');
  IF r->>'error' <> 'DAILY_LIMIT' THEN RAISE EXCEPTION 'exact row check must still refuse, got %', r; END IF;
  r := pg_temp.imp(d_day, jsonb_build_array(pg_temp.mk('Day Import 4', '9800000004')), 'x.csv');
  IF (r->>'inserted')::int <> 1 THEN RAISE EXCEPTION 'one more row fits exactly: %', r; END IF;
  UPDATE public.platform_settings SET value = '2000'::jsonb WHERE key = 'patient_import_max_rows_per_day';

  -------------------------------------------------------------------------
  -- 5c. File name: only the lowercase extension is kept
  -------------------------------------------------------------------------
  r := pg_temp.imp(d_pay, jsonb_build_array(pg_temp.mk('F One', '9900000001')), 'Rahul Sharma diabetic.csv');
  r := pg_temp.imp(d_pay, jsonb_build_array(pg_temp.mk('F Two', '9900000002')), 'PATIENTS.CSV');
  r := pg_temp.imp(d_pay, jsonb_build_array(pg_temp.mk('F Three', '9900000003')), 'noextension');
  r := pg_temp.imp(d_pay, jsonb_build_array(pg_temp.mk('F Four', '9900000004')), NULL);
  r := pg_temp.imp(d_pay, jsonb_build_array(pg_temp.mk('F Five', '9900000005')), 'a.b.XLSX');
  r := pg_temp.imp(d_pay, jsonb_build_array(pg_temp.mk('F Six', '9900000006')), 'trailing.');
  r := pg_temp.imp(d_pay, jsonb_build_array(pg_temp.mk('F Seven', '9900000007')), 'Name.verylongextension1');
  r := pg_temp.imp(d_pay, jsonb_build_array(pg_temp.mk('F Eight', '9900000008')), 'Rahul Sharma.csv ');
  SELECT count(*) INTO n FROM public.patient_imports WHERE doctor_id = d_pay;
  IF n <> 8 THEN RAISE EXCEPTION 'expected 8 import rows, got %', n; END IF;
  SELECT count(*) INTO n FROM public.patient_imports WHERE doctor_id = d_pay AND file_name = '.csv';
  IF n <> 3 THEN RAISE EXCEPTION 'expected 3 rows with .csv, got %', n; END IF;
  SELECT count(*) INTO n FROM public.patient_imports WHERE doctor_id = d_pay AND file_name = '.xlsx';
  IF n <> 1 THEN RAISE EXCEPTION 'expected 1 row with .xlsx, got %', n; END IF;
  SELECT count(*) INTO n FROM public.patient_imports WHERE doctor_id = d_pay AND file_name IS NULL;
  IF n <> 4 THEN RAISE EXCEPTION 'expected 4 rows with NULL file name, got %', n; END IF;
  IF EXISTS (SELECT 1 FROM public.patient_imports WHERE doctor_id = d_pay AND file_name ILIKE '%rahul%') THEN
    RAISE EXCEPTION 'a patient name leaked into the import log';
  END IF;

  -------------------------------------------------------------------------
  -- Client access to the counter table is still closed
  -------------------------------------------------------------------------
  PERFORM pg_temp.act(d_a);
  BEGIN
    PERFORM count(*) FROM public.patient_insert_counters;
    RAISE EXCEPTION 'authenticated must not read patient_insert_counters';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.clear();
END $$;
SELECT 'pass' AS result;
ROLLBACK;
