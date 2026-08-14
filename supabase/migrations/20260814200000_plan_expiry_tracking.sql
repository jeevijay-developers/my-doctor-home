-- Add plan_end column to track when paid plans expire.
-- Used in conjunction with plan_status to determine if a subscription is still active.
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS plan_end timestamp with time zone NULL;

-- Create index for efficient cron-job queries on plan_end
CREATE INDEX IF NOT EXISTS idx_profiles_plan_end ON public.profiles(plan_end) 
WHERE plan_end IS NOT NULL;

-- Create a function to send plan expiry notifications.
-- Similar to trial warnings, but checks plan_end instead of trial_end.
-- Idempotent: uses NOT EXISTS on (doctor_id, source_type, title) to prevent duplicates.
CREATE OR REPLACE FUNCTION public.send_plan_expiry_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 7 days before plan expires
  INSERT INTO public.notifications (doctor_id, source_type, title, message)
  SELECT p.id, 'plan_warning', 'Plan ending in 7 days',
    'Your ' || p.plan_tier || ' plan ends in 7 days. Renew your subscription to maintain access to your practice dashboard.'
  FROM public.profiles p
  WHERE p.plan_status = 'active'
    AND p.plan_tier IN ('pro', 'premium')
    AND p.plan_end IS NOT NULL
    AND p.plan_end BETWEEN now() + interval '6 days' AND now() + interval '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.doctor_id = p.id AND n.source_type = 'plan_warning' AND n.title = 'Plan ending in 7 days'
    );

  -- 3 days before plan expires
  INSERT INTO public.notifications (doctor_id, source_type, title, message)
  SELECT p.id, 'plan_warning', 'Plan ending in 3 days',
    'Your ' || p.plan_tier || ' plan ends in 3 days. Renew now to avoid losing premium features.'
  FROM public.profiles p
  WHERE p.plan_status = 'active'
    AND p.plan_tier IN ('pro', 'premium')
    AND p.plan_end IS NOT NULL
    AND p.plan_end BETWEEN now() + interval '2 days' AND now() + interval '3 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.doctor_id = p.id AND n.source_type = 'plan_warning' AND n.title = 'Plan ending in 3 days'
    );

  -- 1 day before plan expires
  INSERT INTO public.notifications (doctor_id, source_type, title, message)
  SELECT p.id, 'plan_warning', 'Plan ending tomorrow',
    'Your ' || p.plan_tier || ' plan ends tomorrow. Renew immediately to keep access to your practice dashboard.'
  FROM public.profiles p
  WHERE p.plan_status = 'active'
    AND p.plan_tier IN ('pro', 'premium')
    AND p.plan_end IS NOT NULL
    AND p.plan_end BETWEEN now() AND now() + interval '1 day'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.doctor_id = p.id AND n.source_type = 'plan_warning' AND n.title = 'Plan ending tomorrow'
    );
END;
$$;

-- Update the notification source_type enum to include plan_warning
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_source_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_source_type_check
  CHECK (source_type IN ('ticket_reply','direct_message','broadcast','trial_warning','cap_warning','plan_warning'));

-- Schedule the cron job to run daily at 3 AM UTC
SELECT cron.schedule(
  'plan-expiry-notifications',
  '0 3 * * *',
  $$SELECT public.send_plan_expiry_notifications();$$
);
