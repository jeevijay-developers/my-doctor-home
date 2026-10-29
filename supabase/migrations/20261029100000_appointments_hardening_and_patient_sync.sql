-- Appointments + patients: integrity hardening, server-side patient sync/invoicing,
-- per-day queue numbers and the columns the live queue (next migration) builds on.
--
-- Written against the LIVE definitions (patched in place with pg_get_functiondef +
-- replace; every patch fails loudly if its target text is not found).

-- ---------------------------------------------------------------------------
-- 1. New columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS queue_number       integer,
  ADD COLUMN IF NOT EXISTS patient_id         uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visit_counted      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS serving_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS skipped_at         timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS priority           smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS priority_reason    text,
  ADD COLUMN IF NOT EXISTS payment_method     text,
  ADD COLUMN IF NOT EXISTS paid_at            timestamptz;

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_priority_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_priority_check CHECK (priority IN (0, 1));
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_payment_method_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_payment_method_check CHECK (payment_method IS NULL OR payment_method IN ('cash', 'upi', 'card', 'other'));

CREATE INDEX IF NOT EXISTS idx_appointments_patient ON public.appointments (patient_id);

-- Backfill: completed visits were already counted by the old client code, so they
-- must not be counted again; link them to their patient where the match is certain.
UPDATE public.appointments SET visit_counted = true, completed_at = COALESCE(completed_at, updated_at)
 WHERE status = 'completed';

UPDATE public.appointments a
   SET patient_id = p.id
  FROM public.patients p
 WHERE a.patient_id IS NULL
   AND btrim(a.patient_phone) <> ''
   AND p.doctor_id = a.doctor_id
   AND p.phone = a.patient_phone
   AND lower(btrim(p.name)) = lower(btrim(a.patient_name));

-- Sequential number per doctor per appointment date (what staff call out and the
-- queue screen shows). Backfill existing rows in arrival order.
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY doctor_id, date ORDER BY sort_time, created_at) AS n
  FROM public.appointments WHERE queue_number IS NULL
)
UPDATE public.appointments a SET queue_number = numbered.n FROM numbered WHERE a.id = numbered.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_queue_number
  ON public.appointments (doctor_id, date, queue_number) WHERE queue_number IS NOT NULL;

-- At most one patient "in the room" per doctor per day.
CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_one_serving
  ON public.appointments (doctor_id, date)
  WHERE serving_started_at IS NOT NULL AND status IN ('pending', 'confirmed');

-- A real identity for patients: same phone + same name (case-insensitive) is the same
-- person for one doctor. Two people can still share a phone under different names.
CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_doctor_phone_name
  ON public.patients (doctor_id, phone, (lower(btrim(name)))) WHERE phone <> '';

-- ---------------------------------------------------------------------------
-- 2. Write guard: anonymous bookings cannot choose their own status/payment, and
--    nobody on the client can touch gateway payment data.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_appointment_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role     text := auth.role();
  v_uid      uuid := auth.uid();
  v_internal boolean := (auth.role() IS NULL OR auth.role() = 'service_role');
  v_clinic   boolean := (auth.uid() IS NOT NULL
                         AND (auth.uid() = NEW.doctor_id OR public.staff_doctor_id(auth.uid()) = NEW.doctor_id));
  cap integer;
  taken integer;
BEGIN
  -- Cron jobs, edge functions on the service key and migrations are trusted.
  IF v_internal THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT v_clinic THEN
      -- Public booking: it is always a plain unpaid-or-pay-at-clinic pending request.
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

  -- Re-opening a cancelled booking takes a slot again: staff (not the doctor, who may
  -- overbook on purpose) must respect the slot capacity.
  IF v_clinic AND v_uid <> NEW.doctor_id
     AND OLD.status::text = 'cancelled' AND NEW.status::text <> 'cancelled'
     AND NEW.time_slot IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW.doctor_id::text || NEW.date::text || NEW.time_slot::text));
    SELECT COALESCE(max_per_slot, 1) INTO cap FROM public.website_settings WHERE doctor_id = NEW.doctor_id;
    IF cap IS NULL THEN cap := 1; END IF;
    SELECT COUNT(*) INTO taken FROM public.appointments
     WHERE doctor_id = NEW.doctor_id AND date = NEW.date AND time_slot = NEW.time_slot
       AND status <> 'cancelled' AND id <> NEW.id;
    IF taken >= cap THEN
      RAISE EXCEPTION 'SLOT_FULL' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_a1_guard_appointment_writes ON public.appointments;
