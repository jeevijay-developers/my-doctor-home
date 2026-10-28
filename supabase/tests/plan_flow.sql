-- Plan-flow regression checks. Run against a database (never commits):
--   npx supabase db query --linked -f supabase/tests/plan_flow.sql
-- Everything runs in one transaction that is rolled back; any failed check raises.
BEGIN;

DO $$
DECLARE
  d uuid;
  pay uuid := gen_random_uuid();
  r jsonb;
  n int;
BEGIN
  -- Pick any doctor; the whole script is rolled back.
  SELECT id INTO d FROM public.profiles WHERE plan_status = 'trial' LIMIT 1;
  IF d IS NULL THEN SELECT id INTO d FROM public.profiles LIMIT 1; END IF;
  UPDATE public.profiles SET plan_tier = 'free', plan_status = 'trial', plan_end = NULL WHERE id = d;
  DELETE FROM public.pending_plans WHERE doctor_id = d;

  -- Trial grace: expiring a trial keeps trial_end; going active clears it.
  UPDATE public.profiles SET trial_end = now() - interval '1 hour' WHERE id = d;
  UPDATE public.profiles SET plan_status = 'expired' WHERE id = d;
  IF (SELECT trial_end FROM public.profiles WHERE id = d) IS NULL THEN RAISE EXCEPTION 'trial_end lost on expiry'; END IF;

  -- Abandoned order still redeemable; second apply is idempotent.
  INSERT INTO public.plan_upgrade_payments (id, doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock)
  VALUES (pay, d, 'free', 'premium', 3999, 'abandoned', 'order_test_' || pay, false);
  r := public.apply_plan_upgrade_payment(pay, 'pay_test_' || pay);
  IF r->>'status' IS DISTINCT FROM 'applied' AND r->>'result' IS DISTINCT FROM 'applied' THEN
    RAISE NOTICE 'apply result: %', r;
  END IF;
  IF (SELECT plan_tier FROM public.profiles WHERE id = d) <> 'premium' THEN RAISE EXCEPTION 'premium not applied: %', r; END IF;
  IF (SELECT trial_end FROM public.profiles WHERE id = d) IS NOT NULL THEN RAISE EXCEPTION 'trial_end kept after activation'; END IF;
  r := public.apply_plan_upgrade_payment(pay, 'pay_test_' || pay);
  IF r::text NOT LIKE '%already_verified%' THEN RAISE EXCEPTION 'replay not idempotent: %', r; END IF;

  -- A refunded payment can never be replayed.
  UPDATE public.plan_upgrade_payments SET status = 'refunded' WHERE id = pay;
  r := public.apply_plan_upgrade_payment(pay, 'pay_test_' || pay);
  IF r::text NOT LIKE '%not_payable%' THEN RAISE EXCEPTION 'refunded payment replayable: %', r; END IF;

  -- Lapsed premium loses premium access.
  UPDATE public.profiles SET plan_end = now() - interval '3 days' WHERE id = d;
  IF public.doctor_has_premium_access(d) THEN RAISE EXCEPTION 'lapsed premium still has access'; END IF;

  -- Stale checkouts are retired.
  INSERT INTO public.plan_upgrade_payments (doctor_id, from_tier, target_tier, amount, status, razorpay_order_id, is_mock, created_at)
  VALUES (d, 'free', 'pro', 1499, 'created', 'order_stale_' || pay, false, now() - interval '2 days');
  SELECT public.expire_abandoned_plan_orders() INTO n;
  IF n < 1 THEN RAISE EXCEPTION 'stale order not retired'; END IF;

  RAISE NOTICE 'plan_flow checks passed';
END $$;

ROLLBACK;
