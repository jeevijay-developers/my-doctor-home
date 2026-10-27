-- notifications.recipient_user_id became NOT NULL in 20260819090000, but the
-- custom-plan functions (review_plan_request, cancel_custom_plan,
-- expire_custom_plans, activate_scheduled_plans) insert notifications with only
-- doctor_id, so approving/rejecting a request failed with a not-null violation.
-- For doctor-facing notifications the recipient is the doctor, so default it
-- here; this also protects any future insert that forgets the column.
CREATE OR REPLACE FUNCTION public.notifications_default_recipient()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.recipient_user_id IS NULL THEN
    NEW.recipient_user_id := NEW.doctor_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_default_recipient ON public.notifications;
CREATE TRIGGER notifications_default_recipient
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_default_recipient();

-- Refresh PostgREST's schema cache so the new tables/functions are exposed.
NOTIFY pgrst, 'reload schema';
