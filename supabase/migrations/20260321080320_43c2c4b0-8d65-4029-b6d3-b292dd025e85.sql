
-- Create enquiries table for landing page contact form
CREATE TABLE public.enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  clinic_name text,
  city text,
  message text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;

-- Public can submit enquiries (anyone)
CREATE POLICY "Public can submit enquiries"
ON public.enquiries FOR INSERT
WITH CHECK (true);

-- No SELECT/UPDATE/DELETE for public — only service_role can read
