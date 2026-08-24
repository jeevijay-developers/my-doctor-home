-- Clinic Visit bookings may share a doctor-defined slot; Online Consultation
-- remains exclusive at one active appointment per doctor/date/time.
ALTER TABLE public.website_settings
  ADD COLUMN IF NOT EXISTS clinic_max_per_slot integer NOT NULL DEFAULT 3;
ALTER TABLE public.website_settings
  ALTER COLUMN clinic_max_per_slot SET DEFAULT 3;

ALTER TABLE public.website_settings
  DROP CONSTRAINT IF EXISTS website_settings_clinic_max_per_slot_positive;
ALTER TABLE public.website_settings
  ADD CONSTRAINT website_settings_clinic_max_per_slot_positive CHECK (clinic_max_per_slot > 0);

CREATE OR REPLACE FUNCTION public.enforce_slot_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cap integer;
  taken integer;
  slot_key text;
BEGIN
  IF NEW.time_slot IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.appointment_type <> 'online' AND auth.uid() IS NOT NULL AND auth.uid() = NEW.doctor_id THEN
    RETURN NEW;
  END IF;

  IF (NEW.date::text || ' ' || NEW.time_slot)::timestamp < now() THEN
    RAISE EXCEPTION 'SLOT_IN_PAST' USING ERRCODE = 'check_violation';
  END IF;

  cap := CASE WHEN NEW.appointment_type = 'online' THEN 1 ELSE (
    SELECT COALESCE(clinic_max_per_slot, max_per_slot, 1)
    FROM public.website_settings WHERE doctor_id = NEW.doctor_id
  ) END;
  cap := GREATEST(COALESCE(cap, 1), 1);

  slot_key := NEW.doctor_id::text || ':' || NEW.date::text || ':' || NEW.time_slot::text || ':' || NEW.appointment_type;
  PERFORM pg_advisory_xact_lock(hashtextextended(slot_key, 0));

  SELECT COUNT(*) INTO taken
  FROM public.appointments
  WHERE doctor_id = NEW.doctor_id
    AND date = NEW.date
    AND time_slot = NEW.time_slot
    AND appointment_type = NEW.appointment_type
    AND status <> 'cancelled';

  IF taken >= cap THEN
    RAISE EXCEPTION 'SLOT_FULL' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_slot_capacity_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cap integer;
  taken integer;
  slot_key text;
BEGIN
  IF NEW.time_slot IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.date = OLD.date AND NEW.time_slot = OLD.time_slot AND NEW.appointment_type = OLD.appointment_type THEN
    RETURN NEW;
  END IF;
  IF NEW.appointment_type <> 'online' AND auth.uid() IS NOT NULL AND auth.uid() = NEW.doctor_id THEN
    RETURN NEW;
  END IF;

  IF (NEW.date::text || ' ' || NEW.time_slot)::timestamp < now() THEN
    RAISE EXCEPTION 'SLOT_IN_PAST' USING ERRCODE = 'check_violation';
  END IF;

  cap := CASE WHEN NEW.appointment_type = 'online' THEN 1 ELSE (
    SELECT COALESCE(clinic_max_per_slot, max_per_slot, 1)
    FROM public.website_settings WHERE doctor_id = NEW.doctor_id
  ) END;
  cap := GREATEST(COALESCE(cap, 1), 1);

  slot_key := NEW.doctor_id::text || ':' || NEW.date::text || ':' || NEW.time_slot::text || ':' || NEW.appointment_type;
  PERFORM pg_advisory_xact_lock(hashtextextended(slot_key, 0));

  SELECT COUNT(*) INTO taken
  FROM public.appointments
  WHERE doctor_id = NEW.doctor_id
    AND date = NEW.date
    AND time_slot = NEW.time_slot
    AND appointment_type = NEW.appointment_type
    AND status <> 'cancelled'
    AND id <> NEW.id;

  IF taken >= cap THEN
    RAISE EXCEPTION 'SLOT_FULL' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.get_slot_counts(uuid, date);
CREATE OR REPLACE FUNCTION public.get_slot_counts(
  _doctor_id uuid,
  _date date,
  _appointment_type text DEFAULT 'clinic'
)
RETURNS TABLE(time_slot text, booked integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT time_slot, COUNT(*)::int AS booked
  FROM public.appointments
  WHERE doctor_id = _doctor_id
    AND date = _date
    AND time_slot IS NOT NULL
    AND appointment_type = _appointment_type
    AND status <> 'cancelled'
  GROUP BY time_slot;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_appointment_by_token(
  _doctor_id uuid, _token text, _phone text,
  _new_date date, _new_time text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  appt public.appointments%ROWTYPE;
  cutoff integer;
  cap integer;
  taken integer;
  auto_conf boolean;
  slot_key text;
BEGIN
  SELECT * INTO appt FROM public.appointments
  WHERE doctor_id = _doctor_id AND token_number = _token AND patient_phone = _phone
  LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); END IF;
  IF appt.status NOT IN ('pending', 'confirmed') THEN RETURN jsonb_build_object('ok', false, 'error', 'NOT_RESCHEDULABLE'); END IF;
  IF appt.reschedule_count >= 2 THEN RETURN jsonb_build_object('ok', false, 'error', 'MAX_RESCHEDULES'); END IF;

  SELECT COALESCE(cancellation_cutoff_hours, 2), COALESCE(auto_confirm, false)
    INTO cutoff, auto_conf FROM public.website_settings WHERE doctor_id = _doctor_id;
  cutoff := COALESCE(cutoff, 2);

  IF appt.time_slot IS NOT NULL AND (appt.date::text || ' ' || appt.time_slot)::timestamp - now() < make_interval(hours => cutoff) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOO_CLOSE');
  END IF;
  IF (_new_date::text || ' ' || _new_time)::timestamp < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SLOT_IN_PAST');
  END IF;

  cap := CASE WHEN appt.appointment_type = 'online' THEN 1 ELSE (
    SELECT COALESCE(clinic_max_per_slot, max_per_slot, 1) FROM public.website_settings WHERE doctor_id = _doctor_id
  ) END;
  cap := GREATEST(COALESCE(cap, 1), 1);
  slot_key := _doctor_id::text || ':' || _new_date::text || ':' || _new_time || ':' || appt.appointment_type;
  PERFORM pg_advisory_xact_lock(hashtextextended(slot_key, 0));

  SELECT COUNT(*) INTO taken FROM public.appointments
  WHERE doctor_id = _doctor_id AND date = _new_date AND time_slot = _new_time
    AND appointment_type = appt.appointment_type AND status <> 'cancelled' AND id <> appt.id;
  IF taken >= cap THEN RETURN jsonb_build_object('ok', false, 'error', 'SLOT_FULL'); END IF;

  UPDATE public.appointments SET date = _new_date, time_slot = _new_time,
    reschedule_count = reschedule_count + 1,
    status = CASE WHEN auto_conf THEN 'confirmed'::appointment_status ELSE 'pending'::appointment_status END,
    updated_at = now() WHERE id = appt.id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_slot_counts(uuid, date, text) TO anon, authenticated;