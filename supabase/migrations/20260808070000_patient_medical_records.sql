-- ============================================
-- PATIENT MEDICAL RECORDS MODULE
-- Adds structured, normalized medical-record tables linked to the existing
-- patients/appointments/prescriptions tables. Every table is doctor-scoped
-- (doctor_id -> profiles.id) and patient-scoped (patient_id -> patients.id),
-- following the exact RLS pattern already used across the app:
--   FOR ALL USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id)
-- so one doctor can never see/edit another doctor's patient records.
-- ============================================

CREATE TYPE public.condition_status AS ENUM ('active', 'under_treatment', 'resolved', 'unknown');
CREATE TYPE public.medication_status AS ENUM ('active', 'completed');
CREATE TYPE public.allergy_type AS ENUM ('drug', 'food', 'other');
CREATE TYPE public.allergy_severity AS ENUM ('mild', 'moderate', 'severe');
CREATE TYPE public.medical_document_type AS ENUM ('lab_report', 'xray', 'mri', 'ct_scan', 'previous_prescription', 'other');

-- ============================================
-- CONDITIONS (also powers the "Medical History" summary view)
-- ============================================
CREATE TABLE public.patient_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  condition_name text NOT NULL,
  diagnosis_date date,
  treatment_history text,
  status public.condition_status NOT NULL DEFAULT 'active',
  notes text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  updated_by uuid NOT NULL DEFAULT auth.uid()
);

ALTER TABLE public.patient_conditions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Doctors can manage own patient conditions" ON public.patient_conditions
  FOR ALL USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);
CREATE INDEX idx_patient_conditions_patient ON public.patient_conditions(patient_id);
CREATE TRIGGER update_patient_conditions_updated_at BEFORE UPDATE ON public.patient_conditions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- MEDICATIONS
-- ============================================
CREATE TABLE public.patient_medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  medicine_name text NOT NULL,
  dosage text,
  frequency text,
  start_date date,
  end_date date,
  purpose text,
  status public.medication_status NOT NULL DEFAULT 'active',
  prescribed_by text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  updated_by uuid NOT NULL DEFAULT auth.uid()
);

ALTER TABLE public.patient_medications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Doctors can manage own patient medications" ON public.patient_medications
  FOR ALL USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);
CREATE INDEX idx_patient_medications_patient ON public.patient_medications(patient_id);
CREATE TRIGGER update_patient_medications_updated_at BEFORE UPDATE ON public.patient_medications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- ALLERGIES
-- ============================================
CREATE TABLE public.patient_allergies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  allergy_type public.allergy_type NOT NULL DEFAULT 'other',
  allergy_name text NOT NULL,
  reaction text,
  severity public.allergy_severity NOT NULL DEFAULT 'mild',
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  updated_by uuid NOT NULL DEFAULT auth.uid()
);

ALTER TABLE public.patient_allergies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Doctors can manage own patient allergies" ON public.patient_allergies
  FOR ALL USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);
CREATE INDEX idx_patient_allergies_patient ON public.patient_allergies(patient_id);
CREATE TRIGGER update_patient_allergies_updated_at BEFORE UPDATE ON public.patient_allergies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- SURGERIES / HOSPITALIZATIONS
-- ============================================
CREATE TABLE public.patient_surgeries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  event_date date,
  hospital text,
  reason text,
  outcome text,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  updated_by uuid NOT NULL DEFAULT auth.uid()
);

ALTER TABLE public.patient_surgeries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Doctors can manage own patient surgeries" ON public.patient_surgeries
  FOR ALL USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);
CREATE INDEX idx_patient_surgeries_patient ON public.patient_surgeries(patient_id);
CREATE TRIGGER update_patient_surgeries_updated_at BEFORE UPDATE ON public.patient_surgeries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- FAMILY MEDICAL HISTORY
-- ============================================
CREATE TABLE public.patient_family_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  family_member text NOT NULL,
  relationship text,
  condition text NOT NULL,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  updated_by uuid NOT NULL DEFAULT auth.uid()
);

ALTER TABLE public.patient_family_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Doctors can manage own patient family history" ON public.patient_family_history
  FOR ALL USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);
CREATE INDEX idx_patient_family_history_patient ON public.patient_family_history(patient_id);
CREATE TRIGGER update_patient_family_history_updated_at BEFORE UPDATE ON public.patient_family_history
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- VISITS (reuses existing appointments where available; also supports
-- manually logged past visits that predate this module)
-- ============================================
CREATE TABLE public.patient_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  visit_date date NOT NULL DEFAULT CURRENT_DATE,
  consultation_type text,
  reason_for_visit text,
  symptoms text,
  diagnosis text,
  doctor_notes text,
  follow_up_date date,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  updated_by uuid NOT NULL DEFAULT auth.uid()
);

ALTER TABLE public.patient_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Doctors can manage own patient visits" ON public.patient_visits
  FOR ALL USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);
CREATE INDEX idx_patient_visits_patient ON public.patient_visits(patient_id);
CREATE INDEX idx_patient_visits_appointment ON public.patient_visits(appointment_id);
CREATE TRIGGER update_patient_visits_updated_at BEFORE UPDATE ON public.patient_visits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- VITALS (one row per visit)
-- ============================================
CREATE TABLE public.patient_vitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  visit_id uuid NOT NULL REFERENCES public.patient_visits(id) ON DELETE CASCADE,
  recorded_date date NOT NULL DEFAULT CURRENT_DATE,
  blood_pressure text,
  pulse numeric,
  temperature numeric,
  weight numeric,
  height numeric,
  spo2 numeric,
  respiratory_rate numeric,
  bmi numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid()
);

ALTER TABLE public.patient_vitals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Doctors can manage own patient vitals" ON public.patient_vitals
  FOR ALL USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);
CREATE INDEX idx_patient_vitals_patient ON public.patient_vitals(patient_id);
CREATE UNIQUE INDEX idx_patient_vitals_visit ON public.patient_vitals(visit_id);

-- ============================================
-- DOCUMENTS (metadata; files live in the private "patient-documents" bucket)
-- ============================================
CREATE TABLE public.patient_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  visit_id uuid REFERENCES public.patient_visits(id) ON DELETE SET NULL,
  document_name text NOT NULL,
  document_type public.medical_document_type NOT NULL DEFAULT 'other',
  file_path text NOT NULL,
  file_type text,
  document_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid()
);

ALTER TABLE public.patient_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Doctors can manage own patient documents" ON public.patient_documents
  FOR ALL USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);
CREATE INDEX idx_patient_documents_patient ON public.patient_documents(patient_id);

-- Private bucket: unlike doctor-uploads, there is NO public SELECT policy.
-- Files are only ever accessed via short-lived signed URLs requested by the
-- owning doctor, whose session must satisfy the storage RLS below.
INSERT INTO storage.buckets (id, name, public) VALUES ('patient-documents', 'patient-documents', false);

CREATE POLICY "Doctors can upload own patient documents" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'patient-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Doctors can read own patient documents" ON storage.objects FOR SELECT
  USING (bucket_id = 'patient-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Doctors can update own patient documents" ON storage.objects FOR UPDATE
  USING (bucket_id = 'patient-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Doctors can delete own patient documents" ON storage.objects FOR DELETE
  USING (bucket_id = 'patient-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
