CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'expire-trials',
  '0 2 * * *',
  $$UPDATE public.profiles SET plan_status = 'expired' WHERE plan_status = 'trial' AND trial_end < now()$$
);
