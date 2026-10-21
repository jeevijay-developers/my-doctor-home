-- ==========================================================================
-- Service Payments & Platform Commission Split via Razorpay Route
-- ==========================================================================
-- Extends payments, transfers, doctor_ledger, and invoices with full
-- commission split snapshots, service references, and refund reversal flags.
-- Ensures platform_settings has default_commission_percent seeded and RLS
-- policies for authenticated reads and Super Admin writes.
-- ==========================================================================

-- 1. payments table extensions
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS service_id         uuid REFERENCES public.services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commission_percent numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_amount  numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS doctor_share       numeric(10,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_payments_service ON public.payments(service_id);

-- Backfill existing payments rows where doctor_share was 0 (prior 0% commission era)
UPDATE public.payments
SET doctor_share = amount - COALESCE(commission_amount, 0)
WHERE doctor_share = 0 AND amount > 0;

-- 2. transfers table extensions
ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS gross_amount       numeric(10,2),
  ADD COLUMN IF NOT EXISTS commission_percent numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_amount  numeric(10,2) DEFAULT 0;

-- Backfill gross_amount on existing transfers
UPDATE public.transfers
SET gross_amount = amount + COALESCE(commission_amount, 0)
WHERE gross_amount IS NULL;

-- 3. doctor_ledger table extensions
ALTER TABLE public.doctor_ledger
  ADD COLUMN IF NOT EXISTS refunded    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_ledger_refunded ON public.doctor_ledger(doctor_id, refunded);

-- 4. invoices table extensions
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS commission_percent numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_amount  numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount         numeric(10,2),
  ADD COLUMN IF NOT EXISTS refunded_at        timestamptz;

-- Backfill net_amount on existing invoices
UPDATE public.invoices
SET net_amount = amount - COALESCE(commission_amount, 0)
WHERE net_amount IS NULL;

-- 5. Staff read access for billing transparency on payments, transfers, and doctor_ledger
DROP POLICY IF EXISTS "Staff can view payments with permission" ON public.payments;
CREATE POLICY "Staff can view payments with permission" ON public.payments
  FOR SELECT USING (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'billing.view')
  );

DROP POLICY IF EXISTS "Staff can view transfers with permission" ON public.transfers;
CREATE POLICY "Staff can view transfers with permission" ON public.transfers
  FOR SELECT USING (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'billing.view')
  );

DROP POLICY IF EXISTS "Staff can view ledger with permission" ON public.doctor_ledger;
CREATE POLICY "Staff can view ledger with permission" ON public.doctor_ledger
  FOR SELECT USING (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'billing.view')
  );

-- 6. platform_settings RLS & seed verification for default_commission_percent
INSERT INTO public.platform_settings (key, value, updated_at)
VALUES ('default_commission_percent', '10'::jsonb, now())
ON CONFLICT (key) DO NOTHING;

GRANT SELECT ON public.platform_settings TO anon, authenticated;
GRANT ALL ON public.platform_settings TO authenticated, service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read platform settings" ON public.platform_settings;
CREATE POLICY "Public can read platform settings"
  ON public.platform_settings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can manage platform settings" ON public.platform_settings;
CREATE POLICY "Admins can manage platform settings"
  ON public.platform_settings FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
