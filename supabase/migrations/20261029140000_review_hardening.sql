-- Review hardening for the appointments / patients / live-queue work.
--
-- 1. The slot functions and the write guard are redefined in FULL (not text-patched).
--    20260901120000 removed websites_settings.max_per_slot and made a slot exclusive to
--    one active booking per type; the first guard still read the dropped column when staff
--    re-opened a cancelled booking.
-- 2. Anonymous bookings can no longer skip slot rules (time_slot NULL) or choose their own
--    created_at to jump the queue; queue columns can only be written by queue_action.
-- 3. One lock order everywhere (slot -> queue number -> patient) so a booking and a
--    reschedule of the same slot cannot deadlock.
-- 4. Staff who may only cancel can cancel a booking whose provisional patient is released.
-- 5. queue_action: stale-screen protection (_expect), no SKIP LOCKED, id tie-break.
-- 6. Invoices: also for appointments inserted already completed, only for doctors whose
--    plan includes invoicing, and an integer-safe numbering query.
-- 7. Nightly job: one bad row no longer blocks every other doctor's cleanup.
-- 8. A patient edited by a person is no longer eligible for automatic release.

-- ---------------------------------------------------------------------------
-- 1. Slot capacity (one active booking per slot and type), IST clock, one lock key
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

  PERFORM pg_advisory_xact_lock(hashtextextended(
    NEW.doctor_id::text || ':' || NEW.date::text || ':' || NEW.time_slot::text || ':' || NEW.appointment_type, 0));

  SELECT COUNT(*) INTO taken FROM public.appointments
   WHERE doctor_id = NEW.doctor_id AND date = NEW.date AND time_slot = NEW.time_slot
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

  IF NEW.date = OLD.date AND NEW.time_slot = OLD.time_slot AND NEW.appointment_type = OLD.appointment_type THEN
    RETURN NEW;
  END IF;

  IF ((NEW.date::text || ' ' || NEW.time_slot)::timestamp AT TIME ZONE 'Asia/Kolkata') < now() THEN
    RAISE EXCEPTION 'SLOT_IN_PAST' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    NEW.doctor_id::text || ':' || NEW.date::text || ':' || NEW.time_slot::text || ':' || NEW.appointment_type, 0));

  SELECT COUNT(*) INTO taken FROM public.appointments
   WHERE doctor_id = NEW.doctor_id AND date = NEW.date AND time_slot = NEW.time_slot
     AND appointment_type = NEW.appointment_type AND status <> 'cancelled' AND id <> NEW.id;

  IF taken >= 1 THEN
    RAISE EXCEPTION 'SLOT_FULL' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Firing order is alphabetical: renaming puts the slot lock BEFORE the queue-number and
-- patient locks on both INSERT and UPDATE, matching the reschedule function below.
DROP TRIGGER IF EXISTS trg_enforce_slot_capacity ON public.appointments;
DROP TRIGGER IF EXISTS trg_a0_enforce_slot_capacity ON public.appointments;
CREATE TRIGGER trg_a0_enforce_slot_capacity
  BEFORE INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_slot_capacity();

DROP TRIGGER IF EXISTS trg_enforce_slot_capacity_update ON public.appointments;
DROP TRIGGER IF EXISTS trg_a0_enforce_slot_capacity_update ON public.appointments;
CREATE TRIGGER trg_a0_enforce_slot_capacity_update
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_slot_capacity_update();

-- Patient-facing reschedule: phone must be a real number, deterministic row, IST clock,
-- no reschedule while the patient is already being seen.
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
  SELECT * INTO appt FROM public.appointments
   WHERE doctor_id = _doctor_id AND token_number = _token AND patient_phone = _phone
     AND length(btrim(COALESCE(_phone, ''))) >= 10
   ORDER BY date DESC, created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); END IF;
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

-- ---------------------------------------------------------------------------
-- 2. Write guard
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_appointment_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_internal boolean := (auth.role() IS NULL OR auth.role() = 'service_role');
  v_clinic   boolean := (auth.uid() IS NOT NULL
                         AND (auth.uid() = NEW.doctor_id OR public.staff_doctor_id(auth.uid()) = NEW.doctor_id));
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
    PERFORM pg_advisory_xact_lock(hashtextextended(
      NEW.doctor_id::text || ':' || NEW.date::text || ':' || NEW.time_slot::text || ':' || NEW.appointment_type, 0));
    SELECT COUNT(*) INTO taken FROM public.appointments
     WHERE doctor_id = NEW.doctor_id AND date = NEW.date AND time_slot = NEW.time_slot
       AND appointment_type = NEW.appointment_type AND status <> 'cancelled' AND id <> NEW.id;
    IF taken >= 1 THEN
      RAISE EXCEPTION 'SLOT_FULL' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Staff who may only cancel: the cancel releases a provisional patient, and the
