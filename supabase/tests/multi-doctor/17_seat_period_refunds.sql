-- Multi-doctor P3 DB1 follow-up: a plan_upgrade_payments row set to 'refunded' withdraws the
-- seat periods it created. Rolled back; prints 'pass'.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/17_seat_period_refunds.sql
BEGIN;
DO $$
DECLARE
  d   uuid := gen_random_uuid();
  d2  uuid := gen_random_uuid();
  p_seat uuid := gen_random_uuid();   -- seat order, 2 seats
  p_seat2 uuid := gen_random_uuid();  -- seat order, 1 seat (must stay untouched until refunded)
  p_ren uuid := gen_random_uuid();    -- renewal with 3 seats
  p_plain uuid := gen_random_uuid();  -- plain plan payment, no seats
  p_other uuid := gen_random_uuid();  -- another clinic seat order
  r jsonb; n int; pe timestamptz; v_priv boolean;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"full_name":"Dr Refund"}'::jsonb
    FROM unnest(ARRAY[d, d2]) AS u;
  UPDATE public.profiles SET plan_tier = 'premium', plan_status = 'active', plan_end = now() + interval '15 days' WHERE id IN (d, d2);
  INSERT INTO public.doctor_feature_overrides (doctor_id, feature_key, enabled, reason, granted_by)
  VALUES (d, 'multi_doctor', true, 'test: refunds', d), (d2, 'multi_doctor', true, 'test: refunds', d2);
  UPDATE public.platform_settings SET value = '15'::jsonb WHERE key = 'doctor_seat_max';
  SELECT plan_end INTO pe FROM public.profiles WHERE id = d;

  -- Setup: two seat orders on d (2 + 1 seats), one on d2.
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock, kind, seats_quantity, unit_price, period_start, period_end)
  VALUES (p_seat, d, 'premium', 'premium', 600, 'created', 'o_' || p_seat, false, 'seats', 2, 600, now(), pe),
         (p_seat2, d, 'premium', 'premium', 300, 'created', 'o_' || p_seat2, false, 'seats', 1, 300, now(), pe),
         (p_other, d2, 'premium', 'premium', 300, 'created', 'o_' || p_other, false, 'seats', 1, 300, now(), pe);
  PERFORM public.apply_plan_upgrade_payment(p_seat, 'pay_' || p_seat);
  PERFORM public.apply_plan_upgrade_payment(p_seat2, 'pay_' || p_seat2);
  PERFORM public.apply_plan_upgrade_payment(p_other, 'pay_' || p_other);
  IF public.clinic_doctor_seat_limit(d) <> 4 THEN RAISE EXCEPTION 'setup: limit should be 4, got %', public.clinic_doctor_seat_limit(d); END IF;

  -- 1. Refund the 2-seat order: its period goes, the limit drops, the others stay.
  UPDATE public.plan_upgrade_payments SET status = 'refunded' WHERE id = p_seat;
  IF EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE payment_id = p_seat) THEN RAISE EXCEPTION 'refunded seat period still there'; END IF;
  IF public.clinic_doctor_seat_limit(d) <> 2 THEN RAISE EXCEPTION 'limit after refund should be 2, got %', public.clinic_doctor_seat_limit(d); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE payment_id = p_seat2 AND quantity = 1) THEN RAISE EXCEPTION 'other payment period removed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE payment_id = p_other) THEN RAISE EXCEPTION 'other clinic period removed'; END IF;
  SELECT count(*) INTO n FROM public.admin_audit_log
   WHERE action = 'seat_periods_removed_on_refund' AND target_table = 'clinic_seat_periods' AND target_id = d
     AND details->>'payment_id' = p_seat::text AND (details->>'removed')::int = 1 AND (details->>'quantity')::int = 2;
  IF n <> 1 THEN RAISE EXCEPTION 'audit row missing or wrong (%)', n; END IF;

  -- 2. Idempotent: refunded -> refunded, and a re-refund after a status bounce, add no audit rows.
  UPDATE public.plan_upgrade_payments SET status = 'refunded' WHERE id = p_seat;
  UPDATE public.plan_upgrade_payments SET status = 'captured' WHERE id = p_seat;
  UPDATE public.plan_upgrade_payments SET status = 'refunded' WHERE id = p_seat;
  SELECT count(*) INTO n FROM public.admin_audit_log WHERE action = 'seat_periods_removed_on_refund' AND details->>'payment_id' = p_seat::text;
  IF n <> 1 THEN RAISE EXCEPTION 'refund twice wrote % audit rows', n; END IF;
  IF public.clinic_doctor_seat_limit(d) <> 2 THEN RAISE EXCEPTION 'limit changed on repeat refund'; END IF;

  -- 3. Renewal with seats, scheduled behind the live plan; refund before it starts removes only that future period.
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock, kind, seats_quantity)
  VALUES (p_ren, d, 'premium', 'premium', 5000, 'created', 'o_' || p_ren, false, 'plan', 3);
  r := public.apply_plan_upgrade_payment(p_ren, 'pay_' || p_ren);
  IF NOT COALESCE((r->>'scheduled')::boolean, false) THEN RAISE EXCEPTION 'renewal not scheduled: %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE payment_id = p_ren AND quantity = 3 AND starts_at = pe) THEN
    RAISE EXCEPTION 'renewal period not created';
  END IF;
  IF public.clinic_doctor_seat_limit(d) <> 2 THEN RAISE EXCEPTION 'future renewal seats counted early'; END IF;
  UPDATE public.plan_upgrade_payments SET status = 'refunded' WHERE id = p_ren;
  IF EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE payment_id = p_ren) THEN RAISE EXCEPTION 'renewal period not removed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE payment_id = p_seat2 AND quantity = 1) THEN RAISE EXCEPTION 'current period touched by renewal refund'; END IF;
  IF public.clinic_doctor_seat_limit(d) <> 2 THEN RAISE EXCEPTION 'current limit changed by renewal refund'; END IF;

  -- 4. A payment with no periods: refunding is a no-op (no audit row, nothing deleted).
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock, razorpay_payment_id)
  VALUES (p_plain, d, 'premium', 'premium', 5000, 'captured', 'o_' || p_plain, false, 'pay_' || p_plain);
  UPDATE public.plan_upgrade_payments SET status = 'refunded' WHERE id = p_plain;
  IF (SELECT status::text FROM public.plan_upgrade_payments WHERE id = p_plain) <> 'refunded' THEN RAISE EXCEPTION 'plain refund not stored'; END IF;
  IF EXISTS (SELECT 1 FROM public.admin_audit_log WHERE action = 'seat_periods_removed_on_refund' AND details->>'payment_id' = p_plain::text) THEN
    RAISE EXCEPTION 'audit row for a payment with no periods';
  END IF;
  SELECT count(*) INTO n FROM public.clinic_seat_periods WHERE doctor_id = d;
  IF n <> 1 THEN RAISE EXCEPTION 'plain refund changed periods (%)', n; END IF;

  -- 5. Other statuses remove nothing; a currently active period is withdrawn on refund.
  UPDATE public.plan_upgrade_payments SET status = 'failed' WHERE id = p_seat2;
  IF NOT EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE payment_id = p_seat2) THEN RAISE EXCEPTION 'non-refund status removed a period'; END IF;
  UPDATE public.plan_upgrade_payments SET status = 'refunded' WHERE id = p_seat2;
  IF EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE payment_id = p_seat2) THEN RAISE EXCEPTION 'active period survived refund'; END IF;
  IF public.clinic_doctor_seat_limit(d) <> 1 THEN RAISE EXCEPTION 'limit should be back to 1'; END IF;
  IF public.clinic_doctor_seat_limit(d2) <> 2 THEN RAISE EXCEPTION 'other clinic limit changed'; END IF;

  -- 6. The trigger function is not callable by clients.
  IF has_function_privilege('anon', 'public.remove_seat_periods_on_refund()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.remove_seat_periods_on_refund()', 'EXECUTE') THEN
    RAISE EXCEPTION 'trigger function grants too wide';
  END IF;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
