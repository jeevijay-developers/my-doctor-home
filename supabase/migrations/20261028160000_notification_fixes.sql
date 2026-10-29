-- Notification fixes: expiry warnings, trial expiry, appointment-cap warning, grants.

-- 1. Plan-expiry warning fired every day for the last 7 days (its dedupe only
-- covered "today") and printed the expiry date in UTC. It now fires once at 7, 3
-- and 1 days before plan_end, deduped per plan period, with the date in IST.

CREATE OR REPLACE FUNCTION public.send_plan_expiry_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.notifications (doctor_id, recipient_user_id, source_type, title, message)
  SELECT
    p.id,
    p.id,
    'plan_warning',
    CASE d.days WHEN 1 THEN 'Subscription expires tomorrow' ELSE 'Subscription expiring in ' || d.days || ' days' END,
    'Your ' || INITCAP(p.plan_tier) || ' plan ends on ' ||
    to_char(p.plan_end AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY') ||
    '. Renew or upgrade now to avoid any service interruption.'
  FROM public.profiles p
  JOIN (VALUES (7), (3), (1)) AS d(days)
    ON p.plan_end >  now() + make_interval(days => d.days - 1)
   AND p.plan_end <= now() + make_interval(days => d.days)
  WHERE p.plan_status = 'active'
    AND p.plan_tier IN ('pro', 'premium')
    AND NOT EXISTS (SELECT 1 FROM public.pending_plans pp WHERE pp.doctor_id = p.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.doctor_id = p.id
        AND n.source_type = 'plan_warning'
        AND n.title = CASE d.days WHEN 1 THEN 'Subscription expires tomorrow' ELSE 'Subscription expiring in ' || d.days || ' days' END
        AND n.created_at > p.plan_end - interval '8 days'
    );
END;
$$;

-- 2. Trial warnings were deduped for the doctor's whole lifetime, so a trial that
-- was extended or restarted never warned again. Dedupe is now per trial period.

CREATE OR REPLACE FUNCTION public.send_trial_warning_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.notifications (doctor_id, recipient_user_id, source_type, title, message)
  SELECT p.id, p.id, 'trial_warning', m.title, m.message
  FROM public.profiles p
  JOIN (VALUES
    (7, 'Trial ending in 7 days',
        'Your free trial ends in 7 days. Upgrade now to keep full access to your practice dashboard.'),
    (3, 'Trial ending in 3 days',
        'Your free trial ends in 3 days. Upgrade now to keep full access to your practice dashboard.'),
    (1, 'Trial ending tomorrow',
        'Your free trial ends tomorrow. Upgrade now to avoid losing access to your practice dashboard.')
  ) AS m(days, title, message)
    ON p.trial_end >  now() + make_interval(days => m.days - 1)
   AND p.trial_end <= now() + make_interval(days => m.days)
  WHERE p.plan_status = 'trial'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.doctor_id = p.id
        AND n.source_type = 'trial_warning'
        AND n.title = m.title
        AND n.created_at > p.trial_end - interval '8 days'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_trial_warning_notifications() FROM PUBLIC, anon, authenticated;

-- 3. Trials expired silently, and only once a day: a trial that ended at 02:30 UTC
-- kept full access until 02:00 UTC the next day. expire_trials() runs hourly and
-- tells the doctor what happened.

CREATE OR REPLACE FUNCTION public.expire_trials()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  n integer;
BEGIN
  WITH expired AS (
    UPDATE public.profiles
       SET plan_status = 'expired'
     WHERE plan_status = 'trial' AND trial_end < now()
    RETURNING id
  ), ins AS (
    INSERT INTO public.notifications (doctor_id, recipient_user_id, source_type, title, message)
    SELECT id, id, 'trial_warning', 'Your trial has ended',
      'Your free trial has ended. You have 48 hours of read-only access. Upgrade to a paid plan to keep using your dashboard.'
    FROM expired
    RETURNING 1
  )
  SELECT count(*) INTO n FROM expired;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_trials() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job
   WHERE jobname IN ('expire-trials', 'trial-warning-notifications', 'plan-expiry-notifications');
  PERFORM cron.schedule('expire-trials', '5 * * * *', 'SELECT public.expire_trials();');
  PERFORM cron.schedule('trial-warning-notifications', '10 * * * *', 'SELECT public.send_trial_warning_notifications();');
  PERFORM cron.schedule('plan-expiry-notifications', '15 * * * *', 'SELECT public.send_plan_expiry_notifications();');
END $$;

-- 4. Appointment-cap warning: it was deduped against the start of the APPOINTMENT's
-- month, so every booking dated in a future month created a new notification. It is
-- now one notification per doctor per month, named in the title. The month window
-- no longer depends on the session time zone.

CREATE OR REPLACE FUNCTION public.enforce_monthly_appointment_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cap integer;
  taken integer;
  new_total integer;
  month_start date := make_date(extract(year FROM NEW.date)::int, extract(month FROM NEW.date)::int, 1);
  month_label text := to_char(NEW.date, 'Mon YYYY');
  warn_title text;
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
    AND date >= month_start
    AND date < (month_start + interval '1 month')::date;

  IF taken >= cap THEN
    RAISE EXCEPTION 'MONTHLY_APPOINTMENT_CAP_REACHED: Basic plan is limited to % appointments per month', cap
      USING ERRCODE = 'P0001';
  END IF;

  new_total := taken + 1;
  warn_title := 'Approaching your monthly appointment limit (' || month_label || ')';
  IF new_total::numeric / cap >= 0.8 AND NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE doctor_id = NEW.doctor_id AND source_type = 'cap_warning' AND title = warn_title
  ) THEN
    INSERT INTO public.notifications (doctor_id, recipient_user_id, source_type, title, message)
    VALUES (
      NEW.doctor_id, NEW.doctor_id, 'cap_warning', warn_title,
      format('You''ve used %s of %s appointments for %s. Upgrade to Premium for unlimited appointments.', new_total, cap, month_label)
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Recipients may only flip is_read on their own notifications, not rewrite the text.

REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE (is_read) ON public.notifications TO authenticated;

NOTIFY pgrst, 'reload schema';
