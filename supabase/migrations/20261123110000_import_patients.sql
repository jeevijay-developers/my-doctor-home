-- Patient import limits, part 2: the only bulk path (import_patients) and the guard that
-- rate-limits direct inserts so the API cannot be looped around it.

-- ---------------------------------------------------------------------------
-- Row validator. Mirrors patientIntake.ts and patientCsv.ts. Returns an error code, or NULL
-- for a good row. Never raises (a bad value is a code, not an error), and checks the JSON
-- type of every field so objects, arrays and booleans cannot sneak through as text.
-- The browser sends: strings for name/gender/email/notes/dates, the normalised 10-digit
-- phone as a string, numbers (or null) for age/weight/total_visits.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.patient_import_row_error(_r jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  nm text; ph text; ag text; wt text; em text; nt text; tv text; s text; f text; d date;
  ps date; fv date; lv date;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF jsonb_typeof(_r) IS DISTINCT FROM 'object' THEN RETURN 'ROW_INVALID'; END IF;

  IF jsonb_typeof(_r->'name') IS DISTINCT FROM 'string' THEN RETURN 'NAME'; END IF;
  nm := btrim(_r->>'name');
  IF length(nm) < 2 OR length(nm) > 100 THEN RETURN 'NAME'; END IF;

  IF COALESCE(jsonb_typeof(_r->'phone'), '') NOT IN ('string', 'number') THEN RETURN 'PHONE'; END IF;
  ph := _r->>'phone';
  IF ph !~ '^[6-9][0-9]{9}$' THEN RETURN 'PHONE'; END IF;

  IF COALESCE(jsonb_typeof(_r->'age'), '') NOT IN ('string', 'number') THEN RETURN 'AGE'; END IF;
  ag := _r->>'age';
  IF ag !~ '^[0-9]{1,3}$' THEN RETURN 'AGE'; END IF;
  IF ag::integer > 120 THEN RETURN 'AGE'; END IF;

  IF jsonb_typeof(_r->'gender') IS DISTINCT FROM 'string' OR (_r->>'gender') NOT IN ('male', 'female', 'other') THEN
    RETURN 'GENDER';
  END IF;

  IF jsonb_typeof(_r->'weight') IS NOT NULL AND jsonb_typeof(_r->'weight') <> 'null' THEN
    IF jsonb_typeof(_r->'weight') NOT IN ('string', 'number') THEN RETURN 'WEIGHT'; END IF;
    wt := _r->>'weight';
    IF wt !~ '^[0-9]{1,3}(\.[0-9])?$' THEN RETURN 'WEIGHT'; END IF;
    IF wt::numeric < 0.5 OR wt::numeric > 500 THEN RETURN 'WEIGHT'; END IF;
  END IF;

  IF jsonb_typeof(_r->'email') IS NOT NULL AND jsonb_typeof(_r->'email') <> 'null' THEN
    IF jsonb_typeof(_r->'email') <> 'string' THEN RETURN 'EMAIL'; END IF;
    em := btrim(_r->>'email');
    IF em <> '' THEN
      IF length(em) > 254 THEN RETURN 'EMAIL'; END IF;
      IF em !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' THEN RETURN 'EMAIL'; END IF;
    END IF;
  END IF;

  IF jsonb_typeof(_r->'notes') IS NOT NULL AND jsonb_typeof(_r->'notes') <> 'null' THEN
    IF jsonb_typeof(_r->'notes') <> 'string' THEN RETURN 'NOTES'; END IF;
    nt := _r->>'notes';
    IF length(nt) > 2000 THEN RETURN 'NOTES'; END IF;
  END IF;

  -- History dates: blank/null = absent; otherwise strictly YYYY-MM-DD, a real calendar date
  -- from 1900 up to today in India, so Postgres' lenient date parser ('2020-1-5', 'today', ...) is not used.
  FOREACH f IN ARRAY ARRAY['patient_since', 'first_visit', 'last_visit'] LOOP
    IF jsonb_typeof(_r->f) IS NULL OR jsonb_typeof(_r->f) = 'null' THEN CONTINUE; END IF;
    IF jsonb_typeof(_r->f) <> 'string' THEN RETURN 'DATE'; END IF;
    s := _r->>f;
    IF s = '' THEN CONTINUE; END IF;
    IF s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RETURN 'DATE'; END IF;
    BEGIN
      d := s::date;
    EXCEPTION WHEN OTHERS THEN
      RETURN 'DATE';
    END;
    IF d > today OR d < DATE '1900-01-01' THEN RETURN 'DATE'; END IF;
    IF f = 'patient_since' THEN ps := d; ELSIF f = 'first_visit' THEN fv := d; ELSE lv := d; END IF;
  END LOOP;
  IF (fv IS NOT NULL AND lv IS NOT NULL AND lv < fv) OR (ps IS NOT NULL AND fv IS NOT NULL AND ps > fv) THEN
    RETURN 'DATE_ORDER';
  END IF;

  IF jsonb_typeof(_r->'total_visits') IS NOT NULL AND jsonb_typeof(_r->'total_visits') <> 'null' THEN
    IF jsonb_typeof(_r->'total_visits') NOT IN ('string', 'number') THEN RETURN 'VISITS'; END IF;
    tv := COALESCE(NULLIF(_r->>'total_visits', ''), '0');
    IF tv !~ '^[0-9]{1,5}$' THEN RETURN 'VISITS'; END IF;
    IF tv::integer > 10000 THEN RETURN 'VISITS'; END IF;
  END IF;

  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.patient_import_row_error(jsonb) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- import_patients: the only bulk path. All-or-nothing in one transaction. The clinic comes
-- from auth.uid() only; nothing in the payload can change it (unknown keys are ignored).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.import_patients(_rows jsonb, _file_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic uuid;
  v_max_rows integer := public.platform_int_setting('patient_import_max_rows', 1000);
  v_max_per_day integer := public.platform_int_setting('patient_import_max_per_day', 5);
  v_max_rows_day integer := public.platform_int_setting('patient_import_max_rows_per_day', 2000);
  v_cap integer;
  v_current integer;
  v_imports integer;
  v_rows_today integer;
  v_new jsonb;
  v_rejected jsonb;
  v_rejected_n integer;
  v_dupes integer;
  v_good integer;
  v_incoming integer;
  v_inserted integer;
  v_received integer;
BEGIN
  v_clinic := public.patient_import_clinic();
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.patient_import_eligible(v_clinic) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_ELIGIBLE');
  END IF;

  IF jsonb_typeof(_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(_rows) = 0
     OR jsonb_array_length(_rows) > v_max_rows OR octet_length(_rows::text) > 2097152 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAYLOAD_INVALID', 'max_rows', v_max_rows);
  END IF;
  v_received := jsonb_array_length(_rows);

  -- One import per clinic at a time, so two tabs (or doctor + staff) cannot both pass the cap check.
  -- This is the only lock taken here; bookings never take it, so it cannot invert the
  -- slot -> queue number -> patient order used by the appointment triggers.
  PERFORM pg_advisory_xact_lock(hashtext('patient_import:' || v_clinic::text));

  -- Validate every row, drop repeats inside the file (the first one wins), and keep only
  -- the rows that are really new for this clinic (same key as uq_patients_doctor_phone_name).
  WITH src AS MATERIALIZED (
    SELECT t.idx, t.row_json, public.patient_import_row_error(t.row_json) AS row_err
      FROM jsonb_array_elements(_rows) WITH ORDINALITY AS t(row_json, idx)
  ), bad AS (
    SELECT idx, row_err FROM src WHERE row_err IS NOT NULL
  ), good AS (
    SELECT idx, row_json, (row_json->>'phone') || '|' || lower(btrim(row_json->>'name')) AS row_key
      FROM src WHERE row_err IS NULL
  ), first_of AS (
    SELECT DISTINCT ON (row_key) idx, row_json, row_key FROM good ORDER BY row_key, idx
  )
  SELECT (SELECT count(*) FROM bad),
         (SELECT COALESCE(jsonb_agg(jsonb_build_object('index', x.idx, 'error', x.row_err) ORDER BY x.idx), '[]'::jsonb)
            FROM (SELECT idx, row_err FROM bad ORDER BY idx LIMIT 100) x),
         (SELECT count(*) FROM good) - (SELECT count(*) FROM first_of),
         (SELECT count(*) FROM first_of),
         (SELECT COALESCE(jsonb_agg(f.row_json ORDER BY f.idx), '[]'::jsonb)
            FROM first_of f
           WHERE NOT EXISTS (
             SELECT 1 FROM public.patients p
              WHERE p.doctor_id = v_clinic
                AND p.phone = f.row_json->>'phone'
                AND lower(btrim(p.name)) = lower(btrim(f.row_json->>'name'))))
    INTO v_rejected_n, v_rejected, v_dupes, v_good, v_new;
  v_incoming := jsonb_array_length(v_new);
  v_dupes := v_dupes + (v_good - v_incoming);

  SELECT count(*), COALESCE(sum(i.rows_inserted), 0) INTO v_imports, v_rows_today
    FROM public.patient_imports i WHERE i.doctor_id = v_clinic AND i.created_at > now() - interval '24 hours';
  IF v_imports >= v_max_per_day OR v_rows_today + v_incoming > v_max_rows_day THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DAILY_LIMIT', 'imports_today', v_imports,
      'rows_today', v_rows_today, 'max_per_day', v_max_per_day, 'max_rows_per_day', v_max_rows_day);
  END IF;

  v_cap := public.patient_import_cap(v_clinic);
  SELECT count(*) INTO v_current FROM public.patients p WHERE p.doctor_id = v_clinic;
  IF v_current + v_incoming > v_cap THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CAP_EXCEEDED', 'cap', v_cap, 'current', v_current, 'incoming', v_incoming);
  END IF;

  PERFORM set_config('app.patient_import', 'on', true);
  INSERT INTO public.patients (doctor_id, name, phone, email, age, gender, weight, notes,
                               patient_since, first_visit, last_visit, total_visits)
  SELECT v_clinic,
         btrim(e.j->>'name'),
         e.j->>'phone',
         NULLIF(btrim(COALESCE(e.j->>'email', '')), ''),
         (e.j->>'age')::integer,
         e.j->>'gender',
         NULLIF(e.j->>'weight', '')::numeric,
         NULLIF(btrim(COALESCE(e.j->>'notes', '')), ''),
         NULLIF(e.j->>'patient_since', '')::date,
         NULLIF(e.j->>'first_visit', '')::date,
         NULLIF(e.j->>'last_visit', '')::date,
         COALESCE(NULLIF(e.j->>'total_visits', ''), '0')::integer
    FROM jsonb_array_elements(v_new) AS e(j)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  PERFORM set_config('app.patient_import', 'off', true);
  -- A row that lost a race with a booking for the same person is a duplicate, not an error.
  v_dupes := v_dupes + (v_incoming - v_inserted);

  INSERT INTO public.patient_imports (doctor_id, user_id, file_name, rows_received, rows_inserted, rows_duplicate, rows_rejected)
  VALUES (v_clinic, auth.uid(), left(_file_name, 200), v_received, v_inserted, v_dupes, v_rejected_n);

  RETURN jsonb_build_object('ok', true, 'inserted', v_inserted, 'duplicates', v_dupes,
                            'rejected', v_rejected, 'rejected_count', v_rejected_n);
END;
$$;
REVOKE ALL ON FUNCTION public.import_patients(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_patients(jsonb, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Direct-insert guard. Direct inserts (the Add Patient form, or someone calling the API in a
-- loop) are throttled per clinic per hour. Exempt, and checked before anything else runs:
--   * inserts made by another trigger (bookings: sync_appointment_patient runs at depth 2),
--   * inserts made by import_patients (transaction-local flag),
--   * inserts with no JWT at all (service role, cron, migrations).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_patient_direct_inserts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lim integer;
  v_cnt integer;
BEGIN
  IF pg_trigger_depth() > 1 OR auth.uid() IS NULL
     OR COALESCE(current_setting('app.patient_import', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  v_lim := public.platform_int_setting('patient_direct_insert_per_hour', 100);

  INSERT INTO public.patient_insert_counters AS c (doctor_id, window_start, n)
  VALUES (NEW.doctor_id, now(), 1)
  ON CONFLICT (doctor_id) DO UPDATE
     SET n = CASE WHEN c.window_start < now() - interval '1 hour' THEN 1 ELSE c.n + 1 END,
         window_start = CASE WHEN c.window_start < now() - interval '1 hour' THEN now() ELSE c.window_start END
  RETURNING c.n INTO v_cnt;

  IF v_cnt > v_lim THEN
    RAISE EXCEPTION 'PATIENT_RATE_LIMIT';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_patient_direct_inserts() FROM PUBLIC, anon, authenticated;

-- Named trg_a0_* so it fires first (triggers run alphabetically; see the lock-order note in CLAUDE.md).
DROP TRIGGER IF EXISTS trg_a0_guard_patient_direct_inserts ON public.patients;
CREATE TRIGGER trg_a0_guard_patient_direct_inserts
  BEFORE INSERT ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.guard_patient_direct_inserts();
