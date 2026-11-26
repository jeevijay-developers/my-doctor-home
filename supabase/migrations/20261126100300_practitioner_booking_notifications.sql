-- Multi-doctor P1 part 4: tell a doctor who has their own login when a patient is booked
-- with them. Multi-doctor clinics only; single-doctor clinics get no new notifications.
-- Check: npx supabase db query --linked -f supabase/tests/multi-doctor/08_notifications.sql

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_source_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_source_type_check
  CHECK (source_type = ANY (ARRAY['ticket_reply', 'direct_message', 'broadcast', 'trial_warning', 'cap_warning',
                                  'plan_warning', 'plan_request', 'paid_no_show', 'new_booking']));

CREATE OR REPLACE FUNCTION public.notify_practitioner_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
BEGIN
  SELECT user_id INTO v_user FROM public.practitioners WHERE id = NEW.practitioner_id;
  -- No login, the owner's own row, or the doctor booking for themselves: nobody to tell.
  -- IS NOT DISTINCT FROM: a booking with no JWT (paid online booking via the edge function)
  -- has auth.uid() NULL and must still notify the doctor.
  IF v_user IS NULL OR v_user = NEW.doctor_id OR v_user IS NOT DISTINCT FROM auth.uid()
     OR NOT COALESCE(public.clinic_multi_doctor_enabled(NEW.doctor_id), false) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.notifications (doctor_id, recipient_user_id, source_type, title, message)
  VALUES (NEW.doctor_id, v_user, 'new_booking', 'New appointment',
          COALESCE(NULLIF(btrim(NEW.patient_name), ''), 'A patient') || ' booked for ' || to_char(NEW.date, 'DD Mon')
            -- time_slot is a time: format it through a timestamp (to_char has no time variant).
            || COALESCE(' at ' || to_char(('2000-01-01 ' || NEW.time_slot::text)::timestamp, 'HH12:MI AM'), ''));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_a7_notify_practitioner_booking ON public.appointments;
CREATE TRIGGER trg_a7_notify_practitioner_booking
  AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.notify_practitioner_booking();
