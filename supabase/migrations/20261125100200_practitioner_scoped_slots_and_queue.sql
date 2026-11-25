-- Multi-doctor clinics, P0 part 3: a slot, a queue number and "the room" belong to ONE
-- doctor, not to the whole clinic. Two doctors can see patients at 10:00; one cannot be
-- double-booked. Invoice numbering, the patient lock and the monthly cap stay per clinic.
-- Lock order is unchanged: slot -> queue number -> patient.

-- The one slot lock key. Every slot check (insert, update, re-open, patient reschedule)
-- must use it, or two bookings could take the same doctor's slot concurrently.
CREATE OR REPLACE FUNCTION public.slot_lock_key(_practitioner_id uuid, _date date, _time text, _type text)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT hashtextextended(_practitioner_id::text || ':' || _date::text || ':' || _time || ':' || _type, 0)
$$;

-- ---------------------------------------------------------------------------
-- 1. Slot capacity per practitioner (bodies from 20261029140000, re-keyed)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_slot_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  taken integer;
BEGIN
  IF NEW.time_slot IS NULL THEN
    RETURN NEW;
  END IF;

  IF ((NEW.date::text || ' ' || NEW.time_slot)::timestamp AT TIME ZONE 'Asia/Kolkata') < now() THEN
    RAISE EXCEPTION 'SLOT_IN_PAST' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(public.slot_lock_key(
    NEW.practitioner_id, NEW.date, NEW.time_slot::text, NEW.appointment_type::text));

  SELECT COUNT(*) INTO taken FROM public.appointments
   WHERE practitioner_id = NEW.practitioner_id AND date = NEW.date AND time_slot = NEW.time_slot
     AND appointment_type = NEW.appointment_type AND status <> 'cancelled';

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
SET search_path TO 'public'
AS $$
DECLARE
  taken integer;
BEGIN
  IF NEW.time_slot IS NULL THEN
    RETURN NEW;
  END IF;

  -- Moving to another doctor is a new slot claim too.
  IF NEW.date = OLD.date AND NEW.time_slot = OLD.time_slot AND NEW.appointment_type = OLD.appointment_type
     AND NEW.practitioner_id = OLD.practitioner_id THEN
    RETURN NEW;
  END IF;

  IF ((NEW.date::text || ' ' || NEW.time_slot)::timestamp AT TIME ZONE 'Asia/Kolkata') < now() THEN
    RAISE EXCEPTION 'SLOT_IN_PAST' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(public.slot_lock_key(
    NEW.practitioner_id, NEW.date, NEW.time_slot::text, NEW.appointment_type::text));

  SELECT COUNT(*) INTO taken FROM public.appointments
   WHERE practitioner_id = NEW.practitioner_id AND date = NEW.date AND time_slot = NEW.time_slot
     AND appointment_type = NEW.appointment_type AND status <> 'cancelled' AND id <> NEW.id;

  IF taken >= 1 THEN
    RAISE EXCEPTION 'SLOT_FULL' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Queue numbers and "one in the room" per practitioner per day
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_appointment_queue_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('queue_number:' || NEW.practitioner_id::text || NEW.date::text));
  SELECT COALESCE(MAX(queue_number), 0) + 1 INTO NEW.queue_number
    FROM public.appointments WHERE practitioner_id = NEW.practitioner_id AND date = NEW.date;
  RETURN NEW;
END;
$$;

-- A new day OR a new doctor = the next number in that doctor's line that day.
-- Same-day moves must go through queue_action('transfer') (end of the line, logged).
CREATE OR REPLACE FUNCTION public.renumber_rescheduled_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF NEW.practitioner_id IS DISTINCT FROM OLD.practitioner_id THEN
    IF OLD.serving_started_at IS NOT NULL AND OLD.status::text IN ('pending', 'confirmed') THEN
      RAISE EXCEPTION 'PRACTITIONER_IN_SERVICE' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.date = v_today AND COALESCE(current_setting('app.queue_rpc', true), '') <> '1' THEN
      RAISE EXCEPTION 'USE_QUEUE_TRANSFER' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.date IS DISTINCT FROM OLD.date OR NEW.practitioner_id IS DISTINCT FROM OLD.practitioner_id THEN
    PERFORM pg_advisory_xact_lock(hashtext('queue_number:' || NEW.practitioner_id::text || NEW.date::text));
    SELECT COALESCE(MAX(queue_number), 0) + 1 INTO NEW.queue_number
      FROM public.appointments WHERE practitioner_id = NEW.practitioner_id AND date = NEW.date;
    NEW.serving_started_at := NULL;
    NEW.skipped_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_a2b_renumber_rescheduled ON public.appointments;
