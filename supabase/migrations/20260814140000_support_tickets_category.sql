-- Category is grounded in the actual admin panel sections (not invented
-- generic buckets) so a doctor's pick doubles as "which part of the app"
-- for faster superadmin triage, matching the original doc's suggestion.
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS category text
  CHECK (category IS NULL OR category IN (
    'dashboard','my-website','appointments','patients','prescriptions',
    'reviews','blog','billing','staff','settings','account','other'
  ));