--    foreign key's SET NULL update on the same row is a change "beyond status". Updates
--    made by other triggers (depth > 1) are system actions, not a staff edit.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_appointment_staff_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  only_status_changed boolean;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF public.staff_doctor_id(auth.uid()) IS NOT NULL THEN
    only_status_changed := (to_jsonb(NEW) - 'status') = (to_jsonb(OLD) - 'status');
    IF only_status_changed AND NEW.status = 'cancelled' THEN
      IF NOT public.staff_has_permission(auth.uid(), 'appointments.cancel') THEN
        RAISE EXCEPTION 'Not authorized to cancel appointments';
      END IF;
    ELSE
      IF NOT public.staff_has_permission(auth.uid(), 'appointments.edit') THEN
        RAISE EXCEPTION 'Not authorized to edit appointments';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Patient sync: a booking inserted already cancelled / no-show must not create a patient
-- that nothing would ever release.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_appointment_patient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  do_ensure boolean := false;
  do_count  boolean := false;
  v_pid     uuid;
  v_phone   text := btrim(COALESCE(NEW.patient_phone, ''));
  v_internal boolean := (auth.role() IS NULL OR auth.role() = 'service_role');
  v_clinic  boolean := (auth.uid() IS NOT NULL
                        AND (auth.uid() = NEW.doctor_id OR public.staff_doctor_id(auth.uid()) = NEW.doctor_id));
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.patient_id IS NOT NULL AND NEW.patient_id IS DISTINCT FROM OLD.patient_id
       AND NOT EXISTS (SELECT 1 FROM public.patients WHERE id = NEW.patient_id AND doctor_id = NEW.doctor_id) THEN
      NEW.patient_id := OLD.patient_id;
    END IF;
    IF NOT v_internal THEN
      NEW.visit_counted := OLD.visit_counted;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_clinic AND NEW.status::text NOT IN ('cancelled', 'no_show') THEN
      do_ensure := true;
    END IF;
    IF NEW.status::text = 'completed' THEN
      NEW.completed_at := COALESCE(NEW.completed_at, now());
    END IF;
  ELSE
    IF NEW.serving_started_at IS NOT NULL AND OLD.serving_started_at IS NULL THEN
      do_ensure := true;
    END IF;
    IF NEW.status::text = 'completed' AND OLD.status::text <> 'completed' THEN
      do_ensure := true;
      NEW.completed_at := now();
    END IF;
    IF NEW.status::text IN ('pending', 'confirmed') AND OLD.status::text IN ('completed', 'cancelled', 'no_show') THEN
      NEW.serving_started_at := NULL;
      NEW.skipped_at := NULL;
      NEW.completed_at := NULL;
      IF v_clinic THEN do_ensure := true; END IF;
    END IF;
  END IF;

  IF NEW.status::text = 'completed' AND NOT NEW.visit_counted THEN
    do_ensure := true;
    do_count := true;
  ELSIF TG_OP = 'UPDATE' AND NEW.status::text <> 'completed' AND NEW.visit_counted THEN
    IF NEW.patient_id IS NOT NULL THEN
      PERFORM public.uncount_patient_visit(NEW.patient_id, NEW.id);
    END IF;
    NEW.visit_counted := false;
  END IF;

  IF do_ensure AND NEW.patient_id IS NULL THEN
    IF v_phone <> '' THEN
      PERFORM pg_advisory_xact_lock(hashtext('patient:' || NEW.doctor_id::text || v_phone));
      SELECT id INTO v_pid FROM public.patients
       WHERE doctor_id = NEW.doctor_id AND phone = v_phone
         AND lower(btrim(name)) = lower(btrim(NEW.patient_name))
       LIMIT 1;
    END IF;
    IF v_pid IS NULL THEN
      INSERT INTO public.patients (doctor_id, name, phone, email, age, gender, first_visit, last_visit, total_visits, auto_created)
      VALUES (NEW.doctor_id, btrim(NEW.patient_name), v_phone, NEW.patient_email, NEW.patient_age,
              NEW.patient_gender, NULL, NULL, 0, true)
      RETURNING id INTO v_pid;
    END IF;
    NEW.patient_id := v_pid;
  END IF;

  IF do_count AND NEW.patient_id IS NOT NULL THEN
    UPDATE public.patients
       SET total_visits = total_visits + 1,
           first_visit  = LEAST(COALESCE(first_visit, NEW.date), NEW.date),
           last_visit   = GREATEST(COALESCE(last_visit, NEW.date), NEW.date),
           email        = COALESCE(NULLIF(email, ''), NEW.patient_email, email)
     WHERE id = NEW.patient_id;
    NEW.visit_counted := true;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. queue_action: stale-screen protection, no SKIP LOCKED, deterministic order
