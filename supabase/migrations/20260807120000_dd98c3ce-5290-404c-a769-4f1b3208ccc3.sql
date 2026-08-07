-- ============================================
-- Razorpay Marketplace Payments (design doc: doctylia-razorpay-design.md)
-- Patient -> Super Admin (platform Razorpay account) -> monthly Doctor payout (RazorpayX)
-- ============================================

CREATE TYPE public.payment_txn_status AS ENUM ('created', 'authorized', 'captured', 'failed', 'refunded');
CREATE TYPE public.payout_status AS ENUM ('pending', 'processing', 'processed', 'failed', 'cancelled');

-- Per-doctor commission override (NULL = use platform_settings.default_commission_percent)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS commission_percent numeric(5,2);

INSERT INTO public.platform_settings(key, value) VALUES
  ('default_commission_percent', '10'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- PAYMENTS — one row per Razorpay order/payment attempt against an appointment
-- ============================================
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_signature text,
  amount numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  status public.payment_txn_status NOT NULL DEFAULT 'created',
  method text,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_appointment ON public.payments(appointment_id);
CREATE INDEX IF NOT EXISTS idx_payments_doctor ON public.payments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments(razorpay_order_id);

GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Doctors can view own payments" ON public.payments;
CREATE POLICY "Doctors can view own payments" ON public.payments FOR SELECT USING (auth.uid() = doctor_id);
DROP POLICY IF EXISTS "Admins can view all payments" ON public.payments;
CREATE POLICY "Admins can view all payments" ON public.payments FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
-- No INSERT/UPDATE policy for authenticated/anon — writes happen only via edge
-- functions using the service role key (order creation + signature-verified capture).

CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- PAYOUTS — monthly Super Admin -> Doctor transfer (RazorpayX)
-- ============================================
CREATE TABLE IF NOT EXISTS public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month text NOT NULL, -- 'YYYY-MM'
  total_amount numeric(10,2) NOT NULL,
  status public.payout_status NOT NULL DEFAULT 'pending',
  razorpay_payout_id text,
  razorpay_fund_account_id text,
  initiated_by uuid REFERENCES auth.users(id),
  failure_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, month)
);
CREATE INDEX IF NOT EXISTS idx_payouts_doctor ON public.payouts(doctor_id);
CREATE INDEX IF NOT EXISTS idx_payouts_month ON public.payouts(month);

GRANT SELECT ON public.payouts TO authenticated;
GRANT ALL ON public.payouts TO service_role;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Doctors can view own payouts" ON public.payouts;
CREATE POLICY "Doctors can view own payouts" ON public.payouts FOR SELECT USING (auth.uid() = doctor_id);
DROP POLICY IF EXISTS "Admins can manage payouts" ON public.payouts;
CREATE POLICY "Admins can manage payouts" ON public.payouts FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_payouts_updated_at BEFORE UPDATE ON public.payouts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- DOCTOR_LEDGER — per-payment commission split, rolled up monthly into payouts
-- ============================================
CREATE TABLE IF NOT EXISTS public.doctor_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  gross_amount numeric(10,2) NOT NULL,
  commission_percent numeric(5,2) NOT NULL,
  commission_amount numeric(10,2) NOT NULL,
  doctor_share numeric(10,2) NOT NULL,
  month text NOT NULL, -- 'YYYY-MM', derived from payment capture date
  paid boolean NOT NULL DEFAULT false,
  payout_id uuid REFERENCES public.payouts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id)
);
CREATE INDEX IF NOT EXISTS idx_ledger_doctor_month ON public.doctor_ledger(doctor_id, month);
CREATE INDEX IF NOT EXISTS idx_ledger_payout ON public.doctor_ledger(payout_id);

GRANT SELECT ON public.doctor_ledger TO authenticated;
GRANT ALL ON public.doctor_ledger TO service_role;
ALTER TABLE public.doctor_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Doctors can view own ledger" ON public.doctor_ledger;
CREATE POLICY "Doctors can view own ledger" ON public.doctor_ledger FOR SELECT USING (auth.uid() = doctor_id);
DROP POLICY IF EXISTS "Admins can view all ledger" ON public.doctor_ledger;
CREATE POLICY "Admins can view all ledger" ON public.doctor_ledger FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
-- Writes only via service role (verify-payment inserts, calculate-monthly-earnings / create-doctor-payout update payout_id+paid).

-- ============================================
-- DOCTOR_BANK_ACCOUNTS — payout destination (bank or UPI), one per doctor
-- ============================================
CREATE TABLE IF NOT EXISTS public.doctor_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_holder_name text,
  account_number text,
  ifsc text,
  upi_id text,
  razorpay_contact_id text,
  razorpay_fund_account_id text,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT doctor_bank_accounts_has_payout_method CHECK (
    (account_number IS NOT NULL AND ifsc IS NOT NULL) OR upi_id IS NOT NULL
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.doctor_bank_accounts TO authenticated;
GRANT ALL ON public.doctor_bank_accounts TO service_role;
ALTER TABLE public.doctor_bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Doctors can manage own bank account" ON public.doctor_bank_accounts;
CREATE POLICY "Doctors can manage own bank account" ON public.doctor_bank_accounts FOR ALL USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);
DROP POLICY IF EXISTS "Admins can view all bank accounts" ON public.doctor_bank_accounts;
CREATE POLICY "Admins can view all bank accounts" ON public.doctor_bank_accounts FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_doctor_bank_accounts_updated_at BEFORE UPDATE ON public.doctor_bank_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