CREATE TRIGGER trg_a2b_renumber_rescheduled
BEFORE UPDATE OF date, practitioner_id ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.renumber_rescheduled_appointment();

-- With one practitioner per clinic today these are equivalent to the old indexes, so the
-- rebuild cannot fail on existing data.
DROP INDEX IF EXISTS public.uq_appointments_queue_number;
CREATE UNIQUE INDEX uq_appointments_queue_number
  ON public.appointments (practitioner_id, date, queue_number) WHERE queue_number IS NOT NULL;

DROP INDEX IF EXISTS public.uq_appointments_one_serving;
CREATE UNIQUE INDEX uq_appointments_one_serving
  ON public.appointments (practitioner_id, date)
  WHERE serving_started_at IS NOT NULL AND status IN ('pending', 'confirmed');

-- ---------------------------------------------------------------------------
-- 3. Public RPCs (NULL practitioner = the clinic's primary, so old callers are unchanged)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_slot_counts(uuid, date, text);
CREATE FUNCTION public.get_slot_counts(
  _doctor_id uuid,
  _date date,
  _appointment_type text DEFAULT 'clinic',
  _practitioner_id uuid DEFAULT NULL
)
RETURNS TABLE(time_slot text, booked integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.time_slot, COUNT(*)::int AS booked
  FROM public.appointments a
  WHERE a.doctor_id = _doctor_id
    AND a.practitioner_id = COALESCE(_practitioner_id, public.primary_practitioner_id(_doctor_id))
    AND a.date = _date
    AND a.time_slot IS NOT NULL
    AND a.appointment_type = _appointment_type
    AND a.status <> 'cancelled'
  GROUP BY a.time_slot;
$$;
REVOKE ALL ON FUNCTION public.get_slot_counts(uuid, date, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_slot_counts(uuid, date, text, uuid) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_public_queue(uuid);
CREATE FUNCTION public.get_public_queue(_doctor_id uuid, _practitioner_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH t AS (SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS today),
  appts AS (
    SELECT a.* FROM public.appointments a, t
     WHERE a.doctor_id = _doctor_id
       AND a.practitioner_id = COALESCE(_practitioner_id, public.primary_practitioner_id(_doctor_id))
       AND a.date = t.today AND a.appointment_type = 'clinic'
       AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _doctor_id AND p.onboarding_completed = true)
  ),
  waiting AS (
    SELECT queue_number,
           row_number() OVER (ORDER BY priority DESC, sort_time, created_at, id) AS rn
      FROM appts
     WHERE status IN ('pending', 'confirmed') AND skipped_at IS NULL AND serving_started_at IS NULL
  ),
  recent AS (
    SELECT EXTRACT(EPOCH FROM (completed_at - serving_started_at)) / 60.0 AS minutes
      FROM appts
     WHERE status = 'completed' AND serving_started_at IS NOT NULL AND completed_at IS NOT NULL
       AND completed_at > serving_started_at
     ORDER BY completed_at DESC LIMIT 10
  ),
  serving AS (
    SELECT queue_number, btrim(regexp_replace(COALESCE(patient_name, ''), '\s+', ' ', 'g')) AS nm
      FROM appts
     WHERE serving_started_at IS NOT NULL AND status IN ('pending', 'confirmed') LIMIT 1
  )
  SELECT jsonb_build_object(
    'now_serving', (SELECT queue_number FROM serving),
    'now_serving_name', (SELECT CASE
        WHEN nm = '' THEN NULL
        WHEN position(' ' IN nm) = 0 THEN nm
        ELSE split_part(nm, ' ', 1) || ' ' || upper(left((regexp_split_to_array(nm, ' '))[array_length(regexp_split_to_array(nm, ' '), 1)], 1)) || '.'
      END FROM serving),
    'next_up',     COALESCE((SELECT jsonb_agg(queue_number ORDER BY rn) FROM waiting WHERE rn <= 5), '[]'::jsonb),
    'waiting',     (SELECT count(*) FROM waiting),
    'done',        (SELECT count(*) FROM appts WHERE status = 'completed'),
    'avg_minutes', (SELECT round(avg(minutes)::numeric, 1) FROM recent),
    'updated_at',  now()
  );
$$;
REVOKE EXECUTE ON FUNCTION public.get_public_queue(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_queue(uuid, uuid) TO anon, authenticated;

-- Same signature: the patient's own appointment says whose line they are in.
CREATE OR REPLACE FUNCTION public.get_my_queue_status(_doctor_id uuid, _token text, _phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  me public.appointments%ROWTYPE;
  ahead integer;
  serving integer;
  avg_min numeric;
BEGIN
  IF length(btrim(COALESCE(_phone, ''))) < 10 OR COALESCE(_token, '') = '' THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  IF public.token_lookup_blocked(_doctor_id, _phone) THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO me FROM public.appointments
   WHERE doctor_id = _doctor_id AND token_number = _token AND patient_phone = _phone
     AND date = today AND appointment_type = 'clinic'
   ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM public.appointments
                    WHERE doctor_id = _doctor_id AND token_number = _token AND patient_phone = _phone) THEN
      PERFORM public.token_lookup_failed(_doctor_id, _phone);
    END IF;
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT queue_number INTO serving FROM public.appointments
   WHERE doctor_id = _doctor_id AND practitioner_id = me.practitioner_id AND date = today
     AND serving_started_at IS NOT NULL AND status IN ('pending', 'confirmed') LIMIT 1;

  SELECT round(avg(EXTRACT(EPOCH FROM (completed_at - serving_started_at)) / 60.0)::numeric, 1) INTO avg_min
    FROM (SELECT completed_at, serving_started_at FROM public.appointments
           WHERE doctor_id = _doctor_id AND practitioner_id = me.practitioner_id AND date = today
             AND status = 'completed' AND serving_started_at IS NOT NULL AND completed_at > serving_started_at
           ORDER BY completed_at DESC LIMIT 10) r;

  IF me.status::text IN ('pending', 'confirmed') AND me.skipped_at IS NULL AND me.serving_started_at IS NULL THEN
    SELECT count(*)::int INTO ahead FROM public.appointments a
     WHERE a.doctor_id = _doctor_id AND a.practitioner_id = me.practitioner_id
       AND a.date = today AND a.appointment_type = 'clinic'
       AND a.status IN ('pending', 'confirmed') AND a.skipped_at IS NULL AND a.serving_started_at IS NULL
       AND a.id <> me.id
       AND (a.priority > me.priority
            OR (a.priority = me.priority
                AND (a.sort_time < me.sort_time
                     OR (a.sort_time = me.sort_time
                         AND (a.created_at < me.created_at
                              OR (a.created_at = me.created_at AND a.id < me.id))))));
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'queue_number', me.queue_number,
    'state', CASE
      WHEN me.status::text = 'completed' THEN 'done'
      WHEN me.status::text IN ('cancelled', 'no_show') THEN me.status::text
      WHEN me.serving_started_at IS NOT NULL THEN 'serving'
      WHEN me.skipped_at IS NOT NULL THEN 'skipped'
      ELSE 'waiting' END,
    'ahead', ahead,
    'now_serving', serving,
    'avg_minutes', avg_min
  );
END;
$$;

-- Internal (called by the public-booking trigger): the chosen doctor's own fee, else the
-- clinic's. A matching paid service still wins, exactly as before.
CREATE OR REPLACE FUNCTION public.public_booking_price(
  _doctor_id uuid, _service_name text, _type text, _practitioner_id uuid DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fee numeric;
  v_online numeric;
  v_default numeric;
  v_price numeric;
BEGIN
  SELECT NULLIF(consultation_fee, 0) INTO v_fee FROM public.practitioners
   WHERE id = _practitioner_id AND doctor_id = _doctor_id;
  IF v_fee IS NULL THEN
    SELECT COALESCE(NULLIF(consultation_fee, 0), 500) INTO v_fee FROM public.profiles WHERE id = _doctor_id;
  END IF;
  v_fee := COALESCE(v_fee, 500);
  SELECT NULLIF(online_fee, 0) INTO v_online FROM public.website_settings WHERE doctor_id = _doctor_id;
  v_default := CASE WHEN _type = 'online' THEN COALESCE(v_online, v_fee) ELSE v_fee END;

  SELECT price INTO v_price FROM public.services
   WHERE doctor_id = _doctor_id AND active = true
     AND lower(btrim(name)) = lower(btrim(COALESCE(_service_name, '')))
     AND (type = _type OR type = 'both')
   ORDER BY (price > 0) DESC, sort_order
   LIMIT 1;

  IF v_price IS NOT NULL AND v_price > 0 THEN
    RETURN v_price;
  END IF;
  RETURN v_default;
END;
$$;
REVOKE ALL ON FUNCTION public.public_booking_price(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Re-keyed copies of the 20261102100000 bodies (only the slot lock / price call change)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_appointment_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_internal boolean := (auth.role() IS NULL OR auth.role() = 'service_role');
  v_clinic   boolean := COALESCE(auth.uid() IS NOT NULL
                         AND (auth.uid() = NEW.doctor_id OR public.staff_doctor_id(auth.uid()) = NEW.doctor_id), false);
  -- Set (transaction-local) by queue_action only; clients cannot set it.
  v_rpc      boolean := COALESCE(current_setting('app.queue_rpc', true), '') = '1';
  v_today    date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  taken      integer;
BEGIN
  -- Cron jobs, edge functions on the service key and migrations are trusted.
  IF v_internal THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT v_clinic THEN
      -- Public booking: always a plain unpaid-or-pay-at-clinic pending request for a real,
      -- future slot, stamped with the server's clock (it decides the order in the queue).
      NEW.status := 'pending';
      NEW.payment_status := CASE WHEN NEW.payment_status::text = 'pending'
                                 THEN 'pending'::public.payment_status
                                 ELSE 'pay_at_clinic'::public.payment_status END;
      NEW.payment_gateway := NULL; NEW.gateway_order_id := NULL;
      NEW.gateway_payment_id := NULL; NEW.gateway_signature := NULL;
      NEW.meeting_link := NULL; NEW.meeting_provider := NULL; NEW.meeting_status := NULL;
      NEW.zoom_meeting_id := NULL; NEW.zoom_join_url := NULL; NEW.zoom_start_url := NULL;
      NEW.reschedule_count := 0;
      NEW.payment_method := NULL; NEW.paid_at := NULL;
      NEW.serving_started_at := NULL; NEW.skipped_at := NULL; NEW.completed_at := NULL;
      NEW.priority := 0; NEW.priority_reason := NULL;
      NEW.patient_id := NULL; NEW.visit_counted := false;
      NEW.amount := GREATEST(COALESCE(NEW.amount, 0), 0);
      NEW.created_at := now();
      IF NEW.time_slot IS NULL THEN
        RAISE EXCEPTION 'TIME_SLOT_REQUIRED' USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.date IS NULL OR NEW.date < v_today THEN
        RAISE EXCEPTION 'SLOT_IN_PAST' USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      -- Doctor/staff booking: may record a counter payment, never a gateway one.
      NEW.payment_gateway := NULL; NEW.gateway_order_id := NULL;
      NEW.gateway_payment_id := NULL; NEW.gateway_signature := NULL;
      IF NEW.payment_status::text = 'refunded' THEN
        NEW.payment_status := 'pending';
      END IF;
      IF NEW.payment_status::text = 'paid' THEN
        NEW.payment_method := COALESCE(NEW.payment_method, 'cash');
        NEW.paid_at := COALESCE(NEW.paid_at, now());
      END IF;
      -- Queue state starts clean: it is changed only through queue_action.
      NEW.serving_started_at := NULL; NEW.skipped_at := NULL;
      NEW.priority := 0; NEW.priority_reason := NULL;
      NEW.patient_id := NULL; NEW.visit_counted := false;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.payment_gateway IS DISTINCT FROM OLD.payment_gateway
     OR NEW.gateway_order_id IS DISTINCT FROM OLD.gateway_order_id
     OR NEW.gateway_payment_id IS DISTINCT FROM OLD.gateway_payment_id
     OR NEW.gateway_signature IS DISTINCT FROM OLD.gateway_signature THEN
    RAISE EXCEPTION 'GATEWAY_FIELDS_LOCKED' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    IF NOT v_clinic THEN
      RAISE EXCEPTION 'PAYMENT_STATUS_LOCKED' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.payment_status::text = 'refunded' THEN
      RAISE EXCEPTION 'REFUND_VIA_REFUND_FLOW' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.payment_gateway IS NOT NULL AND OLD.payment_status::text = 'paid' THEN
      RAISE EXCEPTION 'ONLINE_PAYMENT_LOCKED' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.payment_status::text = 'paid' THEN
      NEW.payment_method := COALESCE(NEW.payment_method, 'cash');
      NEW.paid_at := COALESCE(NEW.paid_at, now());
    END IF;
  END IF;

  IF NEW.amount IS DISTINCT FROM OLD.amount
     AND OLD.payment_gateway IS NOT NULL AND OLD.payment_status::text = 'paid' THEN
    RAISE EXCEPTION 'ONLINE_PAYMENT_LOCKED' USING ERRCODE = 'check_violation';
  END IF;

  -- The order of the line and its audit trail live behind queue_action (priority needs a
  -- reason, every move is logged). Nobody can edit them, or the arrival time, directly.
  IF NOT v_rpc AND (
       NEW.queue_number       IS DISTINCT FROM OLD.queue_number
    OR NEW.priority           IS DISTINCT FROM OLD.priority
    OR NEW.priority_reason    IS DISTINCT FROM OLD.priority_reason
    OR NEW.serving_started_at IS DISTINCT FROM OLD.serving_started_at
    OR NEW.skipped_at         IS DISTINCT FROM OLD.skipped_at
    OR NEW.sort_time          IS DISTINCT FROM OLD.sort_time
    OR NEW.created_at         IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'QUEUE_FIELDS_LOCKED' USING ERRCODE = 'check_violation';
  END IF;

  -- Re-opening a cancelled booking takes its slot again: staff (not the doctor, who may
  -- overbook on purpose) must respect "one active booking per slot".
  IF v_clinic AND v_uid <> NEW.doctor_id
     AND OLD.status::text = 'cancelled' AND NEW.status::text <> 'cancelled'
     AND NEW.time_slot IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(public.slot_lock_key(
      NEW.practitioner_id, NEW.date, NEW.time_slot::text, NEW.appointment_type::text));
    SELECT COUNT(*) INTO taken FROM public.appointments
     WHERE practitioner_id = NEW.practitioner_id AND date = NEW.date AND time_slot = NEW.time_slot
       AND appointment_type = NEW.appointment_type AND status <> 'cancelled' AND id <> NEW.id;
    IF taken >= 1 THEN
      RAISE EXCEPTION 'SLOT_FULL' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reschedule_appointment_by_token(_doctor_id uuid, _token text, _phone text, _new_date date, _new_time text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  appt public.appointments%ROWTYPE;
  cutoff integer;
  taken integer;
  auto_conf boolean;
  new_t time;
BEGIN
  IF length(btrim(COALESCE(_phone, ''))) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;
  IF public.token_lookup_blocked(_doctor_id, _phone) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOO_MANY_ATTEMPTS');
  END IF;

  SELECT * INTO appt FROM public.appointments
   WHERE doctor_id = _doctor_id AND token_number = _token AND patient_phone = _phone
   ORDER BY date DESC, created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    PERFORM public.token_lookup_failed(_doctor_id, _phone);
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;
  PERFORM public.token_lookup_ok(_doctor_id, _phone);

  IF appt.status NOT IN ('pending', 'confirmed') OR appt.serving_started_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_RESCHEDULABLE');
  END IF;
  IF appt.reschedule_count >= 2 THEN RETURN jsonb_build_object('ok', false, 'error', 'MAX_RESCHEDULES'); END IF;
  IF _new_date IS NULL OR _new_time IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID');
  END IF;
  BEGIN
    new_t := _new_time::time;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID');
  END;

  SELECT COALESCE(cancellation_cutoff_hours, 2), COALESCE(auto_confirm, false)
    INTO cutoff, auto_conf FROM public.website_settings WHERE doctor_id = _doctor_id;
  cutoff := COALESCE(cutoff, 2);

  IF appt.time_slot IS NOT NULL
     AND ((appt.date::text || ' ' || appt.time_slot::text)::timestamp AT TIME ZONE 'Asia/Kolkata') - now() < make_interval(hours => cutoff) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOO_CLOSE');
  END IF;
  IF ((_new_date::text || ' ' || new_t::text)::timestamp AT TIME ZONE 'Asia/Kolkata') < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SLOT_IN_PAST');
  END IF;

  -- same lock key as the slot-capacity triggers (time_slot::text)
  PERFORM pg_advisory_xact_lock(public.slot_lock_key(
    appt.practitioner_id, _new_date, new_t::text, appt.appointment_type::text));

  SELECT COUNT(*) INTO taken FROM public.appointments
   WHERE practitioner_id = appt.practitioner_id AND date = _new_date AND time_slot = new_t
     AND appointment_type = appt.appointment_type AND status <> 'cancelled' AND id <> appt.id;
  IF taken >= 1 THEN RETURN jsonb_build_object('ok', false, 'error', 'SLOT_FULL'); END IF;

  UPDATE public.appointments SET date = _new_date, time_slot = new_t,
    reschedule_count = reschedule_count + 1,
    status = CASE WHEN auto_conf THEN 'confirmed'::appointment_status ELSE 'pending'::appointment_status END,
    updated_at = now()
   WHERE id = appt.id;
  RETURN jsonb_build_object('ok', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_public_booking_limits()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_internal boolean := (auth.role() IS NULL OR auth.role() = 'service_role');
  v_clinic   boolean := COALESCE(auth.uid() IS NOT NULL
                         AND (auth.uid() = NEW.doctor_id OR public.staff_doctor_id(auth.uid()) = NEW.doctor_id), false);
  today      date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  open_count integer;
BEGIN
  -- Staff bookings, cron and the payment edge function (service key) are trusted.
  IF v_internal OR v_clinic THEN
    RETURN NEW;
  END IF;

  IF length(regexp_replace(COALESCE(NEW.patient_phone, ''), '\D', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'PHONE_REQUIRED' USING ERRCODE = 'check_violation';
  END IF;

  -- One person cannot hold the whole day: at most 3 open future bookings per clinic.
  PERFORM pg_advisory_xact_lock(hashtext('pubbook:' || NEW.doctor_id::text || NEW.patient_phone));
  SELECT count(*) INTO open_count FROM public.appointments
   WHERE doctor_id = NEW.doctor_id AND patient_phone = NEW.patient_phone
     AND status IN ('pending', 'confirmed') AND date >= today;
  IF open_count >= 3 THEN
    RAISE EXCEPTION 'TOO_MANY_BOOKINGS' USING ERRCODE = 'check_violation';
  END IF;

  -- The price comes from the clinic's own setup, never from the visitor.
  NEW.amount := public.public_booking_price(NEW.doctor_id, NEW.service_name, NEW.appointment_type::text, NEW.practitioner_id);
  RETURN NEW;
END;
$function$;

-- Only now is nothing left calling the 3-argument price function.
DROP FUNCTION IF EXISTS public.public_booking_price(uuid, text, text);

NOTIFY pgrst, 'reload schema';
