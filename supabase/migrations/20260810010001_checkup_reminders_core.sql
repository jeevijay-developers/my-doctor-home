-- ============================================
-- REGULAR CHECKUP REMINDER & NOTIFICATION
-- ============================================
-- Two tables: patient_checkup_reminders (the doctor's configured recurring
-- reminder for one patient) and notification_logs (an audit trail of every
-- notification attempt — real or simulated — across all channels). Mock vs
-- live delivery is decided entirely inside the edge functions (see
-- supabase/functions/_shared/notificationProviders.ts); this schema is
-- identical either way, so switching to live later needs no table changes.

CREATE TYPE public.checkup_frequency AS ENUM (
  'weekly', 'every_15_days', 'monthly', 'every_3_months', 'every_6_months', 'yearly', 'custom'
);
CREATE TYPE public.reminder_status AS ENUM ('active', 'paused', 'completed', 'cancelled');
CREATE TYPE public.notification_channel AS ENUM ('whatsapp', 'sms', 'in_app');
CREATE TYPE public.notification_status AS ENUM ('pending', 'processing', 'sent', 'failed', 'simulated');

-- ============================================
-- PATIENT_CHECKUP_REMINDERS
-- ============================================
CREATE TABLE public.patient_checkup_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- This app has no single "medical record" row (a patient's record is the
  -- union of 8 separate tables — conditions, medications, etc.), so there is
  -- nothing meaningful to reference here yet. Kept nullable for forward
  -- compatibility if a unifying record entity is introduced later.
  medical_record_id uuid,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  frequency public.checkup_frequency NOT NULL DEFAULT 'every_3_months',
  custom_interval_days integer,
  next_checkup_date date NOT NULL,
  reminder_before_days integer NOT NULL DEFAULT 7,
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  sms_enabled boolean NOT NULL DEFAULT false,
  in_app_enabled boolean NOT NULL DEFAULT true,
  status public.reminder_status NOT NULL DEFAULT 'active',
  last_reminder_sent_at timestamptz,
  next_reminder_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  CONSTRAINT checkup_reminders_custom_interval_required CHECK (
    frequency <> 'custom' OR custom_interval_days IS NOT NULL
  ),
  CONSTRAINT checkup_reminders_at_least_one_channel CHECK (
    whatsapp_enabled OR sms_enabled OR in_app_enabled
  )
);

CREATE INDEX idx_checkup_reminders_patient ON public.patient_checkup_reminders(patient_id);
CREATE INDEX idx_checkup_reminders_doctor ON public.patient_checkup_reminders(doctor_id);
-- The worker's core query: "which active reminders are due right now".
CREATE INDEX idx_checkup_reminders_due ON public.patient_checkup_reminders(next_reminder_at) WHERE status = 'active';

CREATE TRIGGER update_checkup_reminders_updated_at BEFORE UPDATE ON public.patient_checkup_reminders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.patient_checkup_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors manage own checkup reminders" ON public.patient_checkup_reminders
  FOR ALL USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);

-- Staff access rides on the same "View Patient Medical Records" permission
-- already used for every other medical-record table — this feature lives
-- inside the same Medical Record page, under the same permission umbrella.
CREATE POLICY "Staff can manage checkup reminders with permission" ON public.patient_checkup_reminders
  FOR ALL USING (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'patients.medical_records')
  ) WITH CHECK (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'patients.medical_records')
  );

-- The worker (service role) needs to read/update every doctor's due
-- reminders in one sweep; service_role already bypasses RLS entirely, so no
-- additional policy is needed for it specifically.

-- ============================================
-- NOTIFICATION_LOGS — audit trail only, never publicly readable
-- ============================================
CREATE TABLE public.notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reminder_id uuid REFERENCES public.patient_checkup_reminders(id) ON DELETE SET NULL,
  channel public.notification_channel NOT NULL,
  notification_type text NOT NULL DEFAULT 'checkup_reminder',
  recipient text,
  message text NOT NULL,
  status public.notification_status NOT NULL DEFAULT 'pending',
  provider text,
  provider_message_id text,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  error_message text,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_logs_doctor ON public.notification_logs(doctor_id, created_at DESC);
CREATE INDEX idx_notification_logs_patient ON public.notification_logs(patient_id);
CREATE INDEX idx_notification_logs_reminder ON public.notification_logs(reminder_id);

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors view own notification logs" ON public.notification_logs
  FOR SELECT USING (auth.uid() = doctor_id);
CREATE POLICY "Staff view notification logs with permission" ON public.notification_logs
  FOR SELECT USING (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'patients.medical_records')
  );
CREATE POLICY "Admins view all notification logs" ON public.notification_logs
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
-- No INSERT/UPDATE/DELETE policy for authenticated/anon at all — every write
-- comes from an edge function using the service role key. Patients (who
-- have no Supabase Auth session in this app at all) can never read this
-- table directly, satisfying "notification logs must not be publicly
-- accessible" even before considering RLS.

-- ============================================
-- PATIENT-FACING LOOKUP — mirrors the existing get_appointment_by_token
-- pattern (this app has no patient login; the token+phone "Manage
-- Appointment" page is the only place a patient's identity is ever
-- established, so this RPC is scoped by doctor_id + the patient's own
-- phone number, exactly like that page's other lookups). Deliberately
-- returns only what a patient should see — no reminder id, no channel
-- config, no internal scheduling fields.
-- ============================================
CREATE OR REPLACE FUNCTION public.get_upcoming_checkup(_doctor_id uuid, _phone text)
RETURNS TABLE(
  doctor_name text,
  next_checkup_date date,
  frequency public.checkup_frequency,
  reminder_enabled boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.full_name, r.next_checkup_date, r.frequency, true
  FROM public.patient_checkup_reminders r
  JOIN public.patients pt ON pt.id = r.patient_id
  JOIN public.profiles p ON p.id = r.doctor_id
  WHERE r.doctor_id = _doctor_id
    AND pt.phone = _phone
    AND r.status = 'active'
  ORDER BY r.next_checkup_date ASC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_upcoming_checkup(uuid, text) TO anon, authenticated;

-- Needed so the Super Admin Notification Testing dashboard's embedded
-- `notification_logs -> patients(name)` join can resolve a patient name for
-- admins (no such "admin can view all patients" policy existed before this
-- feature — every other admin-visible table, e.g. payments/payouts/
-- invoices, already grants this, patients was simply never needed from an
-- admin surface until now).
CREATE POLICY "Admins can view all patients" ON public.patients
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
