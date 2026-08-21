-- Fix-up for the 20260819090000 migration: notifications.recipient_user_id
-- is now NOT NULL, but these 4 SECURITY DEFINER functions (3 cron jobs + 1
-- trigger) still insert without it, which would start failing on their next
-- run. All four are always doctor-addressed (no staff concept involved), so
-- the fix is simply recipient_user_id = the same doctor id already being
-- used for doctor_id — no other logic changes.

-- Latest version of send_trial_warning_notifications() (from
-- 20260814190000_trial_warning_7_day.sql).
CREATE OR REPLACE FUNCTION public.send_trial_warning_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (doctor_id, recipient_user_id, source_type, title, message)
  SELECT p.id, p.id, 'trial_warning', 'Trial ending in 7 days',
    'Your free trial ends in 7 days. Upgrade now to keep full access to your practice dashboard.'
  FROM public.profiles p
  WHERE p.plan_status = 'trial'
    AND p.trial_end IS NOT NULL
    AND p.trial_end BETWEEN now() + interval '6 days' AND now() + interval '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.doctor_id = p.id AND n.source_type = 'trial_warning' AND n.title = 'Trial ending in 7 days'
    );

  INSERT INTO public.notifications (doctor_id, recipient_user_id, source_type, title, message)
  SELECT p.id, p.id, 'trial_warning', 'Trial ending in 3 days',
    'Your free trial ends in 3 days. Upgrade now to keep full access to your practice dashboard.'
  FROM public.profiles p
  WHERE p.plan_status = 'trial'
    AND p.trial_end IS NOT NULL
    AND p.trial_end BETWEEN now() + interval '2 days' AND now() + interval '3 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.doctor_id = p.id AND n.source_type = 'trial_warning' AND n.title = 'Trial ending in 3 days'
    );

  INSERT INTO public.notifications (doctor_id, recipient_user_id, source_type, title, message)
  SELECT p.id, p.id, 'trial_warning', 'Trial ending tomorrow',
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

-- enforce_monthly_appointment_cap() (from
-- 20260814150000_trial_cap_warning_notifications.sql) — cap-warning insert only.
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
    INSERT INTO public.notifications (doctor_id, recipient_user_id, source_type, title, message)
    VALUES (
      NEW.doctor_id, NEW.doctor_id, 'cap_warning', 'Approaching your monthly appointment limit',
      format('You''ve used %s of %s appointments this month. Upgrade to Premium for unlimited appointments.', new_total, cap)
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Latest version of send_plan_expiry_notifications() (from
-- 20260817130000_plan_expiry_7_day_notifications.sql).
CREATE OR REPLACE FUNCTION public.send_plan_expiry_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (doctor_id, recipient_user_id, source_type, title, message)
  SELECT
    p.id,
    p.id,
    'plan_warning',
    'Subscription Expiring Soon',
    'Your ' || INITCAP(p.plan_tier) || ' plan expires in ' ||
    GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (p.plan_end - now())) / 86400)::int) ||
    ' day(s) (on ' || to_char(p.plan_end, 'Mon DD, YYYY') || '). Renew or upgrade now to avoid any service interruption.'
  FROM public.profiles p
  WHERE p.plan_status = 'active'
    AND p.plan_tier IN ('pro', 'premium')
    AND p.plan_end IS NOT NULL
    AND p.plan_end BETWEEN now() AND now() + interval '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.pending_plans pp
      WHERE pp.doctor_id = p.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.doctor_id = p.id
        AND n.source_type = 'plan_warning'
        AND n.title = 'Subscription Expiring Soon'
        AND n.created_at >= date_trunc('day', now())
    );
END;
$$;

-- activate_scheduled_plans() (from
-- 20260817120000_scheduled_plans_rls_and_reactivation.sql).
CREATE OR REPLACE FUNCTION public.activate_scheduled_plans()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pending_row RECORD;
BEGIN
  FOR pending_row IN
    SELECT pp.id, pp.doctor_id, pp.target_tier, pp.payment_id
    FROM public.pending_plans pp
    WHERE pp.activation_date <= now()
    ORDER BY pp.activation_date ASC
  LOOP
    UPDATE public.profiles
    SET
      plan_tier = pending_row.target_tier,
      plan_status = 'active',
      plan_end = now() + interval '30 days'
    WHERE id = pending_row.doctor_id;

    DELETE FROM public.pending_plans WHERE id = pending_row.id;

    INSERT INTO public.notifications (doctor_id, recipient_user_id, source_type, title, message)
    VALUES (
      pending_row.doctor_id,
      pending_row.doctor_id,
      'direct_message',
      'Scheduled Plan Activated!',
      'Your ' || INITCAP(pending_row.target_tier) || ' plan is now active. Enjoy your upgraded features!'
    );

    INSERT INTO public.admin_audit_log (doctor_id, action, details, actor_id)
    VALUES (
      pending_row.doctor_id,
      'scheduled_plan_activated',
      jsonb_build_object(
        'tier', pending_row.target_tier,
        'payment_id', pending_row.payment_id,
        'activated_at', now()
      ),
      pending_row.doctor_id
    );
  END LOOP;
END;
$$;