CREATE TRIGGER trg_a1_guard_appointment_writes
BEFORE INSERT OR UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.guard_appointment_writes();

-- ---------------------------------------------------------------------------
-- 3. Queue number, assigned by the database (never the browser).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assign_appointment_queue_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('queue_number:' || NEW.doctor_id::text || NEW.date::text));
  SELECT COALESCE(MAX(queue_number), 0) + 1 INTO NEW.queue_number
    FROM public.appointments WHERE doctor_id = NEW.doctor_id AND date = NEW.date;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_a2_assign_queue_number ON public.appointments;
CREATE TRIGGER trg_a2_assign_queue_number
BEFORE INSERT ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.assign_appointment_queue_number();

-- A rescheduled appointment moves to another day: give it the next number there.
CREATE OR REPLACE FUNCTION public.renumber_rescheduled_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.date IS DISTINCT FROM OLD.date THEN
    PERFORM pg_advisory_xact_lock(hashtext('queue_number:' || NEW.doctor_id::text || NEW.date::text));
    SELECT COALESCE(MAX(queue_number), 0) + 1 INTO NEW.queue_number
      FROM public.appointments WHERE doctor_id = NEW.doctor_id AND date = NEW.date;
    NEW.serving_started_at := NULL;
    NEW.skipped_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_a2b_renumber_rescheduled ON public.appointments;
CREATE TRIGGER trg_a2b_renumber_rescheduled
BEFORE UPDATE OF date ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.renumber_rescheduled_appointment();

-- ---------------------------------------------------------------------------
-- 4. Patient record: created/linked on the server, in the same transaction.
--    * a doctor/staff booking creates the patient immediately (walk-ins show up in
--      Patients without anyone marking anything complete);
--    * a public booking creates it when the patient is called in or completed;
--    * the visit is counted exactly once, however often the status is flipped.
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
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL
       AND (auth.uid() = NEW.doctor_id OR public.staff_doctor_id(auth.uid()) = NEW.doctor_id) THEN
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
    -- Re-opening a finished appointment puts it back in the waiting line.
    IF NEW.status::text IN ('pending', 'confirmed') AND OLD.status::text IN ('completed', 'cancelled', 'no_show') THEN
      NEW.serving_started_at := NULL;
      NEW.skipped_at := NULL;
      NEW.completed_at := NULL;
    END IF;
  END IF;

  IF NEW.status::text = 'completed' AND NOT NEW.visit_counted THEN
    do_ensure := true;
    do_count := true;
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
      INSERT INTO public.patients (doctor_id, name, phone, email, age, gender, first_visit, last_visit, total_visits)
      VALUES (NEW.doctor_id, btrim(NEW.patient_name), v_phone, NEW.patient_email, NEW.patient_age,
              NEW.patient_gender, NEW.date, NEW.date, 0)
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

DROP TRIGGER IF EXISTS trg_a3_sync_appointment_patient ON public.appointments;
CREATE TRIGGER trg_a3_sync_appointment_patient
BEFORE INSERT OR UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.sync_appointment_patient();

-- ---------------------------------------------------------------------------
-- 5. Invoices on the server. A visit is billable once it is completed AND paid
--    (paid at the counter/online, or pay-at-clinic). Unpaid or refunded visits no
--    longer inflate revenue; marking one paid later creates its invoice then.
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
  SELECT COALESCE(MAX(substring(invoice_number FROM length(prefix) + 1)::int), 0) + 1 INTO seq
    FROM public.invoices
   WHERE doctor_id = a.doctor_id AND invoice_number LIKE prefix || '%'
     AND substring(invoice_number FROM length(prefix) + 1) ~ '^[0-9]+$';

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

