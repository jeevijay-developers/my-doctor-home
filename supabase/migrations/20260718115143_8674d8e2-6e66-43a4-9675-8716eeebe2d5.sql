
-- Extend slot capacity trigger to also reject past slots for non-doctor callers
CREATE OR REPLACE FUNCTION public.enforce_slot_capacity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cap integer;
  taken integer;
  appt_ts timestamptz;
BEGIN
  -- Doctors adding from admin (auth.uid() = doctor_id) can overbook / backdate intentionally
  IF auth.uid() IS NOT NULL AND auth.uid() = NEW.doctor_id THEN
    RETURN NEW;
  END IF;

  appt_ts := (NEW.date::text || ' ' || NEW.time_slot)::timestamp;
  IF appt_ts < now() THEN
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
    RAISE EXCEPTION 'SLOT_FULL' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

-- Patient reschedule RPC: reject past slots
CREATE OR REPLACE FUNCTION public.reschedule_appointment_by_token(_doctor_id uuid, _token text, _phone text, _new_date date, _new_time text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  appt public.appointments%ROWTYPE;
  cutoff integer;
  appt_ts timestamptz;
  new_ts timestamptz;
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

  new_ts := (_new_date::text || ' ' || _new_time)::timestamp;
  IF new_ts < now() THEN
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
$function$;
