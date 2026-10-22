-- Security and performance hardening migration:
-- 1. Add missing indexes on hot foreign keys and query filter/sort columns.
-- 2. Enforce server-side file_size_limit and allowed_mime_types on storage.buckets.

CREATE INDEX IF NOT EXISTS idx_patients_doctor_last_visit
  ON public.patients(doctor_id, last_visit DESC);

CREATE INDEX IF NOT EXISTS idx_patients_doctor_phone
  ON public.patients(doctor_id, phone);

CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor_date
  ON public.prescriptions(doctor_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_appointments_doctor_token
  ON public.appointments(doctor_id, token_number);

CREATE INDEX IF NOT EXISTS idx_services_doctor
  ON public.services(doctor_id);

CREATE INDEX IF NOT EXISTS idx_packages_doctor
  ON public.packages(doctor_id);

CREATE INDEX IF NOT EXISTS idx_reviews_doctor
  ON public.reviews(doctor_id);

CREATE INDEX IF NOT EXISTS idx_gallery_photos_doctor
  ON public.gallery_photos(doctor_id);

CREATE INDEX IF NOT EXISTS idx_blog_posts_doctor
  ON public.blog_posts(doctor_id);

CREATE INDEX IF NOT EXISTS idx_working_hours_doctor
  ON public.working_hours(doctor_id);

CREATE INDEX IF NOT EXISTS idx_support_tickets_doctor
  ON public.support_tickets(doctor_id);

-- Enforce server-side upload limits and MIME whitelists on storage buckets
UPDATE storage.buckets
SET
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id = 'doctor-uploads';

UPDATE storage.buckets
SET
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
WHERE id = 'patient-documents';
