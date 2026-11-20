-- More document types a clinic actually receives, and server-side limits on the private bucket
-- (the browser checks the same limits first, this is the backstop).
ALTER TYPE public.medical_document_type ADD VALUE IF NOT EXISTS 'discharge_summary';
ALTER TYPE public.medical_document_type ADD VALUE IF NOT EXISTS 'ecg';
ALTER TYPE public.medical_document_type ADD VALUE IF NOT EXISTS 'ultrasound';

UPDATE storage.buckets
   SET file_size_limit = 10485760,
       allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
 WHERE id = 'patient-documents';