--    _expect: for call_next / call, who the caller believes is in the room right now
--             ('none' = nobody, otherwise that appointment's id). If the room changed on
--             another device the action is refused with STALE instead of completing the
--             wrong patient.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.queue_action(text, uuid, text, text);

CREATE OR REPLACE FUNCTION public.queue_action(
  _action text,
  _appointment_id uuid DEFAULT NULL,
  _reason text DEFAULT NULL,
  _payment_method text DEFAULT NULL,
  _expect text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_doctor uuid;
  v_today  date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  a        public.appointments%ROWTYPE;
  cur      public.appointments%ROWTYPE;
  nxt      public.appointments%ROWTYPE;
  v_have   boolean;
  v_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
    v_doctor := v_uid;
  ELSE
    v_doctor := public.staff_doctor_id(v_uid);
    IF v_doctor IS NULL OR NOT public.staff_has_permission(v_uid, 'appointments.edit') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
    END IF;
  END IF;

  IF _action NOT IN ('call_next', 'call', 'complete', 'skip', 'recall', 'no_show',
                     'set_priority', 'clear_priority', 'mark_paid') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'UNKNOWN_ACTION');
  END IF;

  -- One writer at a time per doctor per day: two staff tapping "next" cannot both win.
  PERFORM pg_advisory_xact_lock(hashtext('queue:' || v_doctor::text || v_today::text));
  -- Lets the guard trigger accept writes to the queue columns made by this function only.
  PERFORM set_config('app.queue_rpc', '1', true);

  -- ---- call_next: finish whoever is being seen, then call the next waiting patient ----
  IF _action = 'call_next' THEN
    SELECT * INTO cur FROM public.appointments
     WHERE doctor_id = v_doctor AND date = v_today AND serving_started_at IS NOT NULL
       AND status IN ('pending', 'confirmed')
     FOR UPDATE;
    v_have := FOUND;
    IF _expect IS NOT NULL
       AND ((_expect = 'none' AND v_have) OR (_expect <> 'none' AND (NOT v_have OR cur.id::text <> _expect))) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'STALE');
    END IF;
    IF v_have THEN
      UPDATE public.appointments SET status = 'completed' WHERE id = cur.id;
      INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action) VALUES (v_doctor, cur.id, v_uid, 'complete');
    END IF;

    -- Plain FOR UPDATE: if a patient is mid-cancel we wait a moment rather than silently
    -- calling someone behind them. queue_action callers are already serialised above.
    SELECT * INTO nxt FROM public.appointments
     WHERE doctor_id = v_doctor AND date = v_today AND appointment_type = 'clinic'
       AND status IN ('pending', 'confirmed') AND skipped_at IS NULL AND serving_started_at IS NULL
     ORDER BY priority DESC, sort_time, created_at, id
     LIMIT 1
     FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', true, 'serving', NULL, 'completed', cur.id);
    END IF;
    UPDATE public.appointments SET serving_started_at = now() WHERE id = nxt.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action) VALUES (v_doctor, nxt.id, v_uid, 'call');
    RETURN jsonb_build_object('ok', true, 'serving', nxt.id, 'completed', cur.id);
  END IF;

  -- Everything below acts on one appointment of this clinic.
  SELECT * INTO a FROM public.appointments
   WHERE id = _appointment_id AND doctor_id = v_doctor
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;

  IF _action = 'call' THEN
    IF a.status NOT IN ('pending', 'confirmed') OR a.date <> v_today THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NOT_CALLABLE');
    END IF;
    IF a.serving_started_at IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'serving', a.id);
    END IF;
    SELECT * INTO cur FROM public.appointments
     WHERE doctor_id = v_doctor AND date = v_today AND serving_started_at IS NOT NULL
       AND status IN ('pending', 'confirmed') AND id <> a.id
     FOR UPDATE;
    v_have := FOUND;
    IF _expect IS NOT NULL
       AND ((_expect = 'none' AND v_have) OR (_expect <> 'none' AND (NOT v_have OR cur.id::text <> _expect))) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'STALE');
    END IF;
    IF v_have THEN
      UPDATE public.appointments SET status = 'completed' WHERE id = cur.id;
      INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action) VALUES (v_doctor, cur.id, v_uid, 'complete');
    END IF;
    UPDATE public.appointments SET serving_started_at = now(), skipped_at = NULL WHERE id = a.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action, reason) VALUES (v_doctor, a.id, v_uid, 'call', v_reason);
    RETURN jsonb_build_object('ok', true, 'serving', a.id, 'completed', cur.id);

  ELSIF _action = 'complete' THEN
    IF a.status NOT IN ('pending', 'confirmed') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NOT_COMPLETABLE');
    END IF;
    UPDATE public.appointments
       SET status = 'completed', serving_started_at = COALESCE(serving_started_at, now())
     WHERE id = a.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action) VALUES (v_doctor, a.id, v_uid, 'complete');
    RETURN jsonb_build_object('ok', true);

  ELSIF _action = 'skip' THEN
    IF a.status NOT IN ('pending', 'confirmed') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NOT_SKIPPABLE');
    END IF;
    UPDATE public.appointments SET skipped_at = now(), serving_started_at = NULL WHERE id = a.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action, reason) VALUES (v_doctor, a.id, v_uid, 'skip', v_reason);
    RETURN jsonb_build_object('ok', true);

  ELSIF _action = 'recall' THEN
    IF a.skipped_at IS NULL THEN
      RETURN jsonb_build_object('ok', true);
    END IF;
    UPDATE public.appointments SET skipped_at = NULL WHERE id = a.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action, reason) VALUES (v_doctor, a.id, v_uid, 'recall', v_reason);
    RETURN jsonb_build_object('ok', true);

  ELSIF _action = 'no_show' THEN
    IF a.status NOT IN ('pending', 'confirmed') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NOT_MARKABLE');
    END IF;
    UPDATE public.appointments SET status = 'no_show', serving_started_at = NULL WHERE id = a.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action, reason) VALUES (v_doctor, a.id, v_uid, 'no_show', v_reason);
    RETURN jsonb_build_object('ok', true);

  ELSIF _action = 'set_priority' THEN
    IF v_reason IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'REASON_REQUIRED');
    END IF;
    IF a.status NOT IN ('pending', 'confirmed') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NOT_PRIORITISABLE');
    END IF;
    UPDATE public.appointments SET priority = 1, priority_reason = v_reason WHERE id = a.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action, reason) VALUES (v_doctor, a.id, v_uid, 'priority_on', v_reason);
    RETURN jsonb_build_object('ok', true);

  ELSIF _action = 'clear_priority' THEN
    UPDATE public.appointments SET priority = 0, priority_reason = NULL WHERE id = a.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action, reason) VALUES (v_doctor, a.id, v_uid, 'priority_off', v_reason);
    RETURN jsonb_build_object('ok', true);

  ELSIF _action = 'mark_paid' THEN
    IF _payment_method IS NULL OR _payment_method NOT IN ('cash', 'upi', 'card', 'other') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PAYMENT_METHOD_REQUIRED');
    END IF;
    IF a.payment_gateway IS NOT NULL OR a.payment_status::text IN ('paid', 'refunded') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ALREADY_SETTLED');
    END IF;
    UPDATE public.appointments
       SET payment_status = 'paid', payment_method = _payment_method, paid_at = now()
     WHERE id = a.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action, reason) VALUES (v_doctor, a.id, v_uid, 'mark_paid', _payment_method);
    RETURN jsonb_build_object('ok', true);
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'UNKNOWN_ACTION');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.queue_action(text, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_action(text, uuid, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Invoices
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_invoice_for_appointment(_appointment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  a public.appointments%ROWTYPE;
  prof RECORD;
  yr text;
  prefix text;
  seq integer;
  v_amount numeric;
  v_rate numeric;
  v_gst numeric;
BEGIN
  SELECT * INTO a FROM public.appointments WHERE id = _appointment_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.invoices WHERE appointment_id = _appointment_id) THEN RETURN; END IF;

  SELECT gst_registered, gstin INTO prof FROM public.profiles WHERE id = a.doctor_id;
  yr := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY');
  prefix := 'INV-' || yr || '-';

  PERFORM pg_advisory_xact_lock(hashtext('invoice:' || a.doctor_id::text || yr));
  -- Only plain numeric suffixes of sane length: a hand-made number can never overflow int.
  SELECT COALESCE(MAX(substring(invoice_number FROM length(prefix) + 1)::int), 0) + 1 INTO seq
    FROM public.invoices
   WHERE doctor_id = a.doctor_id AND invoice_number LIKE prefix || '%'
     AND substring(invoice_number FROM length(prefix) + 1) ~ '^[0-9]{1,9}$';

  v_amount := COALESCE(a.amount, 0);
  v_rate := CASE WHEN COALESCE(prof.gst_registered, false) THEN 18 ELSE 0 END;
  v_gst := round(v_amount * v_rate / 100, 2);

  INSERT INTO public.invoices (doctor_id, appointment_id, invoice_number, patient_name, service_name,
                               amount, gst_rate, gst_amount, total_amount, clinic_gstin, status)
  VALUES (a.doctor_id, a.id, prefix || lpad(seq::text, 4, '0'), a.patient_name, a.service_name,
          v_amount, v_rate, v_gst, round(v_amount + v_gst, 2), prof.gstin, 'generated')
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_invoice_for_appointment(uuid) FROM PUBLIC, anon, authenticated;

-- Invoicing is a plan feature (the invoices table's own policy already requires it), so the
-- server-side path must not hand it to doctors whose plan does not include it.
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
    IF NEW.status::text = 'completed' AND NEW.payment_status::text IN ('paid', 'pay_at_clinic') THEN
      PERFORM public.ensure_invoice_for_appointment(NEW.id);
    END IF;
  ELSIF NEW.status::text = 'completed'
        AND NEW.payment_status::text IN ('paid', 'pay_at_clinic')
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
WHEN (NEW.status::text = 'completed' AND NEW.payment_status::text IN ('paid', 'pay_at_clinic'))
EXECUTE FUNCTION public.invoice_on_appointment_billable();

-- ---------------------------------------------------------------------------
-- 7. Nightly clean-up: row by row, so one bad row cannot block every doctor's cleanup,
--    in id order so concurrent work always locks rows in the same order.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_appointments_open_by_date
  ON public.appointments (date) WHERE status IN ('pending', 'confirmed');

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
BEGIN
  FOR r IN
    SELECT id, (serving_started_at IS NOT NULL) AS was_called
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
    EXCEPTION WHEN OTHERS THEN
      failed := failed + 1;
      RAISE WARNING 'expire_overdue_appointments: appointment % skipped: %', r.id, SQLERRM;
    END;
  END LOOP;

  IF failed > 0 THEN
    RAISE WARNING 'expire_overdue_appointments: % closed, % failed', closed, failed;
  END IF;
  RETURN closed;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_overdue_appointments() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. A person editing a patient takes ownership of it: it is no longer "provisional".
--    (Changes the booking triggers make themselves also move total_visits, so they do not
--    count as an edit.)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.patients_adopt_on_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.auto_created AND (
       NEW.name   IS DISTINCT FROM OLD.name
    OR NEW.phone  IS DISTINCT FROM OLD.phone
    OR NEW.age    IS DISTINCT FROM OLD.age
    OR NEW.gender IS DISTINCT FROM OLD.gender
    OR NEW.notes  IS DISTINCT FROM OLD.notes
    OR (NEW.email IS DISTINCT FROM OLD.email AND NEW.total_visits = OLD.total_visits)
  ) THEN
    NEW.auto_created := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patients_adopt_on_edit ON public.patients;
CREATE TRIGGER trg_patients_adopt_on_edit
BEFORE UPDATE ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.patients_adopt_on_edit();

NOTIFY pgrst, 'reload schema';