CREATE OR REPLACE FUNCTION public.invoice_on_appointment_billable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status::text = 'completed'
     AND NEW.payment_status::text IN ('paid', 'pay_at_clinic')
     AND (OLD.status::text <> 'completed' OR OLD.payment_status IS DISTINCT FROM NEW.payment_status) THEN
    PERFORM public.ensure_invoice_for_appointment(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_a4_invoice_on_appointment ON public.appointments;
CREATE TRIGGER trg_a4_invoice_on_appointment
AFTER UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.invoice_on_appointment_billable();

-- ---------------------------------------------------------------------------
-- 6. Overdue appointments are closed by the server, once a day just after midnight
--    IST, instead of by whichever browser happens to open the page.
--    * called in but never closed  -> completed (staff forgot the click)
--    * never called, clinic visit  -> no_show
--    * online + unpaid             -> no_show (a paid online booking is left for the doctor)
--    Today's appointments are never touched.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expire_overdue_appointments()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  n1 integer;
  n2 integer;
BEGIN
  UPDATE public.appointments SET status = 'completed'
   WHERE status IN ('pending', 'confirmed') AND date < today AND serving_started_at IS NOT NULL;
  GET DIAGNOSTICS n1 = ROW_COUNT;

  UPDATE public.appointments SET status = 'no_show'
   WHERE status IN ('pending', 'confirmed') AND date < today AND serving_started_at IS NULL
     AND (appointment_type = 'clinic' OR payment_status::text <> 'paid');
  GET DIAGNOSTICS n2 = ROW_COUNT;

  RETURN n1 + n2;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_overdue_appointments() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('expire-overdue-appointments')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-overdue-appointments');
  PERFORM cron.schedule('expire-overdue-appointments', '35 18 * * *', 'SELECT public.expire_overdue_appointments();');
END $$;

-- ---------------------------------------------------------------------------
-- 7. Patches to the existing public booking functions (timezone, NULL bypass, empty
--    phone, deterministic lookup, slot lock).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  def text;
  patched text;
BEGIN
  -- cancel_appointment_by_token
  def := replace(pg_get_functiondef('public.cancel_appointment_by_token(uuid,text,text)'::regprocedure), E'\r', '');
  patched := replace(def,
    'WHERE doctor_id = _doctor_id AND token_number = _token AND patient_phone = _phone' || E'\n  LIMIT 1;',
    'WHERE doctor_id = _doctor_id AND token_number = _token AND patient_phone = _phone' || E'\n    AND length(btrim(COALESCE(_phone, ''''))) >= 10' || E'\n  ORDER BY date DESC, created_at DESC LIMIT 1;');
  IF patched = def THEN RAISE EXCEPTION 'cancel_appointment_by_token lookup not found'; END IF;
  def := patched;
  patched := replace(def, 'appt_ts := (appt.date::text || '' '' || appt.time_slot)::timestamp;',
                          'appt_ts := (appt.date::text || '' '' || appt.time_slot)::timestamp AT TIME ZONE ''Asia/Kolkata'';');
  IF patched = def THEN RAISE EXCEPTION 'cancel_appointment_by_token timestamp not found'; END IF;
  EXECUTE patched;

  -- reschedule_appointment_by_token
  def := replace(pg_get_functiondef('public.reschedule_appointment_by_token(uuid,text,text,date,text)'::regprocedure), E'\r', '');
  patched := replace(def,
    'WHERE doctor_id = _doctor_id AND token_number = _token AND patient_phone = _phone' || E'\n  LIMIT 1;',
    'WHERE doctor_id = _doctor_id AND token_number = _token AND patient_phone = _phone' || E'\n    AND length(btrim(COALESCE(_phone, ''''))) >= 10' || E'\n  ORDER BY date DESC, created_at DESC LIMIT 1;');
  IF patched = def THEN RAISE EXCEPTION 'reschedule_appointment_by_token lookup not found'; END IF;
  def := patched;
  patched := replace(def, 'appt_ts := (appt.date::text || '' '' || appt.time_slot)::timestamp;',
                          'appt_ts := (appt.date::text || '' '' || appt.time_slot)::timestamp AT TIME ZONE ''Asia/Kolkata'';');
  IF patched = def THEN RAISE EXCEPTION 'reschedule_appointment_by_token timestamp not found'; END IF;
  def := patched;
  patched := replace(def, 'IF (_new_date::text || '' '' || _new_time)::timestamp < now() THEN',
                          'IF _new_date IS NULL OR _new_time IS NULL THEN' || E'\n    RETURN jsonb_build_object(''ok'', false, ''error'', ''INVALID'');' || E'\n  END IF;' || E'\n  IF ((_new_date::text || '' '' || _new_time)::timestamp AT TIME ZONE ''Asia/Kolkata'') < now() THEN');
  IF patched = def THEN RAISE EXCEPTION 'reschedule_appointment_by_token new-slot check not found'; END IF;
  EXECUTE patched;

  -- get_appointment_by_token
  def := replace(pg_get_functiondef('public.get_appointment_by_token(uuid,text,text)'::regprocedure), E'\r', '');
  patched := replace(def, '    AND token_number = _token',
                          '    AND length(btrim(COALESCE(_phone, ''''))) >= 10' || E'\n    AND token_number = _token');
  IF patched = def THEN RAISE EXCEPTION 'get_appointment_by_token filter not found'; END IF;
  def := patched;
  patched := replace(def, '  LIMIT 1;', '  ORDER BY date DESC, created_at DESC LIMIT 1;');
  IF patched = def THEN RAISE EXCEPTION 'get_appointment_by_token limit not found'; END IF;
  EXECUTE patched;

  -- enforce_slot_capacity: IST clock for "slot in the past", and serialise bookings of one slot
  def := replace(pg_get_functiondef('public.enforce_slot_capacity()'::regprocedure), E'\r', '');
  patched := replace(def, 'IF (NEW.date::text || '' '' || NEW.time_slot)::timestamp < now() THEN',
                          'IF ((NEW.date::text || '' '' || NEW.time_slot)::timestamp AT TIME ZONE ''Asia/Kolkata'') < now() THEN');
  IF patched = def THEN RAISE EXCEPTION 'enforce_slot_capacity past-check not found'; END IF;
  def := patched;
  patched := replace(def, '  SELECT COALESCE(max_per_slot, 1) INTO cap',
                          '  PERFORM pg_advisory_xact_lock(hashtext(NEW.doctor_id::text || NEW.date::text || NEW.time_slot::text));' || E'\n  SELECT COALESCE(max_per_slot, 1) INTO cap');
  IF patched = def THEN RAISE EXCEPTION 'enforce_slot_capacity cap lookup not found'; END IF;
  EXECUTE patched;

  -- enforce_slot_capacity_update: same lock
  def := replace(pg_get_functiondef('public.enforce_slot_capacity_update()'::regprocedure), E'\r', '');
  patched := replace(def, '  SELECT COALESCE(max_per_slot, 1) INTO cap',
                          '  PERFORM pg_advisory_xact_lock(hashtext(NEW.doctor_id::text || NEW.date::text || NEW.time_slot::text));' || E'\n  SELECT COALESCE(max_per_slot, 1) INTO cap');
  IF patched = def THEN RAISE EXCEPTION 'enforce_slot_capacity_update cap lookup not found'; END IF;
  EXECUTE patched;
END $$;

-- The monthly cap check counts then inserts: serialise it per doctor and month.
DO $$
DECLARE
  def text;
  patched text;
BEGIN
  def := replace(pg_get_functiondef('public.enforce_monthly_appointment_cap()'::regprocedure), E'\r', '');
  patched := replace(def, '  SELECT COALESCE((value)::int, 500) INTO cap',
                          '  PERFORM pg_advisory_xact_lock(hashtext(''cap:'' || NEW.doctor_id::text || to_char(NEW.date, ''YYYY-MM'')));' || E'\n  SELECT COALESCE((value)::int, 500) INTO cap');
  IF patched = def THEN RAISE EXCEPTION 'enforce_monthly_appointment_cap lookup not found'; END IF;
  EXECUTE patched;
END $$;

NOTIFY pgrst, 'reload schema';
