-- ==========================================================================
-- Razorpay Route — Direct-to-Doctor Payments via Linked Accounts
-- Migrates from: Patient → Platform pool → monthly payout to Doctor
-- To:            Patient → Route transfer → Doctor's Linked Account (T+2)
-- ==========================================================================

-- ===== 1. Add Route fields to profiles ======================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS razorpay_account_id      text UNIQUE,
  ADD COLUMN IF NOT EXISTS razorpay_stakeholder_id   text,
  ADD COLUMN IF NOT EXISTS razorpay_product_id       text,
  ADD COLUMN IF NOT EXISTS razorpay_account_status   text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS razorpay_payment_enabled  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS razorpay_onboarding_error text,
  ADD COLUMN IF NOT EXISTS razorpay_last_synced_at   timestamptz;

COMMENT ON COLUMN public.profiles.razorpay_account_id IS 'Razorpay Route Linked Account ID (acc_xxx)';
COMMENT ON COLUMN public.profiles.razorpay_account_status IS 'not_started | submitted | processing | needs_clarification | active | suspended | failed';
COMMENT ON COLUMN public.profiles.razorpay_payment_enabled IS 'true when linked account is fully active and can receive Route transfers';

-- ===== 2. Add transfer_status to payments ===================================
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS transfer_status text;

COMMENT ON COLUMN public.payments.transfer_status IS 'Mirrors transfers.status for quick reads: pending | processed | failed | reversed';

-- ===== 3. Route transfers table =============================================
CREATE TABLE IF NOT EXISTS public.transfers (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id           uuid        NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  appointment_id       uuid        REFERENCES public.appointments(id) ON DELETE SET NULL,
  doctor_id            uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  razorpay_transfer_id text        UNIQUE,
  razorpay_account_id  text        NOT NULL,
  amount               numeric(10,2) NOT NULL,
  currency             text        NOT NULL DEFAULT 'INR',
  status               text        NOT NULL DEFAULT 'pending',
  processed_at         timestamptz,
  reversed_at          timestamptz,
  error                text,
  is_mock              boolean     NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transfers_payment    ON public.transfers(payment_id);
CREATE INDEX IF NOT EXISTS idx_transfers_doctor     ON public.transfers(doctor_id);
CREATE INDEX IF NOT EXISTS idx_transfers_appointment ON public.transfers(appointment_id);
CREATE INDEX IF NOT EXISTS idx_transfers_rz_id      ON public.transfers(razorpay_transfer_id);
CREATE INDEX IF NOT EXISTS idx_transfers_rz_account ON public.transfers(razorpay_account_id);

GRANT SELECT ON public.transfers TO authenticated;
GRANT ALL    ON public.transfers TO service_role;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors can view own transfers" ON public.transfers;
CREATE POLICY "Doctors can view own transfers"
  ON public.transfers FOR SELECT
  USING (auth.uid() = doctor_id);

DROP POLICY IF EXISTS "Admins can view all transfers" ON public.transfers;
CREATE POLICY "Admins can view all transfers"
  ON public.transfers FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_transfers_updated_at
  BEFORE UPDATE ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== 4. Webhook events table (idempotency) ================================
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_event_id text        UNIQUE NOT NULL,
  event_type        text        NOT NULL,
  payload           jsonb,
  status            text        NOT NULL DEFAULT 'received',
  processed_at      timestamptz,
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON public.webhook_events(event_type);

GRANT SELECT ON public.webhook_events TO authenticated;
GRANT ALL    ON public.webhook_events TO service_role;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view webhook events" ON public.webhook_events;
CREATE POLICY "Admins can view webhook events"
  ON public.webhook_events FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- ===== 5. Settlements table (for future UTR tracking) =======================
CREATE TABLE IF NOT EXISTS public.settlements (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id            uuid        NOT NULL REFERENCES public.transfers(id) ON DELETE CASCADE,
  razorpay_settlement_id text        UNIQUE,
  amount                 numeric(10,2) NOT NULL,
  fee                    numeric(10,2),
  tax                    numeric(10,2),
  utr                    text,
  status                 text        NOT NULL DEFAULT 'pending',
  processed_at           timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlements_transfer ON public.settlements(transfer_id);
CREATE INDEX IF NOT EXISTS idx_settlements_utr      ON public.settlements(utr);

GRANT SELECT ON public.settlements TO authenticated;
GRANT ALL    ON public.settlements TO service_role;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view settlements" ON public.settlements;
CREATE POLICY "Admins can view settlements"
  ON public.settlements FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_settlements_updated_at
  BEFORE UPDATE ON public.settlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
