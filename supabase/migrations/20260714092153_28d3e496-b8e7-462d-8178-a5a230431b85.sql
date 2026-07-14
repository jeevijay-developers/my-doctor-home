
-- Appointments new columns
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS payment_gateway text,
  ADD COLUMN IF NOT EXISTS gateway_order_id text,
  ADD COLUMN IF NOT EXISTS gateway_payment_id text,
  ADD COLUMN IF NOT EXISTS gateway_signature text,
  ADD COLUMN IF NOT EXISTS meeting_link text,
  ADD COLUMN IF NOT EXISTS meeting_provider text,
  ADD COLUMN IF NOT EXISTS meeting_status text DEFAULT 'pending';

-- Profiles GST fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gstin text,
  ADD COLUMN IF NOT EXISTS gst_registered boolean NOT NULL DEFAULT false;

-- Website settings payment/video provider fields
ALTER TABLE public.website_settings
  ADD COLUMN IF NOT EXISTS payment_gateway_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS razorpay_key_id text,
  ADD COLUMN IF NOT EXISTS video_provider text;

-- Invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  patient_name text NOT NULL,
  service_name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  gst_rate numeric NOT NULL DEFAULT 0,
  gst_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  clinic_gstin text,
  status text NOT NULL DEFAULT 'generated',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, invoice_number),
  UNIQUE (appointment_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors manage own invoices"
  ON public.invoices FOR ALL
  TO authenticated
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

CREATE POLICY "Public can view invoices via appointment"
  ON public.invoices FOR SELECT
  TO anon
  USING (false);

CREATE INDEX IF NOT EXISTS idx_invoices_doctor ON public.invoices(doctor_id, created_at DESC);
