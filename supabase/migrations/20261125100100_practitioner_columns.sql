-- Multi-doctor clinics, P0 part 2: which doctor a row belongs to.
--
-- Only data that belongs to ONE doctor gets practitioner_id: appointments (slot, queue,
-- room), working_hours, prescriptions and visits (author / treating doctor), documents
-- (uploader, optional). Patients, medical history, invoices, services etc. stay
-- clinic-level. queue_events needs no column: it always carries appointment_id.

ALTER TABLE public.appointments      ADD COLUMN IF NOT EXISTS practitioner_id uuid;
ALTER TABLE public.working_hours     ADD COLUMN IF NOT EXISTS practitioner_id uuid;
ALTER TABLE public.prescriptions     ADD COLUMN IF NOT EXISTS practitioner_id uuid;
ALTER TABLE public.prescriptions     ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.patient_visits    ADD COLUMN IF NOT EXISTS practitioner_id uuid;
ALTER TABLE public.patient_documents ADD COLUMN IF NOT EXISTS practitioner_id uuid;

-- Prescriptions whose clinic account no longer exists. Pre-flight on 2026-11-25 found 10,
-- from 5 deleted accounts: no auth user, no patient, no visit, unreachable through RLS.
-- Removed (decision 2026-11-25) so every prescription can carry a practitioner.
DO $$
DECLARE n integer;
BEGIN
  DELETE FROM public.prescriptions x
   WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = x.doctor_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'multi-doctor: removed % orphan prescriptions', n;
END $$;

-- Backfill to each clinic's primary practitioner with the tables' own triggers OFF.
-- With them on, every historic appointment would be re-checked as a new booking
-- (SLOT_IN_PAST), updated_at would move on every row, and invoice/patient triggers would
-- run again. Pre-flight (supabase/tests/multi-doctor/00_preflight.sql) confirmed no
-- trigger on these tables was disabled on purpose.
ALTER TABLE public.appointments DISABLE TRIGGER USER;
UPDATE public.appointments t SET practitioner_id = p.id
  FROM public.practitioners p
 WHERE p.doctor_id = t.doctor_id AND p.is_primary AND t.practitioner_id IS NULL;
ALTER TABLE public.appointments ENABLE TRIGGER USER;

ALTER TABLE public.working_hours DISABLE TRIGGER USER;
UPDATE public.working_hours t SET practitioner_id = p.id
  FROM public.practitioners p
 WHERE p.doctor_id = t.doctor_id AND p.is_primary AND t.practitioner_id IS NULL;
ALTER TABLE public.working_hours ENABLE TRIGGER USER;

ALTER TABLE public.prescriptions DISABLE TRIGGER USER;
UPDATE public.prescriptions t SET practitioner_id = p.id
  FROM public.practitioners p
 WHERE p.doctor_id = t.doctor_id AND p.is_primary AND t.practitioner_id IS NULL;
ALTER TABLE public.prescriptions ENABLE TRIGGER USER;

ALTER TABLE public.patient_visits DISABLE TRIGGER USER;
UPDATE public.patient_visits t SET practitioner_id = p.id
  FROM public.practitioners p
 WHERE p.doctor_id = t.doctor_id AND p.is_primary AND t.practitioner_id IS NULL;
ALTER TABLE public.patient_visits ENABLE TRIGGER USER;

