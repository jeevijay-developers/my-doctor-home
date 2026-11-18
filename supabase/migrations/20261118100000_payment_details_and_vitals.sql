-- Counter payment references (UTR / approval code), patient weight, and payment-mode
-- reporting on invoices.
--
-- * appointments.payment_reference  : UTR (UPI, 12 digits) or approval code / last 4 digits (card)
-- * appointments.patient_weight     : kg, optional
-- * patients.weight                 : latest weight, kept in step from appointments
-- * invoices.payment_method/_reference : copied at invoice time so Billing can split revenue
--   by cash / UPI / card / online and the doctor can verify a payment later.

-- ---------------------------------------------------------------------------
-- 1. Columns and constraints
-- ---------------------------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS patient_weight numeric(4,1),
  ADD COLUMN IF NOT EXISTS payment_reference text;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS weight numeric(4,1);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_reference text;

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_patient_weight_range;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_patient_weight_range
  CHECK (patient_weight IS NULL OR (patient_weight >= 0.5 AND patient_weight <= 500));

ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_weight_range;
ALTER TABLE public.patients
  ADD CONSTRAINT patients_weight_range
  CHECK (weight IS NULL OR (weight >= 0.5 AND weight <= 500));

-- Only UPI and card payments carry a reference, in a fixed format. (Existing rows have none.)
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_payment_reference_format;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_payment_reference_format
  CHECK (
    payment_reference IS NULL
    OR CASE payment_method
         WHEN 'upi'  THEN payment_reference ~ '^[0-9]{12}$'
         WHEN 'card' THEN payment_reference ~ '^[A-Z0-9]{4,12}$'
         ELSE false
       END
  );

-- A UTR identifies one bank transaction, so it can back only one of a doctor's payments.
CREATE UNIQUE INDEX IF NOT EXISTS appointments_upi_reference_unique
  ON public.appointments (doctor_id, payment_reference)
  WHERE payment_method = 'upi' AND payment_reference IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. BEFORE trigger: normalise, require and validate the reference
--    Named trg_a1c_* so it fires after trg_a1_guard_appointment_writes (which defaults a
--    paid counter payment to 'cash') and before the queue/patient triggers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_payment_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_internal boolean := (auth.role() IS NULL OR auth.role() = 'service_role');
  -- Handed over by queue_action('mark_paid') for the transaction.
  v_ctx      text := NULLIF(btrim(COALESCE(current_setting('app.payment_reference', true), '')), '');
  v_changed  boolean;
BEGIN
  NEW.payment_reference := NULLIF(upper(regexp_replace(COALESCE(NEW.payment_reference, ''), '\s+', '', 'g')), '');

  -- A reference only describes a counter UPI / card payment.
  IF NEW.payment_gateway IS NOT NULL
     OR NEW.payment_status::text <> 'paid'
     OR NEW.payment_method IS NULL
     OR NEW.payment_method NOT IN ('upi', 'card') THEN
    NEW.payment_reference := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_changed := true;
  ELSE
    v_changed := OLD.payment_status IS DISTINCT FROM NEW.payment_status
              OR OLD.payment_method IS DISTINCT FROM NEW.payment_method
              OR OLD.payment_reference IS DISTINCT FROM NEW.payment_reference;
  END IF;
  -- Older UPI / card rows have no reference; leave them alone unless the payment changes.
  IF NOT v_changed THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_reference IS NULL THEN
    NEW.payment_reference := v_ctx;
  END IF;

  IF NEW.payment_reference IS NULL THEN
    IF v_internal THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'PAYMENT_REFERENCE_REQUIRED' USING ERRCODE = 'check_violation';
  END IF;

  IF (NEW.payment_method = 'upi'  AND NEW.payment_reference !~ '^[0-9]{12}$')
  OR (NEW.payment_method = 'card' AND NEW.payment_reference !~ '^[A-Z0-9]{4,12}$') THEN
    RAISE EXCEPTION 'PAYMENT_REFERENCE_INVALID' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_a1c_payment_reference ON public.appointments;
CREATE TRIGGER trg_a1c_payment_reference
BEFORE INSERT OR UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_reference();

-- ---------------------------------------------------------------------------
-- 3. queue_action gains a payment reference for mark_paid.
--    The existing function is kept untouched as queue_action_core; the new 6-argument
--    queue_action validates the reference, passes it to the trigger above for this
--    transaction, and reports a reused UTR as a normal { ok: false } answer.
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.queue_action(text, uuid, text, text, text) RENAME TO queue_action_core;
REVOKE ALL ON FUNCTION public.queue_action_core(text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.queue_action(
  _action text,
  _appointment_id uuid DEFAULT NULL,
  _reason text DEFAULT NULL,
  _payment_method text DEFAULT NULL,
  _expect text DEFAULT NULL,
  _payment_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ref text := upper(regexp_replace(COALESCE(_payment_reference, ''), '\s+', '', 'g'));
BEGIN
  IF _action = 'mark_paid' THEN
    IF _payment_method IN ('upi', 'card') THEN
      IF v_ref = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'PAYMENT_REFERENCE_REQUIRED');
      END IF;
      IF (_payment_method = 'upi'  AND v_ref !~ '^[0-9]{12}$')
      OR (_payment_method = 'card' AND v_ref !~ '^[A-Z0-9]{4,12}$') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'PAYMENT_REFERENCE_INVALID');
      END IF;
      PERFORM set_config('app.payment_reference', v_ref, true);
    ELSE
      PERFORM set_config('app.payment_reference', '', true);
    END IF;
  END IF;

  RETURN public.queue_action_core(_action, _appointment_id, _reason, _payment_method, _expect);
