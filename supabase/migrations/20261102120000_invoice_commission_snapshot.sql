-- Catch-up: production never received the column extensions of 20260911000000
-- (service_payments_and_platform_commission). All statements are idempotent and are
-- no-ops on databases that already have them.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS service_id         uuid REFERENCES public.services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commission_percent numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_amount  numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS doctor_share       numeric(10,2) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_payments_service ON public.payments(service_id);
ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS gross_amount       numeric(10,2),
  ADD COLUMN IF NOT EXISTS commission_percent numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_amount  numeric(10,2) DEFAULT 0;
ALTER TABLE public.doctor_ledger
  ADD COLUMN IF NOT EXISTS refunded    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_ledger_refunded ON public.doctor_ledger(doctor_id, refunded);
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS commission_percent numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_amount  numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount         numeric(10,2),
  ADD COLUMN IF NOT EXISTS refunded_at        timestamptz;

-- ensure_invoice_for_appointment() must snapshot the platform charge.
--
-- verify-razorpay-payment used to insert the invoice at payment time with the commission
-- split (commission_percent / commission_amount / net_amount). That insert was removed
-- (an invoice may exist only once the visit is completed AND paid), so the invoice is now
-- created by the appointments trigger -- which left the three commission columns at 0 / NULL
-- for online payments. Read the split from doctor_ledger (written at payment time) and fall
-- back to the payment row; pay-at-clinic invoices keep commission 0 and net = amount.

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

  -- Platform-charge snapshot: ledger first (exact split recorded at payment time), then the payment row.
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

  INSERT INTO public.invoices (doctor_id, appointment_id, invoice_number, patient_name, service_name,
                               amount, gst_rate, gst_amount, total_amount, clinic_gstin, status,
                               commission_percent, commission_amount, net_amount)
  VALUES (a.doctor_id, a.id, prefix || lpad(seq::text, 4, '0'), a.patient_name, a.service_name,
          v_amount, v_rate, v_gst, round(v_amount + v_gst, 2), prof.gstin, 'generated',
          v_comm_pct, v_comm_amt, v_net)
  ON CONFLICT DO NOTHING;
END;
$$;

-- Repair invoices the trigger already created without a snapshot.
UPDATE public.invoices i
   SET commission_percent = l.commission_percent,
       commission_amount  = l.commission_amount,
       net_amount         = l.doctor_share
  FROM public.doctor_ledger l
 WHERE l.appointment_id = i.appointment_id
   AND i.commission_amount = 0 AND i.net_amount IS NULL;

UPDATE public.invoices SET net_amount = round(amount - commission_amount, 2) WHERE net_amount IS NULL;
