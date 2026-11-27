-- Multi-doctor P3 DB1: dated seat periods, seat quote, seat orders applied through
-- apply_plan_upgrade_payment. Rolled back; prints 'pass'.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/13_seat_periods.sql
BEGIN;
DO $$
DECLARE
  d   uuid := gen_random_uuid();   -- premium clinic with the pilot override
  d2  uuid := gen_random_uuid();   -- premium clinic WITHOUT the override (feature gate off)
  d3  uuid := gen_random_uuid();   -- pro clinic
  s_ok uuid := gen_random_uuid();  -- staff with billing.manage
  s_no uuid := gen_random_uuid();  -- staff without billing.manage
  stranger uuid := gen_random_uuid();
  pay uuid; pay2 uuid; pay3 uuid; pay4 uuid;
  r jsonb; n int; lim int;
  pe timestamptz;
  v_priv boolean;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"full_name":"Dr Seat"}'::jsonb
    FROM unnest(ARRAY[d, d2, d3]) AS u;
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"account_type":"staff"}'::jsonb
    FROM unnest(ARRAY[s_ok, s_no]) AS u;
  UPDATE public.profiles SET plan_tier = 'premium', plan_status = 'active', plan_end = now() + interval '15 days' WHERE id IN (d, d2);
  UPDATE public.profiles SET plan_tier = 'pro', plan_status = 'active', plan_end = now() + interval '15 days' WHERE id = d3;
  IF EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'multi_doctor_enabled' AND value = 'true'::jsonb) THEN
    UPDATE public.profiles SET plan_tier = 'free' WHERE id = d2;  -- d2 must lack the feature for the gate check
  END IF;
  INSERT INTO public.doctor_feature_overrides (doctor_id, feature_key, enabled, reason, granted_by)
  VALUES (d, 'multi_doctor', true, 'test: seat periods', d);
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status)
  VALUES (s_ok, d, 'Billing', 'bill-' || s_ok, '+1571' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"billing.manage": true, "billing.view": true}'::jsonb, d, 'active'),
         (s_no, d, 'NoBilling', 'nobill-' || s_no, '+1572' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"billing.view": true, "appointments.edit": true}'::jsonb, d, 'active');

  -- 1. Price unset (the shipped state): a quote is refused PRICE_NOT_SET, and purchases cannot start.
  UPDATE public.platform_settings SET value = 'null'::jsonb WHERE key = 'doctor_seat_price';
  r := public.seat_order_quote(d, 1);
  IF r->>'error' IS DISTINCT FROM 'PRICE_NOT_SET' OR (r->>'ok')::boolean THEN RAISE EXCEPTION 'price unset: %', r; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  r := public.get_clinic_doctor_access(d);
  IF (r->>'can_buy_seats')::boolean IS DISTINCT FROM false OR (r->>'purchased_seats')::int <> 0 THEN
    RAISE EXCEPTION 'access summary (no price): %', r;
  END IF;
  IF NOT (r ? 'seats_valid_until') THEN RAISE EXCEPTION 'seats_valid_until key missing: %', r; END IF;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE public.platform_settings SET value = '600'::jsonb WHERE key = 'doctor_seat_price';
  UPDATE public.platform_settings SET value = '15'::jsonb WHERE key = 'doctor_seat_max';

  -- 2. Quote maths. plan_end = now() + 15 days exactly (now() is frozen in the transaction).
  r := public.seat_order_quote(d, 2);   -- 2 * 600 * 100 * 15/30 = 60000
  IF NOT (r->>'ok')::boolean OR (r->>'amount_paise')::bigint <> 60000 OR (r->>'unit_price')::numeric <> 600
     OR (r->>'days_left')::numeric <> 15 THEN RAISE EXCEPTION 'quote 2 seats: %', r; END IF;
  SELECT plan_end INTO pe FROM public.profiles WHERE id = d;
  IF (r->>'period_end')::timestamptz <> pe THEN RAISE EXCEPTION 'period_end <> plan_end: %', r; END IF;
  -- More than 30 days left is capped at one full month.
  UPDATE public.profiles SET plan_end = now() + interval '60 days' WHERE id = d;
  r := public.seat_order_quote(d, 1);
  IF (r->>'amount_paise')::bigint <> 60000 THEN RAISE EXCEPTION 'quote not capped at 30 days: %', r; END IF;
  -- P3 hardening: the PERIOD is capped at 30 days too (it is exactly what was charged for), not plan_end.
  IF (r->>'period_end')::timestamptz <> now() + interval '30 days' THEN RAISE EXCEPTION 'period_end not capped at 30 days: %', r; END IF;
  -- Rounds UP to the next paisa.
  UPDATE public.profiles SET plan_end = now() + interval '7 days' WHERE id = d;
  UPDATE public.platform_settings SET value = '1'::jsonb WHERE key = 'doctor_seat_price';
  r := public.seat_order_quote(d, 1);   -- 1*1*100*7/30 = 23.33 -> 24
  -- Minimum charge is 100 paise.
  IF (r->>'amount_paise')::bigint <> 100 THEN RAISE EXCEPTION 'minimum 100 paise not applied: %', r; END IF;
  UPDATE public.platform_settings SET value = '333'::jsonb WHERE key = 'doctor_seat_price';
  r := public.seat_order_quote(d, 1);   -- 333*100*7/30 = 7770 exactly
  IF (r->>'amount_paise')::bigint <> 7770 THEN RAISE EXCEPTION 'quote 7 days: %', r; END IF;
  UPDATE public.platform_settings SET value = '3.5'::jsonb WHERE key = 'doctor_seat_price';
  r := public.seat_order_quote(d, 1);   -- 3.5*100*7/30 = 81.67 -> 82 -> min 100
  IF (r->>'amount_paise')::bigint <> 100 THEN RAISE EXCEPTION 'small quote should floor at 100: %', r; END IF;
  UPDATE public.platform_settings SET value = '10'::jsonb WHERE key = 'doctor_seat_price';
  r := public.seat_order_quote(d, 1);   -- 10*100*7/30 = 233.33 -> 234
  IF (r->>'amount_paise')::bigint <> 234 THEN RAISE EXCEPTION 'ceil 233.33 -> 234: %', r; END IF;
  UPDATE public.platform_settings SET value = '600'::jsonb WHERE key = 'doctor_seat_price';
  UPDATE public.profiles SET plan_end = now() + interval '15 days' WHERE id = d;

  -- 3. Quote errors.
  r := public.seat_order_quote(d, 0);
  IF r->>'error' IS DISTINCT FROM 'INVALID_QTY' THEN RAISE EXCEPTION 'qty 0: %', r; END IF;
  r := public.seat_order_quote(d, NULL);
  IF r->>'error' IS DISTINCT FROM 'INVALID_QTY' THEN RAISE EXCEPTION 'qty NULL: %', r; END IF;
  r := public.seat_order_quote(d, -3);
  IF r->>'error' IS DISTINCT FROM 'INVALID_QTY' THEN RAISE EXCEPTION 'qty -3: %', r; END IF;
  r := public.seat_order_quote(d, 15);     -- seat_max 15 => at most 14 extra
  IF r->>'error' IS DISTINCT FROM 'SEAT_MAX' THEN RAISE EXCEPTION 'qty 15: %', r; END IF;
  r := public.seat_order_quote(d, 14);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'qty 14 should fit: %', r; END IF;
  INSERT INTO public.clinic_doctor_seats (doctor_id, extra_seats, reason) VALUES (d, 3, 'test grant');
  r := public.seat_order_quote(d, 12);     -- 3 granted + 12 > 14
  IF r->>'error' IS DISTINCT FROM 'SEAT_MAX' THEN RAISE EXCEPTION 'granted counts toward max: %', r; END IF;
  r := public.seat_order_quote(d, 11);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION '3 granted + 11 fits: %', r; END IF;
  DELETE FROM public.clinic_doctor_seats WHERE doctor_id = d;
  r := public.seat_order_quote(d2, 1);     -- feature not enabled for this clinic
  IF r->>'error' IS DISTINCT FROM 'NOT_ENABLED' THEN RAISE EXCEPTION 'd2: %', r; END IF;
  r := public.seat_order_quote(gen_random_uuid(), 1);
  IF (r->>'ok')::boolean IS NOT DISTINCT FROM true THEN RAISE EXCEPTION 'unknown clinic got a quote: %', r; END IF;
  -- Eligibility: premium + active + at least 1h of plan left.
  UPDATE public.profiles SET plan_end = now() + interval '30 minutes' WHERE id = d;
  r := public.seat_order_quote(d, 1);
  IF r->>'error' IS DISTINCT FROM 'PLAN_NOT_ELIGIBLE' THEN RAISE EXCEPTION 'under 1h left: %', r; END IF;
  UPDATE public.profiles SET plan_end = now() + interval '15 days', plan_status = 'trial', trial_end = now() + interval '5 days' WHERE id = d;
  r := public.seat_order_quote(d, 1);
  IF (r->>'ok')::boolean IS NOT DISTINCT FROM true THEN RAISE EXCEPTION 'trial clinic got a quote: %', r; END IF;
  UPDATE public.profiles SET plan_status = 'active', trial_end = NULL, plan_end = now() + interval '15 days' WHERE id = d;
  UPDATE public.profiles SET plan_end = NULL WHERE id = d;
  r := public.seat_order_quote(d, 1);
  IF r->>'error' IS DISTINCT FROM 'PLAN_NOT_ELIGIBLE' THEN RAISE EXCEPTION 'no plan_end: %', r; END IF;
  UPDATE public.profiles SET plan_end = now() + interval '15 days' WHERE id = d;
  INSERT INTO public.doctor_feature_overrides (doctor_id, feature_key, enabled, reason, granted_by)
  VALUES (d3, 'multi_doctor', true, 'test: pro', d3);
  r := public.seat_order_quote(d3, 1);     -- pro clinic: feature override on, but only Premium buys seats
  IF r->>'error' IS DISTINCT FROM 'PLAN_NOT_ELIGIBLE' THEN RAISE EXCEPTION 'pro clinic: %', r; END IF;

  -- 4. get_seat_order_quote: owner and staff with billing.manage only; clinic comes from the caller.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  r := public.get_seat_order_quote(2);
  RESET ROLE;
  IF NOT COALESCE((r->>'ok')::boolean, false) OR (r->>'amount_paise')::bigint <> 60000 THEN RAISE EXCEPTION 'owner quote: %', r; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', s_ok, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  r := public.get_seat_order_quote(2);
  RESET ROLE;
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION 'billing.manage staff refused: %', r; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', s_no, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  r := public.get_seat_order_quote(2);
  RESET ROLE;
  IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'staff without billing.manage: %', r; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  r := public.get_seat_order_quote(2);
  RESET ROLE;
  IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'stranger: %', r; END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  BEGIN
    r := public.get_seat_order_quote(2);
    RESET ROLE;
    IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'anon got a quote: %', r; END IF;
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE;
  END;
  -- The unscoped quote function is not callable by clients at all.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_priv := false;
  BEGIN
    r := public.seat_order_quote(d, 1);
  EXCEPTION WHEN insufficient_privilege THEN v_priv := true;
  END;
  RESET ROLE;
  IF NOT v_priv THEN RAISE EXCEPTION 'authenticated can call seat_order_quote directly'; END IF;
  PERFORM set_config('request.jwt.claims', '', true);

  -- 5. Applying a seat order creates a period [now, plan_end) and raises the limit.
  lim := public.clinic_doctor_seat_limit(d);
  IF lim <> 1 THEN RAISE EXCEPTION 'baseline limit should be 1, got %', lim; END IF;
  pay := gen_random_uuid();
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock,
                                            kind, seats_quantity, unit_price, period_start, period_end)
  VALUES (pay, d, 'premium', 'premium', 600, 'created', 'order_seat_' || pay, false, 'seats', 2, 600, now(), now() + interval '15 days');
  r := public.apply_plan_upgrade_payment(pay, 'pay_seat_' || pay);
  IF NOT COALESCE((r->>'ok')::boolean, false) OR r->>'kind' IS DISTINCT FROM 'seats' OR (r->>'seat_limit')::int <> 3 THEN
    RAISE EXCEPTION 'seat apply: %', r;
  END IF;
  SELECT plan_end INTO pe FROM public.profiles WHERE id = d;
  IF NOT EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE doctor_id = d AND payment_id = pay AND quantity = 2
                   AND starts_at <= now() AND ends_at = pe) THEN RAISE EXCEPTION 'period not created as [now, plan_end)'; END IF;
  IF public.clinic_doctor_seat_limit(d) <> 3 THEN RAISE EXCEPTION 'limit not raised'; END IF;
  -- A seat order never touches the plan itself.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = d AND plan_tier = 'premium' AND plan_status = 'active' AND plan_end = pe) THEN
    RAISE EXCEPTION 'seat order changed the plan';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pending_plans WHERE doctor_id = d) THEN RAISE EXCEPTION 'seat order scheduled a plan'; END IF;
  -- Idempotent.
  r := public.apply_plan_upgrade_payment(pay, 'pay_seat_' || pay);
  IF (r->>'already_verified')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'replay: %', r; END IF;
  SELECT count(*) INTO n FROM public.clinic_seat_periods WHERE doctor_id = d;
  IF n <> 1 THEN RAISE EXCEPTION 'replay created another period (%)', n; END IF;
  -- Access summary.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  r := public.get_clinic_doctor_access(d);
  IF (r->>'purchased_seats')::int <> 2 OR (r->>'seats_valid_until')::timestamptz <> pe
     OR (r->>'can_buy_seats')::boolean IS DISTINCT FROM true OR (r->>'seat_limit')::int <> 3 THEN
    RAISE EXCEPTION 'access summary after purchase: %', r;
  END IF;
  IF NOT (r ? 'enabled' AND r ? 'has_feature' AND r ? 'seats_used' AND r ? 'extra_seats' AND r ? 'seat_max' AND r ? 'seat_price') THEN
    RAISE EXCEPTION 'existing access keys lost: %', r;
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  -- Granted seats still add on top.
  INSERT INTO public.clinic_doctor_seats (doctor_id, extra_seats, reason) VALUES (d, 1, 'test grant');
  IF public.clinic_doctor_seat_limit(d) <> 4 THEN RAISE EXCEPTION 'granted + purchased should be 4'; END IF;
  -- A seat actually lets a second and a third doctor in, and a fifth is refused.
  INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (d, 'Dr B', 'dr-b-sp');
  INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (d, 'Dr C', 'dr-c-sp');
  INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (d, 'Dr D', 'dr-d-sp');
  BEGIN
    INSERT INTO public.practitioners (doctor_id, display_name, slug) VALUES (d, 'Dr E', 'dr-e-sp');
    RAISE EXCEPTION 'fifth doctor accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'SEAT_LIMIT' THEN RAISE; END IF;
  END;
  DELETE FROM public.practitioners WHERE doctor_id = d AND slug IN ('dr-b-sp', 'dr-c-sp', 'dr-d-sp');
  DELETE FROM public.clinic_doctor_seats WHERE doctor_id = d;

  -- 6. Expiry needs no cron: an ended period stops counting.
  UPDATE public.clinic_seat_periods SET starts_at = now() - interval '2 days', ends_at = now() - interval '1 day' WHERE doctor_id = d;
  IF public.clinic_doctor_seat_limit(d) <> 1 THEN RAISE EXCEPTION 'expired period still counted'; END IF;
  UPDATE public.clinic_seat_periods SET starts_at = now() + interval '1 day', ends_at = now() + interval '2 days' WHERE doctor_id = d;
  IF public.clinic_doctor_seat_limit(d) <> 1 THEN RAISE EXCEPTION 'future period counted early'; END IF;
  UPDATE public.clinic_seat_periods SET starts_at = now() - interval '1 hour', ends_at = now() + interval '1 hour' WHERE doctor_id = d;
  IF public.clinic_doctor_seat_limit(d) <> 3 THEN RAISE EXCEPTION 'active period not counted'; END IF;
  BEGIN
    UPDATE public.clinic_seat_periods SET ends_at = starts_at WHERE doctor_id = d;
    RAISE EXCEPTION 'empty period accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.clinic_seat_periods SET quantity = 0 WHERE doctor_id = d;
    RAISE EXCEPTION 'zero quantity accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  DELETE FROM public.clinic_seat_periods WHERE doctor_id = d;

  -- 7. Lapsed / cancelled / over-cap between order and capture: money recorded, nothing applied, audit written.
  pay2 := gen_random_uuid();
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock, kind, seats_quantity, unit_price, period_start, period_end)
  VALUES (pay2, d, 'premium', 'premium', 600, 'created', 'order_seat_' || pay2, false, 'seats', 1, 600, now(), now() + interval '15 days');
  UPDATE public.profiles SET plan_status = 'expired', plan_end = now() - interval '1 day' WHERE id = d;
  r := public.apply_plan_upgrade_payment(pay2, 'pay_seat_' || pay2);
  IF COALESCE((r->>'ok')::boolean, true) OR r->>'code' IS NULL THEN RAISE EXCEPTION 'lapsed plan seat payment applied: %', r; END IF;
  IF EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE doctor_id = d) THEN RAISE EXCEPTION 'period created for lapsed plan'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_audit_log WHERE target_id = pay2 AND action LIKE 'seat_payment_not_applied_%') THEN
    RAISE EXCEPTION 'no audit row for the unapplied seat payment';
  END IF;
  IF (SELECT status::text FROM public.plan_upgrade_payments WHERE id = pay2) <> 'captured' THEN RAISE EXCEPTION 'payment not recorded as captured'; END IF;
  -- cancelled
  pay3 := gen_random_uuid();
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock, kind, seats_quantity, unit_price, period_start, period_end)
  VALUES (pay3, d, 'premium', 'premium', 600, 'created', 'order_seat_' || pay3, false, 'seats', 1, 600, now(), now() + interval '10 days');
  UPDATE public.profiles SET plan_status = 'cancelled', plan_end = now() + interval '10 days' WHERE id = d;
  r := public.apply_plan_upgrade_payment(pay3, 'pay_seat_' || pay3);
  IF COALESCE((r->>'ok')::boolean, true) THEN RAISE EXCEPTION 'cancelled clinic seat payment applied: %', r; END IF;
  IF EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE doctor_id = d) THEN RAISE EXCEPTION 'period created for cancelled clinic'; END IF;
  -- over the cap
  UPDATE public.profiles SET plan_status = 'active', plan_end = now() + interval '15 days' WHERE id = d;
  INSERT INTO public.clinic_doctor_seats (doctor_id, extra_seats, reason) VALUES (d, 13, 'test grant');
  pay4 := gen_random_uuid();
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock, kind, seats_quantity, unit_price, period_start, period_end)
  VALUES (pay4, d, 'premium', 'premium', 600, 'created', 'order_seat_' || pay4, false, 'seats', 2, 600, now(), now() + interval '15 days');
  r := public.apply_plan_upgrade_payment(pay4, 'pay_seat_' || pay4);
  IF COALESCE((r->>'ok')::boolean, true) THEN RAISE EXCEPTION 'over-cap seat payment applied: %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_audit_log WHERE target_id = pay4 AND action = 'seat_payment_not_applied_cap_exceeded') THEN
    RAISE EXCEPTION 'no cap_exceeded audit row for the over-cap payment';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.plan_upgrade_payments WHERE id = pay4 AND needs_refund AND needs_refund_reason = 'cap_exceeded') THEN
    RAISE EXCEPTION 'over-cap payment not flagged needs_refund';
  END IF;
  DELETE FROM public.clinic_doctor_seats WHERE doctor_id = d;

  -- 7b. Stale order (P3 hardening): quoted with 2 hours of plan left, the plan is renewed (plan_end +30d) afterwards.
  --     Captured while the order is still valid, the seats cover only what was paid for (2 hours), never the new plan_end;
  --     captured after the order's own period is over, nothing is applied and the payment is flagged needs_refund.
  UPDATE public.profiles SET plan_tier = 'premium', plan_status = 'active', plan_end = now() + interval '2 hours' WHERE id = d;
  pay2 := gen_random_uuid();
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock, kind, seats_quantity, unit_price, period_start, period_end)
  VALUES (pay2, d, 'premium', 'premium', 100, 'created', 'order_stale_' || pay2, false, 'seats', 1, 600, now(), now() + interval '2 hours');
  pay3 := gen_random_uuid();
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock, kind, seats_quantity, unit_price, period_start, period_end)
  VALUES (pay3, d, 'premium', 'premium', 100, 'created', 'order_stale_' || pay3, false, 'seats', 1, 600, now(), now() + interval '2 hours');
  UPDATE public.profiles SET plan_end = now() + interval '30 days' WHERE id = d;
  r := public.apply_plan_upgrade_payment(pay2, 'pay_stale_' || pay2);
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION 'stale order within its period refused: %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE payment_id = pay2 AND ends_at = now() + interval '2 hours') THEN
    RAISE EXCEPTION 'stale order got more than the 2 hours it paid for';
  END IF;
  UPDATE public.plan_upgrade_payments SET period_end = now() - interval '1 hour' WHERE id = pay3;   -- 3 hours pass before capture
  r := public.apply_plan_upgrade_payment(pay3, 'pay_stale_' || pay3);
  IF COALESCE((r->>'ok')::boolean, true) OR r->>'code' IS DISTINCT FROM 'order_expired' OR (r->>'needs_refund')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'order past its period was applied: %', r;
  END IF;
  IF EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE payment_id = pay3) THEN RAISE EXCEPTION 'period created for an expired order'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.plan_upgrade_payments WHERE id = pay3 AND needs_refund AND needs_refund_reason = 'order_expired') THEN
    RAISE EXCEPTION 'expired order not flagged needs_refund';
  END IF;
  DELETE FROM public.clinic_seat_periods WHERE doctor_id = d;

  -- 8. Renewal order that includes seats: period starts at the renewal start.
  --    a) live plan: scheduled for plan_end, seats from plan_end for 30 days, not counted before then.
  UPDATE public.profiles SET plan_tier = 'premium', plan_status = 'active', plan_end = now() + interval '10 days' WHERE id = d;
  SELECT plan_end INTO pe FROM public.profiles WHERE id = d;
  pay := gen_random_uuid();
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock, seats_quantity, unit_price)
  VALUES (pay, d, 'premium', 'premium', 4599, 'created', 'order_ren_' || pay, false, 2, 600);
  r := public.apply_plan_upgrade_payment(pay, 'pay_ren_' || pay);
  IF NOT COALESCE((r->>'ok')::boolean, false) OR (r->>'scheduled')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'renewal not scheduled: %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE doctor_id = d AND payment_id = pay AND quantity = 2
                   AND starts_at = pe AND ends_at = pe + interval '30 days') THEN
    RAISE EXCEPTION 'scheduled renewal period wrong';
  END IF;
  IF public.clinic_doctor_seat_limit(d) <> 1 THEN RAISE EXCEPTION 'renewal seats counted before they start'; END IF;
  --    a2) a newer scheduled renewal supersedes it: the old one's future seats are dropped.
  pay2 := gen_random_uuid();
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock)
  VALUES (pay2, d, 'premium', 'premium', 3999, 'created', 'order_ren_' || pay2, false);
  r := public.apply_plan_upgrade_payment(pay2, 'pay_ren_' || pay2);
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION 'second renewal: %', r; END IF;
  IF EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE doctor_id = d AND payment_id = pay) THEN
    RAISE EXCEPTION 'superseded renewal kept its future seat period';
  END IF;
  DELETE FROM public.pending_plans WHERE doctor_id = d;
  --    b) lapsed plan: immediate, seats [now, now+30d) count straight away.
  UPDATE public.profiles SET plan_status = 'expired', plan_end = now() - interval '2 days' WHERE id = d;
  pay3 := gen_random_uuid();
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock, seats_quantity, unit_price)
  VALUES (pay3, d, 'premium', 'premium', 4599, 'created', 'order_ren_' || pay3, false, 3, 600);
  r := public.apply_plan_upgrade_payment(pay3, 'pay_ren_' || pay3);
  IF NOT COALESCE((r->>'ok')::boolean, false) OR (r->>'scheduled')::boolean IS DISTINCT FROM false THEN RAISE EXCEPTION 'immediate renewal: %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE doctor_id = d AND payment_id = pay3 AND quantity = 3
                   AND starts_at <= now() AND ends_at = now() + interval '30 days') THEN
    RAISE EXCEPTION 'immediate renewal period wrong';
  END IF;
  IF public.clinic_doctor_seat_limit(d) <> 4 THEN RAISE EXCEPTION 'immediate renewal seats not counted: %', public.clinic_doctor_seat_limit(d); END IF;
  DELETE FROM public.clinic_seat_periods WHERE doctor_id = d;

  -- 9. A plain plan payment (no seats) takes exactly the old path and makes no period.
  UPDATE public.profiles SET plan_status = 'expired', plan_end = now() - interval '2 days' WHERE id = d;
  pay := gen_random_uuid();
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock)
  VALUES (pay, d, 'premium', 'premium', 3999, 'created', 'order_plain_' || pay, false);
  IF (SELECT kind FROM public.plan_upgrade_payments WHERE id = pay) <> 'plan' THEN RAISE EXCEPTION 'kind default should be plan'; END IF;
  r := public.apply_plan_upgrade_payment(pay, 'pay_plain_' || pay);
  IF NOT COALESCE((r->>'ok')::boolean, false) OR r->>'plan_tier' <> 'premium' OR (r->>'scheduled')::boolean IS DISTINCT FROM false
     OR r ? 'kind' OR r ? 'seat_limit' THEN RAISE EXCEPTION 'plain payment result changed: %', r; END IF;
  IF EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE doctor_id = d) THEN RAISE EXCEPTION 'plain payment made a seat period'; END IF;
  BEGIN
    INSERT INTO public.plan_upgrade_payments (doctor_id, from_tier, target_tier, amount, kind, razorpay_order_id)
    VALUES (d, 'premium', 'premium', 1, 'bogus', 'order_bogus_' || pay);
    RAISE EXCEPTION 'bogus kind accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 10. Feature gate off: purchased periods exist but the limit stays 1.
  UPDATE public.profiles SET plan_end = now() + interval '15 days', plan_status = 'active' WHERE id = d2;
  INSERT INTO public.clinic_seat_periods (doctor_id, quantity, starts_at, ends_at)
  VALUES (d2, 2, now() - interval '1 day', now() + interval '5 days');
  IF public.clinic_doctor_seat_limit(d2) <> 1 THEN RAISE EXCEPTION 'seat limit not 1 when the feature is off'; END IF;

  -- 11. RLS: members read their clinic's periods, strangers see none, clients cannot write.
  INSERT INTO public.clinic_seat_periods (doctor_id, quantity, starts_at, ends_at)
  VALUES (d, 1, now() - interval '1 day', now() + interval '5 days');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.clinic_seat_periods;
  IF n <> 1 THEN RESET ROLE; RAISE EXCEPTION 'owner should see exactly their own period, saw %', n; END IF;
  v_priv := false;
  BEGIN
    UPDATE public.clinic_seat_periods SET quantity = 9 WHERE doctor_id = d;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'owner edited a seat period'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN v_priv := true;
  END;
  IF NOT v_priv THEN RESET ROLE; RAISE EXCEPTION 'update not refused'; END IF;
  v_priv := false;
  BEGIN
    INSERT INTO public.clinic_seat_periods (doctor_id, quantity, starts_at, ends_at) VALUES (d, 5, now(), now() + interval '1 day');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN v_priv := true;
  END;
  RESET ROLE;
  IF NOT v_priv THEN RAISE EXCEPTION 'owner inserted a seat period'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', s_ok, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.clinic_seat_periods;
  RESET ROLE;
  IF n <> 1 THEN RAISE EXCEPTION 'staff should see their clinic period, saw %', n; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.clinic_seat_periods;
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'stranger sees % seat periods', n; END IF;
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
SELECT 'pass' AS result;
ROLLBACK;
