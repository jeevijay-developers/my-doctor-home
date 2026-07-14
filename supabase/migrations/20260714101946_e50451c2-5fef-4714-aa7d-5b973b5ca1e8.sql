
-- 1. New columns
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reschedule_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.website_settings
  ADD COLUMN IF NOT EXISTS cancellation_cutoff_hours integer NOT NULL DEFAULT 2;

-- 2. Slot-availability enforcement trigger (public inserts only)
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
  -- Doctors adding from admin (auth.uid() = doctor_id) can overbook intentionally
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
    AND status <> 'cancelled';

  IF taken >= cap THEN
    RAISE EXCEPTION 'SLOT_FULL'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_slot_capacity ON public.appointments;
CREATE TRIGGER trg_enforce_slot_capacity
  BEFORE INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_slot_capacity();

-- Also enforce on reschedule (date/time change)
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

DROP TRIGGER IF EXISTS trg_enforce_slot_capacity_update ON public.appointments;
CREATE TRIGGER trg_enforce_slot_capacity_update
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_slot_capacity_update();

-- 3. Slot count RPC (safe for anon — returns aggregates only)
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
    AND status <> 'cancelled'
  GROUP BY time_slot;
$$;

GRANT EXECUTE ON FUNCTION public.get_slot_counts(uuid, date) TO anon, authenticated;

-- 4. Appointment lookup by token + phone
CREATE OR REPLACE FUNCTION public.get_appointment_by_token(
  _doctor_id uuid, _token text, _phone text
)
RETURNS TABLE(
  id uuid, doctor_id uuid, patient_name text, patient_phone text,
  service_name text, appointment_type text, date date, time_slot text,
  status text, token_number text, amount numeric, reschedule_count integer,
  chief_complaint text, meeting_link text, created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, doctor_id, patient_name, patient_phone, service_name,
         appointment_type, date, time_slot, status::text, token_number,
         amount, reschedule_count, chief_complaint, meeting_link, created_at
  FROM public.appointments
  WHERE doctor_id = _doctor_id
    AND token_number = _token
    AND patient_phone = _phone
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_appointment_by_token(uuid, text, text) TO anon, authenticated;

-- 5. Queue position: patients ahead of a given appointment (same-day non-cancelled/non-completed with earlier time or created earlier)
CREATE OR REPLACE FUNCTION public.get_queue_position(_appointment_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT doctor_id, date, time_slot, created_at, status
    FROM public.appointments WHERE id = _appointment_id
  )
  SELECT COUNT(*)::int FROM public.appointments a, me
  WHERE a.doctor_id = me.doctor_id
    AND a.date = me.date
    AND a.status IN ('pending', 'confirmed')
    AND a.id <> _appointment_id
    AND (a.time_slot < me.time_slot
         OR (a.time_slot = me.time_slot AND a.created_at < me.created_at));
$$;

GRANT EXECUTE ON FUNCTION public.get_queue_position(uuid) TO anon, authenticated;

-- 6. Cancel by token
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

  appt_ts := (appt.date::text || ' ' || appt.time_slot)::timestamp;
  IF appt_ts - now() < make_interval(hours => cutoff) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOO_CLOSE');
  END IF;

  UPDATE public.appointments SET status = 'cancelled', updated_at = now() WHERE id = appt.id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_appointment_by_token(uuid, text, text) TO anon, authenticated;

-- 7. Reschedule by token
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

  appt_ts := (appt.date::text || ' ' || appt.time_slot)::timestamp;
  IF appt_ts - now() < make_interval(hours => cutoff) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOO_CLOSE');
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

GRANT EXECUTE ON FUNCTION public.reschedule_appointment_by_token(uuid, text, text, date, text) TO anon, authenticated;