-- Fail loudly (whole migration rolls back) if any row has no clinic practitioner.
DO $$
DECLARE t text; n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['appointments', 'working_hours', 'prescriptions', 'patient_visits'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE practitioner_id IS NULL', t) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'practitioner backfill: % rows in % have no clinic practitioner (orphans?)', n, t;
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.appointments   ALTER COLUMN practitioner_id SET NOT NULL;
ALTER TABLE public.working_hours  ALTER COLUMN practitioner_id SET NOT NULL;
ALTER TABLE public.prescriptions  ALTER COLUMN practitioner_id SET NOT NULL;
ALTER TABLE public.patient_visits ALTER COLUMN practitioner_id SET NOT NULL;

-- Clients may keep omitting practitioner_id: trg_a00_fill_practitioner fills it, and
-- Postgres checks NOT NULL only after BEFORE triggers. A real column default is what makes
-- the Supabase type generator mark the column optional in Insert types (a NOT NULL column
-- without a default is "required", which would break every existing insert call).
CREATE OR REPLACE FUNCTION public.practitioner_filled_by_trigger()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$ SELECT NULL::uuid $$;

ALTER TABLE public.appointments   ALTER COLUMN practitioner_id SET DEFAULT public.practitioner_filled_by_trigger();
ALTER TABLE public.working_hours  ALTER COLUMN practitioner_id SET DEFAULT public.practitioner_filled_by_trigger();
ALTER TABLE public.prescriptions  ALTER COLUMN practitioner_id SET DEFAULT public.practitioner_filled_by_trigger();
ALTER TABLE public.patient_visits ALTER COLUMN practitioner_id SET DEFAULT public.practitioner_filled_by_trigger();

-- Same-clinic foreign keys. NO ACTION (the default), not RESTRICT: deleting a clinic
-- cascades to its rows AND its practitioners in one statement and is checked at the end,
-- while deleting a practitioner who still has rows is refused.
ALTER TABLE public.appointments ADD CONSTRAINT appointments_practitioner_fk
  FOREIGN KEY (practitioner_id, doctor_id) REFERENCES public.practitioners (id, doctor_id) NOT VALID;
ALTER TABLE public.appointments VALIDATE CONSTRAINT appointments_practitioner_fk;
ALTER TABLE public.working_hours ADD CONSTRAINT working_hours_practitioner_fk
  FOREIGN KEY (practitioner_id, doctor_id) REFERENCES public.practitioners (id, doctor_id) NOT VALID;
ALTER TABLE public.working_hours VALIDATE CONSTRAINT working_hours_practitioner_fk;
ALTER TABLE public.prescriptions ADD CONSTRAINT prescriptions_practitioner_fk
  FOREIGN KEY (practitioner_id, doctor_id) REFERENCES public.practitioners (id, doctor_id) NOT VALID;
ALTER TABLE public.prescriptions VALIDATE CONSTRAINT prescriptions_practitioner_fk;
ALTER TABLE public.patient_visits ADD CONSTRAINT patient_visits_practitioner_fk
  FOREIGN KEY (practitioner_id, doctor_id) REFERENCES public.practitioners (id, doctor_id) NOT VALID;
ALTER TABLE public.patient_visits VALIDATE CONSTRAINT patient_visits_practitioner_fk;
ALTER TABLE public.patient_documents ADD CONSTRAINT patient_documents_practitioner_fk
  FOREIGN KEY (practitioner_id, doctor_id) REFERENCES public.practitioners (id, doctor_id) NOT VALID;
ALTER TABLE public.patient_documents VALIDATE CONSTRAINT patient_documents_practitioner_fk;

CREATE INDEX IF NOT EXISTS idx_appointments_practitioner_date ON public.appointments (practitioner_id, date);
CREATE INDEX IF NOT EXISTS idx_prescriptions_practitioner ON public.prescriptions (practitioner_id);
CREATE INDEX IF NOT EXISTS idx_patient_visits_practitioner ON public.patient_visits (practitioner_id);
CREATE INDEX IF NOT EXISTS idx_patient_documents_practitioner ON public.patient_documents (practitioner_id)
  WHERE practitioner_id IS NOT NULL;
-- Per-doctor weekly hours. The old UNIQUE (doctor_id, day_of_week) stays until P1 moves
-- MyWebsite to per-doctor hours (expand now, contract in P1).
CREATE UNIQUE INDEX IF NOT EXISTS uq_working_hours_practitioner_day ON public.working_hours (practitioner_id, day_of_week);

-- Fills a missing practitioner_id and validates a given one. TG_ARGV[0] is the mode
-- (booking | sole | author | visit | optional); see the plan / spec §3.3.
-- Table-specific columns are read inside nested IFs: PL/pgSQL resolves NEW.<column> when
-- the statement runs, and the columns differ per table.
CREATE OR REPLACE FUNCTION public.fill_practitioner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mode   text := TG_ARGV[0];
  v_uid    uuid := auth.uid();
  v_caller uuid;
  v_parent uuid;
  v_pid    uuid;
  v_ids    uuid[];
  p        public.practitioners%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'prescriptions' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_by := COALESCE(v_uid, NEW.created_by);
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.practitioner_id IS NULL THEN
    IF v_uid IS NOT NULL THEN
      SELECT id INTO v_caller FROM public.practitioners
       WHERE doctor_id = NEW.doctor_id AND user_id = v_uid AND is_active;
    END IF;

    IF TG_TABLE_NAME = 'patient_visits' THEN
      IF NEW.appointment_id IS NOT NULL THEN
        SELECT practitioner_id INTO v_parent FROM public.appointments
         WHERE id = NEW.appointment_id AND doctor_id = NEW.doctor_id;
      END IF;
    ELSIF TG_TABLE_NAME IN ('prescriptions', 'patient_documents') THEN
      IF NEW.visit_id IS NOT NULL THEN
        SELECT practitioner_id INTO v_parent FROM public.patient_visits
         WHERE id = NEW.visit_id AND doctor_id = NEW.doctor_id;
      END IF;
    END IF;

    v_pid := CASE v_mode
               WHEN 'author'   THEN COALESCE(v_caller, v_parent)
               WHEN 'visit'    THEN COALESCE(v_parent, v_caller)
               WHEN 'optional' THEN COALESCE(v_parent, v_caller)
             END;

    IF v_pid IS NULL AND v_mode <> 'optional' THEN
      SELECT array_agg(id) INTO v_ids FROM public.practitioners
       WHERE doctor_id = NEW.doctor_id AND is_active AND (v_mode <> 'booking' OR is_bookable);
      IF v_ids IS NULL AND NOT EXISTS (SELECT 1 FROM public.practitioners WHERE doctor_id = NEW.doctor_id) THEN
        -- A clinic created before its practitioner (any trigger order): make it now.
        v_pid := public.ensure_primary_practitioner(NEW.doctor_id);
      ELSIF v_ids IS NULL THEN
        RAISE EXCEPTION 'PRACTITIONER_NOT_BOOKABLE' USING ERRCODE = 'check_violation';
      ELSIF array_length(v_ids, 1) = 1 THEN
        v_pid := v_ids[1];
      ELSE
        -- Never guess between doctors: a paid booking must not land in the wrong queue.
        RAISE EXCEPTION 'PRACTITIONER_REQUIRED' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    NEW.practitioner_id := v_pid;
  END IF;

  IF NEW.practitioner_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.practitioner_id IS DISTINCT FROM OLD.practitioner_id) THEN
    SELECT * INTO p FROM public.practitioners WHERE id = NEW.practitioner_id AND doctor_id = NEW.doctor_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRACTITIONER_MISMATCH' USING ERRCODE = 'check_violation';
    END IF;
    IF v_mode = 'booking'
       AND (NOT (p.is_active AND p.is_bookable)
            OR (COALESCE(auth.role(), '') = 'anon' AND NOT p.online_booking)) THEN
      RAISE EXCEPTION 'PRACTITIONER_NOT_BOOKABLE' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- trg_a00_* sorts before trg_a0_enforce_slot_capacity*, so the slot lock already sees
