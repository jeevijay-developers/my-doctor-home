-- Add the 7-day trial-expiry warning to the existing notification flow.
-- Keep the existing 3-day and 1-day reminders, but ensure the doctor also gets
-- notified once when the expiry is 7 days away.
CREATE OR REPLACE FUNCTION public.send_trial_warning_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (doctor_id, source_type, title, message)
  SELECT p.id, 'trial_warning', 'Trial ending in 7 days',
    'Your free trial ends in 7 days. Upgrade now to keep full access to your practice dashboard.'
  FROM public.profiles p
  WHERE p.plan_status = 'trial'
    AND p.trial_end IS NOT NULL
    AND p.trial_end BETWEEN now() + interval '6 days' AND now() + interval '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.doctor_id = p.id AND n.source_type = 'trial_warning' AND n.title = 'Trial ending in 7 days'
    );

  INSERT INTO public.notifications (doctor_id, source_type, title, message)
  SELECT p.id, 'trial_warning', 'Trial ending in 3 days',
    'Your free trial ends in 3 days. Upgrade now to keep full access to your practice dashboard.'
  FROM public.profiles p
  WHERE p.plan_status = 'trial'
    AND p.trial_end IS NOT NULL
    AND p.trial_end BETWEEN now() + interval '2 days' AND now() + interval '3 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.doctor_id = p.id AND n.source_type = 'trial_warning' AND n.title = 'Trial ending in 3 days'
    );

  INSERT INTO public.notifications (doctor_id, source_type, title, message)
  SELECT p.id, 'trial_warning', 'Trial ending tomorrow',
    'Your free trial ends tomorrow. Upgrade now to avoid losing access to your practice dashboard.'
  FROM public.profiles p
  WHERE p.plan_status = 'trial'
    AND p.trial_end IS NOT NULL
    AND p.trial_end BETWEEN now() AND now() + interval '1 day'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.doctor_id = p.id AND n.source_type = 'trial_warning' AND n.title = 'Trial ending tomorrow'
    );
END;
$$;

SELECT cron.unschedule('trial-warning-notifications');
SELECT cron.schedule(
  'trial-warning-notifications',
  '0 3 * * *',
  $$SELECT public.send_trial_warning_notifications();$$
);
