-- Abuse limits, billing rules and tie-breaks left over from the review.
--
-- 1. Token lookups are throttled: 8 failed guesses for one clinic + phone lock that pair out
--    for 15 minutes. (New tokens are unguessable; this protects older short T123 tokens.)
-- 2. Public bookings need a real phone and at most 3 upcoming bookings per phone and clinic.
-- 3. A public booking's price is looked up on the server from the clinic's own services, so
--    a forged amount can never reach an invoice.
-- 4. Invoices only for money actually received (payment_status = 'paid').
-- 5. The nightly job tells the doctor when a patient who paid online did not attend.
-- 6. Equal arrival times are ordered by id everywhere, so "how many are ahead" and the order
--    the doctor calls patients in always agree.

-- ---------------------------------------------------------------------------
-- 1. Lookup throttle
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.token_lookup_attempts (
  doctor_id    uuid        NOT NULL,
  phone        text        NOT NULL,
  failures     integer     NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (doctor_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_token_lookup_attempts_window ON public.token_lookup_attempts (window_start);
ALTER TABLE public.token_lookup_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.token_lookup_attempts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.token_lookup_blocked(_doctor_id uuid, _phone text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.token_lookup_attempts
     WHERE doctor_id = _doctor_id AND phone = _phone
       AND failures >= 8 AND window_start > now() - interval '15 minutes');
$$;

CREATE OR REPLACE FUNCTION public.token_lookup_failed(_doctor_id uuid, _phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.token_lookup_attempts (doctor_id, phone, failures, window_start)
  VALUES (_doctor_id, _phone, 1, now())
  ON CONFLICT (doctor_id, phone) DO UPDATE
     SET failures     = CASE WHEN token_lookup_attempts.window_start < now() - interval '15 minutes'
                             THEN 1 ELSE token_lookup_attempts.failures + 1 END,
         window_start = CASE WHEN token_lookup_attempts.window_start < now() - interval '15 minutes'
                             THEN now() ELSE token_lookup_attempts.window_start END;
  -- Housekeeping: old windows are meaningless.
  DELETE FROM public.token_lookup_attempts WHERE window_start < now() - interval '1 day';
END;
$$;

CREATE OR REPLACE FUNCTION public.token_lookup_ok(_doctor_id uuid, _phone text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.token_lookup_attempts WHERE doctor_id = _doctor_id AND phone = _phone;
$$;

REVOKE ALL ON FUNCTION public.token_lookup_blocked(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.token_lookup_failed(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.token_lookup_ok(uuid, text) FROM PUBLIC, anon, authenticated;

-- Appointment lookup by token + phone (the manage-appointment page).
CREATE OR REPLACE FUNCTION public.get_appointment_by_token(
  _doctor_id uuid, _token text, _phone text
)
RETURNS TABLE(
  id uuid, doctor_id uuid, patient_name text, patient_phone text,
  service_name text, appointment_type text, date date, time_slot text,
  status text, token_number text, amount numeric, reschedule_count integer,
  chief_complaint text, meeting_link text, created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF length(btrim(COALESCE(_phone, ''))) < 10 THEN
    RETURN;
  END IF;
  IF public.token_lookup_blocked(_doctor_id, _phone) THEN
    RAISE EXCEPTION 'TOO_MANY_ATTEMPTS';
  END IF;

  RETURN QUERY
    SELECT a.id, a.doctor_id, a.patient_name, a.patient_phone, a.service_name,
           a.appointment_type, a.date, a.time_slot, a.status::text, a.token_number,
           a.amount, a.reschedule_count, a.chief_complaint, a.meeting_link, a.created_at
      FROM public.appointments a
     WHERE a.doctor_id = _doctor_id
       AND a.token_number = _token
       AND a.patient_phone = _phone
     ORDER BY a.date DESC, a.created_at DESC
     LIMIT 1;

  IF FOUND THEN
    PERFORM public.token_lookup_ok(_doctor_id, _phone);
  ELSE
    PERFORM public.token_lookup_failed(_doctor_id, _phone);
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_appointment_by_token(uuid, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.cancel_appointment_by_token(
  _doctor_id uuid, _token text, _phone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  appt public.appointments%ROWTYPE;
  cutoff integer;
  appt_ts timestamptz;
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

  -- Already closed, or the patient is in the consultation room right now.
  IF appt.status NOT IN ('pending', 'confirmed') OR appt.serving_started_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_CANCELLABLE');
  END IF;

  SELECT COALESCE(cancellation_cutoff_hours, 2) INTO cutoff
    FROM public.website_settings WHERE doctor_id = _doctor_id;
  IF cutoff IS NULL THEN cutoff := 2; END IF;

  IF appt.time_slot IS NOT NULL THEN
    appt_ts := (appt.date::text || ' ' || appt.time_slot)::timestamp AT TIME ZONE 'Asia/Kolkata';
    IF appt_ts - now() < make_interval(hours => cutoff) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'TOO_CLOSE');
    END IF;
  END IF;

  UPDATE public.appointments SET status = 'cancelled', updated_at = now() WHERE id = appt.id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.cancel_appointment_by_token(uuid, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.reschedule_appointment_by_token(
  _doctor_id uuid, _token text, _phone text,
  _new_date date, _new_time text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  appt public.appointments%ROWTYPE;
  cutoff integer;
  taken integer;
  auto_conf boolean;
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

  SELECT COALESCE(cancellation_cutoff_hours, 2), COALESCE(auto_confirm, false)
    INTO cutoff, auto_conf FROM public.website_settings WHERE doctor_id = _doctor_id;
  cutoff := COALESCE(cutoff, 2);

  IF appt.time_slot IS NOT NULL
     AND ((appt.date::text || ' ' || appt.time_slot)::timestamp AT TIME ZONE 'Asia/Kolkata') - now() < make_interval(hours => cutoff) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOO_CLOSE');
  END IF;
  IF ((_new_date::text || ' ' || _new_time)::timestamp AT TIME ZONE 'Asia/Kolkata') < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SLOT_IN_PAST');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    _doctor_id::text || ':' || _new_date::text || ':' || _new_time || ':' || appt.appointment_type, 0));

  SELECT COUNT(*) INTO taken FROM public.appointments
   WHERE doctor_id = _doctor_id AND date = _new_date AND time_slot = _new_time
     AND appointment_type = appt.appointment_type AND status <> 'cancelled' AND id <> appt.id;
  IF taken >= 1 THEN RETURN jsonb_build_object('ok', false, 'error', 'SLOT_FULL'); END IF;

  UPDATE public.appointments SET date = _new_date, time_slot = _new_time,
    reschedule_count = reschedule_count + 1,
    status = CASE WHEN auto_conf THEN 'confirmed'::appointment_status ELSE 'pending'::appointment_status END,
    updated_at = now()
   WHERE id = appt.id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment_by_token(uuid, text, text, date, text) TO anon, authenticated;

-- Place in line. Failed guesses count only when the token + phone match NO booking at all:
-- a real booking for another day (or a closed one) is not a guess.
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
   WHERE doctor_id = _doctor_id AND date = today AND serving_started_at IS NOT NULL
     AND status IN ('pending', 'confirmed') LIMIT 1;

  SELECT round(avg(EXTRACT(EPOCH FROM (completed_at - serving_started_at)) / 60.0)::numeric, 1) INTO avg_min
    FROM (SELECT completed_at, serving_started_at FROM public.appointments
           WHERE doctor_id = _doctor_id AND date = today AND status = 'completed'
             AND serving_started_at IS NOT NULL AND completed_at > serving_started_at
           ORDER BY completed_at DESC LIMIT 10) r;

  IF me.status::text IN ('pending', 'confirmed') AND me.skipped_at IS NULL AND me.serving_started_at IS NULL THEN
    SELECT count(*)::int INTO ahead FROM public.appointments a
     WHERE a.doctor_id = _doctor_id AND a.date = today AND a.appointment_type = 'clinic'
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
REVOKE EXECUTE ON FUNCTION public.get_my_queue_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_queue_status(uuid, text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Tie-breaks (public queue + position helper)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_queue(_doctor_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH t AS (SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS today),
  appts AS (
    SELECT a.* FROM public.appointments a, t
     WHERE a.doctor_id = _doctor_id AND a.date = t.today AND a.appointment_type = 'clinic'
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
  )
  SELECT jsonb_build_object(
    'now_serving', (SELECT queue_number FROM appts
                     WHERE serving_started_at IS NOT NULL AND status IN ('pending', 'confirmed') LIMIT 1),
    'next_up',     COALESCE((SELECT jsonb_agg(queue_number ORDER BY rn) FROM waiting WHERE rn <= 5), '[]'::jsonb),
    'waiting',     (SELECT count(*) FROM waiting),
    'done',        (SELECT count(*) FROM appts WHERE status = 'completed'),
    'avg_minutes', (SELECT round(avg(minutes)::numeric, 1) FROM recent),
    'updated_at',  now()
  );
$$;
REVOKE EXECUTE ON FUNCTION public.get_public_queue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_queue(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_queue_position(_appointment_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH me AS (
    SELECT id, doctor_id, date, sort_time, created_at, priority
    FROM public.appointments WHERE id = _appointment_id
  )
  SELECT COUNT(*)::int FROM public.appointments a, me
  WHERE a.doctor_id = me.doctor_id
    AND a.date = me.date
    AND a.appointment_type = 'clinic'
    AND a.status IN ('pending', 'confirmed')
    AND a.skipped_at IS NULL
    AND a.id <> me.id
    AND (a.priority > me.priority
         OR (a.priority = me.priority
             AND (a.sort_time < me.sort_time
                  OR (a.sort_time = me.sort_time
                      AND (a.created_at < me.created_at
                           OR (a.created_at = me.created_at AND a.id < me.id))))));
$$;

-- ---------------------------------------------------------------------------
-- 2 + 3. Public bookings: real phone, a sane number of open bookings, server-side price
-- ---------------------------------------------------------------------------

-- What the clinic's own configuration says this booking costs. Mirrors the booking widget:
-- the default "Clinic Visit" / "Online Consultation" uses the doctor's fee, a named service
-- uses its price (or the default fee when it has none).
CREATE OR REPLACE FUNCTION public.public_booking_price(_doctor_id uuid, _service_name text, _type text)
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
  SELECT COALESCE(NULLIF(consultation_fee, 0), 500) INTO v_fee FROM public.profiles WHERE id = _doctor_id;
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
REVOKE ALL ON FUNCTION public.public_booking_price(uuid, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_public_booking_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_internal boolean := (auth.role() IS NULL OR auth.role() = 'service_role');
  v_clinic   boolean := (auth.uid() IS NOT NULL
                         AND (auth.uid() = NEW.doctor_id OR public.staff_doctor_id(auth.uid()) = NEW.doctor_id));
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
  NEW.amount := public.public_booking_price(NEW.doctor_id, NEW.service_name, NEW.appointment_type::text);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_public_booking_limits() FROM PUBLIC, anon, authenticated;

-- Runs after the write guard (a1) and before the queue number (a2): slot -> guard -> this
-- -> queue -> patient, the same lock order everywhere.
DROP TRIGGER IF EXISTS trg_a1b_public_booking_limits ON public.appointments;
CREATE TRIGGER trg_a1b_public_booking_limits
BEFORE INSERT ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.enforce_public_booking_limits();

-- ---------------------------------------------------------------------------
-- 4. Invoices only for money actually received
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.invoice_on_appointment_billable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.doctor_has_feature(NEW.doctor_id, 'billing_invoices') THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status::text = 'completed' AND NEW.payment_status::text = 'paid' THEN
      PERFORM public.ensure_invoice_for_appointment(NEW.id);
    END IF;
  ELSIF NEW.status::text = 'completed'
        AND NEW.payment_status::text = 'paid'
        AND (OLD.status::text <> 'completed' OR OLD.payment_status IS DISTINCT FROM NEW.payment_status) THEN
    PERFORM public.ensure_invoice_for_appointment(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_a4b_invoice_on_insert ON public.appointments;
CREATE TRIGGER trg_a4b_invoice_on_insert
AFTER INSERT ON public.appointments
FOR EACH ROW
WHEN (NEW.status::text = 'completed' AND NEW.payment_status::text = 'paid')
EXECUTE FUNCTION public.invoice_on_appointment_billable();

-- ---------------------------------------------------------------------------
-- 5. Nightly job: tell the doctor about paid-online no-shows (the money is theirs to
--    refund or keep; nothing is refunded automatically)
-- ---------------------------------------------------------------------------

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_source_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_source_type_check
  CHECK (source_type IN ('ticket_reply','direct_message','broadcast','trial_warning','cap_warning','plan_warning','plan_request','paid_no_show'));

CREATE OR REPLACE FUNCTION public.expire_overdue_appointments()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  today  date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  r      record;
  closed integer := 0;
  failed integer := 0;
  paid_no_shows uuid[] := '{}';
BEGIN
  FOR r IN
    SELECT id, doctor_id,
           (serving_started_at IS NOT NULL) AS was_called,
           (payment_gateway IS NOT NULL AND payment_status::text = 'paid') AS paid_online
      FROM public.appointments
     WHERE status IN ('pending', 'confirmed') AND date < today
       AND (serving_started_at IS NOT NULL OR appointment_type = 'clinic' OR payment_status::text <> 'paid')
     ORDER BY id
  LOOP
    BEGIN
      UPDATE public.appointments
         SET status = (CASE WHEN r.was_called THEN 'completed' ELSE 'no_show' END)::public.appointment_status
       WHERE id = r.id;
      closed := closed + 1;
      IF NOT r.was_called AND r.paid_online THEN
        paid_no_shows := paid_no_shows || r.doctor_id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      failed := failed + 1;
      RAISE WARNING 'expire_overdue_appointments: appointment % skipped: %', r.id, SQLERRM;
    END;
  END LOOP;

  -- One message per doctor per night, not one per patient.
  INSERT INTO public.notifications (doctor_id, recipient_user_id, source_type, title, message)
  SELECT d.doctor_id, d.doctor_id, 'paid_no_show',
         CASE WHEN d.n = 1 THEN 'A patient who paid online did not attend'
              ELSE d.n || ' patients who paid online did not attend' END,
         'They were marked no-show but their payment was kept. Open the appointment to refund it from Billing, or keep it per your cancellation policy.'
    FROM (SELECT x AS doctor_id, count(*) AS n FROM unnest(paid_no_shows) AS x GROUP BY x) d;

  IF failed > 0 THEN
    RAISE WARNING 'expire_overdue_appointments: % closed, % failed', closed, failed;
  END IF;
  RETURN closed;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.expire_overdue_appointments() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
