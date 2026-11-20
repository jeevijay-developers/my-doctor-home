-- "Patient since": the day the patient first came to the clinic, which for a patient moved in
-- from an old system is long before patients.created_at (the day they were added to Doctylia).
-- created_at stays the true "added here" time; this is the clinic's own history date.
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS patient_since date;
