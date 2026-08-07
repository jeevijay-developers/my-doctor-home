-- Mock Payment Mode support (mock-payment-mode-testing-prompt.md).
-- Lets every payment-touching table record whether a row came from the mock
-- gateway (PAYMENT_MODE=mock, no real Razorpay keys needed) or the real one,
-- so mock test data is always distinguishable from real transactions in the
-- Doctor / Super Admin dashboards.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS is_mock boolean NOT NULL DEFAULT false;
ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS is_mock boolean NOT NULL DEFAULT false;
ALTER TABLE public.doctor_bank_accounts ADD COLUMN IF NOT EXISTS is_mock boolean NOT NULL DEFAULT false;