EXCEPTION
  WHEN unique_violation THEN
    IF SQLERRM LIKE '%appointments_upi_reference_unique%' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'DUPLICATE_PAYMENT_REFERENCE');
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_action(text, uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_action(text, uuid, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Keep the patient record's age / gender / weight in step with their appointments.
--    Age and gender fill blanks only; weight follows the latest value entered.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_patient_vitals_from_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.patient_id IS NULL
     OR (NEW.patient_age IS NULL AND NEW.patient_gender IS NULL AND NEW.patient_weight IS NULL) THEN
    RETURN NULL;
  END IF;

  UPDATE public.patients
     SET age    = COALESCE(age, NEW.patient_age),
         gender = COALESCE(NULLIF(gender, ''), NEW.patient_gender),
         weight = COALESCE(NEW.patient_weight, weight)
   WHERE id = NEW.patient_id
     AND doctor_id = NEW.doctor_id
     AND (
          (age IS NULL AND NEW.patient_age IS NOT NULL)
       OR ((gender IS NULL OR gender = '') AND NEW.patient_gender IS NOT NULL)
       OR (NEW.patient_weight IS NOT NULL AND weight IS DISTINCT FROM NEW.patient_weight)
     );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_patient_vitals_from_appointment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_a6_sync_patient_vitals ON public.appointments;
CREATE TRIGGER trg_a6_sync_patient_vitals
AFTER INSERT OR UPDATE OF patient_age, patient_gender, patient_weight, patient_id ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.sync_patient_vitals_from_appointment();

-- ---------------------------------------------------------------------------
-- 5. Invoices remember how they were paid
--    (ensure_invoice_for_appointment as in 20261102120000, plus the two columns)
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
  led RECORD;
  yr text;
  prefix text;
  seq integer;
  v_amount numeric;
  v_rate numeric;
  v_gst numeric;
  v_comm_pct numeric := 0;
  v_comm_amt numeric := 0;
  v_net numeric;
  v_method text;
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
     AND substring(invoice_number FROM length(prefix) + 1) ~ '^[0-9]{1,9}$';

  v_amount := COALESCE(a.amount, 0);
  v_rate := CASE WHEN COALESCE(prof.gst_registered, false) THEN 18 ELSE 0 END;
  v_gst := round(v_amount * v_rate / 100, 2);

  SELECT commission_percent, commission_amount, doctor_share INTO led
    FROM public.doctor_ledger WHERE appointment_id = a.id ORDER BY created_at LIMIT 1;
  IF FOUND THEN
    v_comm_pct := led.commission_percent; v_comm_amt := led.commission_amount; v_net := led.doctor_share;
  ELSE
    SELECT commission_percent, commission_amount, doctor_share INTO led
      FROM public.payments WHERE appointment_id = a.id AND status = 'captured' ORDER BY created_at LIMIT 1;
    IF FOUND THEN
      v_comm_pct := COALESCE(led.commission_percent, 0);
      v_comm_amt := COALESCE(led.commission_amount, 0);
      v_net := led.doctor_share;
    END IF;
  END IF;
  v_net := COALESCE(v_net, round(v_amount - v_comm_amt, 2));

  v_method := CASE WHEN a.payment_gateway IS NOT NULL THEN 'online' ELSE a.payment_method END;

  INSERT INTO public.invoices (doctor_id, appointment_id, invoice_number, patient_name, service_name,
                               amount, gst_rate, gst_amount, total_amount, clinic_gstin, status,
                               commission_percent, commission_amount, net_amount,
                               payment_method, payment_reference)
  VALUES (a.doctor_id, a.id, prefix || lpad(seq::text, 4, '0'), a.patient_name, a.service_name,
          v_amount, v_rate, v_gst, round(v_amount + v_gst, 2), prof.gstin, 'generated',
          v_comm_pct, v_comm_amt, v_net,
          v_method, a.payment_reference)
  ON CONFLICT DO NOTHING;
END;
$$;

-- Existing invoices: take the mode from their appointment.
UPDATE public.invoices i
   SET payment_method    = CASE WHEN a.payment_gateway IS NOT NULL THEN 'online' ELSE a.payment_method END,
       payment_reference = a.payment_reference
  FROM public.appointments a
 WHERE a.id = i.appointment_id
   AND i.payment_method IS NULL;
