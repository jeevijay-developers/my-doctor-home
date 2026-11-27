-- Multi-doctor P3 DB2: per-doctor revenue (invoice snapshot, get_practitioner_revenue,
-- get_my_practitioner_revenue, owner-only earnings switch). Rolled back; prints 'pass'.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/14_practitioner_revenue.sql
-- Synthetic data only; the script prints counts/booleans, never patient data.
BEGIN;
CREATE FUNCTION pg_temp.as_user(u uuid, r text DEFAULT 'authenticated') RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', CASE WHEN u IS NULL THEN '' ELSE json_build_object('sub', u, 'role', r)::text END, true)
$$;
CREATE FUNCTION pg_temp.row_of(r jsonb, pid uuid) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT e FROM jsonb_array_elements(r->'rows') e WHERE (e->>'practitioner_id')::uuid = pid
$$;
DO $$
DECLARE
  d   uuid := gen_random_uuid();   -- multi-doctor clinic owner, Dr A (GST registered)
  d1  uuid := gen_random_uuid();   -- single-doctor clinic
  s_view uuid := gen_random_uuid();  -- reception with billing.view
  s_no   uuid := gen_random_uuid();  -- staff without billing.view
  s_doc  uuid := gen_random_uuid();  -- Dr B's own login (role 'doctor')
  s_web  uuid := gen_random_uuid();  -- staff with website.edit
  stranger uuid := gen_random_uuid();
  pa uuid; pb uuid; pc uuid; pd uuid; p1 uuid;
  a1 uuid; a2 uuid; a3 uuid; a4 uuid; a5 uuid; a6 uuid; a7 uuid; a8 uuid; a9 uuid; a11 uuid;
  i7 uuid; i11 uuid; i6 uuid;
  r jsonb; ra jsonb; rb jsonb; rc jsonb; rs jsonb;
  n int; v_priv boolean;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  t_ist timestamp;
  inv public.invoices%ROWTYPE;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"full_name":"Dr Rev"}'::jsonb
    FROM unnest(ARRAY[d, d1]) AS u;
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"account_type":"staff"}'::jsonb
    FROM unnest(ARRAY[s_view, s_no, s_doc, s_web]) AS u;
  UPDATE public.profiles SET plan_tier = 'premium', plan_status = 'active', plan_end = now() + interval '30 days',
         gst_registered = true WHERE id = d;
  UPDATE public.profiles SET plan_status = 'trial', trial_end = now() + interval '5 days' WHERE id = d1;
  INSERT INTO public.doctor_feature_overrides (doctor_id, feature_key, enabled, reason, granted_by)
  VALUES (d, 'multi_doctor', true, 'test: revenue', d);
  INSERT INTO public.clinic_doctor_seats (doctor_id, extra_seats, reason) VALUES (d, 3, 'test');
  INSERT INTO public.website_settings (doctor_id) VALUES (d), (d1) ON CONFLICT DO NOTHING;
  pa := public.primary_practitioner_id(d);
  p1 := public.primary_practitioner_id(d1);
  INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (d, 'Dr Bee', 'dr-bee') RETURNING id INTO pb;
  INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (d, 'Dr Cee', 'dr-cee') RETURNING id INTO pc;
  INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (d, 'Dr Dee', 'dr-dee') RETURNING id INTO pd;
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status, role, practitioner_id)
  VALUES (s_doc, d, 'Dr Bee', 'drb-' || s_doc, '+1581' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"appointments.view": true}'::jsonb, d, 'active', 'doctor', pb);
  UPDATE public.practitioners SET user_id = s_doc WHERE id = pb;
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status)
  VALUES (s_view, d, 'Reception', 'rec-' || s_view, '+1582' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"billing.view": true}'::jsonb, d, 'active'),
         (s_no, d, 'NoBill', 'nob-' || s_no, '+1583' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"appointments.view": true}'::jsonb, d, 'active'),
         (s_web, d, 'Web', 'web-' || s_web, '+1584' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"website.edit": true, "website.view": true}'::jsonb, d, 'active');

  -- ---- Build the clinic's day through the real triggers (owner's JWT) ----
  PERFORM pg_temp.as_user(d);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status, payment_method, practitioner_id, status)
  VALUES (d, 'Rev A1', '9000000601', 'Visit', 'clinic', today, 500, 'RV01', 'paid', 'cash', pa, 'pending') RETURNING id INTO a1;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status, payment_method, practitioner_id, status)
  VALUES (d, 'Rev A2', '9000000602', 'Visit', 'clinic', today, 300, 'RV02', 'paid', 'cash', pb, 'pending') RETURNING id INTO a2;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status, practitioner_id, status)
  VALUES (d, 'Rev A3', '9000000603', 'Visit', 'clinic', today, 250, 'RV03', 'paid', pb, 'pending') RETURNING id INTO a3;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status, practitioner_id, status)
  VALUES (d, 'Rev A4', '9000000604', 'Visit', 'clinic', today, 200, 'RV04', 'paid', pb, 'pending') RETURNING id INTO a4;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status, practitioner_id, status)
  VALUES (d, 'Rev A5', '9000000605', 'Visit', 'clinic', today, 100, 'RV05', 'pending', pa, 'pending') RETURNING id INTO a5;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status, payment_method, practitioner_id, status)
  VALUES (d, 'Rev A6', '9000000606', 'Visit', 'clinic', today, 400, 'RV06', 'paid', 'cash', pb, 'pending') RETURNING id INTO a6;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status, payment_method, practitioner_id, status)
  VALUES (d, 'Rev A7', '9000000607', 'Visit', 'clinic', today, 600, 'RV07', 'paid', 'cash', pa, 'pending') RETURNING id INTO a7;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status, payment_method, practitioner_id, status)
  VALUES (d, 'Rev A8', '9000000608', 'Visit', 'clinic', today, 350, 'RV08', 'paid', 'cash', pb, 'pending') RETURNING id INTO a8;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status, payment_method, practitioner_id, status)
  VALUES (d, 'Rev A9', '9000000609', 'Visit', 'clinic', today, 150, 'RV09', 'paid', 'cash', pa, 'pending') RETURNING id INTO a9;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status, payment_method, practitioner_id, status)
  VALUES (d, 'Rev A11', '9000000611', 'Visit', 'clinic', today, 120, 'RV11', 'paid', 'cash', pa, 'pending') RETURNING id INTO a11;

  UPDATE public.appointments SET status = 'completed' WHERE id IN (a1, a2, a6, a7, a8, a9, a11);
  UPDATE public.appointments SET status = 'cancelled' WHERE id = a3;
  UPDATE public.appointments SET status = 'no_show' WHERE id IN (a4, a5);
  PERFORM pg_temp.as_user(NULL);

  -- Invoices carry the doctor, snapshotted at creation by the BEFORE INSERT trigger.
  SELECT count(*) INTO n FROM public.invoices WHERE doctor_id = d;
  IF n <> 7 THEN RAISE EXCEPTION 'expected 7 invoices (3 cancelled/no-show produce none), got %', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE appointment_id = a1 AND practitioner_id = pa)
     OR NOT EXISTS (SELECT 1 FROM public.invoices WHERE appointment_id = a2 AND practitioner_id = pb) THEN
    RAISE EXCEPTION 'invoice not attributed to its appointment''s doctor';
  END IF;
  IF EXISTS (SELECT 1 FROM public.invoices WHERE doctor_id = d AND practitioner_id IS NULL) THEN
    RAISE EXCEPTION 'an invoice has no doctor';
  END IF;

  -- Shape the data: methods, snapshot money, dates.
  UPDATE public.invoices SET payment_method = 'upi', commission_amount = 30, net_amount = 270 WHERE appointment_id = a2;
  UPDATE public.invoices SET payment_method = 'card',
         created_at = ((today - 1)::timestamp + time '23:30') AT TIME ZONE 'Asia/Kolkata' WHERE appointment_id = a6 RETURNING id INTO i6;
  UPDATE public.invoices SET status = 'refunded',
         created_at = ((today - 1)::timestamp + time '12:00') AT TIME ZONE 'Asia/Kolkata',
         refunded_at = (today::timestamp + time '10:00') AT TIME ZONE 'Asia/Kolkata' WHERE appointment_id = a7 RETURNING id INTO i7;
  UPDATE public.invoices SET payment_method = 'online' WHERE appointment_id = a8;
  UPDATE public.invoices SET created_at = (today::timestamp + time '00:30') AT TIME ZONE 'Asia/Kolkata'
   WHERE appointment_id = a11 RETURNING id INTO i11;
  -- Snapshot wins: the appointment is deleted (a8) or moved to another doctor (a9) after invoicing.
  DELETE FROM public.appointments WHERE id = a8;
  IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE doctor_id = d AND appointment_id IS NULL AND practitioner_id = pb AND amount = 350) THEN
    RAISE EXCEPTION 'deleting the appointment lost the invoice''s doctor';
  END IF;
  BEGIN
    UPDATE public.appointments SET practitioner_id = pb WHERE id = a9;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'moving a9 to another doctor refused (%): snapshot still checked below', SQLERRM;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE appointment_id = a9 AND practitioner_id = pa) THEN
    RAISE EXCEPTION 'reassigning the appointment moved the invoice''s doctor';
  END IF;
  -- An explicit value is never overwritten; an invoice with no appointment and no value stays unattributed.
  INSERT INTO public.invoices (doctor_id, invoice_number, patient_name, service_name, amount, total_amount, status, payment_method, practitioner_id)
  VALUES (d, 'INV-TEST-C1', 'Rev C', 'Visit', 40, 40, 'generated', 'cash', pc);
  INSERT INTO public.invoices (doctor_id, invoice_number, patient_name, service_name, amount, total_amount, status, net_amount)
  VALUES (d, 'INV-TEST-U1', 'Rev U', 'Visit', 70, 70, 'generated', 70);
  INSERT INTO public.invoices (doctor_id, appointment_id, invoice_number, patient_name, service_name, amount, total_amount, status, practitioner_id)
  VALUES (d, a9, 'INV-TEST-X1', 'Rev X', 'Visit', 1, 1, 'generated', pb) ON CONFLICT DO NOTHING;  -- a9 already has one: ignored
  IF (SELECT practitioner_id FROM public.invoices WHERE doctor_id = d AND invoice_number = 'INV-TEST-C1') IS DISTINCT FROM pc THEN
    RAISE EXCEPTION 'explicit practitioner overwritten';
  END IF;
  IF (SELECT practitioner_id FROM public.invoices WHERE doctor_id = d AND invoice_number = 'INV-TEST-U1') IS NOT NULL THEN
    RAISE EXCEPTION 'orphan invoice got a doctor';
  END IF;
  BEGIN
    INSERT INTO public.invoices (doctor_id, invoice_number, patient_name, service_name, amount, total_amount, status, practitioner_id)
    VALUES (d, 'INV-TEST-M1', 'Rev M', 'Visit', 5, 5, 'generated', p1);   -- another clinic's doctor
    RAISE EXCEPTION 'foreign practitioner accepted on an invoice';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PRACTITIONER_MISMATCH' THEN RAISE; END IF;
  END;
  -- Clients cannot re-point an invoice at another doctor afterwards.
  PERFORM pg_temp.as_user(d);
  BEGIN
    UPDATE public.invoices SET practitioner_id = pb WHERE appointment_id = a1;
    RAISE EXCEPTION 'client re-pointed an invoice to another doctor';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  PERFORM pg_temp.as_user(NULL);
  -- Dr Cee leaves: still has activity so still listed; Dr Dee leaves with none so not listed.
  UPDATE public.practitioners SET is_active = false WHERE id IN (pc, pd);

  -- ---- The clinic report ----
  PERFORM pg_temp.as_user(d);
  r := public.get_practitioner_revenue(today, today);
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION 'owner report refused: %', r; END IF;
  ra := pg_temp.row_of(r, pa);  rb := pg_temp.row_of(r, pb);  rc := pg_temp.row_of(r, pc);
  IF ra IS NULL OR rb IS NULL OR rc IS NULL THEN RAISE EXCEPTION 'missing doctor rows: %', r->'rows'; END IF;
  IF pg_temp.row_of(r, pd) IS NOT NULL THEN RAISE EXCEPTION 'inactive doctor without activity listed'; END IF;
  IF (rc->>'is_active')::boolean OR NOT (ra->>'is_active')::boolean OR rb->>'display_name' IS DISTINCT FROM 'Dr Bee' THEN
    RAISE EXCEPTION 'is_active/display_name wrong: % %', rb, rc;
  END IF;
  -- Dr A: a1 500 + a9 150 + a11 120 (IST 00:30 today = yesterday in UTC); a7 is refunded.
  IF (ra->>'visits_completed')::int <> 4 OR (ra->>'paid_amount')::numeric <> 770 OR (ra->>'gst_amount')::numeric <> 138.6
     OR (ra->'by_mode'->>'cash')::numeric <> 770 OR (ra->>'refunds_count')::int <> 1 OR (ra->>'refunds_amount')::numeric <> 600
     OR (ra->>'no_shows')::int <> 1 OR (ra->>'paid_no_shows_count')::int <> 0 OR (ra->>'paid_no_shows_amount')::numeric <> 0
     OR (ra->>'platform_charge')::numeric <> 0 OR (ra->>'net')::numeric <> 770
     OR (ra->>'net_after_refunds')::numeric <> 170 THEN   -- P3 hardening: net 770 - refunds 600
    RAISE EXCEPTION 'Dr A row wrong: %', ra;
  END IF;
  -- Dr B: a2 300 (upi) + the invoice of the deleted appointment 350 (online); a6's invoice is yesterday IST.
  IF (rb->>'visits_completed')::int <> 2 OR (rb->>'paid_amount')::numeric <> 650 OR (rb->>'gst_amount')::numeric <> 117
     OR (rb->'by_mode'->>'upi')::numeric <> 300 OR (rb->'by_mode'->>'online')::numeric <> 350
     OR (rb->'by_mode'->>'cash')::numeric <> 0 OR (rb->'by_mode'->>'unrecorded')::numeric <> 0
     OR (rb->>'refunds_count')::int <> 0 OR (rb->>'no_shows')::int <> 1
     OR (rb->>'paid_no_shows_count')::int <> 1 OR (rb->>'paid_no_shows_amount')::numeric <> 200
     OR (rb->>'platform_charge')::numeric <> 30 OR (rb->>'net')::numeric <> 620
     OR (rb->>'net_after_refunds')::numeric <> 620 THEN
    RAISE EXCEPTION 'Dr B row wrong: %', rb;
  END IF;
  -- The cancelled-but-paid appointment (a3, 250) is nowhere: no invoice, not a no-show.
  IF (rb->>'paid_amount')::numeric + (rb->>'paid_no_shows_amount')::numeric <> 850 THEN RAISE EXCEPTION 'cancelled paid counted'; END IF;
  IF (rc->>'paid_amount')::numeric <> 40 THEN RAISE EXCEPTION 'Dr C row wrong: %', rc; END IF;
  IF (r->'unattributed'->>'paid_amount')::numeric <> 70 OR (r->'unattributed'->'by_mode'->>'unrecorded')::numeric <> 70
     OR (r->'unattributed'->>'net')::numeric <> 70 OR (r->'unattributed'->>'net_after_refunds')::numeric <> 70 THEN
    RAISE EXCEPTION 'unattributed wrong: %', r->'unattributed';
  END IF;
  IF (r->'totals'->>'paid_amount')::numeric <> 1530 OR (r->'totals'->>'gst_amount')::numeric <> 255.6
     OR (r->'totals'->>'visits_completed')::int <> 6 OR (r->'totals'->>'refunds_count')::int <> 1
     OR (r->'totals'->>'refunds_amount')::numeric <> 600 OR (r->'totals'->>'no_shows')::int <> 2
     OR (r->'totals'->>'platform_charge')::numeric <> 30 OR (r->'totals'->>'net')::numeric <> 1500
     OR (r->'totals'->>'net_after_refunds')::numeric <> 900 THEN   -- 1500 - 600 refunded today
    RAISE EXCEPTION 'totals wrong: %', r->'totals';
  END IF;
  IF r->>'from' <> today::text OR r->>'to' <> today::text THEN RAISE EXCEPTION 'from/to not echoed: %', r; END IF;
  -- IST day boundaries: yesterday holds a6's 23:30 IST invoice (card, Dr B) and not the 00:30 IST one.
  r := public.get_practitioner_revenue(today - 1, today - 1);
  rb := pg_temp.row_of(r, pb);  ra := pg_temp.row_of(r, pa);
  IF (rb->>'paid_amount')::numeric <> 400 OR (rb->'by_mode'->>'card')::numeric <> 400 THEN RAISE EXCEPTION 'yesterday Dr B wrong: %', rb; END IF;
  -- P3 hardening: Dr A's yesterday holds a7's 600 invoice AS INVOICED although it was refunded today (the
  -- refund itself stays in today's report); the IST 00:30 invoice of a11 (120) is today, not yesterday.
  IF ra IS NULL OR (ra->>'paid_amount')::numeric <> 600 OR (ra->>'refunds_count')::int <> 0 OR (ra->>'refunds_amount')::numeric <> 0
     OR (ra->>'net_after_refunds')::numeric <> 600 THEN
    RAISE EXCEPTION 'refunded invoice must count in the period it was issued (and the IST 00:30 one must not): %', ra;
  END IF;
  -- Validation.
  r := public.get_practitioner_revenue(NULL, today);
  IF COALESCE((r->>'ok')::boolean, true) OR r->>'error' IS NULL THEN RAISE EXCEPTION 'NULL from accepted: %', r; END IF;
  r := public.get_practitioner_revenue(today, today - 1);
  IF COALESCE((r->>'ok')::boolean, true) THEN RAISE EXCEPTION 'from > to accepted'; END IF;
  r := public.get_practitioner_revenue(today - 400, today);
  IF COALESCE((r->>'ok')::boolean, true) THEN RAISE EXCEPTION 'range over 366 days accepted'; END IF;
  r := public.get_practitioner_revenue(today - 365, today);
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION '366-day range refused: %', r; END IF;

  -- ---- Who may read the clinic report ----
  PERFORM pg_temp.as_user(s_view);
  r := public.get_practitioner_revenue(today, today);
  IF NOT COALESCE((r->>'ok')::boolean, false) OR (r->'totals'->>'paid_amount')::numeric <> 1530 THEN
    RAISE EXCEPTION 'reception with billing.view refused/wrong: %', r->'error';
  END IF;
  PERFORM pg_temp.as_user(s_no);
  r := public.get_practitioner_revenue(today, today);
  IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'staff without billing.view: %', r; END IF;
  PERFORM pg_temp.as_user(s_doc);
  r := public.get_practitioner_revenue(today, today);
  IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'doctor login read the clinic report: %', r; END IF;
  PERFORM pg_temp.as_user(stranger);
  r := public.get_practitioner_revenue(today, today);
  IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'stranger read the clinic report: %', r; END IF;
  PERFORM pg_temp.as_user(NULL);
  r := public.get_practitioner_revenue(today, today);
  IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'no caller read the clinic report: %', r; END IF;
  PERFORM pg_temp.as_user(NULL, 'anon');
  SET LOCAL ROLE anon;
  v_priv := false;
  BEGIN
    r := public.get_practitioner_revenue(today, today);
    IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'anon read the clinic report: %', r; END IF;
  EXCEPTION WHEN insufficient_privilege THEN v_priv := true;
  END;
  RESET ROLE;

  -- ---- Single-doctor clinic: one row equal to the totals ----
  PERFORM pg_temp.as_user(d1);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status, payment_method, status)
  VALUES (d1, 'Solo 1', '9000000701', 'Visit', 'clinic', today, 200, 'SO01', 'paid', 'cash', 'pending') RETURNING id INTO a1;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status, payment_method, status)
  VALUES (d1, 'Solo 2', '9000000702', 'Visit', 'clinic', today, 300, 'SO02', 'paid', 'cash', 'pending') RETURNING id INTO a2;
  UPDATE public.appointments SET status = 'completed' WHERE id IN (a1, a2);
  r := public.get_practitioner_revenue(today, today);
  IF NOT COALESCE((r->>'ok')::boolean, false) OR jsonb_array_length(r->'rows') <> 1 THEN RAISE EXCEPTION 'single-doctor rows: %', r; END IF;
  rs := r->'rows'->0;
  IF (rs->>'practitioner_id')::uuid <> p1 OR (rs->>'paid_amount')::numeric <> 500 OR (rs->>'visits_completed')::int <> 2
     OR (rs->>'paid_amount')::numeric <> (r->'totals'->>'paid_amount')::numeric
     OR (rs->>'visits_completed')::int <> (r->'totals'->>'visits_completed')::int
     OR (r->'unattributed'->>'paid_amount')::numeric <> 0 THEN
    RAISE EXCEPTION 'single-doctor clinic row <> totals: %', r;
  END IF;
  PERFORM pg_temp.as_user(NULL);

  -- ---- The earnings switch: off by default, owner-only ----
  IF (SELECT show_doctor_earnings FROM public.website_settings WHERE doctor_id = d) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'show_doctor_earnings should default to false';
  END IF;
  PERFORM pg_temp.as_user(s_doc);
  r := public.get_my_practitioner_revenue(today, today);
  IF r->>'error' IS DISTINCT FROM 'NOT_ENABLED' THEN RAISE EXCEPTION 'doctor login saw earnings while switched off: %', r; END IF;
  PERFORM pg_temp.as_user(d);
  r := public.get_my_practitioner_revenue(today, today);
  IF r->>'error' IS DISTINCT FROM 'NOT_ENABLED' THEN RAISE EXCEPTION 'my-earnings should be off for the owner too until switched on: %', r; END IF;
  -- A staff member (even with website.edit) cannot flip it.
  PERFORM pg_temp.as_user(s_web);
  BEGIN
    UPDATE public.website_settings SET show_doctor_earnings = true WHERE doctor_id = d;
    RAISE EXCEPTION 'staff switched earnings on';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'OWNER_ONLY' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.website_settings (doctor_id, show_doctor_earnings) VALUES (gen_random_uuid(), true);
    RAISE EXCEPTION 'non-owner inserted a row with earnings on';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'OWNER_ONLY' THEN RAISE; END IF;
  WHEN foreign_key_violation THEN RAISE EXCEPTION 'insert guard should fire before the FK';
  END;
  -- Same-clinic updates that do not touch it still work for that staff member.
  UPDATE public.website_settings SET theme = theme WHERE doctor_id = d;
  PERFORM pg_temp.as_user(d);
  UPDATE public.website_settings SET show_doctor_earnings = true WHERE doctor_id = d;
  IF NOT (SELECT show_doctor_earnings FROM public.website_settings WHERE doctor_id = d) THEN RAISE EXCEPTION 'owner could not switch earnings on'; END IF;

  -- ---- My earnings: aggregate numbers for MY row only ----
  PERFORM pg_temp.as_user(s_doc);
  r := public.get_my_practitioner_revenue(today, today);
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION 'doctor login refused after switch on: %', r; END IF;
  IF r ? 'rows' OR r ? 'totals' OR r ? 'unattributed' THEN RAISE EXCEPTION 'my earnings leaks clinic-wide keys: %', r; END IF;
  rb := r->'row';
  IF rb IS NULL OR (rb->>'practitioner_id')::uuid <> pb OR (rb->>'paid_amount')::numeric <> 650 OR (rb->>'visits_completed')::int <> 2
     OR (rb->>'net')::numeric <> 620 OR (rb->'by_mode'->>'upi')::numeric <> 300 THEN
    RAISE EXCEPTION 'doctor B sees wrong numbers: %', r;
  END IF;
  IF r::text ~* '(invoice|INV-|patient|Rev A|9000000)' THEN RAISE EXCEPTION 'my earnings contains identifying text'; END IF;
  -- A parameter cannot choose someone else's row (there is none) and bad ranges are refused.
  r := public.get_my_practitioner_revenue(today, today - 3);
  IF COALESCE((r->>'ok')::boolean, true) THEN RAISE EXCEPTION 'bad range accepted by my earnings'; END IF;
  -- The owner (Dr A, the primary) sees their own row.
  PERFORM pg_temp.as_user(d);
  r := public.get_my_practitioner_revenue(today, today);
  IF NOT COALESCE((r->>'ok')::boolean, false) OR (r->'row'->>'practitioner_id')::uuid <> pa OR (r->'row'->>'paid_amount')::numeric <> 770 THEN
    RAISE EXCEPTION 'owner my-earnings wrong: %', r;
  END IF;
  -- Reception (not a doctor) and strangers are refused; so is a doctor login once switched off.
  PERFORM pg_temp.as_user(s_view);
  r := public.get_my_practitioner_revenue(today, today);
  IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'reception got my-earnings: %', r; END IF;
  PERFORM pg_temp.as_user(stranger);
  r := public.get_my_practitioner_revenue(today, today);
  IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'stranger got my-earnings: %', r; END IF;
  PERFORM pg_temp.as_user(NULL);
  r := public.get_my_practitioner_revenue(today, today);
  IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'no caller got my-earnings: %', r; END IF;
  UPDATE public.website_settings SET show_doctor_earnings = false WHERE doctor_id = d;
  PERFORM pg_temp.as_user(s_doc);
  r := public.get_my_practitioner_revenue(today, today);
  IF r->>'error' IS DISTINCT FROM 'NOT_ENABLED' THEN RAISE EXCEPTION 'doctor login still sees earnings after switch off: %', r; END IF;
  -- A suspended doctor login is refused.
  PERFORM pg_temp.as_user(d);
  UPDATE public.website_settings SET show_doctor_earnings = true WHERE doctor_id = d;
  PERFORM pg_temp.as_user(s_doc);
  PERFORM pg_temp.as_user(NULL);
  UPDATE public.staff_members SET status = 'inactive' WHERE id = s_doc;
  PERFORM pg_temp.as_user(s_doc);
  r := public.get_my_practitioner_revenue(today, today);
  IF r->>'error' IS NULL THEN RAISE EXCEPTION 'disabled doctor login still sees earnings: %', r; END IF;
  PERFORM pg_temp.as_user(NULL);
END $$;
SELECT 'pass' AS result;
ROLLBACK;
