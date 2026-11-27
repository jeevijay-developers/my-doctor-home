-- Multi-doctor P3 hardening (20261127100500_p3_hardening.sql): seat order terms, "not applied must
-- stay visible", renewal seats, seats follow plan_end, superadmin settings, review limits, directory
-- view, service mappings vs inactive doctors, access-log index. Rolled back; prints 'pass'.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/18_p3_hardening.sql
-- Synthetic data only; the script prints a single 'pass' row.
BEGIN;
CREATE FUNCTION pg_temp.as_user(u uuid, r text DEFAULT 'authenticated') RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', CASE WHEN u IS NULL AND r IS NULL THEN ''
                    WHEN u IS NULL THEN json_build_object('role', r)::text
                    ELSE json_build_object('sub', u, 'role', r)::text END, true)
$$;
-- A seat payment that must NOT be applied: exact result shape, needs_refund, audit row, owner notification,
-- and a second call must not pretend it was applied.
CREATE FUNCTION pg_temp.expect_unapplied(pay uuid, expect text, clinic uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  r jsonb;
  n0 int;
  n1 int;
BEGIN
  SELECT count(*) INTO n0 FROM public.notifications
   WHERE doctor_id = clinic AND recipient_user_id = clinic AND source_type = 'plan_warning'
     AND title = 'A seat payment needs attention';
  r := public.apply_plan_upgrade_payment(pay, 'rzp_' || pay);
  IF r IS DISTINCT FROM jsonb_build_object('ok', false, 'code', expect, 'kind', 'seats', 'needs_refund', true) THEN
    RAISE EXCEPTION 'expected not-applied % but got %', expect, r;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.plan_upgrade_payments
                  WHERE id = pay AND status::text = 'captured' AND needs_refund AND needs_refund_reason = expect) THEN
    RAISE EXCEPTION 'payment % not flagged needs_refund (%)', pay, expect;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_audit_log WHERE target_id = pay AND action = 'seat_payment_not_applied_' || expect) THEN
    RAISE EXCEPTION 'no audit row for %', expect;
  END IF;
  SELECT count(*) INTO n1 FROM public.notifications
   WHERE doctor_id = clinic AND recipient_user_id = clinic AND source_type = 'plan_warning'
     AND title = 'A seat payment needs attention';
  IF n1 <> n0 + 1 THEN RAISE EXCEPTION 'no owner notification for % (% -> %)', expect, n0, n1; END IF;
  IF EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE payment_id = pay) THEN
    RAISE EXCEPTION 'a seat period exists for the unapplied payment %', expect;
  END IF;
  -- The webhook/verify retry must not turn it into a success.
  r := public.apply_plan_upgrade_payment(pay, 'rzp_' || pay);
  IF r IS DISTINCT FROM jsonb_build_object('ok', false, 'code', 'not_applied', 'kind', 'seats', 'needs_refund', true) THEN
    RAISE EXCEPTION 'replay of an unapplied payment (%): %', expect, r;
  END IF;
END $$;
-- Does this setting write fail (validator)?
CREATE FUNCTION pg_temp.setting_rejected(k text, v jsonb) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.platform_settings SET value = v WHERE key = k;
  RETURN false;
EXCEPTION WHEN OTHERS THEN
  RETURN true;
END $$;
-- Used to prove a failing notification can never fail the payment function.
CREATE FUNCTION public.zz_p3h_fail_seat_notification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.zz_fail_notify', true) = 'on' AND NEW.title = 'A seat payment needs attention' THEN
    RAISE EXCEPTION 'zz boom';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER zz_p3h_fail_seat_notification BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.zz_p3h_fail_seat_notification();

