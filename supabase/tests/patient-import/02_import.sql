-- Patient import limits, part 2 check (import_patients, row validator, direct-insert guard).
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

-- Import as a user; returns the jsonb answer (raises if the function raises).
CREATE FUNCTION pg_temp.imp(uid uuid, rows jsonb, fname text DEFAULT 'x.csv') RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE r jsonb;
BEGIN
  PERFORM pg_temp.act(uid);
  r := public.import_patients(rows, fname);
  PERFORM pg_temp.clear();
  RETURN r;
END $f$;

-- Import as a user; returns 'SQLSTATE:message' of the failure, or 'NO_ERROR'.
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

-- A direct insert as a user (the Add Patient form); returns 'OK' or the error message.
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

CREATE FUNCTION pg_temp.mk(nm text, ph text, extra jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $f$
  SELECT jsonb_build_object('name', nm, 'phone', ph, 'age', 30, 'gender', 'male') || extra
$f$;

CREATE FUNCTION pg_temp.rowerr(r jsonb) RETURNS text LANGUAGE sql AS $f$
  SELECT COALESCE(public.patient_import_row_error(r), 'OK')
$f$;

DO $$
DECLARE
  d_pro uuid := gen_random_uuid();
  d_other uuid := gen_random_uuid();
  d_trial uuid := gen_random_uuid();
  d_big uuid := gen_random_uuid();
  d_day uuid := gen_random_uuid();
  d_cap uuid := gen_random_uuid();
  s_ok uuid := gen_random_uuid();
  s_no uuid := gen_random_uuid();
  nobody uuid := gen_random_uuid();
  r jsonb;
  n integer;
  cnt integer;
  t text;
  c record;
  b jsonb := pg_temp.mk('Test One', '9000000001');
  ist_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  three jsonb := jsonb_build_array(
    jsonb_build_object('name', 'Test One',   'phone', '9000000001', 'age', 30, 'gender', 'male'),
    jsonb_build_object('name', 'Test Two',   'phone', '9000000002', 'age', 31, 'gender', 'female', 'patient_since', '2019-03-15', 'first_visit', '2019-03-15', 'last_visit', '2025-09-02', 'total_visits', 14,
                       'email', 'two@example.test', 'weight', 62.5, 'notes', 'allergic to penicillin'),
    jsonb_build_object('name', 'Test Three', 'phone', '9000000003', 'age', 0,  'gender', 'other', 'weight', 6.8));
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{}'::jsonb
  FROM unnest(ARRAY[d_pro, d_other, d_trial, d_big, d_day, d_cap, nobody]) AS u;
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"account_type":"staff"}'::jsonb FROM unnest(ARRAY[s_ok, s_no]) AS u;
  -- `nobody` got a profile from the signup trigger; make it a user with no clinic rights at all
  DELETE FROM public.profiles WHERE id = nobody;
  EXECUTE format('UPDATE public.profiles SET plan_tier=%L, plan_status=%L WHERE id IN (%L, %L, %L)', 'pro', 'active', d_pro, d_other, d_day);
  EXECUTE format('UPDATE public.profiles SET plan_tier=%L, plan_status=%L WHERE id = %L', 'pro', 'active', d_cap);
  EXECUTE format('UPDATE public.profiles SET plan_tier=%L, plan_status=%L WHERE id = %L', 'premium', 'active', d_big);
  EXECUTE format('UPDATE public.profiles SET plan_tier=%L, plan_status=%L WHERE id = %L', 'free', 'trial', d_trial);
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status)
  VALUES (s_ok, d_pro, 'Staff Ok', 'ok-' || s_ok, '+1555' || lpad((floor(random()*1e7))::int::text, 7, '0'), '{"patients.add": true, "appointments.create": true}'::jsonb, d_pro, 'active'),
         (s_no, d_pro, 'Staff No', 'no-' || s_no, '+1556' || lpad((floor(random()*1e7))::int::text, 7, '0'), '{"patients.view": true}'::jsonb, d_pro, 'active');
  -- plenty of imports per day for the main flow; the daily limit is tested on its own clinic
  UPDATE public.platform_settings SET value = '1000'::jsonb WHERE key = 'patient_import_max_per_day';

  -------------------------------------------------------------------------
  -- Who may call it
  -------------------------------------------------------------------------
  r := pg_temp.imp(d_trial, three, 'x.csv');
  IF r->>'error' <> 'NOT_ELIGIBLE' OR (r->>'ok')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'trial should get NOT_ELIGIBLE, got %', r; END IF;
  IF EXISTS (SELECT 1 FROM public.patients WHERE doctor_id = d_trial) OR EXISTS (SELECT 1 FROM public.patient_imports WHERE doctor_id = d_trial) THEN
    RAISE EXCEPTION 'a refused import must write nothing and log nothing';
  END IF;

  t := pg_temp.imp_err(NULL, three);
  IF t <> 'P0001:NOT_ALLOWED' AND t <> '42501:NOT_ALLOWED' THEN RAISE EXCEPTION 'no JWT should raise NOT_ALLOWED, got %', t; END IF;
  t := pg_temp.imp_err(nobody, three);
  IF t NOT LIKE '%:NOT_ALLOWED' THEN RAISE EXCEPTION 'a user with no clinic should raise NOT_ALLOWED, got %', t; END IF;
  t := pg_temp.imp_err(s_no, three);
  IF t NOT LIKE '%:NOT_ALLOWED' THEN RAISE EXCEPTION 'staff without patients.add should raise NOT_ALLOWED, got %', t; END IF;

  -- anon cannot execute it at all; neither helper is callable by clients
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM public.import_patients(three, 'x.csv');
    RAISE EXCEPTION 'anon must not execute import_patients';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.act(d_pro);
  BEGIN
    PERFORM public.patient_import_row_error(b);
    RAISE EXCEPTION 'authenticated must not execute patient_import_row_error';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.clear();
  PERFORM pg_temp.act(d_pro);
  BEGIN
    PERFORM public.guard_patient_direct_inserts();
    RAISE EXCEPTION 'authenticated must not execute guard_patient_direct_inserts';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.clear();

  -------------------------------------------------------------------------
  -- The happy path, and that it is logged
  -------------------------------------------------------------------------
  r := pg_temp.imp(d_pro, three, 'demo.csv');
  IF (r->>'ok')::boolean IS NOT TRUE OR (r->>'inserted')::int <> 3 OR (r->>'duplicates')::int <> 0
     OR (r->>'rejected_count')::int <> 0 OR r->'rejected' <> '[]'::jsonb THEN
    RAISE EXCEPTION 'expected 3 inserted, got %', r;
  END IF;
  SELECT count(*) INTO n FROM public.patients WHERE doctor_id = d_pro AND NOT auto_created;
  IF n <> 3 THEN RAISE EXCEPTION 'expected 3 patient rows, found %', n; END IF;
  SELECT count(*) INTO n FROM public.patients WHERE doctor_id = d_pro AND name = 'Test Two'
     AND patient_since = DATE '2019-03-15' AND first_visit = DATE '2019-03-15' AND last_visit = DATE '2025-09-02' AND total_visits = 14
     AND email = 'two@example.test' AND weight = 62.5 AND notes = 'allergic to penicillin' AND age = 31 AND gender = 'female';
  IF n <> 1 THEN RAISE EXCEPTION 'history/email/weight/notes columns were not stored'; END IF;
  SELECT count(*) INTO n FROM public.patients WHERE doctor_id = d_pro AND name = 'Test Three' AND age = 0 AND weight = 6.8 AND gender = 'other' AND total_visits = 0 AND email IS NULL AND notes IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'Test Three (age 0, infant weight) not stored right'; END IF;
  SELECT count(*) INTO n FROM public.patient_imports WHERE doctor_id = d_pro AND user_id = d_pro AND rows_received = 3
     AND rows_inserted = 3 AND rows_duplicate = 0 AND rows_rejected = 0 AND file_name = '.csv';
  IF n <> 1 THEN RAISE EXCEPTION 'import log row missing or wrong'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid()) THEN
    RAISE EXCEPTION 'the per-clinic advisory lock was not taken';
  END IF;
  -- the flag is reset after the call
  IF COALESCE(current_setting('app.patient_import', true), 'off') <> 'off' THEN RAISE EXCEPTION 'app.patient_import leaked: %', current_setting('app.patient_import', true); END IF;

  -- the same file again: everything is a duplicate, nothing new, still logged
  r := pg_temp.imp(d_pro, three, 'demo.csv');
  IF (r->>'inserted')::int <> 0 OR (r->>'duplicates')::int <> 3 THEN RAISE EXCEPTION 'expected 3 duplicates, got %', r; END IF;
  SELECT count(*) INTO n FROM public.patients WHERE doctor_id = d_pro;
  IF n <> 3 THEN RAISE EXCEPTION 'a duplicate import must not add rows (have %)', n; END IF;

  -- file name: optional, cut at 200
  r := pg_temp.imp(d_pro, jsonb_build_array(pg_temp.mk('Name Null File', '9000000090')), NULL);
  IF (r->>'inserted')::int <> 1 THEN RAISE EXCEPTION 'null file name must work: %', r; END IF;
  r := pg_temp.imp(d_pro, jsonb_build_array(pg_temp.mk('Name Long File', '9000000091')), repeat('f', 300));
  -- (changed in the hardening migration: only the lowercase extension is stored, never the free text)
  IF EXISTS (SELECT 1 FROM public.patient_imports WHERE doctor_id = d_pro AND length(file_name) > 11) THEN RAISE EXCEPTION 'only the extension may be stored'; END IF;
  IF EXISTS (SELECT 1 FROM public.patient_imports WHERE doctor_id = d_pro AND file_name LIKE '%demo%') THEN RAISE EXCEPTION 'file name text must not be stored'; END IF;

  -------------------------------------------------------------------------
  -- Row validator, one case per rule (called as postgres)
  -------------------------------------------------------------------------
  FOR c IN SELECT * FROM (VALUES
    ('base ok', b, 'OK'),
    -- rows that are not objects
    ('JSON null element', 'null'::jsonb, 'ROW_INVALID'),
    ('string row', '"Test One"'::jsonb, 'ROW_INVALID'),
    ('array row', '["Test One","9000000001"]'::jsonb, 'ROW_INVALID'),
    ('empty array row', '[]'::jsonb, 'ROW_INVALID'),
    ('number row', '5'::jsonb, 'ROW_INVALID'),
    ('bool row', 'true'::jsonb, 'ROW_INVALID'),
    ('empty object', '{}'::jsonb, 'NAME'),
    -- name
    ('name spaces only', b || '{"name":"     "}', 'NAME'),
    ('name 1 char', b || '{"name":"A"}', 'NAME'),
    ('name 1 char padded', b || '{"name":"  A  "}', 'NAME'),
    ('name 2 chars', b || '{"name":"AB"}', 'OK'),
    ('name 2 devanagari', b || '{"name":"अब"}', 'OK'),
    ('name 2 emoji', b || '{"name":"😀😀"}', 'OK'),
    ('name unicode accents', b || '{"name":"José Müller-Ñandú"}', 'OK'),
    ('name 100 chars', b || jsonb_build_object('name', repeat('a', 100)), 'OK'),
    ('name 100 chars + padding', b || jsonb_build_object('name', repeat('a', 100) || '     '), 'OK'),
    ('name 101 chars', b || jsonb_build_object('name', repeat('a', 101)), 'NAME'),
    ('name number', b || '{"name":12}', 'NAME'),
    ('name object', b || '{"name":{"a":1}}', 'NAME'),
    ('name array', b || '{"name":["Test"]}', 'NAME'),
    ('name null', b || '{"name":null}', 'NAME'),
    ('name missing', b - 'name', 'NAME'),
    ('name sql text', b || jsonb_build_object('name', 'Robert''); DROP TABLE patients;--'), 'OK'),
    -- phone (the browser sends the normalised 10 digits as a string)
    ('phone 6xxx', b || '{"phone":"6000000001"}', 'OK'),
    ('phone number type', b || '{"phone":9000000001}', 'OK'),
    ('phone +91', b || '{"phone":"+919000000001"}', 'PHONE'),
    ('phone 91 prefix 12 digits', b || '{"phone":"919000000001"}', 'PHONE'),
    ('phone with space', b || '{"phone":"90000 00001"}', 'PHONE'),
    ('phone padded', b || '{"phone":" 9000000001"}', 'PHONE'),
    ('phone starts 5', b || '{"phone":"5000000001"}', 'PHONE'),
    ('phone 9 digits', b || '{"phone":"900000000"}', 'PHONE'),
    ('phone 11 digits', b || '{"phone":"90000000012"}', 'PHONE'),
    ('phone newline tail', b || jsonb_build_object('phone', E'9000000001\n'), 'PHONE'),
    ('phone null', b || '{"phone":null}', 'PHONE'),
    ('phone missing', b - 'phone', 'PHONE'),
    ('phone bool', b || '{"phone":true}', 'PHONE'),
    ('phone array', b || '{"phone":["9000000001"]}', 'PHONE'),
    ('phone float', b || '{"phone":9000000001.5}', 'PHONE'),
    -- age
    ('age 0', b || '{"age":0}', 'OK'),
    ('age string', b || '{"age":"30"}', 'OK'),
    ('age 120', b || '{"age":120}', 'OK'),
    ('age 121', b || '{"age":121}', 'AGE'),
    ('age string 121', b || '{"age":"121"}', 'AGE'),
    ('age 999', b || '{"age":999}', 'AGE'),
    ('age 1000', b || '{"age":1000}', 'AGE'),
    ('age negative', b || '{"age":-1}', 'AGE'),
    ('age decimal', b || '{"age":30.5}', 'AGE'),
    ('age empty', b || '{"age":""}', 'AGE'),
    ('age null', b || '{"age":null}', 'AGE'),
    ('age missing', b - 'age', 'AGE'),
    ('age text', b || '{"age":"abc"}', 'AGE'),
    ('age exponent', b || '{"age":"1e2"}', 'AGE'),
    ('age bool', b || '{"age":true}', 'AGE'),
    ('age array', b || '{"age":[30]}', 'AGE'),
    -- gender
    ('gender female', b || '{"gender":"female"}', 'OK'),
    ('gender other', b || '{"gender":"other"}', 'OK'),
    ('gender capital', b || '{"gender":"Male"}', 'GENDER'),
    ('gender m', b || '{"gender":"m"}', 'GENDER'),
    ('gender empty', b || '{"gender":""}', 'GENDER'),
    ('gender null', b || '{"gender":null}', 'GENDER'),
    ('gender missing', b - 'gender', 'GENDER'),
    ('gender array', b || '{"gender":["male"]}', 'GENDER'),
    -- weight
    ('weight absent', b, 'OK'),
    ('weight null', b || '{"weight":null}', 'OK'),
    ('weight 0.4', b || '{"weight":0.4}', 'WEIGHT'),
    ('weight 0.5', b || '{"weight":0.5}', 'OK'),
    ('weight 0', b || '{"weight":0}', 'WEIGHT'),
    ('weight 500', b || '{"weight":500}', 'OK'),
    ('weight 500.1', b || '{"weight":500.1}', 'WEIGHT'),
    ('weight 1000', b || '{"weight":1000}', 'WEIGHT'),
    ('weight string 62.5', b || '{"weight":"62.5"}', 'OK'),
    ('weight string 62.55', b || '{"weight":"62.55"}', 'WEIGHT'),
    ('weight number 62.55', b || '{"weight":62.55}', 'WEIGHT'),
    ('weight negative', b || '{"weight":-5}', 'WEIGHT'),
    ('weight empty string', b || '{"weight":""}', 'WEIGHT'),
    ('weight text', b || '{"weight":"abc"}', 'WEIGHT'),
    ('weight bool', b || '{"weight":true}', 'WEIGHT'),
    ('weight array', b || '{"weight":[60]}', 'WEIGHT'),
    -- email
    ('email absent', b, 'OK'),
    ('email null', b || '{"email":null}', 'OK'),
    ('email empty', b || '{"email":""}', 'OK'),
    ('email blank', b || '{"email":"   "}', 'OK'),
    ('email good', b || '{"email":"a@b.co"}', 'OK'),
    ('email padded', b || '{"email":" a@b.co "}', 'OK'),
    ('email inner space', b || '{"email":"a b@c.com"}', 'EMAIL'),
    ('email no tld', b || '{"email":"a@b"}', 'EMAIL'),
    ('email 1-char tld', b || '{"email":"a@b.c"}', 'EMAIL'),
    ('email no at', b || '{"email":"abc.com"}', 'EMAIL'),
    ('email 254 chars', b || jsonb_build_object('email', repeat('a', 241) || '@example.test'), 'OK'),
    ('email 255 chars', b || jsonb_build_object('email', repeat('a', 242) || '@example.test'), 'EMAIL'),
    ('email number', b || '{"email":5}', 'EMAIL'),
    ('email object', b || '{"email":{"a":"b@c.de"}}', 'EMAIL'),
    -- notes
    ('notes null', b || '{"notes":null}', 'OK'),
    ('notes 2000', b || jsonb_build_object('notes', repeat('n', 2000)), 'OK'),
    ('notes 2001', b || jsonb_build_object('notes', repeat('n', 2001)), 'NOTES'),
    ('notes number', b || '{"notes":5}', 'NOTES'),
    ('notes object', b || '{"notes":{"a":1}}', 'NOTES'),
    ('notes sql text', b || jsonb_build_object('notes', '''; DELETE FROM patients; --'), 'OK'),
    -- dates
    ('date ok', b || '{"first_visit":"2020-01-05"}', 'OK'),
    ('date null', b || '{"first_visit":null,"last_visit":null,"patient_since":null}', 'OK'),
    ('date empty string = absent', b || '{"first_visit":""}', 'OK'),
    ('date 2020-02-30', b || '{"first_visit":"2020-02-30"}', 'DATE'),
    ('date leap day', b || '{"first_visit":"2020-02-29"}', 'OK'),
    ('date non-leap 29 Feb', b || '{"first_visit":"2021-02-29"}', 'DATE'),
    ('date 2020-1-5', b || '{"first_visit":"2020-1-5"}', 'DATE'),
    ('date dd/mm/yyyy', b || '{"first_visit":"05/01/2020"}', 'DATE'),
    ('date with time', b || '{"first_visit":"2020-01-05 10:00"}', 'DATE'),
    ('date word', b || '{"first_visit":"today"}', 'DATE'),
    ('date infinity', b || '{"first_visit":"infinity"}', 'DATE'),
    ('date number', b || '{"first_visit":20200105}', 'DATE'),
    ('date future', b || '{"last_visit":"2999-01-01"}', 'DATE'),
    ('date IST today', b || jsonb_build_object('last_visit', ist_today), 'OK'),
    ('date IST tomorrow', b || jsonb_build_object('last_visit', ist_today + 1), 'DATE'),
    ('date 1899', b || '{"patient_since":"1899-12-31"}', 'DATE'),
    ('date 1900', b || '{"patient_since":"1900-01-01"}', 'OK'),
    ('date bad since', b || '{"patient_since":"nope"}', 'DATE'),
    ('date last < first', b || '{"first_visit":"2022-05-10","last_visit":"2022-05-01"}', 'DATE_ORDER'),
    ('date last = first', b || '{"first_visit":"2022-05-10","last_visit":"2022-05-10"}', 'OK'),
    ('date since > first', b || '{"patient_since":"2022-05-11","first_visit":"2022-05-10"}', 'DATE_ORDER'),
    ('date since only + last', b || '{"patient_since":"2022-05-11","last_visit":"2022-05-01"}', 'OK'),
    -- total visits
    ('visits null', b || '{"total_visits":null}', 'OK'),
    ('visits empty', b || '{"total_visits":""}', 'OK'),
    ('visits 0', b || '{"total_visits":0}', 'OK'),
    ('visits string', b || '{"total_visits":"10"}', 'OK'),
    ('visits 10000', b || '{"total_visits":10000}', 'OK'),
    ('visits 10001', b || '{"total_visits":10001}', 'VISITS'),
    ('visits string 10001', b || '{"total_visits":"10001"}', 'VISITS'),
    ('visits 99999', b || '{"total_visits":99999}', 'VISITS'),
    ('visits 100000', b || '{"total_visits":100000}', 'VISITS'),
    ('visits negative', b || '{"total_visits":-1}', 'VISITS'),
    ('visits decimal', b || '{"total_visits":1.5}', 'VISITS'),
    ('visits text', b || '{"total_visits":"x"}', 'VISITS'),
    ('visits bool', b || '{"total_visits":true}', 'VISITS'),
    -- unknown keys are ignored
    ('extra keys ignored', b || '{"doctor_id":"00000000-0000-0000-0000-000000000000","auto_created":true,"id":"x","foo":[1]}', 'OK')
  ) AS v(label, j, want) LOOP
    t := pg_temp.rowerr(c.j);
    IF t <> c.want THEN RAISE EXCEPTION 'row validator case "%": expected %, got %  (row %)', c.label, c.want, t, left(c.j::text, 120); END IF;
  END LOOP;

  -------------------------------------------------------------------------
  -- Mixed payloads
  -------------------------------------------------------------------------
  r := pg_temp.imp(d_pro, jsonb_build_array(
    pg_temp.mk('Good Four', '9000000004'),
    pg_temp.mk('Bad Phone', '12345'),
    pg_temp.mk('Future', '9000000005', '{"first_visit":"2999-01-01"}'),
    pg_temp.mk('Backwards', '9000000006', '{"first_visit":"2022-05-10","last_visit":"2022-05-01"}'),
    pg_temp.mk('good four', '9000000004'),
    'null'::jsonb,
    '"just a string"'::jsonb,
    '[1,2]'::jsonb), 'mix.csv');
  IF (r->>'inserted')::int <> 1 OR (r->>'duplicates')::int <> 1 OR (r->>'rejected_count')::int <> 6 THEN
    RAISE EXCEPTION 'unexpected mixed result: %', r;
  END IF;
  IF r->'rejected' <> '[{"index":2,"error":"PHONE"},{"index":3,"error":"DATE"},{"index":4,"error":"DATE_ORDER"},{"index":6,"error":"ROW_INVALID"},{"index":7,"error":"ROW_INVALID"},{"index":8,"error":"ROW_INVALID"}]'::jsonb THEN
    RAISE EXCEPTION 'rejected list wrong (indexes are 1-based, in order): %', r->'rejected';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.patient_imports WHERE doctor_id = d_pro AND file_name = '.csv' AND rows_received = 8 AND rows_inserted = 1 AND rows_duplicate = 1 AND rows_rejected = 6) THEN
    RAISE EXCEPTION 'mixed import log row wrong';
  END IF;

  -- everything invalid: nothing inserted, still a clean answer
  r := pg_temp.imp(d_pro, jsonb_build_array('null'::jsonb, pg_temp.mk('X', '9000000007')), 'allbad.csv');
  IF (r->>'ok')::boolean IS NOT TRUE OR (r->>'inserted')::int <> 0 OR (r->>'rejected_count')::int <> 2 THEN RAISE EXCEPTION 'all-bad import wrong: %', r; END IF;

  -- more than 100 bad rows: the list is cut to 100, the count is not
  r := pg_temp.imp(d_pro, (SELECT jsonb_agg(pg_temp.mk('Bad ' || g, '123')) FROM generate_series(1, 150) g), 'bad150.csv');
  IF (r->>'rejected_count')::int <> 150 OR jsonb_array_length(r->'rejected') <> 100 OR r->'rejected'->99->>'index' <> '100' THEN
    RAISE EXCEPTION 'rejected list must hold the first 100 of 150: %', r;
  END IF;

  -- payload shapes that are not a non-empty array within the row limit
  FOREACH t IN ARRAY ARRAY['{}', '"x"', '5', 'null', '[]', 'true'] LOOP
    r := pg_temp.imp(d_pro, t::jsonb);
    IF r->>'error' <> 'PAYLOAD_INVALID' OR (r->>'max_rows')::int <> 1000 THEN RAISE EXCEPTION 'payload % should be PAYLOAD_INVALID, got %', t, r; END IF;
  END LOOP;
  r := pg_temp.imp(d_pro, NULL);
  IF r->>'error' <> 'PAYLOAD_INVALID' THEN RAISE EXCEPTION 'SQL NULL payload should be PAYLOAD_INVALID, got %', r; END IF;
  r := pg_temp.imp(d_pro, (SELECT jsonb_agg(pg_temp.mk('Bulk ' || g, '8' || lpad(g::text, 9, '0'))) FROM generate_series(1, 1001) g), 'big.csv');
  IF r->>'error' <> 'PAYLOAD_INVALID' THEN RAISE EXCEPTION '1001 rows should be PAYLOAD_INVALID, got %', r; END IF;
  -- a payload just over 2 MB (1000 valid rows with long names and notes)
  r := pg_temp.imp(d_pro, (SELECT jsonb_agg(pg_temp.mk(repeat('N', 95) || lpad(g::text, 4, '0'), '8' || lpad(g::text, 9, '0'), jsonb_build_object('notes', repeat('n', 2000)))) FROM generate_series(1, 1000) g), 'huge.csv');
  IF r->>'error' <> 'PAYLOAD_INVALID' THEN RAISE EXCEPTION 'a payload over 2 MB should be PAYLOAD_INVALID, got %', left(r::text, 200); END IF;
  IF EXISTS (SELECT 1 FROM public.patients WHERE doctor_id = d_pro AND name LIKE 'NNNN%') THEN RAISE EXCEPTION 'oversize payload wrote rows'; END IF;

  -------------------------------------------------------------------------
  -- Duplicates
  -------------------------------------------------------------------------
  -- same phone, different name: both are new; the same person under another clinic is new here
  INSERT INTO public.patients (doctor_id, name, phone, age, gender) VALUES (d_other, 'Shared Name', '9000000070', 40, 'male');
  r := pg_temp.imp(d_pro, jsonb_build_array(
    pg_temp.mk('Family Member A', '9000000071'),
    pg_temp.mk('Family Member B', '9000000071'),
    pg_temp.mk('Shared Name', '9000000070'),
    pg_temp.mk('  Padded   ', '9000000072'),
    pg_temp.mk('padded', '9000000072'),
    pg_temp.mk('PADDED', '9000000072'),
    pg_temp.mk('Padded  Inner', '9000000073'),
    pg_temp.mk('Padded Inner', '9000000073')), 'dups.csv');
  IF (r->>'inserted')::int <> 6 OR (r->>'duplicates')::int <> 2 THEN RAISE EXCEPTION 'dup handling wrong (want 6 inserted, 2 dup): %', r; END IF;
  SELECT count(*) INTO n FROM public.patients WHERE doctor_id = d_other;
  IF n <> 1 THEN RAISE EXCEPTION 'importing for one clinic must not touch another clinic (found % rows)', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE doctor_id = d_pro AND name = 'Padded' AND phone = '9000000072') THEN RAISE EXCEPTION 'name must be stored trimmed'; END IF;
  -- an existing auto-created patient is a duplicate too (and keeps its flag)
  INSERT INTO public.patients (doctor_id, name, phone, age, gender, auto_created) VALUES (d_pro, 'Booked Earlier', '9000000074', 30, 'male', true);
  r := pg_temp.imp(d_pro, jsonb_build_array(pg_temp.mk('booked earlier', '9000000074')), 'auto.csv');
  IF (r->>'inserted')::int <> 0 OR (r->>'duplicates')::int <> 1 THEN RAISE EXCEPTION 'auto-created patient should count as a duplicate: %', r; END IF;

  -- the payload cannot steer the clinic or the flags
  r := pg_temp.imp(d_pro, jsonb_build_array(pg_temp.mk('Steer Attempt', '9000000075',
        jsonb_build_object('doctor_id', d_other, 'auto_created', true, 'id', gen_random_uuid(), 'created_at', '2001-01-01', 'clinic', d_other))), 'steer.csv');
  IF (r->>'inserted')::int <> 1 THEN RAISE EXCEPTION 'steer row should insert: %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE name = 'Steer Attempt' AND doctor_id = d_pro AND NOT auto_created AND created_at > now() - interval '1 day') THEN
    RAISE EXCEPTION 'a payload field changed the clinic, the flag or the creation date';
  END IF;
  IF EXISTS (SELECT 1 FROM public.patients WHERE name = 'Steer Attempt' AND doctor_id = d_other) THEN RAISE EXCEPTION 'imported into another doctor via a payload field'; END IF;

  -- SQL-looking text is data
  r := pg_temp.imp(d_pro, jsonb_build_array(pg_temp.mk('Robert''); DROP TABLE patients;--', '9000000076',
        '{"notes":"''; DELETE FROM patients; --","email":"x@y.zz"}')), 'sql.csv');
  IF (r->>'inserted')::int <> 1 THEN RAISE EXCEPTION 'sql-looking row should insert verbatim: %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE doctor_id = d_pro AND name = 'Robert''); DROP TABLE patients;--' AND notes = '''; DELETE FROM patients; --') THEN
    RAISE EXCEPTION 'sql-looking text was not stored verbatim';
  END IF;
  SELECT count(*) INTO n FROM public.patients WHERE doctor_id = d_pro;
  IF n < 10 THEN RAISE EXCEPTION 'patients table lost rows (% left)', n; END IF;

  -------------------------------------------------------------------------
  -- Cap (auto-created patients count; boundary is allowed; duplicates do not count)
  -------------------------------------------------------------------------
  INSERT INTO public.patients (doctor_id, name, phone, age, gender, auto_created)
  VALUES (d_cap, 'Cap Auto 1', '9000000101', 30, 'male', true), (d_cap, 'Cap Auto 2', '9000000102', 30, 'male', true);
  INSERT INTO public.patients (doctor_id, name, phone, age, gender) VALUES (d_cap, 'Cap Manual', '9000000103', 30, 'male');
  UPDATE public.platform_settings SET value = '5'::jsonb WHERE key = 'patient_import_cap_pro';
  r := pg_temp.imp(d_cap, jsonb_build_array(pg_temp.mk('Cap One', '9000000111'), pg_temp.mk('Cap Two', '9000000112'), pg_temp.mk('Cap Three', '9000000113')), 'cap.csv');
  IF r->>'error' <> 'CAP_EXCEEDED' OR (r->>'cap')::int <> 5 OR (r->>'current')::int <> 3 OR (r->>'incoming')::int <> 3 THEN RAISE EXCEPTION 'expected CAP_EXCEEDED 5/3/3, got %', r; END IF;
  IF EXISTS (SELECT 1 FROM public.patients WHERE name LIKE 'Cap T%' OR name = 'Cap One') THEN RAISE EXCEPTION 'cap breach wrote rows'; END IF;
  -- one duplicate in the file does not count toward the cap: 3 + 2 new = 5 = the cap, allowed
  r := pg_temp.imp(d_cap, jsonb_build_array(pg_temp.mk('Cap One', '9000000111'), pg_temp.mk('Cap Two', '9000000112'), pg_temp.mk('Cap Auto 1', '9000000101')), 'cap2.csv');
  IF (r->>'ok')::boolean IS NOT TRUE OR (r->>'inserted')::int <> 2 OR (r->>'duplicates')::int <> 1 THEN RAISE EXCEPTION 'exactly at the cap must be allowed: %', r; END IF;
  r := pg_temp.imp(d_cap, jsonb_build_array(pg_temp.mk('Cap Three', '9000000113')), 'cap3.csv');
  IF r->>'error' <> 'CAP_EXCEEDED' OR (r->>'current')::int <> 5 OR (r->>'incoming')::int <> 1 THEN RAISE EXCEPTION 'one over the cap must be refused: %', r; END IF;
  -- at the cap, an all-duplicate file is still fine
  r := pg_temp.imp(d_cap, jsonb_build_array(pg_temp.mk('Cap One', '9000000111')), 'cap4.csv');
  IF (r->>'ok')::boolean IS NOT TRUE OR (r->>'duplicates')::int <> 1 THEN RAISE EXCEPTION 'an all-duplicate file at the cap should be fine: %', r; END IF;
  -- an approved higher cap lifts it
  INSERT INTO public.patient_import_requests (doctor_id, requested_cap, status, approved_cap, decided_at) VALUES (d_cap, 50, 'approved', 50, now());
  r := pg_temp.imp(d_cap, jsonb_build_array(pg_temp.mk('Cap Three', '9000000113')), 'cap5.csv');
  IF (r->>'inserted')::int <> 1 THEN RAISE EXCEPTION 'an approved cap should allow the import: %', r; END IF;
  UPDATE public.platform_settings SET value = '2000'::jsonb WHERE key = 'patient_import_cap_pro';

  -------------------------------------------------------------------------
  -- Daily limits (per clinic, rolling 24 hours, counted from successful calls)
  -------------------------------------------------------------------------
  UPDATE public.platform_settings SET value = '2'::jsonb WHERE key = 'patient_import_max_per_day';
  r := pg_temp.imp(d_day, jsonb_build_array(pg_temp.mk('Day A1', '9000000201')), 'd1.csv');
  IF (r->>'inserted')::int <> 1 THEN RAISE EXCEPTION 'first daily import failed: %', r; END IF;
  r := pg_temp.imp(d_day, jsonb_build_array(pg_temp.mk('Day A2', '9000000202')), 'd2.csv');
  IF (r->>'inserted')::int <> 1 THEN RAISE EXCEPTION 'second daily import failed: %', r; END IF;
  r := pg_temp.imp(d_day, jsonb_build_array(pg_temp.mk('Day A3', '9000000203')), 'd3.csv');
  IF r->>'error' <> 'DAILY_LIMIT' OR (r->>'imports_today')::int <> 2 OR (r->>'rows_today')::int <> 2 OR (r->>'max_per_day')::int <> 2 OR (r->>'max_rows_per_day')::int <> 2000 THEN
    RAISE EXCEPTION 'expected DAILY_LIMIT with the numbers, got %', r;
  END IF;
  -- a refused call is not logged, so it does not count
  SELECT count(*) INTO n FROM public.patient_imports WHERE doctor_id = d_day;
  IF n <> 2 THEN RAISE EXCEPTION 'refused call must not be logged (% rows)', n; END IF;
  -- another clinic is unaffected
  r := pg_temp.imp(d_other, jsonb_build_array(pg_temp.mk('Other Day', '9000000204')), 'o.csv');
  IF (r->>'inserted')::int <> 1 THEN RAISE EXCEPTION 'the daily limit must be per clinic: %', r; END IF;
  -- after 24 hours the window moves on
  UPDATE public.patient_imports SET created_at = now() - interval '25 hours' WHERE doctor_id = d_day AND file_name = '.csv';
  r := pg_temp.imp(d_day, jsonb_build_array(pg_temp.mk('Day A3', '9000000203')), 'd3.csv');
  IF (r->>'inserted')::int <> 1 THEN RAISE EXCEPTION 'an import older than 24h must not count: %', r; END IF;

  -- rows per day: exactly at the limit is allowed, one over is not (rows_today = rows INSERTED in 24h)
  UPDATE public.platform_settings SET value = '1000'::jsonb WHERE key = 'patient_import_max_per_day';
  UPDATE public.platform_settings SET value = '10'::jsonb WHERE key = 'patient_import_max_rows_per_day';
  DELETE FROM public.patient_imports WHERE doctor_id = d_day;
  r := pg_temp.imp(d_day, (SELECT jsonb_agg(pg_temp.mk('Row ' || g, '9100000' || lpad(g::text, 3, '0'))) FROM generate_series(1, 6) g), 'r1.csv');
  IF (r->>'inserted')::int <> 6 THEN RAISE EXCEPTION 'rows/day first import failed: %', r; END IF;
  r := pg_temp.imp(d_day, (SELECT jsonb_agg(pg_temp.mk('Row ' || g, '9100000' || lpad(g::text, 3, '0'))) FROM generate_series(1, 11) g), 'r2.csv');
  -- 6 duplicates + 5 new: 6 + 5 = 11 > 10
  IF r->>'error' <> 'DAILY_LIMIT' OR (r->>'rows_today')::int <> 6 THEN RAISE EXCEPTION 'one over rows/day must be refused: %', r; END IF;
  r := pg_temp.imp(d_day, (SELECT jsonb_agg(pg_temp.mk('Row ' || g, '9100000' || lpad(g::text, 3, '0'))) FROM generate_series(1, 10) g), 'r3.csv');
  IF (r->>'ok')::boolean IS NOT TRUE OR (r->>'inserted')::int <> 4 OR (r->>'duplicates')::int <> 6 THEN RAISE EXCEPTION 'exactly at rows/day must be allowed (6 dup + 4 new = 10): %', r; END IF;
  r := pg_temp.imp(d_day, jsonb_build_array(pg_temp.mk('Row Extra', '9100000999')), 'r4.csv');
  IF r->>'error' <> 'DAILY_LIMIT' OR (r->>'rows_today')::int <> 10 THEN RAISE EXCEPTION 'at 10 rows today one more must be refused: %', r; END IF;
  UPDATE public.platform_settings SET value = '2000'::jsonb WHERE key = 'patient_import_max_rows_per_day';

  -------------------------------------------------------------------------
  -- Staff
  -------------------------------------------------------------------------
  r := pg_temp.imp(s_ok, jsonb_build_array(pg_temp.mk('Staff Added', '9000000031')), 's.csv');
  IF (r->>'inserted')::int <> 1 THEN RAISE EXCEPTION 'staff import failed: %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE name = 'Staff Added' AND doctor_id = d_pro) THEN RAISE EXCEPTION 'staff import must land in the doctor''s clinic'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.patient_imports WHERE file_name = '.csv' AND doctor_id = d_pro AND user_id = s_ok) THEN RAISE EXCEPTION 'staff import must log the staff member as the user'; END IF;

  -------------------------------------------------------------------------
  -- Big payloads at the limits (premium clinic): 1000 rows with ~1.9 KB notes is just under 2 MB
  -------------------------------------------------------------------------
  r := pg_temp.imp(d_big, (SELECT jsonb_agg(pg_temp.mk('Bulk ' || g, '8' || lpad(g::text, 9, '0'), jsonb_build_object('notes', repeat('n', 1900)))) FROM generate_series(1, 1000) g), 'thousand.csv');
  IF (r->>'ok')::boolean IS NOT TRUE OR (r->>'inserted')::int <> 1000 THEN RAISE EXCEPTION '1000 rows (just under 2 MB) should import: %', left(r::text, 200); END IF;
  SELECT count(*) INTO n FROM public.patients WHERE doctor_id = d_big;
  IF n <> 1000 THEN RAISE EXCEPTION 'expected 1000 rows for the big clinic, got %', n; END IF;

  -------------------------------------------------------------------------
  -- The direct-insert guard
  -------------------------------------------------------------------------
  UPDATE public.platform_settings SET value = '3'::jsonb WHERE key = 'patient_direct_insert_per_hour';
  FOR i IN 1..3 LOOP
    t := pg_temp.direct(d_pro, d_pro, 'Direct ' || i, '90000000' || (40 + i));
    IF t <> 'OK' THEN RAISE EXCEPTION 'direct insert % should be allowed, got %', i, t; END IF;
  END LOOP;
  t := pg_temp.direct(d_pro, d_pro, 'Direct 4', '9000000044');
  IF t <> 'PATIENT_RATE_LIMIT' THEN RAISE EXCEPTION 'the 4th direct insert must be refused with PATIENT_RATE_LIMIT, got %', t; END IF;
  IF EXISTS (SELECT 1 FROM public.patients WHERE name = 'Direct 4') THEN RAISE EXCEPTION 'the refused insert left a row'; END IF;
  SELECT k.n INTO cnt FROM public.patient_insert_counters k WHERE k.doctor_id = d_pro;
  IF cnt <> 3 THEN RAISE EXCEPTION 'counter should stay at 3 after the refused insert, is %', n; END IF;
  -- other clinics have their own counter
  t := pg_temp.direct(d_other, d_other, 'Other Direct', '9000000045');
  IF t <> 'OK' THEN RAISE EXCEPTION 'the guard must be per clinic, got %', t; END IF;
  -- staff direct inserts count against the doctor's clinic
  t := pg_temp.direct(s_ok, d_pro, 'Staff Direct', '9000000046');
  IF t <> 'PATIENT_RATE_LIMIT' THEN RAISE EXCEPTION 'staff direct inserts count against the clinic counter, got %', t; END IF;
  -- an import is still allowed while direct inserts are throttled, and it does not touch the counter
  r := pg_temp.imp(d_pro, jsonb_build_array(pg_temp.mk('After Guard', '9000000051')), 'g.csv');
  IF (r->>'inserted')::int <> 1 THEN RAISE EXCEPTION 'import must bypass the direct-insert guard: %', r; END IF;
  SELECT k.n INTO cnt FROM public.patient_insert_counters k WHERE k.doctor_id = d_pro;
  IF cnt <> 3 THEN RAISE EXCEPTION 'an import must not change the direct-insert counter (is %)', n; END IF;
  -- the flag does not leak: a direct insert right after an import in the same transaction is counted (and refused)
  IF COALESCE(current_setting('app.patient_import', true), 'off') <> 'off' THEN RAISE EXCEPTION 'app.patient_import leaked after import'; END IF;
  t := pg_temp.direct(d_pro, d_pro, 'Direct After Import', '9000000047');
  IF t <> 'PATIENT_RATE_LIMIT' THEN RAISE EXCEPTION 'the flag leaked: a direct insert after an import was not counted (%)', t; END IF;
  -- a failed import (refused) also leaves no flag behind
  r := pg_temp.imp(d_trial, three, 'x.csv');
  IF COALESCE(current_setting('app.patient_import', true), 'off') <> 'off' THEN RAISE EXCEPTION 'app.patient_import leaked after a refused import'; END IF;

  -- no JWT (service role, cron, migrations): exempt even though the hourly limit is used up
  INSERT INTO public.patients (doctor_id, name, phone, age, gender) VALUES (d_pro, 'Postgres Insert', '9000000061', 30, 'male');
  EXECUTE 'SET LOCAL ROLE service_role';
  INSERT INTO public.patients (doctor_id, name, phone, age, gender) VALUES (d_pro, 'Service Insert', '9000000062', 30, 'male');
  EXECUTE 'RESET ROLE';
  -- the guard only looks at INSERT
  PERFORM pg_temp.act(d_pro);
  UPDATE public.patients SET notes = 'edited' WHERE doctor_id = d_pro AND name = 'Direct 1';
  PERFORM pg_temp.clear();

  -- the window: an hour later the counter starts again at 1
  UPDATE public.patient_insert_counters SET window_start = now() - interval '2 hours' WHERE doctor_id = d_pro;
  t := pg_temp.direct(d_pro, d_pro, 'Direct New Window', '9000000048');
  IF t <> 'OK' THEN RAISE EXCEPTION 'a new hour must reset the guard, got %', t; END IF;
  SELECT k.n INTO cnt FROM public.patient_insert_counters k WHERE k.doctor_id = d_pro;
  IF cnt <> 1 THEN RAISE EXCEPTION 'counter should restart at 1 in the new window, is %', n; END IF;
  -- right at the edge of the window it is still the old window
  UPDATE public.patient_insert_counters SET window_start = now() - interval '59 minutes', n = 3 WHERE doctor_id = d_pro;
  t := pg_temp.direct(d_pro, d_pro, 'Direct Edge', '9000000049');
  IF t <> 'PATIENT_RATE_LIMIT' THEN RAISE EXCEPTION '59 minutes in, the window must still count, got %', t; END IF;

  -- bookings are never throttled: the appointment triggers create the patient at trigger depth 2,
  -- even when the clinic's hourly counter is used up (n = 3, limit 3)
  PERFORM pg_temp.act(d_pro);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, patient_age, patient_gender, service_name, date, time_slot, status)
  VALUES (d_pro, 'Booked Person', '9000000081', 30, 'male', 'Consultation', current_date + 3, '10:00', 'pending');
  PERFORM pg_temp.clear();
  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE doctor_id = d_pro AND name = 'Booked Person' AND auto_created) THEN
    RAISE EXCEPTION 'a booking by the clinic must auto-create the patient even over the hourly direct-insert limit';
  END IF;
  SELECT k.n INTO cnt FROM public.patient_insert_counters k WHERE k.doctor_id = d_pro;
  IF cnt <> 3 THEN RAISE EXCEPTION 'a booking must not touch the direct-insert counter (is %)', n; END IF;
  -- a staff booking too (must really succeed: the old check swallowed errors)
  PERFORM pg_temp.act(s_ok);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, patient_age, patient_gender, service_name, date, time_slot, status)
  VALUES (d_pro, 'Staff Booked', '9000000082', 30, 'male', 'Consultation', current_date + 3, '10:30', 'pending');
  PERFORM pg_temp.clear();
  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE doctor_id = d_pro AND name = 'Staff Booked' AND auto_created) THEN
    RAISE EXCEPTION 'a staff booking must auto-create the patient';
  END IF;

  -- and the Add Patient form at normal speed is untouched (default limit 100 per hour)
  UPDATE public.platform_settings SET value = '100'::jsonb WHERE key = 'patient_direct_insert_per_hour';
  FOR i IN 1..20 LOOP
    t := pg_temp.direct(d_other, d_other, 'Form ' || i, '92000000' || lpad(i::text, 2, '0'));
    IF t <> 'OK' THEN RAISE EXCEPTION 'normal-speed direct insert % refused: %', i, t; END IF;
  END LOOP;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