-- the practitioner.
DROP TRIGGER IF EXISTS trg_a00_fill_practitioner ON public.appointments;
CREATE TRIGGER trg_a00_fill_practitioner
  BEFORE INSERT OR UPDATE OF practitioner_id ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.fill_practitioner('booking');

DROP TRIGGER IF EXISTS trg_a00_fill_practitioner ON public.working_hours;
CREATE TRIGGER trg_a00_fill_practitioner
  BEFORE INSERT OR UPDATE OF practitioner_id ON public.working_hours
  FOR EACH ROW EXECUTE FUNCTION public.fill_practitioner('sole');

DROP TRIGGER IF EXISTS trg_a00_fill_practitioner ON public.prescriptions;
CREATE TRIGGER trg_a00_fill_practitioner
  BEFORE INSERT OR UPDATE OF practitioner_id ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.fill_practitioner('author');

DROP TRIGGER IF EXISTS trg_a00_fill_practitioner ON public.patient_visits;
CREATE TRIGGER trg_a00_fill_practitioner
  BEFORE INSERT OR UPDATE OF practitioner_id ON public.patient_visits
  FOR EACH ROW EXECUTE FUNCTION public.fill_practitioner('visit');

DROP TRIGGER IF EXISTS trg_a00_fill_practitioner ON public.patient_documents;
CREATE TRIGGER trg_a00_fill_practitioner
  BEFORE INSERT OR UPDATE OF practitioner_id ON public.patient_documents
  FOR EACH ROW EXECUTE FUNCTION public.fill_practitioner('optional');
