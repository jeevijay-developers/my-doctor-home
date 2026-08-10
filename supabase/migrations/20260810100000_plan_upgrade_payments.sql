-- Self-service doctor plan upgrade payments (Razorpay one-time payment).
-- Separate from public.payments, which represents a PATIENT paying a
-- DOCTOR for a booking (appointment_id/pending_booking shape) — this table
-- represents a DOCTOR paying the platform for a tier upgrade. Reuses
-- payment_txn_status (created/authorized/captured/failed/refunded) for
-- consistency with the booking payments table's own status values.
CREATE TABLE public.plan_upgrade_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_tier text NOT NULL,
  target_tier text NOT NULL CHECK (target_tier IN ('pro', 'premium')),
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  status public.payment_txn_status NOT NULL DEFAULT 'created',
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_signature text,
  is_mock boolean NOT NULL DEFAULT false,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_plan_upgrade_payments_doctor ON public.plan_upgrade_payments(doctor_id);

ALTER TABLE public.plan_upgrade_payments ENABLE ROW LEVEL SECURITY;

-- Doctors can view their own payment history/receipts. They can never
-- INSERT/UPDATE directly — only the service-role edge functions
-- (create-plan-upgrade-order, verify-plan-upgrade-payment) write here, so a
-- doctor can't forge a "captured" row and grant themselves a tier for free.
CREATE POLICY "Doctors view own plan payments" ON public.plan_upgrade_payments
  FOR SELECT USING (auth.uid() = doctor_id);

CREATE POLICY "Admins view all plan payments" ON public.plan_upgrade_payments
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
