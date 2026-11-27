-- Doctor logins cannot read other doctors' money (20261127130000). Rolled back; prints 'pass'.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/21_doctor_login_money.sql
BEGIN;
CREATE FUNCTION pg_temp.as_user(u uuid, r text DEFAULT 'authenticated') RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', CASE WHEN u IS NULL THEN '' ELSE json_build_object('sub', u, 'role', r)::text END, true)
$$;
DO $$
DECLARE
  d uuid := gen_random_uuid(); s_doc uuid := gen_random_uuid(); s_rec uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
  pa uuid; pb uuid; n int; r jsonb;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  VALUES (d, 'authenticated', 'authenticated', d::text || '@example.test', '{"full_name":"Dr Money"}'::jsonb);
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"account_type":"staff"}'::jsonb
    FROM unnest(ARRAY[s_doc, s_rec]) AS u;
  UPDATE public.profiles SET plan_tier = 'premium', plan_status = 'active', plan_end = now() + interval '30 days' WHERE id = d;
  INSERT INTO public.doctor_feature_overrides (doctor_id, feature_key, enabled, reason, granted_by) VALUES (d, 'multi_doctor', true, 'test', d);
  INSERT INTO public.clinic_doctor_seats (doctor_id, extra_seats, reason) VALUES (d, 2, 'test');
  INSERT INTO public.website_settings (doctor_id) VALUES (d) ON CONFLICT DO NOTHING;
  pa := public.primary_practitioner_id(d);
  INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (d, 'Dr Bee', 'dr-bee-money') RETURNING id INTO pb;
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status, role, practitioner_id)
  VALUES (s_doc, d, 'Dr Bee', 'drb-' || s_doc, '+1591' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"billing.view": true, "billing.manage": true}'::jsonb, d, 'active', 'doctor', pb);
  UPDATE public.practitioners SET user_id = s_doc WHERE id = pb;
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status)
  VALUES (s_rec, d, 'Reception', 'rec-' || s_rec, '+1592' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"billing.view": true}'::jsonb, d, 'active');
  INSERT INTO public.invoices (doctor_id, invoice_number, patient_name, service_name, amount, total_amount, status, payment_method, practitioner_id)
  VALUES (d, 'INV-M-A', 'M A', 'Visit', 100, 100, 'generated', 'cash', pa),
         (d, 'INV-M-B', 'M B', 'Visit', 200, 200, 'generated', 'cash', pb);
  INSERT INTO public.invoices (doctor_id, invoice_number, patient_name, service_name, amount, total_amount, status)
  VALUES (d, 'INV-M-U', 'M U', 'Visit', 50, 50, 'generated');

  SET LOCAL ROLE authenticated;
  -- doctor login with billing.view: refused the clinic report, sees only their own invoices
  PERFORM pg_temp.as_user(s_doc);
  r := public.get_practitioner_revenue(today - 5, today);
  IF (r->>'ok')::boolean OR r->>'error' <> 'DOCTOR_LOGIN' THEN RAISE EXCEPTION 'doctor login got the clinic report: %', r; END IF;
  SELECT count(*) INTO n FROM public.invoices WHERE doctor_id = d;
  IF n <> 1 THEN RAISE EXCEPTION 'doctor login should see exactly 1 invoice, saw %', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE invoice_number = 'INV-M-B') THEN RAISE EXCEPTION 'own invoice hidden'; END IF;
  UPDATE public.invoices SET patient_name = 'x' WHERE doctor_id = d AND invoice_number = 'INV-M-A';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'doctor login changed another doctor''s invoice'; END IF;
  -- reception with billing.view: unchanged, whole clinic
  PERFORM pg_temp.as_user(s_rec);
  r := public.get_practitioner_revenue(today - 5, today);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'reception refused: %', r; END IF;
  SELECT count(*) INTO n FROM public.invoices WHERE doctor_id = d;
  IF n <> 3 THEN RAISE EXCEPTION 'reception should see 3 invoices, saw %', n; END IF;
  -- owner: unchanged
  PERFORM pg_temp.as_user(d);
  r := public.get_practitioner_revenue(today - 5, today);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'owner refused: %', r; END IF;
  SELECT count(*) INTO n FROM public.invoices WHERE doctor_id = d;
  IF n <> 3 THEN RAISE EXCEPTION 'owner should see 3 invoices, saw %', n; END IF;
  -- stranger: refused, sees nothing
  PERFORM pg_temp.as_user(stranger);
  r := public.get_practitioner_revenue(today - 5, today);
  IF (r->>'ok')::boolean OR r->>'error' <> 'FORBIDDEN' THEN RAISE EXCEPTION 'stranger not refused: %', r; END IF;
  SELECT count(*) INTO n FROM public.invoices WHERE doctor_id = d;
  IF n <> 0 THEN RAISE EXCEPTION 'stranger saw invoices'; END IF;
  -- anon: no JWT
  PERFORM pg_temp.as_user(NULL, 'anon');
  RESET ROLE;
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.get_practitioner_revenue(today - 5, today);
    RAISE EXCEPTION 'anon could call the report';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
