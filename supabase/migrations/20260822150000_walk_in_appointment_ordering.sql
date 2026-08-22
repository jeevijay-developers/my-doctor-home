ALTER TABLE public.appointments
  ALTER COLUMN time_slot DROP NOT NULL;

ALTER TABLE public.appointments
  ADD COLUMN sort_time time;

UPDATE public.appointments
SET sort_time = COALESCE(
  time_slot,
  (created_at AT TIME ZONE 'Asia/Kolkata')::time
);

ALTER TABLE public.appointments
  ALTER COLUMN sort_time SET NOT NULL;

CREATE OR REPLACE FUNCTION public.set_appointment_sort_time()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.sort_time := COALESCE(
    NEW.time_slot,
    (NEW.created_at AT TIME ZONE 'Asia/Kolkata')::time
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_appointment_sort_time ON public.appointments;
CREATE TRIGGER trg_set_appointment_sort_time
  BEFORE INSERT OR UPDATE OF time_slot, created_at ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_appointment_sort_time();

CREATE INDEX IF NOT EXISTS idx_appointments_doctor_date_sort_time
  ON public.appointments (doctor_id, date, sort_time, created_at);

CREATE OR REPLACE FUNCTION public.enforce_slot_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cap integer;
  taken integer;
BEGIN
  IF NEW.time_slot IS NULL THEN
    RETURN NEW;
  END IF;

  -- Doctors adding from admin can overbook or backdate intentionally.
  IF auth.uid() IS NOT NULL AND auth.uid() = NEW.doctor_id THEN
    RETURN NEW;
  END IF;

  IF (NEW.date::text || ' ' || NEW.time_slot)::timestamp < now() THEN
    RAISE EXCEPTION 'SLOT_IN_PAST' USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(max_per_slot, 1) INTO cap
  FROM public.website_settings WHERE doctor_id = NEW.doctor_id;
  IF cap IS NULL THEN cap := 1; END IF;

  SELECT COUNT(*) INTO taken
  FROM public.appointments
  WHERE doctor_id = NEW.doctor_id
    AND date = NEW.date
    AND time_slot = NEW.time_slot
    AND status <> 'cancelled';

  IF taken >= cap THEN
    RAISE EXCEPTION 'SLOT_FULL'
      USING ERRCODE = 'check_violation';
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
BEGIN
  IF NEW.time_slot IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.date = OLD.date AND NEW.time_slot = OLD.time_slot THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() = NEW.doctor_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(max_per_slot, 1) INTO cap
  FROM public.website_settings WHERE doctor_id = NEW.doctor_id;
  IF cap IS NULL THEN cap := 1; END IF;

  SELECT COUNT(*) INTO taken
  FROM public.appointments
  WHERE doctor_id = NEW.doctor_id
    AND date = NEW.date
    AND time_slot = NEW.time_slot
    AND status <> 'cancelled'
    AND id <> NEW.id;

  IF taken >= cap THEN
    RAISE EXCEPTION 'SLOT_FULL' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_slot_counts(_doctor_id uuid, _date date)
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
    AND status <> 'cancelled'
  GROUP BY time_slot;
$$;

CREATE OR REPLACE FUNCTION public.get_queue_position(_appointment_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT doctor_id, date, sort_time, created_at
    FROM public.appointments WHERE id = _appointment_id
  )
  SELECT COUNT(*)::int FROM public.appointments a, me
  WHERE a.doctor_id = me.doctor_id
    AND a.date = me.date
    AND a.status IN ('pending', 'confirmed')
    AND a.id <> _appointment_id
    AND (a.sort_time < me.sort_time
         OR (a.sort_time = me.sort_time AND a.created_at < me.created_at));
$$;

CREATE OR REPLACE FUNCTION public.cancel_appointment_by_token(
  _doctor_id uuid, _token text, _phone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  appt public.appointments%ROWTYPE;
  cutoff integer;
  appt_ts timestamptz;
BEGIN
  SELECT * INTO appt FROM public.appointments
  WHERE doctor_id = _doctor_id AND token_number = _token AND patient_phone = _phone
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;
  IF appt.status NOT IN ('pending', 'confirmed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_CANCELLABLE');
  END IF;

  SELECT COALESCE(cancellation_cutoff_hours, 2) INTO cutoff
  FROM public.website_settings WHERE doctor_id = _doctor_id;
  IF cutoff IS NULL THEN cutoff := 2; END IF;

  IF appt.time_slot IS NOT NULL THEN
    appt_ts := (appt.date::text || ' ' || appt.time_slot)::timestamp;
    IF appt_ts - now() < make_interval(hours => cutoff) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'TOO_CLOSE');
    END IF;
  END IF;

  UPDATE public.appointments SET status = 'cancelled', updated_at = now() WHERE id = appt.id;
  RETURN jsonb_build_object('ok', true);
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
  appt_ts timestamptz;
  cap integer;
  taken integer;
  auto_conf boolean;
BEGIN
  SELECT * INTO appt FROM public.appointments
  WHERE doctor_id = _doctor_id AND token_number = _token AND patient_phone = _phone
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;
  IF appt.status NOT IN ('pending', 'confirmed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_RESCHEDULABLE');
  END IF;
  IF appt.reschedule_count >= 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MAX_RESCHEDULES');
  END IF;

  SELECT COALESCE(cancellation_cutoff_hours, 2), COALESCE(max_per_slot, 1), COALESCE(auto_confirm, false)
    INTO cutoff, cap, auto_conf
  FROM public.website_settings WHERE doctor_id = _doctor_id;
  IF cutoff IS NULL THEN cutoff := 2; END IF;
  IF cap IS NULL THEN cap := 1; END IF;

  IF appt.time_slot IS NOT NULL THEN
    appt_ts := (appt.date::text || ' ' || appt.time_slot)::timestamp;
    IF appt_ts - now() < make_interval(hours => cutoff) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'TOO_CLOSE');
    END IF;
  END IF;

  IF (_new_date::text || ' ' || _new_time)::timestamp < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SLOT_IN_PAST');
  END IF;

  SELECT COUNT(*) INTO taken FROM public.appointments
  WHERE doctor_id = _doctor_id AND date = _new_date AND time_slot = _new_time
    AND status <> 'cancelled' AND id <> appt.id;
  IF taken >= cap THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SLOT_FULL');
  END IF;

  UPDATE public.appointments
    SET date = _new_date,
        time_slot = _new_time,
        reschedule_count = reschedule_count + 1,
        status = CASE WHEN auto_conf THEN 'confirmed'::appointment_status ELSE 'pending'::appointment_status END,
        updated_at = now()
    WHERE id = appt.id;

  RETURN jsonb_build_object('ok', true);
END;
$$;