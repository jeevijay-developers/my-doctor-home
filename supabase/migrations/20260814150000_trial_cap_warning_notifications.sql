-- Extend notifications to accept two new automated warning sources.
ALTER TABLE public.notifications DROP CONSTRAINT notifications_source_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_source_type_check
  CHECK (source_type IN ('ticket_reply','direct_message','broadcast','trial_warning','cap_warning'));

-- Trial-ending warnings, fired once each at the 3-day and 1-day marks.
-- Idempotent via NOT EXISTS on (doctor_id, source_type, title) rather than a
-- separate tracking column — trial_end never changes once set, so a fixed
-- title per checkpoint is a reliable dedupe key.
CREATE OR REPLACE FUNCTION public.send_trial_warning_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

SELECT cron.schedule(
  'trial-warning-notifications',
  '0 3 * * *',
  $$SELECT public.send_trial_warning_notifications();$$
);

-- Cap-warning: piggyback on the existing enforce_monthly_appointment_cap
-- trigger (already fires on every appointment insert) rather than a new
-- cron — fires once per doctor per month, right when usage first crosses
-- 80%, using the same counting logic the hard cap already trusts.
CREATE OR REPLACE FUNCTION public.enforce_monthly_appointment_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cap integer;
  taken integer;
  new_total integer;
BEGIN
  IF public.doctor_has_premium_access(NEW.doctor_id) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE((value)::int, 500) INTO cap
  FROM public.platform_settings WHERE key = 'basic_appointment_cap';
  IF cap IS NULL THEN cap := 500; END IF;

  SELECT COUNT(*) INTO taken
  FROM public.appointments
  WHERE doctor_id = NEW.doctor_id
    AND status <> 'cancelled'
    AND date_trunc('month', date) = date_trunc('month', NEW.date);

  IF taken >= cap THEN
    RAISE EXCEPTION 'MONTHLY_APPOINTMENT_CAP_REACHED: Basic plan is limited to % appointments per month', cap
      USING ERRCODE = 'P0001';
  END IF;

  new_total := taken + 1;
  IF new_total::numeric / cap >= 0.8 AND NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE doctor_id = NEW.doctor_id AND source_type = 'cap_warning'
      AND created_at >= date_trunc('month', NEW.date)
  ) THEN
    INSERT INTO public.notifications (doctor_id, source_type, title, message)
    VALUES (
      NEW.doctor_id, 'cap_warning', 'Approaching your monthly appointment limit',
      format('You''ve used %s of %s appointments this month. Upgrade to Premium for unlimited appointments.', new_total, cap)
    );
  END IF;

  RETURN NEW;
END;
$$;
