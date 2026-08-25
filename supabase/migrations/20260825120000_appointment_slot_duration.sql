-- Lets a doctor choose the appointment slot interval (previously a hardcoded
-- 30 minutes) from Working Hours. Slot generation itself stays client-side
-- (see src/lib/timeSlots.ts) — this column is just the doctor's saved choice.
ALTER TABLE public.website_settings
  ADD COLUMN IF NOT EXISTS slot_duration_minutes integer NOT NULL DEFAULT 30;

ALTER TABLE public.website_settings
  DROP CONSTRAINT IF EXISTS website_settings_slot_duration_minutes_valid;
ALTER TABLE public.website_settings
  ADD CONSTRAINT website_settings_slot_duration_minutes_valid
  CHECK (slot_duration_minutes IN (5, 10, 15, 20, 30, 45, 60));
