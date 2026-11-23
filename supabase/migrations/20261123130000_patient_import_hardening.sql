-- Patient import limits, part 4: hardening after review.
--   1. The guard no longer exempts trigger depth > 1 for signed-in users. Patients created by the
--      appointment triggers (bookings, completing a visit) count against a separate DAILY counter.
--   2. Direct inserts get a rolling daily limit and a hard total ceiling (PATIENT_TOTAL_LIMIT).
--   3. The guard only touches the caller's own clinic counter (no cross-tenant oracle).
--   4. A reviewer cannot review / override their own clinic.
--   5. import_patients: safe payload check, cheap daily pre-check first, file name reduced to its extension.
-- Create-or-replace only; earlier migrations are untouched.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
-- 300 direct inserts a day: the Add Patient form is typed by hand (a busy front desk adds
-- tens a day), and anything bigger belongs in the CSV import. 1500 booking-created patients a
-- day: far above any real clinic (every one of them is a NEW person who booked or was seen that
-- day), but it stops an API loop at about 1.5k fake patients a day instead of unlimited.
INSERT INTO public.platform_settings (key, value) VALUES
  ('patient_direct_insert_per_day', '300'::jsonb),
  ('patient_clinic_booking_inserts_per_day', '1500'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Extra counters on the same (client-inaccessible) table: a rolling day for direct inserts and
-- a rolling day for patients created by the appointment triggers.
ALTER TABLE public.patient_insert_counters
  ADD COLUMN IF NOT EXISTS day_start timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS day_n     integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bk_start  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS bk_n      integer     NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Guard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_patient_direct_inserts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_clinic uuid;
  v_lim_h integer;
  v_lim_d integer;
  v_lim_b integer;
  v_ceiling integer;
  v_n integer;
  v_dn integer;
  v_bn integer;
BEGIN
  -- No JWT (service role, cron, migrations) and import_patients (transaction-local flag): trusted.
  IF v_uid IS NULL OR COALESCE(current_setting('app.patient_import', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  -- The caller's own clinic, resolved like the appointment trigger does (doctor, or active staff).
  -- If the row names another clinic, leave it alone: the RLS check rejects it with no side effects
  -- here (no counter touched, no different error to learn from).
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
    v_clinic := v_uid;
  ELSE
    v_clinic := public.staff_doctor_id(v_uid);
  END IF;
  IF v_clinic IS NULL OR NEW.doctor_id IS DISTINCT FROM v_clinic THEN
    RETURN NEW;
  END IF;

  IF pg_trigger_depth() > 1 THEN
    -- A patient created by another trigger (sync_appointment_patient, for a booking or a completed
    -- visit made by the clinic). Real use is never throttled at normal volume; the generous daily
    -- counter only stops a loop of fake appointments from creating patients without end.
    v_lim_b := public.platform_int_setting('patient_clinic_booking_inserts_per_day', 1500);
    INSERT INTO public.patient_insert_counters AS c (doctor_id, window_start, n, day_start, day_n, bk_start, bk_n)
    VALUES (v_clinic, now(), 0, now(), 0, now(), 1)
    ON CONFLICT (doctor_id) DO UPDATE
       SET bk_n = CASE WHEN c.bk_start < now() - interval '24 hours' THEN 1 ELSE c.bk_n + 1 END,
           bk_start = CASE WHEN c.bk_start < now() - interval '24 hours' THEN now() ELSE c.bk_start END
    RETURNING c.bk_n INTO v_bn;
    IF v_bn > v_lim_b THEN
      RAISE EXCEPTION 'PATIENT_RATE_LIMIT';
    END IF;
    RETURN NEW;
  END IF;

  v_lim_h := public.platform_int_setting('patient_direct_insert_per_hour', 100);
  v_lim_d := public.platform_int_setting('patient_direct_insert_per_day', 300);

  INSERT INTO public.patient_insert_counters AS c (doctor_id, window_start, n, day_start, day_n)
  VALUES (v_clinic, now(), 1, now(), 1)
  ON CONFLICT (doctor_id) DO UPDATE
     SET n = CASE WHEN c.window_start < now() - interval '1 hour' THEN 1 ELSE c.n + 1 END,
         window_start = CASE WHEN c.window_start < now() - interval '1 hour' THEN now() ELSE c.window_start END,
         day_n = CASE WHEN c.day_start < now() - interval '24 hours' THEN 1 ELSE c.day_n + 1 END,
         day_start = CASE WHEN c.day_start < now() - interval '24 hours' THEN now() ELSE c.day_start END
  RETURNING c.n, c.day_n INTO v_n, v_dn;

  IF v_n > v_lim_h OR v_dn > v_lim_d THEN
    RAISE EXCEPTION 'PATIENT_RATE_LIMIT';
  END IF;

  -- Hard total ceiling, checked once at the start of each hourly window so the count stays cheap.
  IF v_n = 1 THEN
    v_ceiling := public.platform_int_setting('patient_import_cap_ceiling', 100000);
    IF (SELECT count(*) FROM public.patients p WHERE p.doctor_id = v_clinic) >= v_ceiling THEN
      RAISE EXCEPTION 'PATIENT_TOTAL_LIMIT';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_patient_direct_inserts() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- import_patients
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
  v_ext text;
BEGIN
  v_clinic := public.patient_import_clinic();
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.patient_import_eligible(v_clinic) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_ELIGIBLE');
  END IF;

  -- Nested IFs: Postgres does not promise OR / AND short-circuit order, so a non-array must
  -- never reach jsonb_array_length.
  IF _rows IS NULL OR jsonb_typeof(_rows) IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAYLOAD_INVALID', 'max_rows', v_max_rows);
  END IF;
  v_received := jsonb_array_length(_rows);
  IF v_received = 0 OR v_received > v_max_rows THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAYLOAD_INVALID', 'max_rows', v_max_rows);
  END IF;
  IF octet_length(_rows::text) > 2097152 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAYLOAD_INVALID', 'max_rows', v_max_rows);
  END IF;

  -- One import per clinic at a time, so two tabs (or doctor + staff) cannot both pass the cap check.
  -- This is the only lock taken here; bookings never take it, so it cannot invert the
  -- slot -> queue number -> patient order used by the appointment triggers.
  PERFORM pg_advisory_xact_lock(hashtext('patient_import:' || v_clinic::text));

  -- Cheap daily-limit pre-check, before the heavy per-row validation. (The exact check, which
  -- knows how many rows are really new, stays below.)
  SELECT count(*), COALESCE(sum(i.rows_inserted), 0) INTO v_imports, v_rows_today
    FROM public.patient_imports i WHERE i.doctor_id = v_clinic AND i.created_at > now() - interval '24 hours';
  IF v_imports >= v_max_per_day OR v_rows_today >= v_max_rows_day THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DAILY_LIMIT', 'imports_today', v_imports,
      'rows_today', v_rows_today, 'max_per_day', v_max_per_day, 'max_rows_per_day', v_max_rows_day);
  END IF;

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

  IF v_rows_today + v_incoming > v_max_rows_day THEN
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

  -- A file name can carry patient names ("Rahul Sharma diabetic.csv"), so only the lowercase
  -- extension is kept (NULL when there is none).
  v_ext := lower(substring(btrim(COALESCE(_file_name, '')) from '\.([A-Za-z0-9]{1,10})$'));
  INSERT INTO public.patient_imports (doctor_id, user_id, file_name, rows_received, rows_inserted, rows_duplicate, rows_rejected)
  VALUES (v_clinic, auth.uid(), CASE WHEN v_ext IS NULL THEN NULL ELSE '.' || v_ext END, v_received, v_inserted, v_dupes, v_rejected_n);

  RETURN jsonb_build_object('ok', true, 'inserted', v_inserted, 'duplicates', v_dupes,
                            'rejected', v_rejected, 'rejected_count', v_rejected_n);
END;
$$;
REVOKE ALL ON FUNCTION public.import_patients(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_patients(jsonb, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Reviews and overrides: not for your own clinic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_patient_import_request(
  _request_id uuid, _decision text, _approved_cap integer DEFAULT NULL, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  r public.patient_import_requests%ROWTYPE;
  ceil integer := public.platform_int_setting('patient_import_cap_ceiling', 100000);
  cur integer;
  v_note text := NULLIF(regexp_replace(COALESCE(_note, ''), '^\s+|\s+$', '', 'g'), '');
BEGIN
  IF NOT public.sa_has_permission(uid, 'plan_requests.manage') THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- NULL must be refused explicitly: NULL NOT IN (...) is NULL, not true.
  IF _decision IS NULL OR _decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'decision must be approve or reject';
  END IF;
  IF length(COALESCE(v_note, '')) > 1000 THEN
    RAISE EXCEPTION 'The note is too long (1000 characters at most)';
  END IF;

  SELECT * INTO r FROM public.patient_import_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF r.doctor_id = uid THEN
    RAISE EXCEPTION 'You cannot review your own clinic';
  END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'This request was already % — refresh to see the latest', r.status;
  END IF;

  IF _decision = 'reject' THEN
    IF v_note IS NULL THEN
      RAISE EXCEPTION 'A reason is required when declining';
    END IF;
    UPDATE public.patient_import_requests
       SET status = 'rejected', reviewer_id = uid, reviewer_note = v_note, decided_at = now()
     WHERE id = _request_id;
    INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
    VALUES (uid, 'reject_patient_import_request', 'patient_import_requests', r.id, jsonb_build_object('doctor_id', r.doctor_id));
    INSERT INTO public.notifications (doctor_id, source_type, title, message)
    VALUES (r.doctor_id, 'plan_request', 'Patient import limit request not approved',
            'Your request was not approved. Reason: ' || v_note || ' You can ask again after 7 days.');
    RETURN;
  END IF;

  IF NOT public.patient_import_eligible(r.doctor_id) THEN
    RAISE EXCEPTION 'The clinic is not eligible to import right now. Decline the request, or allow the clinic first.';
  END IF;

  cur := public.patient_import_cap(r.doctor_id);
  IF _approved_cap IS NULL OR _approved_cap <= cur OR _approved_cap > ceil THEN
    RAISE EXCEPTION 'The approved limit must be above the current limit (%) and at most %', cur, ceil;
  END IF;
  UPDATE public.patient_import_requests
     SET status = 'approved', approved_cap = _approved_cap, reviewer_id = uid,
         reviewer_note = v_note, decided_at = now()
   WHERE id = _request_id;
  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
  VALUES (uid, 'approve_patient_import_request', 'patient_import_requests', r.id,
          jsonb_build_object('doctor_id', r.doctor_id, 'approved_cap', _approved_cap));
  INSERT INTO public.notifications (doctor_id, source_type, title, message)
  VALUES (r.doctor_id, 'plan_request', 'Patient import limit raised',
          'You can now hold up to ' || _approved_cap || ' patients when importing.');
END;
$$;
REVOKE ALL ON FUNCTION public.review_patient_import_request(uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_patient_import_request(uuid, text, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_patient_import_override(
  _doctor_id uuid, _mode text, _until timestamptz DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_reason text := NULLIF(regexp_replace(COALESCE(_reason, ''), '^\s+|\s+$', '', 'g'), '');
BEGIN
  IF NOT public.sa_has_permission(uid, 'plan_requests.manage') THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _mode IS NULL OR _mode NOT IN ('allowed', 'blocked', 'clear') THEN
    RAISE EXCEPTION 'mode must be allowed, blocked or clear';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _doctor_id) THEN
    RAISE EXCEPTION 'Doctor not found';
  END IF;
  IF _doctor_id = uid THEN
    RAISE EXCEPTION 'You cannot review your own clinic';
  END IF;

  IF _mode = 'clear' THEN
    DELETE FROM public.patient_import_overrides WHERE doctor_id = _doctor_id;
  ELSE
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'A reason is required for an override';
    END IF;
    IF length(v_reason) > 1000 THEN
      RAISE EXCEPTION 'The reason is too long (1000 characters at most)';
    END IF;
    IF _until IS NOT NULL AND _until <= now() THEN
      RAISE EXCEPTION 'The end date must be in the future';
    END IF;
    INSERT INTO public.patient_import_overrides (doctor_id, mode, until, reason, set_by, set_at)
    VALUES (_doctor_id, _mode, _until, v_reason, uid, now())
    ON CONFLICT (doctor_id) DO UPDATE
       SET mode = EXCLUDED.mode, until = EXCLUDED.until, reason = EXCLUDED.reason,
           set_by = EXCLUDED.set_by, set_at = EXCLUDED.set_at;
  END IF;

  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
  VALUES (uid, 'set_patient_import_override', 'patient_import_overrides', _doctor_id,
          jsonb_build_object('mode', _mode, 'until', _until, 'reason', v_reason));
END;
$$;
REVOKE ALL ON FUNCTION public.set_patient_import_override(uuid, text, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_patient_import_override(uuid, text, timestamptz, text) TO authenticated;

-- Known and accepted, deliberately unchanged here:
--  * anyone holding flags.manage can edit platform_settings (pre-existing), including these limits;
--  * get_doctor_import_access answers doctors.view OR plan_requests.view;
--  * a booking can lose a race with an in-flight import for the same phone + name and get one
--    unique violation (the same pre-existing pattern as two simultaneous bookings);
--  * failed import calls are not logged (their cost is bounded by the 2 MB limit and the clinic lock).