DO $$
DECLARE
  d   uuid := gen_random_uuid();   -- premium clinic with the pilot override
  d2  uuid := gen_random_uuid();   -- premium clinic WITHOUT the override (feature off)
  dr  uuid := gen_random_uuid();   -- onboarded clinic for the review limits
  dr2 uuid := gen_random_uuid();   -- a second onboarded clinic
  dm  uuid := gen_random_uuid();   -- polyclinic for the service mappings
  sa  uuid := gen_random_uuid();   -- superadmin owner
  tm_yes uuid := gen_random_uuid(); -- team member with flags.manage
  tm_no  uuid := gen_random_uuid(); -- team member without it
  s_no   uuid := gen_random_uuid(); -- clinic staff
  stranger uuid := gen_random_uuid();
  pay uuid; pay2 uuid; pay3 uuid; pay4 uuid;
  pm_a uuid; pm_b uuid; pm_c uuid;
  sv_x uuid; sv_dup1 uuid; sv_dup2 uuid;
  r jsonb; n int; n0 int; lim int;
  pe timestamptz;
  v_priv boolean;
  deflt numeric;
  t text;
  tmr date := (now() AT TIME ZONE 'Asia/Kolkata')::date + 1;
  a_old jsonb; a_new jsonb;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"full_name":"Dr P3H"}'::jsonb
    FROM unnest(ARRAY[d, d2, dr, dr2, dm]) AS u;
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{}'::jsonb
    FROM unnest(ARRAY[sa, tm_yes, tm_no, stranger]) AS u;
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"account_type":"staff"}'::jsonb
    FROM unnest(ARRAY[s_no]) AS u;
  DELETE FROM public.profiles WHERE id IN (sa, tm_yes, tm_no, stranger);
  UPDATE public.profiles SET plan_tier = 'premium', plan_status = 'active', plan_end = now() + interval '15 days' WHERE id IN (d, d2, dm);
  -- Visitors (anon) can only see / review / book onboarded clinics that have a public slug.
  UPDATE public.profiles SET onboarding_completed = true, slug = 'zz-p3h-' || substr(replace(id::text, '-', ''), 1, 12) WHERE id IN (dr, dr2, dm);
  IF EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'multi_doctor_enabled' AND value = 'true'::jsonb) THEN
    UPDATE public.profiles SET plan_tier = 'free' WHERE id = d2;
  END IF;
  INSERT INTO public.doctor_feature_overrides (doctor_id, feature_key, enabled, reason, granted_by)
  VALUES (d, 'multi_doctor', true, 'test: p3 hardening', d), (dm, 'multi_doctor', true, 'test: p3 hardening', dm);
  INSERT INTO public.user_roles (user_id, role) VALUES (sa, 'admin');
  INSERT INTO public.superadmin_team_members (id, name, phone, status, permissions, created_by) VALUES
    (tm_yes, 'TM Yes', '+1591' || lpad((floor(random()*1e7))::int::text, 7, '0'), 'active', '{"flags.manage": true, "flags.view": true}'::jsonb, sa),
    (tm_no,  'TM No',  '+1592' || lpad((floor(random()*1e7))::int::text, 7, '0'), 'active', '{"doctors.view": true}'::jsonb, sa);
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status)
  VALUES (s_no, d, 'NoFlags', 'nof-' || s_no, '+1593' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"billing.manage": true, "billing.view": true}'::jsonb, d, 'active');
  UPDATE public.platform_settings SET value = '600'::jsonb WHERE key = 'doctor_seat_price';
  UPDATE public.platform_settings SET value = '15'::jsonb WHERE key = 'doctor_seat_max';

  ----------------------------------------------------------------------------- 1. Seat order terms
  r := public.seat_order_quote(d, 1001);
  IF r->>'error' IS DISTINCT FROM 'INVALID_QTY' THEN RAISE EXCEPTION '1: qty 1001: %', r; END IF;
  r := public.seat_order_quote(d, 2147483647);   -- would overflow granted + active + qty
  IF r->>'error' IS DISTINCT FROM 'INVALID_QTY' THEN RAISE EXCEPTION '1: qty int max: %', r; END IF;
  r := public.seat_order_quote(d, 1000);
  IF r->>'error' IS DISTINCT FROM 'SEAT_MAX' THEN RAISE EXCEPTION '1: qty 1000 should be SEAT_MAX: %', r; END IF;
  -- More than 30 days left: charged for 30 days AND the period is 30 days (never the whole plan).
  UPDATE public.profiles SET plan_end = now() + interval '60 days' WHERE id = d;
  r := public.seat_order_quote(d, 1);
  IF NOT (r->>'ok')::boolean OR (r->>'amount_paise')::bigint <> 60000
     OR (r->>'period_end')::timestamptz <> now() + interval '30 days' THEN
    RAISE EXCEPTION '1: 60 days left must quote 30 days of seats: %', r;
  END IF;
  -- Fewer than 30 days: period ends at plan_end.
  UPDATE public.profiles SET plan_end = now() + interval '15 days' WHERE id = d;
  r := public.seat_order_quote(d, 2);
  SELECT plan_end INTO pe FROM public.profiles WHERE id = d;
  IF (r->>'amount_paise')::bigint <> 60000 OR (r->>'period_end')::timestamptz <> pe THEN
    RAISE EXCEPTION '1: 15 days left: %', r;
  END IF;

  ----------------------------------------------------------------------------- 2. Order terms are what was paid for
  -- a) happy path: period = [now, pay.period_end), needs_refund stays false.
  pay := gen_random_uuid();
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock,
                                            kind, seats_quantity, unit_price, period_start, period_end)
  VALUES (pay, d, 'premium', 'premium', 600, 'created', 'o_' || pay, false, 'seats', 2, 600, now(), now() + interval '15 days');
  IF (SELECT needs_refund FROM public.plan_upgrade_payments WHERE id = pay) IS DISTINCT FROM false THEN
    RAISE EXCEPTION '2a: needs_refund should default to false';
  END IF;
  r := public.apply_plan_upgrade_payment(pay, 'rzp_' || pay);
  IF NOT COALESCE((r->>'ok')::boolean, false) OR r->>'kind' <> 'seats' OR (r->>'seat_limit')::int <> 3
     OR (r->>'period_end')::timestamptz <> pe THEN RAISE EXCEPTION '2a: %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE payment_id = pay AND quantity = 2 AND ends_at = now() + interval '15 days') THEN
    RAISE EXCEPTION '2a: period wrong';
  END IF;
  IF (SELECT needs_refund FROM public.plan_upgrade_payments WHERE id = pay) THEN RAISE EXCEPTION '2a: applied payment flagged'; END IF;
  -- The captured early return says "applied" only because a period exists.
  r := public.apply_plan_upgrade_payment(pay, 'rzp_' || pay);
  IF NOT COALESCE((r->>'ok')::boolean, false) OR (r->>'already_verified')::boolean IS DISTINCT FROM true OR r->>'kind' <> 'seats' THEN
    RAISE EXCEPTION '2a: replay of an applied payment: %', r;
  END IF;
  DELETE FROM public.clinic_seat_periods WHERE payment_id = pay;
  r := public.apply_plan_upgrade_payment(pay, 'rzp_' || pay);   -- period gone (e.g. withdrawn): not a success any more
  IF r IS DISTINCT FROM jsonb_build_object('ok', false, 'code', 'not_applied', 'kind', 'seats', 'needs_refund', true) THEN
    RAISE EXCEPTION '2a: captured payment without a period reported as applied: %', r;
  END IF;

  -- b) the plan was extended after the quote: seats still end where the ORDER ended, never later.
  pay2 := gen_random_uuid();
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock,
                                            kind, seats_quantity, unit_price, period_start, period_end)
  VALUES (pay2, d, 'premium', 'premium', 100, 'created', 'o_' || pay2, false, 'seats', 1, 600, now(), now() + interval '2 hours');
  UPDATE public.profiles SET plan_end = now() + interval '30 days' WHERE id = d;
  r := public.apply_plan_upgrade_payment(pay2, 'rzp_' || pay2);
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION '2b: extended plan refused: %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE payment_id = pay2 AND ends_at = now() + interval '2 hours') THEN
    RAISE EXCEPTION '2b: period must end at the order''s period_end (2 hours), not at the new plan_end';
  END IF;
  DELETE FROM public.clinic_seat_periods WHERE doctor_id = d;
  -- c) the plan was shortened after the quote (more than 60 seconds): not applied.
  UPDATE public.profiles SET plan_end = now() + interval '5 days' WHERE id = d;
  pay3 := gen_random_uuid();
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock,
                                            kind, seats_quantity, unit_price, period_start, period_end)
  VALUES (pay3, d, 'premium', 'premium', 600, 'created', 'o_' || pay3, false, 'seats', 1, 600, now(), now() + interval '10 days');
  PERFORM pg_temp.expect_unapplied(pay3, 'plan_changed', d);
  -- ...but a 30-second difference is tolerated.
  pay4 := gen_random_uuid();
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock,
                                            kind, seats_quantity, unit_price, period_start, period_end)
  VALUES (pay4, d, 'premium', 'premium', 600, 'created', 'o_' || pay4, false, 'seats', 1, 600, now(), now() + interval '5 days' + interval '30 seconds');
  r := public.apply_plan_upgrade_payment(pay4, 'rzp_' || pay4);
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION '2c: 30s tolerance: %', r; END IF;
  DELETE FROM public.clinic_seat_periods WHERE doctor_id = d;
  -- d) the order's own period is over (or was never set).
  UPDATE public.profiles SET plan_end = now() + interval '15 days' WHERE id = d;
  pay := gen_random_uuid();
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock, kind, seats_quantity, unit_price)
  VALUES (pay, d, 'premium', 'premium', 600, 'created', 'o_' || pay, false, 'seats', 1, 600);   -- no period_end
  PERFORM pg_temp.expect_unapplied(pay, 'order_expired', d);
  pay := gen_random_uuid();
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock,
                                            kind, seats_quantity, unit_price, period_start, period_end)
  VALUES (pay, d, 'premium', 'premium', 600, 'created', 'o_' || pay, false, 'seats', 1, 600, now() - interval '1 hour', now());   -- ends exactly now
  PERFORM pg_temp.expect_unapplied(pay, 'order_expired', d);
  -- e) the existing reasons are all still reported, flagged and notified.
  pay := gen_random_uuid();
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock,
                                            kind, seats_quantity, unit_price, period_start, period_end)
  VALUES (pay, d, 'premium', 'premium', 600, 'created', 'o_' || pay, false, 'seats', 1, 600, now(), now() + interval '10 days');
  UPDATE public.profiles SET plan_status = 'expired', plan_end = now() - interval '1 day' WHERE id = d;
  PERFORM pg_temp.expect_unapplied(pay, 'plan_lapsed', d);
  pay := gen_random_uuid();
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock,
                                            kind, seats_quantity, unit_price, period_start, period_end)
  VALUES (pay, d, 'premium', 'premium', 600, 'created', 'o_' || pay, false, 'seats', 1, 600, now(), now() + interval '10 days');
  UPDATE public.profiles SET plan_status = 'cancelled', plan_end = now() + interval '15 days' WHERE id = d;
  PERFORM pg_temp.expect_unapplied(pay, 'cancelled', d);
  UPDATE public.profiles SET plan_status = 'active', plan_end = now() + interval '15 days' WHERE id = d;
  pay := gen_random_uuid();
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock,
                                            kind, seats_quantity, unit_price, period_start, period_end)
  VALUES (pay, d2, 'premium', 'premium', 600, 'created', 'o_' || pay, false, 'seats', 1, 600, now(), now() + interval '10 days');
  PERFORM pg_temp.expect_unapplied(pay, 'not_enabled', d2);
  INSERT INTO public.clinic_doctor_seats (doctor_id, extra_seats, reason) VALUES (d, 13, 'test grant');
  pay := gen_random_uuid();
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock,
                                            kind, seats_quantity, unit_price, period_start, period_end)
  VALUES (pay, d, 'premium', 'premium', 600, 'created', 'o_' || pay, false, 'seats', 2, 600, now(), now() + interval '10 days');
  PERFORM pg_temp.expect_unapplied(pay, 'cap_exceeded', d);
  DELETE FROM public.clinic_doctor_seats WHERE doctor_id = d;
  -- f) a notification failure can NEVER fail the payment function.
  PERFORM set_config('app.zz_fail_notify', 'on', true);
  pay := gen_random_uuid();
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock, kind, seats_quantity, unit_price)
  VALUES (pay, d, 'premium', 'premium', 600, 'created', 'o_' || pay, false, 'seats', 1, 600);
  r := public.apply_plan_upgrade_payment(pay, 'rzp_' || pay);
  PERFORM set_config('app.zz_fail_notify', 'off', true);
  IF r IS DISTINCT FROM jsonb_build_object('ok', false, 'code', 'order_expired', 'kind', 'seats', 'needs_refund', true) THEN
    RAISE EXCEPTION '2f: failing notification broke the payment function: %', r;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.plan_upgrade_payments WHERE id = pay AND status::text = 'captured' AND needs_refund) THEN
    RAISE EXCEPTION '2f: payment not recorded when the notification failed';
  END IF;
  -- g) a plain plan payment keeps its shape (no needs_refund keys).
  UPDATE public.profiles SET plan_status = 'expired', plan_end = now() - interval '2 days' WHERE id = d;
  pay := gen_random_uuid();
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock)
  VALUES (pay, d, 'premium', 'premium', 3999, 'created', 'o_' || pay, false);
  r := public.apply_plan_upgrade_payment(pay, 'rzp_' || pay);
  IF NOT COALESCE((r->>'ok')::boolean, false) OR r ? 'kind' OR r ? 'needs_refund' OR r ? 'seats_clamped' THEN
    RAISE EXCEPTION '2g: plain payment shape changed: %', r;
  END IF;
  IF (SELECT needs_refund FROM public.plan_upgrade_payments WHERE id = pay) THEN RAISE EXCEPTION '2g: plain payment flagged'; END IF;

  ----------------------------------------------------------------------------- 3. Renewal seats
  UPDATE public.profiles SET plan_tier = 'premium', plan_status = 'active', plan_end = now() + interval '10 days' WHERE id = d;
  DELETE FROM public.pending_plans WHERE doctor_id = d;
  DELETE FROM public.clinic_seat_periods WHERE doctor_id = d;
  r := public.renewal_seats_check(d, 3);
  IF r IS DISTINCT FROM jsonb_build_object('ok', true) THEN RAISE EXCEPTION '3: ok case: %', r; END IF;
  FOREACH n IN ARRAY ARRAY[0, -1, 1001, 2147483647] LOOP
    r := public.renewal_seats_check(d, n);
    IF COALESCE((r->>'ok')::boolean, true) OR r->>'error' IS DISTINCT FROM 'INVALID_QTY' THEN RAISE EXCEPTION '3: qty %: %', n, r; END IF;
  END LOOP;
  r := public.renewal_seats_check(d, NULL);
  IF r->>'error' IS DISTINCT FROM 'INVALID_QTY' THEN RAISE EXCEPTION '3: qty NULL: %', r; END IF;
  r := public.renewal_seats_check(d2, 1);
  IF r IS DISTINCT FROM jsonb_build_object('ok', false, 'error', 'NOT_ENABLED') THEN RAISE EXCEPTION '3: not enabled: %', r; END IF;
  UPDATE public.platform_settings SET value = 'null'::jsonb WHERE key = 'doctor_seat_price';
  r := public.renewal_seats_check(d, 1);
  IF r->>'error' IS DISTINCT FROM 'PRICE_NOT_SET' THEN RAISE EXCEPTION '3: price unset: %', r; END IF;
  UPDATE public.platform_settings SET value = '600'::jsonb WHERE key = 'doctor_seat_price';
  -- SEAT_MAX counts granted + ACTIVE + SCHEDULED periods (max 15 => 14 extras).
  INSERT INTO public.clinic_doctor_seats (doctor_id, extra_seats, reason) VALUES (d, 3, 'test grant');
  INSERT INTO public.clinic_seat_periods (doctor_id, quantity, starts_at, ends_at) VALUES (d, 5, now() + interval '20 days', now() + interval '50 days');
  IF NOT (public.renewal_seats_check(d, 6)->>'ok')::boolean THEN RAISE EXCEPTION '3: 3 granted + 5 scheduled + 6 = 14 fits'; END IF;
  r := public.renewal_seats_check(d, 7);
  IF r->>'error' IS DISTINCT FROM 'SEAT_MAX' THEN RAISE EXCEPTION '3: scheduled periods must count: %', r; END IF;
  INSERT INTO public.clinic_seat_periods (doctor_id, quantity, starts_at, ends_at) VALUES (d, 1, now() - interval '1 day', now() + interval '5 days');
  r := public.renewal_seats_check(d, 6);
  IF r->>'error' IS DISTINCT FROM 'SEAT_MAX' THEN RAISE EXCEPTION '3: active periods must count: %', r; END IF;
  -- An ended period does not.
  UPDATE public.clinic_seat_periods SET starts_at = now() - interval '9 days', ends_at = now() - interval '1 day' WHERE doctor_id = d AND quantity = 1;
  IF NOT (public.renewal_seats_check(d, 6)->>'ok')::boolean THEN RAISE EXCEPTION '3: an ended period counted'; END IF;
  -- Clamp: a renewal with 10 seats where only 6 fit.
  pay := gen_random_uuid();
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock, seats_quantity, unit_price)
  VALUES (pay, d, 'premium', 'premium', 9999, 'created', 'o_' || pay, false, 10, 600);
  r := public.apply_plan_upgrade_payment(pay, 'rzp_' || pay);
  IF NOT COALESCE((r->>'ok')::boolean, false) OR (r->>'scheduled')::boolean IS DISTINCT FROM true
     OR (r->>'seats_clamped')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION '3: clamped renewal result: %', r;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE payment_id = pay AND quantity = 6) THEN RAISE EXCEPTION '3: clamp should leave 6 seats'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.plan_upgrade_payments WHERE id = pay AND needs_refund AND needs_refund_reason = 'renewal_seats_clamped') THEN
    RAISE EXCEPTION '3: clamped renewal not flagged for refund';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_audit_log WHERE target_id = pay AND action = 'renewal_seats_clamped') THEN
    RAISE EXCEPTION '3: clamp audit row lost';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pending_plans WHERE doctor_id = d AND payment_id = pay) THEN RAISE EXCEPTION '3: plan itself not scheduled'; END IF;
  -- No room at all: seats declined, plan still applies.
  UPDATE public.clinic_doctor_seats SET extra_seats = 14 WHERE doctor_id = d;
  DELETE FROM public.pending_plans WHERE doctor_id = d;
  DELETE FROM public.clinic_seat_periods WHERE doctor_id = d;
  pay := gen_random_uuid();
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock, seats_quantity, unit_price)
  VALUES (pay, d, 'premium', 'premium', 4599, 'created', 'o_' || pay, false, 2, 600);
  r := public.apply_plan_upgrade_payment(pay, 'rzp_' || pay);
  IF NOT COALESCE((r->>'ok')::boolean, false) OR (r->>'seats_clamped')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION '3: declined renewal result: %', r; END IF;
  IF EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE payment_id = pay) THEN RAISE EXCEPTION '3: seats granted with no room'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.plan_upgrade_payments WHERE id = pay AND needs_refund AND needs_refund_reason = 'renewal_seats_clamped') THEN
    RAISE EXCEPTION '3: declined renewal not flagged';
  END IF;
  -- Seats on a non-Premium renewal: declined, flagged, plan applies.
  DELETE FROM public.clinic_doctor_seats WHERE doctor_id = d;
  DELETE FROM public.pending_plans WHERE doctor_id = d;
  pay := gen_random_uuid();
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock, seats_quantity, unit_price)
  VALUES (pay, d, 'premium', 'pro', 1999, 'created', 'o_' || pay, false, 2, 600);
  r := public.apply_plan_upgrade_payment(pay, 'rzp_' || pay);
  IF NOT COALESCE((r->>'ok')::boolean, false) OR (r->>'seats_clamped')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION '3: pro renewal result: %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.plan_upgrade_payments WHERE id = pay AND needs_refund AND needs_refund_reason = 'renewal_seats_not_applied_tier') THEN
    RAISE EXCEPTION '3: pro renewal seats not flagged';
  END IF;
  -- A renewal whose seats fit is unflagged and has no seats_clamped key.
  DELETE FROM public.pending_plans WHERE doctor_id = d;
  pay := gen_random_uuid();
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock, seats_quantity, unit_price)
  VALUES (pay, d, 'premium', 'premium', 4599, 'created', 'o_' || pay, false, 2, 600);
  r := public.apply_plan_upgrade_payment(pay, 'rzp_' || pay);
  IF NOT COALESCE((r->>'ok')::boolean, false) OR r ? 'seats_clamped' THEN RAISE EXCEPTION '3: normal renewal result: %', r; END IF;
  IF (SELECT needs_refund FROM public.plan_upgrade_payments WHERE id = pay) THEN RAISE EXCEPTION '3: normal renewal flagged'; END IF;

  ----------------------------------------------------------------------------- 4. Seats follow plan_end
  -- (the renewal just applied is pending, with its seat period starting at plan_end)
  SELECT plan_end INTO pe FROM public.profiles WHERE id = d;
  IF NOT EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE payment_id = pay AND starts_at = pe AND ends_at = pe + interval '30 days') THEN
    RAISE EXCEPTION '4: setup: renewal period should start at plan_end';
  END IF;
  INSERT INTO public.clinic_seat_periods (doctor_id, quantity, starts_at, ends_at) VALUES (d, 1, pe, pe + interval '30 days');   -- unrelated: no payment
  UPDATE public.profiles SET plan_end = plan_end + interval '10 days' WHERE id = d;
  IF NOT EXISTS (SELECT 1 FROM public.pending_plans WHERE doctor_id = d AND activation_date = pe + interval '10 days') THEN RAISE EXCEPTION '4: pending plan did not follow'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE payment_id = pay
                   AND starts_at = pe + interval '10 days' AND ends_at = pe + interval '40 days') THEN
    RAISE EXCEPTION '4: the renewal seat period did not shift by 10 days';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE payment_id IS NULL AND doctor_id = d AND quantity = 1 AND starts_at = pe) THEN
    RAISE EXCEPTION '4: an unrelated seat period moved';
  END IF;
  UPDATE public.profiles SET plan_end = plan_end - interval '4 days' WHERE id = d;
  IF NOT EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE payment_id = pay
                   AND starts_at = pe + interval '6 days' AND ends_at = pe + interval '36 days') THEN
    RAISE EXCEPTION '4: shortening plan_end did not shift the seat period back';
  END IF;
  IF public.clinic_doctor_seat_limit(d) <> 1 THEN RAISE EXCEPTION '4: future seats counted early'; END IF;
  DELETE FROM public.pending_plans WHERE doctor_id = d;
  DELETE FROM public.clinic_seat_periods WHERE doctor_id = d;

  ----------------------------------------------------------------------------- 5. Superadmin settings
  -- Validator.
  FOR t, r IN SELECT * FROM (VALUES
      ('multi_doctor_enabled', '"yes"'::jsonb), ('multi_doctor_enabled', '1'::jsonb), ('multi_doctor_enabled', 'null'::jsonb),
      ('doctor_seat_price', '0'::jsonb), ('doctor_seat_price', '-5'::jsonb), ('doctor_seat_price', '100001'::jsonb),
      ('doctor_seat_price', '"600"'::jsonb), ('doctor_seat_price', 'true'::jsonb),
      ('doctor_seat_max', '1'::jsonb), ('doctor_seat_max', '51'::jsonb), ('doctor_seat_max', '2.5'::jsonb), ('doctor_seat_max', '"15"'::jsonb), ('doctor_seat_max', 'null'::jsonb),
      ('trial_extra_doctor_seats', '-1'::jsonb), ('trial_extra_doctor_seats', '6'::jsonb), ('trial_extra_doctor_seats', '1.5'::jsonb), ('trial_extra_doctor_seats', '"1"'::jsonb)
    ) AS x(k, v)
  LOOP
    IF NOT pg_temp.setting_rejected(t, r) THEN RAISE EXCEPTION '5: % = % was accepted', t, r; END IF;
  END LOOP;
  FOR t, r IN SELECT * FROM (VALUES
      ('multi_doctor_enabled', 'true'::jsonb), ('multi_doctor_enabled', 'false'::jsonb),
      ('doctor_seat_price', 'null'::jsonb), ('doctor_seat_price', '99.5'::jsonb), ('doctor_seat_price', '100000'::jsonb), ('doctor_seat_price', '600'::jsonb),
      ('doctor_seat_max', '2'::jsonb), ('doctor_seat_max', '50'::jsonb), ('doctor_seat_max', '15'::jsonb),
      ('trial_extra_doctor_seats', '0'::jsonb), ('trial_extra_doctor_seats', '5'::jsonb), ('trial_extra_doctor_seats', '1'::jsonb)
    ) AS x(k, v)
  LOOP
    IF pg_temp.setting_rejected(t, r) THEN RAISE EXCEPTION '5: % = % was rejected', t, r; END IF;
  END LOOP;
  UPDATE public.platform_settings SET value = 'false'::jsonb WHERE key = 'multi_doctor_enabled';
  -- Other keys keep their old (lenient) behaviour.
  IF pg_temp.setting_rejected('some_future_key_zz', '"x"'::jsonb) THEN RAISE EXCEPTION '5: unrelated key validated'; END IF;
  -- Audit trigger: ANY write path, only for these four keys, only when the value changes.
  SELECT count(*) INTO n0 FROM public.admin_audit_log WHERE action = 'platform_setting_changed';
  UPDATE public.platform_settings SET value = '20'::jsonb WHERE key = 'doctor_seat_max';
  IF (SELECT count(*) FROM public.admin_audit_log WHERE action = 'platform_setting_changed') <> n0 + 1 THEN RAISE EXCEPTION '5: no audit row for a direct UPDATE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_audit_log WHERE action = 'platform_setting_changed' AND target_table = 'platform_settings'
                   AND details->>'key' = 'doctor_seat_max' AND details->'old' = '15'::jsonb AND details->'new' = '20'::jsonb) THEN
    RAISE EXCEPTION '5: audit details wrong';
  END IF;
  UPDATE public.platform_settings SET value = '20'::jsonb WHERE key = 'doctor_seat_max';   -- no change
  UPDATE public.platform_settings SET value = '30'::jsonb WHERE key = 'default_trial_days';   -- other key
  IF (SELECT count(*) FROM public.admin_audit_log WHERE action = 'platform_setting_changed') <> n0 + 1 THEN RAISE EXCEPTION '5: audit wrote rows for no-ops / other keys'; END IF;
  UPDATE public.platform_settings SET value = 'null'::jsonb WHERE key = 'doctor_seat_price';
  IF NOT EXISTS (SELECT 1 FROM public.admin_audit_log WHERE details->>'key' = 'doctor_seat_price' AND details->'new' = 'null'::jsonb AND details->'old' = '600'::jsonb) THEN
    RAISE EXCEPTION '5: clearing the price not audited as jsonb null';
  END IF;
  UPDATE public.platform_settings SET value = '600'::jsonb WHERE key = 'doctor_seat_price';
  UPDATE public.platform_settings SET value = '15'::jsonb WHERE key = 'doctor_seat_max';
  DELETE FROM public.platform_settings WHERE key = 'trial_extra_doctor_seats';
  INSERT INTO public.platform_settings (key, value) VALUES ('trial_extra_doctor_seats', '2'::jsonb);
  IF NOT EXISTS (SELECT 1 FROM public.admin_audit_log WHERE details->>'key' = 'trial_extra_doctor_seats' AND details->'new' = '2'::jsonb) THEN
    RAISE EXCEPTION '5: INSERT path not audited';
  END IF;
  UPDATE public.platform_settings SET value = '1'::jsonb WHERE key = 'trial_extra_doctor_seats';

  -- The RPC.
  PERFORM pg_temp.as_user(sa);
  SET LOCAL ROLE authenticated;
  r := public.set_multi_doctor_settings(jsonb_build_object('multi_doctor_enabled', true, 'doctor_seat_price', 450, 'doctor_seat_max', 15, 'trial_extra_doctor_seats', 2));
  RESET ROLE;
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION '5: owner refused: %', r; END IF;
  IF (SELECT array_agg(x ORDER BY x) FROM jsonb_array_elements_text(r->'changed') x)
     IS DISTINCT FROM ARRAY['doctor_seat_price', 'multi_doctor_enabled', 'trial_extra_doctor_seats'] THEN
    RAISE EXCEPTION '5: changed list should hold only the keys that changed: %', r;
  END IF;
  IF (SELECT value FROM public.platform_settings WHERE key = 'multi_doctor_enabled') <> 'true'::jsonb
     OR (SELECT value FROM public.platform_settings WHERE key = 'doctor_seat_price') <> '450'::jsonb
     OR (SELECT value FROM public.platform_settings WHERE key = 'trial_extra_doctor_seats') <> '2'::jsonb THEN
    RAISE EXCEPTION '5: values not applied';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_audit_log WHERE details->>'key' = 'multi_doctor_enabled' AND details->'new' = 'true'::jsonb AND admin_user_id = sa) THEN
    RAISE EXCEPTION '5: RPC change not audited with the actor';
  END IF;
  -- Clearing the price stores a real jsonb null (the column is NOT NULL).
  PERFORM pg_temp.as_user(tm_yes);
  SET LOCAL ROLE authenticated;
  r := public.set_multi_doctor_settings('{"doctor_seat_price": null}'::jsonb);
  RESET ROLE;
  IF NOT COALESCE((r->>'ok')::boolean, false) OR r->'changed' IS DISTINCT FROM '["doctor_seat_price"]'::jsonb THEN RAISE EXCEPTION '5: team member with flags.manage: %', r; END IF;
  IF (SELECT value FROM public.platform_settings WHERE key = 'doctor_seat_price') IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION '5: price not cleared to jsonb null'; END IF;
  -- Invalid values: nothing is applied (all-or-nothing) and the key is named.
  PERFORM pg_temp.as_user(sa);
  SET LOCAL ROLE authenticated;
  r := public.set_multi_doctor_settings('{"multi_doctor_enabled": false, "doctor_seat_max": 99}'::jsonb);
  RESET ROLE;
  IF r IS DISTINCT FROM jsonb_build_object('ok', false, 'error', 'INVALID_VALUE', 'key', 'doctor_seat_max') THEN RAISE EXCEPTION '5: invalid max: %', r; END IF;
  IF (SELECT value FROM public.platform_settings WHERE key = 'multi_doctor_enabled') <> 'true'::jsonb THEN RAISE EXCEPTION '5: partial application'; END IF;
  SET LOCAL ROLE authenticated;
  r := public.set_multi_doctor_settings('{"doctor_seat_price": 0}'::jsonb);
  RESET ROLE;
  IF r->>'error' IS DISTINCT FROM 'INVALID_VALUE' OR r->>'key' IS DISTINCT FROM 'doctor_seat_price' THEN RAISE EXCEPTION '5: zero price: %', r; END IF;
  SET LOCAL ROLE authenticated;
  r := public.set_multi_doctor_settings('{"default_trial_days": 1}'::jsonb);   -- not one of the four keys
  RESET ROLE;
  IF r->>'error' IS DISTINCT FROM 'INVALID_VALUE' OR r->>'key' IS DISTINCT FROM 'default_trial_days' THEN RAISE EXCEPTION '5: foreign key: %', r; END IF;
  SET LOCAL ROLE authenticated;
  r := public.set_multi_doctor_settings('[1,2]'::jsonb);
  RESET ROLE;
  IF COALESCE((r->>'ok')::boolean, true) THEN RAISE EXCEPTION '5: non-object accepted: %', r; END IF;
  -- Nothing to change is a success with an empty list.
  SET LOCAL ROLE authenticated;
  r := public.set_multi_doctor_settings('{"doctor_seat_max": 15}'::jsonb);
  RESET ROLE;
  IF NOT COALESCE((r->>'ok')::boolean, false) OR r->'changed' IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION '5: no-op: %', r; END IF;
  -- Strangers are refused: clinic owner, clinic staff, team member without flags.manage, signed-in nobody, anon.
  FOREACH t IN ARRAY ARRAY['owner', 'staff', 'team_no', 'stranger'] LOOP
    PERFORM pg_temp.as_user(CASE t WHEN 'owner' THEN d WHEN 'staff' THEN s_no WHEN 'team_no' THEN tm_no ELSE stranger END);
    SET LOCAL ROLE authenticated;
    r := public.set_multi_doctor_settings('{"multi_doctor_enabled": false}'::jsonb);
    RESET ROLE;
    IF r IS DISTINCT FROM jsonb_build_object('ok', false, 'error', 'FORBIDDEN') THEN RAISE EXCEPTION '5: % not refused: %', t, r; END IF;
  END LOOP;
  IF (SELECT value FROM public.platform_settings WHERE key = 'multi_doctor_enabled') <> 'true'::jsonb THEN RAISE EXCEPTION '5: a refused caller changed the setting'; END IF;
  PERFORM pg_temp.as_user(NULL, 'anon');
  SET LOCAL ROLE anon;
  v_priv := false;
  BEGIN
    r := public.set_multi_doctor_settings('{"multi_doctor_enabled": false}'::jsonb);
    RESET ROLE;
    IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION '5: anon changed settings: %', r; END IF;
  EXCEPTION WHEN insufficient_privilege THEN v_priv := true;
  END;
  RESET ROLE;
  IF NOT v_priv THEN RAISE EXCEPTION '5: anon can execute set_multi_doctor_settings'; END IF;
  PERFORM pg_temp.as_user(NULL, NULL);
  UPDATE public.platform_settings SET value = 'false'::jsonb WHERE key = 'multi_doctor_enabled';
  UPDATE public.platform_settings SET value = '600'::jsonb WHERE key = 'doctor_seat_price';
  UPDATE public.platform_settings SET value = '1'::jsonb WHERE key = 'trial_extra_doctor_seats';

  -- Internal helpers are not callable by clients (renewal_seats_check is service_role only).
  PERFORM pg_temp.as_user(d);
  SET LOCAL ROLE authenticated;
  v_priv := false;
  BEGIN
    PERFORM public.renewal_seats_check(d, 1);
  EXCEPTION WHEN insufficient_privilege THEN v_priv := true;
  END;
  RESET ROLE;
  IF NOT v_priv THEN RAISE EXCEPTION '6: authenticated can call renewal_seats_check'; END IF;
  PERFORM pg_temp.as_user(NULL, 'anon');
  SET LOCAL ROLE anon;
  v_priv := false;
  BEGIN
    PERFORM public.renewal_seats_check(d, 1);
  EXCEPTION WHEN insufficient_privilege THEN v_priv := true;
  END;
  RESET ROLE;
  IF NOT v_priv THEN RAISE EXCEPTION '6: anon can call renewal_seats_check'; END IF;
  IF NOT has_function_privilege('service_role', 'public.renewal_seats_check(uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION '6: service_role cannot call renewal_seats_check';
  END IF;
  IF has_function_privilege('authenticated', 'public.grant_renewal_seat_period(uuid,uuid,integer,timestamptz)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.grant_renewal_seat_period(uuid,uuid,integer,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION '6: grant_renewal_seat_period is callable by clients';
  END IF;
  PERFORM pg_temp.as_user(NULL, NULL);

  ----------------------------------------------------------------------------- 7. Reviews: length limits + throttle
  PERFORM pg_temp.as_user(NULL, 'anon');
  SET LOCAL ROLE anon;
  BEGIN
    INSERT INTO public.reviews (doctor_id, patient_name, rating) VALUES (dr, repeat('n', 101), 5);
    RESET ROLE;
    RAISE EXCEPTION '7: 101-char name accepted';
  EXCEPTION WHEN check_violation THEN
    RESET ROLE;
    IF SQLERRM <> 'REVIEW_TOO_LONG' THEN RAISE; END IF;
  END;
  SET LOCAL ROLE anon;
  BEGIN
    INSERT INTO public.reviews (doctor_id, patient_name, rating, review_text) VALUES (dr, 'Long Text', 5, repeat('t', 2001));
    RESET ROLE;
    RAISE EXCEPTION '7: 2001-char review accepted';
  EXCEPTION WHEN check_violation THEN
    RESET ROLE;
    IF SQLERRM <> 'REVIEW_TOO_LONG' THEN RAISE; END IF;
  END;
  SET LOCAL ROLE anon;
  INSERT INTO public.reviews (doctor_id, patient_name, rating, review_text) VALUES (dr, repeat('n', 100), 5, repeat('t', 2000));   -- exactly at the limits: #1
  RESET ROLE;
  SET LOCAL ROLE anon;
  FOR n IN 2..20 LOOP
    INSERT INTO public.reviews (doctor_id, patient_name, rating) VALUES (dr, 'Throttle ' || n, 4);
  END LOOP;
  RESET ROLE;
  SET LOCAL ROLE anon;
  BEGIN
    INSERT INTO public.reviews (doctor_id, patient_name, rating) VALUES (dr, 'Throttle 21', 4);
    RESET ROLE;
    RAISE EXCEPTION '7: the 21st review within an hour accepted';
  EXCEPTION WHEN check_violation THEN
    RESET ROLE;
    IF SQLERRM <> 'REVIEW_RATE_LIMIT' THEN RAISE; END IF;
  END;
  -- Another clinic is unaffected; the signed-in stranger is throttled like anon.
  SET LOCAL ROLE anon;
  INSERT INTO public.reviews (doctor_id, patient_name, rating) VALUES (dr2, 'Other clinic', 5);
  RESET ROLE;
  PERFORM pg_temp.as_user(stranger);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.reviews (doctor_id, patient_name, rating) VALUES (dr, 'Stranger 22', 3);
    RESET ROLE;
    RAISE EXCEPTION '7: signed-in stranger bypassed the review throttle';
  EXCEPTION WHEN check_violation THEN
    RESET ROLE;
    IF SQLERRM <> 'REVIEW_RATE_LIMIT' THEN RAISE; END IF;
  END;
  -- Owner and service role are untouched (even at the limit, and with long text).
  PERFORM pg_temp.as_user(dr);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.reviews (doctor_id, patient_name, rating, review_text) VALUES (dr, repeat('o', 150), 5, repeat('x', 2500));
  RESET ROLE;
  PERFORM pg_temp.as_user(NULL, NULL);
  INSERT INTO public.reviews (doctor_id, patient_name, rating, review_text) VALUES (dr, repeat('s', 150), 5, repeat('x', 2500));
  -- Only the last hour counts.
  UPDATE public.reviews SET created_at = now() - interval '2 hours' WHERE doctor_id = dr;
  PERFORM pg_temp.as_user(NULL, 'anon');
  SET LOCAL ROLE anon;
  INSERT INTO public.reviews (doctor_id, patient_name, rating) VALUES (dr, 'After the hour', 5);
  RESET ROLE;
  PERFORM pg_temp.as_user(NULL, NULL);

  ----------------------------------------------------------------------------- 8. Directory: a view nobody can read directly
  IF to_regclass('public.directory_entries_v') IS NULL THEN RAISE EXCEPTION '8: directory_entries_v missing'; END IF;
  IF has_table_privilege('anon', 'public.directory_entries_v', 'SELECT') OR has_table_privilege('authenticated', 'public.directory_entries_v', 'SELECT') THEN
    RAISE EXCEPTION '8: clients can read directory_entries_v';
  END IF;
  PERFORM pg_temp.as_user(NULL, 'anon');
  SET LOCAL ROLE anon;
  v_priv := false;
  BEGIN
    PERFORM count(*) FROM public.directory_entries_v;
  EXCEPTION WHEN insufficient_privilege THEN v_priv := true;
  END;
  RESET ROLE;
  IF NOT v_priv THEN RAISE EXCEPTION '8: anon read directory_entries_v'; END IF;
  PERFORM pg_temp.as_user(NULL, NULL);
  IF to_regprocedure('public.directory_entries()') IS NOT NULL THEN RAISE EXCEPTION '8: the old directory_entries() function still exists'; END IF;
  -- search_doctors only looks at the first 100 characters of the query; anon can still call it.
  PERFORM pg_temp.as_user(NULL, 'anon');
  SET LOCAL ROLE anon;
  SELECT jsonb_agg(to_jsonb(x)) INTO a_old FROM public.search_doctors(repeat('a', 100), NULL, NULL, 100, 0) x;
  SELECT jsonb_agg(to_jsonb(x)) INTO a_new FROM public.search_doctors(repeat('a', 5000), NULL, NULL, 100, 0) x;
  RESET ROLE;
  IF a_old IS DISTINCT FROM a_new THEN RAISE EXCEPTION '8: search_doctors does not cut the query at 100 characters'; END IF;
  PERFORM pg_temp.as_user(NULL, NULL);

  ----------------------------------------------------------------------------- 9. Service mappings vs inactive doctors
  INSERT INTO public.clinic_doctor_seats (doctor_id, extra_seats, reason) VALUES (dm, 3, 'test grant');
  pm_a := public.primary_practitioner_id(dm);
  INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (dm, 'Dr Pm B', 'dr-pm-b') RETURNING id INTO pm_b;
  INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (dm, 'Dr Pm C', 'dr-pm-c') RETURNING id INTO pm_c;
  INSERT INTO public.services (doctor_id, name, price, type, active, sort_order) VALUES (dm, 'Zz Only B', 900, 'both', true, 1) RETURNING id INTO sv_x;
  INSERT INTO public.services (doctor_id, name, price, type, active, sort_order) VALUES (dm, 'Zz Twin', 300, 'both', true, 2) RETURNING id INTO sv_dup1;
  INSERT INTO public.services (doctor_id, name, price, type, active, sort_order) VALUES (dm, 'Zz Twin', 400, 'both', true, 3) RETURNING id INTO sv_dup2;
  INSERT INTO public.service_practitioners (service_id, practitioner_id, doctor_id) VALUES (sv_x, pm_b, dm), (sv_dup1, pm_b, dm);
  deflt := public.public_booking_price(dm, 'Zz Unknown Service', 'clinic', pm_a);
  IF public.public_booking_price(dm, 'Zz Only B', 'clinic', pm_a) <> deflt THEN RAISE EXCEPTION '9: mapped-away service priced for the wrong doctor'; END IF;
  IF public.public_booking_price(dm, 'Zz Only B', 'clinic', pm_b) <> 900 THEN RAISE EXCEPTION '9: mapped doctor lost the service price'; END IF;
  SELECT count(*) INTO n FROM public.get_public_service_practitioners(dm);
  IF n <> 2 THEN RAISE EXCEPTION '9: public mapping rows (active doctor): %', n; END IF;
  -- Dr B leaves: a service mapped only to a deactivated doctor behaves as unmapped.
  UPDATE public.practitioners SET is_active = false WHERE id = pm_b;
  IF public.public_booking_price(dm, 'Zz Only B', 'clinic', pm_a) <> 900 THEN RAISE EXCEPTION '9: service mapped only to an inactive doctor should be offered by everyone'; END IF;
  IF EXISTS (SELECT 1 FROM public.get_public_service_practitioners(dm)) THEN RAISE EXCEPTION '9: public RPC returned rows of an inactive doctor'; END IF;
  -- Mapped to an inactive AND an active doctor: only the active one counts.
  INSERT INTO public.service_practitioners (service_id, practitioner_id, doctor_id) VALUES (sv_x, pm_c, dm);
  IF public.public_booking_price(dm, 'Zz Only B', 'clinic', pm_a) <> deflt THEN RAISE EXCEPTION '9: still mapped to an active doctor (C), A should not get it'; END IF;
  IF public.public_booking_price(dm, 'Zz Only B', 'clinic', pm_c) <> 900 THEN RAISE EXCEPTION '9: Dr C should get it'; END IF;
  IF (SELECT count(*) FROM public.get_public_service_practitioners(dm) WHERE service_id = sv_x) <> 1 THEN RAISE EXCEPTION '9: public rows should hold only Dr C'; END IF;
  DELETE FROM public.service_practitioners WHERE service_id = sv_x AND practitioner_id = pm_c;
  UPDATE public.practitioners SET is_active = true WHERE id = pm_b;

  -- Anonymous bookings: SERVICE_NOT_OFFERED (the edge function enforces INVALID_SERVICE for paid ones).
  PERFORM pg_temp.as_user(NULL, 'anon');
  BEGIN
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status, time_slot, practitioner_id)
    VALUES (dm, 'Svc Anon A', '9000002001', 'Zz Only B', 'clinic', tmr, 0, 'SV01', 'pay_at_clinic', '10:00', pm_a);
    RAISE EXCEPTION '9: anon booked a service the doctor does not offer';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'SERVICE_NOT_OFFERED' THEN RAISE; END IF;
  END;
  BEGIN   -- case and spacing do not matter
    INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status, time_slot, practitioner_id)
    VALUES (dm, 'Svc Anon A2', '9000002001', '  zz only b ', 'clinic', tmr, 0, 'SV02', 'pay_at_clinic', '10:30', pm_a);
    RAISE EXCEPTION '9: a differently spelled service name slipped through';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'SERVICE_NOT_OFFERED' THEN RAISE; END IF;
  END;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status, time_slot, practitioner_id)
  VALUES (dm, 'Svc Anon B', '9000002002', 'Zz Only B', 'clinic', tmr, 0, 'SV03', 'pay_at_clinic', '11:00', pm_b);   -- the doctor who offers it
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status, time_slot, practitioner_id)
  VALUES (dm, 'Svc Anon A3', '9000002003', 'Zz Unknown Service', 'clinic', tmr, 0, 'SV04', 'pay_at_clinic', '11:30', pm_a);   -- not a service of the clinic
  -- Same-name services: one unmapped copy means everyone offers it.
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status, time_slot, practitioner_id)
  VALUES (dm, 'Svc Anon A4', '9000002004', 'Zz Twin', 'clinic', tmr, 0, 'SV05', 'pay_at_clinic', '12:00', pm_a);
  -- A service mapped only to a deactivated doctor is offered by everyone.
  PERFORM pg_temp.as_user(NULL, NULL);
  UPDATE public.practitioners SET is_active = false WHERE id = pm_b;
  PERFORM pg_temp.as_user(NULL, 'anon');
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status, time_slot, practitioner_id)
  VALUES (dm, 'Svc Anon A5', '9000002005', 'Zz Only B', 'clinic', tmr, 0, 'SV06', 'pay_at_clinic', '12:30', pm_a);
  PERFORM pg_temp.as_user(NULL, NULL);
  UPDATE public.practitioners SET is_active = true WHERE id = pm_b;
  -- The clinic's own staff/owner and the service role are untouched by this rule.
  PERFORM pg_temp.as_user(dm);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status, time_slot, practitioner_id)
  VALUES (dm, 'Svc Owner', '9000002006', 'Zz Only B', 'clinic', tmr, 0, 'SV07', 'pending', '13:00', pm_a);
  PERFORM pg_temp.as_user(NULL, NULL);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date, amount, token_number, payment_status, time_slot, practitioner_id)
  VALUES (dm, 'Svc Service', '9000002007', 'Zz Only B', 'clinic', tmr, 0, 'SV08', 'pay_at_clinic', '13:30', pm_a);

  ----------------------------------------------------------------------------- 10. Purge index
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'clinical_access_log'
                  AND indexdef ~ '\(created_at\)') THEN
    RAISE EXCEPTION '10: no index on clinical_access_log(created_at)';
  END IF;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
