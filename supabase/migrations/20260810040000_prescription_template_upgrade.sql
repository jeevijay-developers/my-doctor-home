-- Prescription template upgrade: structured medicines, optional visit link,
-- advice/follow-up fields, and doctor letterhead details (registration
-- number, signature image, clinic email). No RLS changes are needed: these
-- are new columns on tables that already have doctor-scoped RLS policies
-- (profiles: auth.uid() = id; prescriptions: doctor_id / staff permission
-- policies) which apply to all columns automatically.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS signature_url text,
  ADD COLUMN IF NOT EXISTS clinic_email text;

-- `medicines` holds an array of structured line items, each shaped as:
--   { "name": "", "strength": "", "frequency": "", "duration": "",
--     "timing": "", "route": "", "instructions": "" }
-- Shape is enforced client-side (consistent with how the legacy
-- `medications` free-text column was always freeform), not via a DB
-- constraint. The legacy `medications` column is left untouched as a
-- fallback for prescriptions written before this change.
ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS visit_id uuid REFERENCES public.patient_visits(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS medicines jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS advice text,
  ADD COLUMN IF NOT EXISTS diet_advice text,
  ADD COLUMN IF NOT EXISTS lifestyle_advice text,
  ADD COLUMN IF NOT EXISTS follow_up_date date,
  ADD COLUMN IF NOT EXISTS follow_up_instructions text;

CREATE INDEX IF NOT EXISTS idx_prescriptions_visit_id ON public.prescriptions(visit_id);
