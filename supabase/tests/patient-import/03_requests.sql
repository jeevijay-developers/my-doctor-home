-- Patient import limits, part 3 check (request / review / override / superadmin summary).
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

CREATE FUNCTION pg_temp.ck(c boolean, msg text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF c IS NOT TRUE THEN RAISE EXCEPTION 'CHECK FAILED: %', msg; END IF;
END $f$;

-- Every helper returns jsonb; a raised error becomes {"raised": "SQLSTATE:message"}.
CREATE FUNCTION pg_temp.rq(uid uuid, n integer, note text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE r jsonb;
BEGIN
  BEGIN
    PERFORM pg_temp.act(uid);
    r := public.request_patient_import_limit(n, note);
    PERFORM pg_temp.clear();
    RETURN r;
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.clear();
    RETURN jsonb_build_object('raised', SQLSTATE || ':' || SQLERRM);
  END;
END $f$;

CREATE FUNCTION pg_temp.rv(uid uuid, req uuid, decision text, cap integer DEFAULT NULL, note text DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $f$
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

CREATE FUNCTION pg_temp.ov(uid uuid, doc uuid, mode text, until timestamptz DEFAULT NULL, reason text DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN
    PERFORM pg_temp.act(uid);
    PERFORM public.set_patient_import_override(doc, mode, until, reason);
    PERFORM pg_temp.clear();
    RETURN 'NO_ERROR';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.clear();
    RETURN SQLSTATE || ':' || SQLERRM;
  END;
END $f$;

CREATE FUNCTION pg_temp.acc(uid uuid, doc uuid) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE r jsonb;
BEGIN
  BEGIN
    PERFORM pg_temp.act(uid);
    r := public.get_doctor_import_access(doc);
    PERFORM pg_temp.clear();
    RETURN r;
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.clear();
    RETURN jsonb_build_object('raised', SQLSTATE || ':' || SQLERRM);
  END;
END $f$;

-- Run any statement as a user; 'OK' or 'SQLSTATE:message'.
CREATE FUNCTION pg_temp.as_user(uid uuid, stmt text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN
    PERFORM pg_temp.act(uid);
    EXECUTE stmt;
    PERFORM pg_temp.clear();
    RETURN 'OK';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.clear();
    RETURN SQLSTATE || ':' || SQLERRM;
  END;
END $f$;

-- Row count of a query as a user (for RLS checks).
CREATE FUNCTION pg_temp.cnt(uid uuid, q text) RETURNS integer LANGUAGE plpgsql AS $f$
DECLARE n integer;
BEGIN
  PERFORM pg_temp.act(uid);
  EXECUTE 'SELECT count(*) FROM (' || q || ') s' INTO n;
  PERFORM pg_temp.clear();
  RETURN n;
END $f$;

-- A fresh clinic.
CREATE FUNCTION pg_temp.mkdoc(tier text, st text) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE u uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  VALUES (u, 'authenticated', 'authenticated', u::text || '@example.test', '{}'::jsonb);
  EXECUTE format('UPDATE public.profiles SET plan_tier=%L, plan_status=%L WHERE id=%L', tier, st, u);
  RETURN u;
END $f$;

DO $$
DECLARE
  ceil integer := public.platform_int_setting('patient_import_cap_ceiling', 100000);
  d uuid := pg_temp.mkdoc('pro', 'active');
  d2 uuid := pg_temp.mkdoc('pro', 'active');
  d_free uuid := pg_temp.mkdoc('free', 'trial');
  d_exp uuid := pg_temp.mkdoc('pro', 'active');
  d_blk uuid := pg_temp.mkdoc('pro', 'active');
  d_prem uuid := pg_temp.mkdoc('premium', 'active');
  d_a uuid := pg_temp.mkdoc('pro', 'active');
  d_b uuid := pg_temp.mkdoc('pro', 'active');
  d_c uuid := pg_temp.mkdoc('pro', 'active');
  d_dg uuid := pg_temp.mkdoc('pro', 'active');
  d_allow uuid := pg_temp.mkdoc('free', 'active');
  d_cd uuid := pg_temp.mkdoc('pro', 'active');
  sa uuid := gen_random_uuid();
  tm_yes uuid := gen_random_uuid();
  tm_view uuid := gen_random_uuid();
  tm_docs uuid := gen_random_uuid();
  tm_off uuid := gen_random_uuid();
  s_ok uuid := gen_random_uuid();
  s_no uuid := gen_random_uuid();
  nobody uuid := gen_random_uuid();
  req uuid;
  req2 uuid;
  r jsonb;
  t text;
  n integer;
  rec record;
BEGIN
  -- ghost user with no profile and no staff row; team members; owner; staff
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{}'::jsonb FROM unnest(ARRAY[sa, tm_yes, tm_view, tm_docs, tm_off, nobody]) AS u;
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"account_type":"staff"}'::jsonb FROM unnest(ARRAY[s_ok, s_no]) AS u;
  DELETE FROM public.profiles WHERE id IN (nobody, sa, tm_yes, tm_view, tm_docs, tm_off);
  INSERT INTO public.user_roles (user_id, role) VALUES (sa, 'admin');  -- owner: holds every superadmin permission
  INSERT INTO public.superadmin_team_members (id, name, phone, status, permissions, created_by) VALUES
    (tm_yes,  'TM Yes',  '+1557' || lpad((floor(random()*1e7))::int::text, 7, '0'), 'active',   '{"plan_requests.manage": true, "plan_requests.view": true}'::jsonb, sa),
    (tm_view, 'TM View', '+1558' || lpad((floor(random()*1e7))::int::text, 7, '0'), 'active',   '{"plan_requests.view": true}'::jsonb, sa),
    (tm_docs, 'TM Docs', '+1559' || lpad((floor(random()*1e7))::int::text, 7, '0'), 'active',   '{"doctors.view": true}'::jsonb, sa),
    (tm_off,  'TM Off',  '+1560' || lpad((floor(random()*1e7))::int::text, 7, '0'), 'inactive', '{"plan_requests.manage": true, "plan_requests.view": true}'::jsonb, sa);
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status) VALUES
    (s_ok, d, 'Staff Ok', 'ok-' || s_ok, '+1555' || lpad((floor(random()*1e7))::int::text, 7, '0'), '{"patients.add": true}'::jsonb, d, 'active'),
    (s_no, d, 'Staff No', 'no-' || s_no, '+1556' || lpad((floor(random()*1e7))::int::text, 7, '0'), '{"patients.view": true}'::jsonb, d, 'active');
  UPDATE public.profiles SET plan_end = now() - interval '2 days' WHERE id = d_exp;
  INSERT INTO public.patient_import_overrides (doctor_id, mode, reason, set_by) VALUES (d_blk, 'blocked', 'abuse', sa);

  -------------------------------------------------------------------------
  -- Anon cannot execute any of the four functions
  -------------------------------------------------------------------------
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN PERFORM public.request_patient_import_limit(6000, 'x'); RAISE EXCEPTION 'anon must not request';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.review_patient_import_request(gen_random_uuid(), 'reject', NULL, 'x'); RAISE EXCEPTION 'anon must not review';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.set_patient_import_override(d, 'clear', NULL, NULL); RAISE EXCEPTION 'anon must not override';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.get_doctor_import_access(d); RAISE EXCEPTION 'anon must not read access';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  EXECUTE 'RESET ROLE';

  -------------------------------------------------------------------------
  -- Request: who may ask
  -------------------------------------------------------------------------
  r := pg_temp.rq(NULL, 5000);
  PERFORM pg_temp.ck(r->>'raised' LIKE '%:NOT_ALLOWED', 'no JWT -> NOT_ALLOWED, got ' || r::text);
  r := pg_temp.rq(nobody, 5000);
  PERFORM pg_temp.ck(r->>'raised' LIKE '%:NOT_ALLOWED', 'user with no clinic -> NOT_ALLOWED, got ' || r::text);
  r := pg_temp.rq(s_no, 5000);
  PERFORM pg_temp.ck(r->>'raised' LIKE '%:NOT_ALLOWED', 'staff without patients.add -> NOT_ALLOWED, got ' || r::text);
  r := pg_temp.rq(tm_yes, 5000);
  PERFORM pg_temp.ck(r->>'raised' LIKE '%:NOT_ALLOWED', 'a team member without a clinic -> NOT_ALLOWED, got ' || r::text);

  r := pg_temp.rq(d_free, 5000, 'x');
  PERFORM pg_temp.ck(r->>'error' = 'NOT_ELIGIBLE', 'trial -> NOT_ELIGIBLE, got ' || r::text);
  r := pg_temp.rq(d_exp, 5000, 'x');
  PERFORM pg_temp.ck(r->>'error' = 'NOT_ELIGIBLE', 'active pro past plan_end -> NOT_ELIGIBLE, got ' || r::text);
  r := pg_temp.rq(d_blk, 5000, 'x');
  PERFORM pg_temp.ck(r->>'error' = 'NOT_ELIGIBLE', 'blocked override -> NOT_ELIGIBLE, got ' || r::text);
  PERFORM pg_temp.ck(NOT EXISTS (SELECT 1 FROM public.patient_import_requests WHERE doctor_id IN (d_free, d_exp, d_blk)), 'ineligible clinics must not leave a request');

  -------------------------------------------------------------------------
  -- Request: the number (pro cap is 2000)
  -------------------------------------------------------------------------
  r := pg_temp.rq(d, NULL);  PERFORM pg_temp.ck(r->>'error' = 'BAD_NUMBER', 'NULL -> BAD_NUMBER ' || r::text);
  PERFORM pg_temp.ck((r->>'cap')::int = 2000 AND (r->>'ceiling')::int = ceil, 'BAD_NUMBER carries cap and ceiling: ' || r::text);
  r := pg_temp.rq(d, 0);     PERFORM pg_temp.ck(r->>'error' = 'BAD_NUMBER', '0 -> BAD_NUMBER ' || r::text);
  r := pg_temp.rq(d, -5);    PERFORM pg_temp.ck(r->>'error' = 'BAD_NUMBER', 'negative -> BAD_NUMBER ' || r::text);
  r := pg_temp.rq(d, 1500);  PERFORM pg_temp.ck(r->>'error' = 'BAD_NUMBER', 'below cap -> BAD_NUMBER ' || r::text);
  r := pg_temp.rq(d, 2000);  PERFORM pg_temp.ck(r->>'error' = 'BAD_NUMBER', 'equal to cap -> BAD_NUMBER ' || r::text);
  r := pg_temp.rq(d, ceil + 1);       PERFORM pg_temp.ck(r->>'error' = 'BAD_NUMBER', 'ceiling+1 -> BAD_NUMBER ' || r::text);
  r := pg_temp.rq(d, 2147483647);     PERFORM pg_temp.ck(r->>'error' = 'BAD_NUMBER', 'int max -> BAD_NUMBER ' || r::text);
  PERFORM pg_temp.act(d);
  BEGIN
    EXECUTE format('SELECT public.request_patient_import_limit(%L, %L)', '2147483648', 'x');
    RAISE EXCEPTION 'int overflow must not be accepted';
  EXCEPTION WHEN numeric_value_out_of_range THEN NULL; END;
  PERFORM pg_temp.clear();
  PERFORM pg_temp.ck(NOT EXISTS (SELECT 1 FROM public.patient_import_requests WHERE doctor_id = d), 'bad numbers must leave no request');

  -- note rules, on their own clinics
  r := pg_temp.rq(d_a, 2001, repeat('a', 1001));
  PERFORM pg_temp.ck(r->>'error' = 'BAD_NOTE', '1001-char note -> BAD_NOTE ' || r::text);
  r := pg_temp.rq(d_a, 2001, repeat('a', 1000));
  PERFORM pg_temp.ck((r->>'ok')::boolean IS TRUE, '1000-char note accepted ' || r::text);   -- cap+1 is accepted too
  r := pg_temp.rq(d_b, ceil, '   ');
  PERFORM pg_temp.ck((r->>'ok')::boolean IS TRUE, 'request exactly at the ceiling with a blank note accepted ' || r::text);
  PERFORM pg_temp.ck((SELECT doctor_note IS NULL FROM public.patient_import_requests WHERE id = (r->>'id')::uuid), 'a whitespace note is stored as NULL');
  r := pg_temp.rq(d_c, 3000, NULL);
  PERFORM pg_temp.ck((r->>'ok')::boolean IS TRUE, 'NULL note accepted ' || r::text);
  r := pg_temp.rq(d_prem, 10000, 'x');
  PERFORM pg_temp.ck(r->>'error' = 'BAD_NUMBER' AND (r->>'cap')::int = 10000, 'premium base cap is 10000 ' || r::text);

  -- an allowed override makes a free clinic eligible to ask
  INSERT INTO public.patient_import_overrides (doctor_id, mode, reason, set_by) VALUES (d_allow, 'allowed', 'support', sa);
  r := pg_temp.rq(d_allow, 3000, 'x');
  PERFORM pg_temp.ck((r->>'ok')::boolean IS TRUE, 'allowed override lets a free clinic ask ' || r::text);

  -- staff with patients.add asks for the clinic they work for; the clinic then has one pending
  r := pg_temp.rq(s_ok, 5000, 'big clinic');
  PERFORM pg_temp.ck((r->>'ok')::boolean IS TRUE, 'staff with patients.add may ask ' || r::text);
  req := (r->>'id')::uuid;
  PERFORM pg_temp.ck((SELECT doctor_id = d AND status = 'pending' AND requested_cap = 5000 AND cap_at_request = 2000 AND patient_count = 0
                        FROM public.patient_import_requests WHERE id = req), 'request is recorded for the doctor with its snapshot');
  r := pg_temp.rq(d, 6000, 'again');
  PERFORM pg_temp.ck(r->>'error' = 'ALREADY_PENDING', 'second request -> ALREADY_PENDING ' || r::text);
  PERFORM pg_temp.ck(public.patient_import_cap(d) = 2000, 'a pending request changes nothing');

  -- the unique index is what makes the race safe: a second pending row cannot exist
  BEGIN
    INSERT INTO public.patient_import_requests (doctor_id, requested_cap) VALUES (d, 7000);
    RAISE EXCEPTION 'a second pending row must be impossible';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -------------------------------------------------------------------------
  -- Review: who may decide
  -------------------------------------------------------------------------
  FOR rec IN SELECT * FROM (VALUES ('doctor', d), ('staff', s_ok), ('nobody', nobody), ('no JWT', NULL::uuid),
                                   ('team view only', tm_view), ('team doctors.view', tm_docs), ('inactive team manage', tm_off)) v(who, uid) LOOP
    t := pg_temp.rv(rec.uid, req, 'approve', 5000, NULL);
    PERFORM pg_temp.ck(t = '42501:not authorized' OR t = 'P0001:not authorized', rec.who || ' must not approve, got ' || t);
    t := pg_temp.rv(rec.uid, req, 'reject', NULL, 'nope');
    PERFORM pg_temp.ck(t LIKE '%:not authorized', rec.who || ' must not reject, got ' || t);
  END LOOP;
  PERFORM pg_temp.ck((SELECT status FROM public.patient_import_requests WHERE id = req) = 'pending', 'unauthorised attempts leave it pending');

  -- bad input from a real reviewer
  t := pg_temp.rv(sa, req, NULL, 5000, NULL);       PERFORM pg_temp.ck(t LIKE '%:decision must be approve or reject', 'NULL decision refused, got ' || t);
  t := pg_temp.rv(sa, req, 'maybe', 5000, NULL);    PERFORM pg_temp.ck(t LIKE '%:decision must be approve or reject', 'unknown decision refused, got ' || t);
  t := pg_temp.rv(sa, gen_random_uuid(), 'reject', NULL, 'x'); PERFORM pg_temp.ck(t LIKE '%:Request not found', 'unknown request, got ' || t);
  t := pg_temp.rv(sa, NULL, 'reject', NULL, 'x');   PERFORM pg_temp.ck(t LIKE '%:Request not found', 'NULL request, got ' || t);
  t := pg_temp.rv(sa, req, 'approve', NULL, NULL);  PERFORM pg_temp.ck(t LIKE '%:The approved limit must be above%', 'NULL cap, got ' || t);
  t := pg_temp.rv(sa, req, 'approve', 0, NULL);     PERFORM pg_temp.ck(t LIKE '%:The approved limit must be above%', '0 cap, got ' || t);
  t := pg_temp.rv(sa, req, 'approve', -1, NULL);    PERFORM pg_temp.ck(t LIKE '%:The approved limit must be above%', 'negative cap, got ' || t);
  t := pg_temp.rv(sa, req, 'approve', 1500, NULL);  PERFORM pg_temp.ck(t LIKE '%:The approved limit must be above%', 'below cap, got ' || t);
  t := pg_temp.rv(sa, req, 'approve', 2000, NULL);  PERFORM pg_temp.ck(t LIKE '%:The approved limit must be above%', 'equal to cap, got ' || t);
  t := pg_temp.rv(sa, req, 'approve', ceil + 1, NULL); PERFORM pg_temp.ck(t LIKE '%:The approved limit must be above%', 'above ceiling, got ' || t);
  t := pg_temp.rv(sa, req, 'approve', 3000, repeat('n', 1001)); PERFORM pg_temp.ck(t LIKE '%:The note is too long%', 'approve note too long, got ' || t);
  t := pg_temp.rv(sa, req, 'reject', NULL, NULL);   PERFORM pg_temp.ck(t LIKE '%:A reason is required%', 'reject NULL note, got ' || t);
  t := pg_temp.rv(sa, req, 'reject', NULL, E'  \n ');PERFORM pg_temp.ck(t LIKE '%:A reason is required%', 'reject blank note, got ' || t);
  t := pg_temp.rv(sa, req, 'reject', NULL, repeat('n', 1001)); PERFORM pg_temp.ck(t LIKE '%:The note is too long%', 'reject note too long, got ' || t);
  PERFORM pg_temp.ck((SELECT status FROM public.patient_import_requests WHERE id = req) = 'pending', 'bad input leaves it pending');

  -- a team member WITH plan_requests.manage may decline; reviewer, audit and notification are recorded
  t := pg_temp.rv(tm_yes, req, 'reject', NULL, '  Please import in smaller batches  ');
  PERFORM pg_temp.ck(t = 'NO_ERROR', 'team member with manage may decline, got ' || t);
  PERFORM pg_temp.ck((SELECT status = 'rejected' AND reviewer_id = tm_yes AND reviewer_note = 'Please import in smaller batches' AND decided_at IS NOT NULL
                        FROM public.patient_import_requests WHERE id = req), 'decline stored');
  PERFORM pg_temp.ck((SELECT count(*) FROM public.notifications WHERE doctor_id = d AND source_type = 'plan_request'
                         AND message LIKE '%Please import in smaller batches%' AND message LIKE '%7 days%') = 1, 'doctor notified once, with the reason');
  PERFORM pg_temp.ck((SELECT count(*) FROM public.admin_audit_log WHERE admin_user_id = tm_yes AND action = 'reject_patient_import_request' AND target_id = req) = 1, 'decline audited');

  -- double review fails cleanly, and writes nothing more
  t := pg_temp.rv(sa, req, 'reject', NULL, 'again');     PERFORM pg_temp.ck(t LIKE '%:This request was already rejected%', 'double reject, got ' || t);
  t := pg_temp.rv(sa, req, 'approve', 5000, NULL);       PERFORM pg_temp.ck(t LIKE '%:This request was already rejected%', 'approve after reject, got ' || t);
  PERFORM pg_temp.ck((SELECT count(*) FROM public.notifications WHERE doctor_id = d AND source_type = 'plan_request') = 1, 'no second notification');

  -- decline cool-down: 7 days from the decision
  r := pg_temp.rq(d, 5000, 'try again');
  PERFORM pg_temp.ck(r->>'error' = 'COOLDOWN' AND (r->>'until')::timestamptz > now() + interval '6 days', 'COOLDOWN with a date ' || r::text);
  UPDATE public.patient_import_requests SET decided_at = now() - interval '7 days' + interval '1 second' WHERE id = req;
  r := pg_temp.rq(d, 5000, 'one second early');
  PERFORM pg_temp.ck(r->>'error' = 'COOLDOWN', 'one second before 7 days is still COOLDOWN ' || r::text);
  UPDATE public.patient_import_requests SET decided_at = now() - interval '7 days' WHERE id = req;
  r := pg_temp.rq(d, 5000, 'second try');
  PERFORM pg_temp.ck((r->>'ok')::boolean IS TRUE, 'exactly 7 days later the clinic may ask again ' || r::text);
  req2 := (r->>'id')::uuid;
  -- an old decline plus a NEW pending request: the pending one is what the clinic is told
  r := pg_temp.rq(d, 6000, 'third');
  PERFORM pg_temp.ck(r->>'error' = 'ALREADY_PENDING', 'old decline + new pending -> ALREADY_PENDING ' || r::text);

  -- approve: first approval at the cap fails, 3000 works, cap follows
  t := pg_temp.rv(sa, req2, 'approve', 3000, '  ok  ');
  PERFORM pg_temp.ck(t = 'NO_ERROR', 'owner approves, got ' || t);
  PERFORM pg_temp.ck(public.patient_import_cap(d) = 3000, 'cap is now 3000');
  PERFORM pg_temp.ck((SELECT status = 'approved' AND approved_cap = 3000 AND reviewer_id = sa AND reviewer_note = 'ok' FROM public.patient_import_requests WHERE id = req2), 'approval stored');
  PERFORM pg_temp.ck(EXISTS (SELECT 1 FROM public.notifications WHERE doctor_id = d AND source_type = 'plan_request' AND message LIKE '%up to 3000 patients%'), 'doctor told the new limit');
  PERFORM pg_temp.ck((SELECT details->>'approved_cap' = '3000' AND details->>'doctor_id' = d::text FROM public.admin_audit_log
                        WHERE admin_user_id = sa AND action = 'approve_patient_import_request' AND target_id = req2), 'approval audited');
  t := pg_temp.rv(sa, req2, 'approve', 4000, NULL);
  PERFORM pg_temp.ck(t LIKE '%:This request was already approved%', 'double approve, got ' || t);

  -- an approval can never lower the cap: a later approval must beat the CURRENT cap (3000),
  -- so "latest approved" and "highest approved" are always the same value
  r := pg_temp.rq(d, 3000, 'same');  PERFORM pg_temp.ck(r->>'error' = 'BAD_NUMBER', 'cannot ask for the cap you hold ' || r::text);
  r := pg_temp.rq(d, 2500, 'lower'); PERFORM pg_temp.ck(r->>'error' = 'BAD_NUMBER', 'cannot ask below the approved cap ' || r::text);
  r := pg_temp.rq(d, 3500, 'more');  PERFORM pg_temp.ck((r->>'ok')::boolean IS TRUE, 'approved clinic may ask for more ' || r::text);
  req := (r->>'id')::uuid;
  t := pg_temp.rv(sa, req, 'approve', 2500, NULL);
  PERFORM pg_temp.ck(t LIKE '%:The approved limit must be above the current limit (3000)%', 'approval below an earlier approval refused, got ' || t);
  t := pg_temp.rv(sa, req, 'approve', ceil, NULL);
  UPDATE public.patient_import_requests SET decided_at = now() + interval '1 second' WHERE id = req;   -- decisions share one transaction time here
  PERFORM pg_temp.ck(t = 'NO_ERROR' AND public.patient_import_cap(d) = ceil, 'approval exactly at the ceiling is allowed, got ' || t);
  -- the cap is the highest approval, whatever order decisions are stamped in
  PERFORM pg_temp.ck(public.patient_import_cap(d) = (SELECT max(approved_cap) FROM public.patient_import_requests WHERE doctor_id = d AND status = 'approved'), 'cap equals the highest approval');

  -- approving a clinic that is no longer eligible is refused (declining is still allowed)
  r := pg_temp.rq(d_dg, 4000, 'x');
  req := (r->>'id')::uuid;
  UPDATE public.profiles SET plan_tier = 'free', plan_status = 'active' WHERE id = d_dg;   -- downgraded since asking
  t := pg_temp.rv(sa, req, 'approve', 4000, NULL);
  PERFORM pg_temp.ck(t LIKE '%:The clinic is not eligible to import%', 'approve for a downgraded clinic refused, got ' || t);
  PERFORM pg_temp.ck(public.patient_import_cap(d_dg) = 2000, 'refused approval changes no cap');
  t := pg_temp.rv(sa, req, 'reject', NULL, 'Plan changed');
  PERFORM pg_temp.ck(t = 'NO_ERROR', 'decline for a downgraded clinic works, got ' || t);
  -- blocked since asking
  r := pg_temp.rq(d_cd, 4000, 'x');
  req := (r->>'id')::uuid;
  INSERT INTO public.patient_import_overrides (doctor_id, mode, reason, set_by) VALUES (d_cd, 'blocked', 'abuse', sa);
  t := pg_temp.rv(sa, req, 'approve', 4000, NULL);
  PERFORM pg_temp.ck(t LIKE '%:The clinic is not eligible to import%', 'approve for a blocked clinic refused, got ' || t);
  -- superadmin lifts the block, then the approval goes through
  DELETE FROM public.patient_import_overrides WHERE doctor_id = d_cd;
  t := pg_temp.rv(sa, req, 'approve', 4000, NULL);
  PERFORM pg_temp.ck(t = 'NO_ERROR', 'approve after the block is lifted, got ' || t);

  -------------------------------------------------------------------------
  -- Overrides
  -------------------------------------------------------------------------
  FOR rec IN SELECT * FROM (VALUES ('doctor', d), ('staff', s_ok), ('nobody', nobody), ('no JWT', NULL::uuid),
                                   ('team view only', tm_view), ('team doctors.view', tm_docs), ('inactive team manage', tm_off)) v(who, uid) LOOP
    t := pg_temp.ov(rec.uid, d2, 'blocked', NULL, 'sneaky');
    PERFORM pg_temp.ck(t LIKE '%:not authorized', rec.who || ' must not set overrides, got ' || t);
  END LOOP;
  PERFORM pg_temp.ck(NOT EXISTS (SELECT 1 FROM public.patient_import_overrides WHERE doctor_id = d2), 'unauthorised override attempts write nothing');

  t := pg_temp.ov(sa, d2, NULL, NULL, 'x');        PERFORM pg_temp.ck(t LIKE '%:mode must be allowed, blocked or clear', 'NULL mode, got ' || t);
  t := pg_temp.ov(sa, d2, 'banana', NULL, 'x');    PERFORM pg_temp.ck(t LIKE '%:mode must be allowed, blocked or clear', 'unknown mode, got ' || t);
  t := pg_temp.ov(sa, d2, 'blocked', NULL, NULL);  PERFORM pg_temp.ck(t LIKE '%:A reason is required%', 'NULL reason, got ' || t);
  t := pg_temp.ov(sa, d2, 'blocked', NULL, E' \t ');PERFORM pg_temp.ck(t LIKE '%:A reason is required%', 'blank reason, got ' || t);
  t := pg_temp.ov(sa, d2, 'blocked', NULL, repeat('r', 1001)); PERFORM pg_temp.ck(t LIKE '%:The reason is too long%', 'long reason, got ' || t);
  t := pg_temp.ov(sa, d2, 'blocked', now() - interval '1 minute', 'x'); PERFORM pg_temp.ck(t LIKE '%:The end date must be in the future', 'until in the past, got ' || t);
  t := pg_temp.ov(sa, d2, 'blocked', now(), 'x');  PERFORM pg_temp.ck(t LIKE '%:The end date must be in the future', 'until = now, got ' || t);
  t := pg_temp.ov(sa, gen_random_uuid(), 'blocked', NULL, 'x'); PERFORM pg_temp.ck(t LIKE '%:Doctor not found', 'unknown doctor, got ' || t);
  t := pg_temp.ov(sa, NULL, 'blocked', NULL, 'x'); PERFORM pg_temp.ck(t LIKE '%:Doctor not found', 'NULL doctor, got ' || t);
  t := pg_temp.ov(sa, nobody, 'blocked', NULL, 'x');PERFORM pg_temp.ck(t LIKE '%:Doctor not found', 'user without a profile, got ' || t);
  t := pg_temp.ov(sa, s_ok, 'blocked', NULL, 'x'); PERFORM pg_temp.ck(t LIKE '%:Doctor not found', 'staff id is not a doctor, got ' || t);
  PERFORM pg_temp.ck(NOT EXISTS (SELECT 1 FROM public.patient_import_overrides WHERE doctor_id IN (d2, nobody, s_ok)), 'refused overrides write nothing');

  t := pg_temp.ov(tm_yes, d2, 'clear', NULL, NULL);     -- clearing when none exists is not an error
  PERFORM pg_temp.ck(t = 'NO_ERROR', 'clear with nothing to clear, got ' || t);
  t := pg_temp.ov(sa, d2, 'clear', now() - interval '1 day', NULL);   -- clear ignores until and reason
  PERFORM pg_temp.ck(t = 'NO_ERROR', 'clear ignores until, got ' || t);

  t := pg_temp.ov(sa, d2, 'blocked', NULL, '  abuse  ');
  PERFORM pg_temp.ck(t = 'NO_ERROR', 'block, got ' || t);
  PERFORM pg_temp.ck((SELECT mode = 'blocked' AND until IS NULL AND reason = 'abuse' AND set_by = sa FROM public.patient_import_overrides WHERE doctor_id = d2), 'override stored trimmed');
  PERFORM pg_temp.ck(NOT public.patient_import_eligible(d2), 'blocked pro is not eligible');
  PERFORM pg_temp.ck(EXISTS (SELECT 1 FROM public.admin_audit_log WHERE admin_user_id = sa AND action = 'set_patient_import_override' AND target_id = d2
                              AND details->>'mode' = 'blocked' AND details->>'reason' = 'abuse'), 'override audited with the trimmed reason');
  -- replace it (one row per clinic), by a different reviewer, with an end date
  t := pg_temp.ov(tm_yes, d2, 'allowed', now() + interval '10 days', 'goodwill');
  PERFORM pg_temp.ck(t = 'NO_ERROR', 'replace override, got ' || t);
  PERFORM pg_temp.ck((SELECT count(*) = 1 AND bool_and(mode = 'allowed' AND set_by = tm_yes AND reason = 'goodwill' AND until > now()) FROM public.patient_import_overrides WHERE doctor_id = d2), 'override replaced in place');
  -- an override that has ended stops counting
  UPDATE public.patient_import_overrides SET mode = 'blocked', until = now() - interval '1 day' WHERE doctor_id = d2;
  PERFORM pg_temp.ck(public.patient_import_eligible(d2), 'an ended block falls back to the plan');
  -- allowed for a free clinic
  t := pg_temp.ov(sa, d_free, 'allowed', NULL, 'pilot');
  PERFORM pg_temp.ck(t = 'NO_ERROR' AND public.patient_import_eligible(d_free), 'allowed makes a trial clinic eligible, got ' || t);
  t := pg_temp.ov(sa, d_free, 'clear', NULL, NULL);
  PERFORM pg_temp.ck(t = 'NO_ERROR' AND NOT public.patient_import_eligible(d_free) AND NOT EXISTS (SELECT 1 FROM public.patient_import_overrides WHERE doctor_id = d_free), 'clear restores the plan rule');
  PERFORM pg_temp.ck((SELECT count(*) FROM public.admin_audit_log WHERE admin_user_id = sa AND action = 'set_patient_import_override') >= 3, 'overrides audited');

  -------------------------------------------------------------------------
  -- get_doctor_import_access (superadmin only) and its reason
  -------------------------------------------------------------------------
  r := pg_temp.acc(d, d);        PERFORM pg_temp.ck(r->>'raised' LIKE '%:not authorized', 'a doctor must not read even their own, got ' || r::text);
  r := pg_temp.acc(d, d2);       PERFORM pg_temp.ck(r->>'raised' LIKE '%:not authorized', 'a doctor must not read another clinic, got ' || r::text);
  r := pg_temp.acc(s_ok, d);     PERFORM pg_temp.ck(r->>'raised' LIKE '%:not authorized', 'staff refused, got ' || r::text);
  r := pg_temp.acc(nobody, d);   PERFORM pg_temp.ck(r->>'raised' LIKE '%:not authorized', 'nobody refused, got ' || r::text);
  r := pg_temp.acc(NULL, d);     PERFORM pg_temp.ck(r->>'raised' LIKE '%:not authorized', 'no JWT refused, got ' || r::text);
  r := pg_temp.acc(tm_off, d);   PERFORM pg_temp.ck(r->>'raised' LIKE '%:not authorized', 'inactive team member refused, got ' || r::text);
  r := pg_temp.acc(sa, gen_random_uuid()); PERFORM pg_temp.ck(r->>'raised' LIKE '%:Doctor not found', 'unknown doctor, got ' || r::text);
  r := pg_temp.acc(sa, NULL);    PERFORM pg_temp.ck(r->>'raised' LIKE '%:Doctor not found', 'NULL doctor, got ' || r::text);
  r := pg_temp.acc(sa, s_ok);    PERFORM pg_temp.ck(r->>'raised' LIKE '%:Doctor not found', 'staff id, got ' || r::text);
  r := pg_temp.acc(tm_docs, d);  PERFORM pg_temp.ck(r ? 'eligible', 'doctors.view may read, got ' || r::text);
  r := pg_temp.acc(tm_view, d);  PERFORM pg_temp.ck(r ? 'eligible', 'plan_requests.view may read, got ' || r::text);

  -- reason: ok_plan / plan_not_eligible (free trial, ended paid period, free active) / ok_override / blocked_override
  r := pg_temp.acc(sa, d_a);
  PERFORM pg_temp.ck(r->>'reason' = 'ok_plan' AND (r->>'eligible')::boolean AND r->>'plan_tier' = 'pro' AND r->>'plan_status' = 'active'
                     AND jsonb_typeof(r->'plan_end') = 'null' AND r->'override' = 'null'::jsonb AND (r->>'cap')::int = 2000 AND (r->>'patient_count')::int = 0, 'ok_plan, got ' || r::text);
  r := pg_temp.acc(sa, d_free);
  PERFORM pg_temp.ck(r->>'reason' = 'plan_not_eligible' AND NOT (r->>'eligible')::boolean AND r->>'plan_tier' = 'free' AND r->>'plan_status' = 'trial', 'trial -> plan_not_eligible, got ' || r::text);
  r := pg_temp.acc(sa, d_exp);
  PERFORM pg_temp.ck(r->>'reason' = 'plan_not_eligible' AND r->>'plan_tier' = 'pro' AND r->>'plan_status' = 'active' AND (r->>'plan_end')::timestamptz < now(), 'ended paid period -> plan_not_eligible with plan_end, got ' || r::text);
  r := pg_temp.acc(sa, d_dg);
  PERFORM pg_temp.ck(r->>'reason' = 'plan_not_eligible' AND r->>'plan_tier' = 'free', 'downgraded clinic -> plan_not_eligible, got ' || r::text);
  r := pg_temp.acc(sa, d_blk);
  PERFORM pg_temp.ck(r->>'reason' = 'blocked_override' AND NOT (r->>'eligible')::boolean AND r->'override'->>'mode' = 'blocked' AND r->'override'->>'reason' = 'abuse', 'blocked_override, got ' || r::text);
  r := pg_temp.acc(sa, d_allow);
  PERFORM pg_temp.ck(r->>'reason' = 'ok_override' AND (r->>'eligible')::boolean AND r->'override'->>'mode' = 'allowed' AND r->>'plan_tier' = 'free', 'ok_override on a free clinic, got ' || r::text);
  -- blocked on a premium clinic, allowed on a pro clinic that was already eligible
  INSERT INTO public.patient_import_overrides (doctor_id, mode, reason, set_by) VALUES (d_prem, 'blocked', 'abuse', sa);
  r := pg_temp.acc(sa, d_prem);
  PERFORM pg_temp.ck(r->>'reason' = 'blocked_override' AND r->>'plan_tier' = 'premium' AND (r->>'cap')::int = 10000, 'blocked premium, got ' || r::text);
  UPDATE public.patient_import_overrides SET mode = 'allowed' WHERE doctor_id = d_prem;
  r := pg_temp.acc(sa, d_prem);
  PERFORM pg_temp.ck(r->>'reason' = 'ok_override', 'allowed override wins even for a paid clinic, got ' || r::text);
  -- an ended override is not reported
  UPDATE public.patient_import_overrides SET until = now() - interval '1 day' WHERE doctor_id = d_prem;
  r := pg_temp.acc(sa, d_prem);
  PERFORM pg_temp.ck(r->>'reason' = 'ok_plan' AND r->'override' = 'null'::jsonb, 'ended override falls back to the plan, got ' || r::text);
  -- cancelled / expired status
  UPDATE public.profiles SET plan_status = 'cancelled' WHERE id = d_prem;
  r := pg_temp.acc(sa, d_prem);
  PERFORM pg_temp.ck(r->>'reason' = 'plan_not_eligible' AND r->>'plan_status' = 'cancelled', 'cancelled -> plan_not_eligible, got ' || r::text);
  -- the patient count is the clinic's own
  INSERT INTO public.patients (doctor_id, name, phone, age, gender) VALUES (d_a, 'Count One', '9000000011', 30, 'male');
  r := pg_temp.acc(sa, d_a);
  PERFORM pg_temp.ck((r->>'patient_count')::int = 1, 'patient_count counts the clinic, got ' || r::text);
  -- an approved cap shows
  r := pg_temp.acc(sa, d);
  PERFORM pg_temp.ck((r->>'cap')::int = ceil, 'approved cap shows in the summary, got ' || r::text);

  -------------------------------------------------------------------------
  -- Row-level security: clients cannot decide their own request through the API
  -------------------------------------------------------------------------
  INSERT INTO public.patient_import_requests (doctor_id, requested_cap) VALUES (d2, 9000) RETURNING id INTO req2;
  PERFORM pg_temp.ck(pg_temp.cnt(d2, 'SELECT 1 FROM public.patient_import_requests') = 1, 'a doctor sees only their own request');
  PERFORM pg_temp.ck(pg_temp.cnt(d2, 'SELECT 1 FROM public.patient_import_requests WHERE doctor_id <> auth.uid()') = 0, 'a doctor sees no other clinic''s requests');
  PERFORM pg_temp.ck(pg_temp.cnt(d, 'SELECT 1 FROM public.patient_import_requests WHERE doctor_id = ''' || d2 || '''') = 0, 'another doctor cannot read d2''s request');
  PERFORM pg_temp.ck(pg_temp.cnt(s_ok, 'SELECT 1 FROM public.patient_import_requests') >= 1, 'staff with patients.add sees the clinic''s requests');
  PERFORM pg_temp.ck(pg_temp.cnt(s_no, 'SELECT 1 FROM public.patient_import_requests') = 0, 'staff without patients.add sees none');
  PERFORM pg_temp.ck(pg_temp.cnt(nobody, 'SELECT 1 FROM public.patient_import_requests') = 0, 'a stranger sees none');
  PERFORM pg_temp.ck(pg_temp.cnt(tm_view, 'SELECT 1 FROM public.patient_import_requests') >= 2, 'plan_requests.view reads all requests');
  PERFORM pg_temp.ck(pg_temp.cnt(d2, 'SELECT 1 FROM public.patient_import_overrides') = 0, 'a doctor sees no overrides, not even their own');
  PERFORM pg_temp.ck(pg_temp.cnt(tm_view, 'SELECT 1 FROM public.patient_import_overrides') >= 1, 'plan_requests.view reads overrides');

  t := pg_temp.as_user(d2, format('UPDATE public.patient_import_requests SET status = ''approved'', approved_cap = 99999 WHERE id = %L', req2));
  PERFORM pg_temp.ck(t LIKE '42501:%', 'doctor UPDATE of own request must be denied, got ' || t);
  PERFORM pg_temp.ck((SELECT status FROM public.patient_import_requests WHERE id = req2) = 'pending', 'request still pending after the UPDATE attempt');
  t := pg_temp.as_user(d2, format('DELETE FROM public.patient_import_requests WHERE id = %L', req2));
  PERFORM pg_temp.ck(t LIKE '42501:%', 'doctor DELETE denied, got ' || t);
  t := pg_temp.as_user(d2, format('INSERT INTO public.patient_import_requests (doctor_id, requested_cap, status, approved_cap) VALUES (%L, 5, ''approved'', 99999)', d2));
  PERFORM pg_temp.ck(t LIKE '42501:%', 'doctor INSERT denied, got ' || t);
  t := pg_temp.as_user(sa, format('UPDATE public.patient_import_requests SET status = ''approved'' WHERE id = %L', req2));
  PERFORM pg_temp.ck(t LIKE '42501:%', 'even a superadmin must use the function, got ' || t);
  t := pg_temp.as_user(d2, format('INSERT INTO public.patient_import_overrides (doctor_id, mode, reason, set_by) VALUES (%L, ''allowed'', ''me'', %L)', d2, d2));
  PERFORM pg_temp.ck(t LIKE '42501:%', 'doctor cannot write overrides, got ' || t);
  t := pg_temp.as_user(d2, format('DELETE FROM public.patient_import_overrides WHERE doctor_id = %L', d_blk));
  PERFORM pg_temp.ck(t LIKE '42501:%', 'doctor cannot delete overrides, got ' || t);
  PERFORM pg_temp.ck(public.patient_import_cap(d2) = 2000, 'no cap change from client writes');
END $$;
SELECT 'pass' AS result;
ROLLBACK;
