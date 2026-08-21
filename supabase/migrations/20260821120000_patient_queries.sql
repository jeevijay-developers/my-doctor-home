-- ============================================
-- PATIENT QUERIES — visitor "get in touch" form on the doctor's public site
-- ============================================
-- New, separate from support_tickets (doctor -> superadmin) and from
-- ClinicDetails.tsx (which only displays clinic info, no form). Any site
-- visitor can submit a general query; the doctor and permitted staff triage
-- it in its own "Inquiries" admin module — deliberately NOT wired into the
-- notifications bell, per explicit product direction.

CREATE TABLE public.patient_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'responded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_queries_contact_method_required CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

CREATE INDEX idx_patient_queries_doctor ON public.patient_queries(doctor_id, created_at DESC);

ALTER TABLE public.patient_queries ENABLE ROW LEVEL SECURITY;

-- Anonymous site visitors submit the form — same "public can create" shape
-- already used for the booking flow (see "Public can create appointments").
CREATE POLICY "Public can create patient queries" ON public.patient_queries
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Doctors manage own patient queries" ON public.patient_queries
  FOR ALL USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);

-- Staff visibility requires the new inquiries.view permission; marking a
-- query read/responded requires the separate inquiries.manage permission —
-- mirrors the view/manage split already used for reviews and billing.
CREATE POLICY "Staff can view patient queries with permission" ON public.patient_queries
  FOR SELECT USING (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'inquiries.view')
  );

CREATE POLICY "Staff can update patient queries with permission" ON public.patient_queries
  FOR UPDATE USING (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'inquiries.manage')
  ) WITH CHECK (
    public.staff_doctor_id(auth.uid()) = doctor_id
  );

-- ============================================
-- Basic spam protection. Nothing pre-existing to match — the booking flow
-- has no rate limit or honeypot either — so this is a new, minimal guard:
-- a short per-contact cooldown against submit-mashing or a naive bot, paired
-- client-side with a honeypot field (see ContactQueryForm.tsx) that silently
-- no-ops the submit instead of hitting this table at all.
-- ============================================
CREATE OR REPLACE FUNCTION public.enforce_patient_query_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.patient_queries
    WHERE doctor_id = NEW.doctor_id
      AND created_at > now() - interval '2 minutes'
      AND (
        (NEW.phone IS NOT NULL AND phone = NEW.phone)
        OR (NEW.email IS NOT NULL AND email = NEW.email)
      )
  ) THEN
    RAISE EXCEPTION 'PATIENT_QUERY_RATE_LIMITED: Please wait a moment before sending another message.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_patient_query_rate_limit
  BEFORE INSERT ON public.patient_queries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_patient_query_rate_limit();
