-- Migration: 20260817130000_plan_expiry_7_day_notifications.sql
-- Description: Daily plan expiry reminder notifications during the last 7 days until plan is renewed or upgraded.

-- 1. Ensure source_type constraint includes plan_warning
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_source_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_source_type_check
  CHECK (source_type IN ('ticket_reply','direct_message','broadcast','trial_warning','cap_warning','plan_warning'));

-- 2. Create or replace send_plan_expiry_notifications function
CREATE OR REPLACE FUNCTION public.send_plan_expiry_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert daily expiry warning during the final 7 days for active Pro/Premium doctors.
  -- Daily deduplication: sends at most once per calendar day.
  -- Automatic stop: does NOT send if the doctor has already renewed/upgraded or has an upcoming scheduled plan in pending_plans.
  INSERT INTO public.notifications (doctor_id, source_type, title, message)
  SELECT 
    p.id, 
    'plan_warning', 
    'Subscription Expiring Soon',
    'Your ' || INITCAP(p.plan_tier) || ' plan expires in ' || 
    GREATEST(1, CEIL(EXTRACT(EPOCH FROM (p.plan_end - now())) / 86400)::int) || 
    ' day(s) (on ' || to_char(p.plan_end, 'Mon DD, YYYY') || '). Renew or upgrade now to avoid any service interruption.'
  FROM public.profiles p
  WHERE p.plan_status = 'active'
    AND p.plan_tier IN ('pro', 'premium')
    AND p.plan_end IS NOT NULL
    AND p.plan_end BETWEEN now() AND now() + interval '7 days'
    -- Stop sending as soon as doctor renews/upgrades or schedules a plan change
    AND NOT EXISTS (
      SELECT 1 FROM public.pending_plans pp 
      WHERE pp.doctor_id = p.id
    )
    -- Prevent multiple notifications on the same calendar day
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.doctor_id = p.id 
        AND n.source_type = 'plan_warning'
        AND n.title = 'Subscription Expiring Soon'
        AND n.created_at >= date_trunc('day', now())
    );
END;
$$;

-- 3. Ensure cron job is scheduled daily at 03:00 UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('plan-expiry-notifications');
    PERFORM cron.schedule(
      'plan-expiry-notifications',
      '0 3 * * *',
      'SELECT public.send_plan_expiry_notifications();'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
