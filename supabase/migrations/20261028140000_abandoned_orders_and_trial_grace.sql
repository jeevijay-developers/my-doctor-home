-- 1. Abandoned plan checkouts.
--
-- A doctor who opens the Razorpay checkout and closes it leaves a plan_upgrade_payments
-- row in 'created' forever, which the superadmin Billing page counts as "Pending".
-- A background job now retires those rows as 'abandoned' after 24h. The row stays
-- redeemable: a payment that lands late (UPI collect, slow bank) is still applied by
-- apply_plan_upgrade_payment, which accepts 'abandoned' just like 'created'/'failed'.

DO $$
DECLARE
  def text;
  patched text;
BEGIN
  def := pg_get_functiondef('public.apply_plan_upgrade_payment(uuid,text,text)'::regprocedure);
  patched := replace(def, $q$pay.status NOT IN ('created', 'failed')$q$, $q$pay.status NOT IN ('created', 'failed', 'abandoned')$q$);
  IF patched = def THEN
    RAISE EXCEPTION 'apply_plan_upgrade_payment status check not found; refusing to continue';
  END IF;
  EXECUTE patched;
END $$;

CREATE OR REPLACE FUNCTION public.expire_abandoned_plan_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.plan_upgrade_payments
     SET status = 'abandoned', updated_at = now()
   WHERE status = 'created'
     AND created_at < now() - interval '24 hours';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_abandoned_plan_orders() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('expire-abandoned-plan-orders')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-abandoned-plan-orders');
  PERFORM cron.schedule('expire-abandoned-plan-orders', '17 * * * *', 'SELECT public.expire_abandoned_plan_orders();');
END $$;

-- Retire the rows that are already stale.
SELECT public.expire_abandoned_plan_orders();

-- 2. Trial grace period.
--
-- sync_profile_trial_end() blanked trial_end for every non-'trial' status, including
-- 'expired' and 'cancelled'. Once a trial lapsed, the 48h grace window (computed from
-- trial_end on the client) had nothing to count from, so doctors were hard-blocked at
-- once and a suspended trial doctor could never be restored to their trial. trial_end
-- is now cleared only when the doctor becomes a paying ('active') customer.

CREATE OR REPLACE FUNCTION public.sync_profile_trial_end()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.plan_status = 'trial' AND NEW.trial_end IS NULL THEN
    NEW.trial_end = COALESCE(NEW.created_at, now()) + interval '7 days';
  ELSIF NEW.plan_status = 'active' THEN
    NEW.trial_end = NULL;
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
