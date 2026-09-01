-- A time slot is now exclusively reserved for one active appointment of a
-- given type. Remove the former configurable clinic slot-capacity feature.

CREATE OR REPLACE FUNCTION public.enforce_slot_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  taken integer;
  slot_key text;
BEGIN
  IF NEW.time_slot IS NULL THEN
    RETURN NEW;
  END IF;

  IF (NEW.date::text || ' ' || NEW.time_slot)::timestamp < now() THEN
    RAISE EXCEPTION 'SLOT_IN_PAST' USING ERRCODE = 'check_violation';
  END IF;

  slot_key := NEW.doctor_id::text || ':' || NEW.date::text || ':' || NEW.time_slot::text || ':' || NEW.appointment_type;
  PERFORM pg_advisory_xact_lock(hashtextextended(slot_key, 0));

  SELECT COUNT(*) INTO taken
  FROM public.appointments
  WHERE doctor_id = NEW.doctor_id
    AND date = NEW.date
    AND time_slot = NEW.time_slot
    AND appointment_type = NEW.appointment_type
    AND status <> 'cancelled';

  IF taken >= 1 THEN
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
  taken integer;
  slot_key text;
BEGIN
  IF NEW.time_slot IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.date = OLD.date AND NEW.time_slot = OLD.time_slot AND NEW.appointment_type = OLD.appointment_type THEN
    RETURN NEW;
  END IF;

  IF (NEW.date::text || ' ' || NEW.time_slot)::timestamp < now() THEN
    RAISE EXCEPTION 'SLOT_IN_PAST' USING ERRCODE = 'check_violation';
  END IF;

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

  IF taken >= 1 THEN
    RAISE EXCEPTION 'SLOT_FULL' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
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

  slot_key := _doctor_id::text || ':' || _new_date::text || ':' || _new_time || ':' || appt.appointment_type;
  PERFORM pg_advisory_xact_lock(hashtextextended(slot_key, 0));

  SELECT COUNT(*) INTO taken FROM public.appointments
  WHERE doctor_id = _doctor_id AND date = _new_date AND time_slot = _new_time
    AND appointment_type = appt.appointment_type AND status <> 'cancelled' AND id <> appt.id;
  IF taken >= 1 THEN RETURN jsonb_build_object('ok', false, 'error', 'SLOT_FULL'); END IF;

  UPDATE public.appointments SET date = _new_date, time_slot = _new_time,
    reschedule_count = reschedule_count + 1,
    status = CASE WHEN auto_conf THEN 'confirmed'::appointment_status ELSE 'pending'::appointment_status END,
    updated_at = now() WHERE id = appt.id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

ALTER TABLE public.website_settings
  DROP COLUMN IF EXISTS clinic_max_per_slot,
  DROP COLUMN IF EXISTS max_per_slot;
