-- Pay-first patient booking flow: the appointment must not exist until payment
-- is verified, so the Razorpay order is now opened against a booking payload
-- (not a pre-created appointment). `payments.appointment_id` becomes nullable
-- and holds the pending booking details until verify-razorpay-payment turns
-- them into a real appointment row.
ALTER TABLE public.payments ALTER COLUMN appointment_id DROP NOT NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS pending_booking jsonb;
-- Set when a payment was captured but the slot was taken by someone else in
-- the (rare) window between order creation and verification — the patient
-- paid but no appointment could be created; flagged here for manual refund.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS needs_refund boolean NOT NULL DEFAULT false;
