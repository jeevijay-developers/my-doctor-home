-- Appointment -> patient lifecycle.
--
-- A doctor/staff booking creates the patient row immediately (so walk-ins show up in
-- Patients without anyone marking anything complete). That row is PROVISIONAL until the
-- first visit completes. If the booking is then cancelled, marked no-show or deleted,
-- and nothing else ever attached to the patient, the provisional row is released again
-- so Patients is not littered with people who never came.
--
-- Rules
--   * patients.auto_created = true  -> the row was made by the booking trigger, not typed
--     in by a person. Only such rows are ever released automatically.
--   * A row is released only when ALL are true: auto_created, total_visits = 0, no notes,
--     no other pending/confirmed/completed appointment, and nothing in ANY table that
--     references patients (medical records, checkup reminders, invoices, ...).
--   * A visit counts only while its appointment is completed: leaving "completed"
--     (cancelled, no-show, reopened, deleted) takes the visit back off the patient.
--   * Re-opening a cancelled/no-show booking re-creates the patient if it was released.

-- ---------------------------------------------------------------------------
-- 1. Marker column
-- ---------------------------------------------------------------------------
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS auto_created boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

-- Take one counted visit back off a patient and recompute first/last visit dates.
CREATE OR REPLACE FUNCTION public.uncount_patient_visit(_pid uuid, _appt uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.patients p
     SET total_visits = GREATEST(p.total_visits - 1, 0),
         first_visit  = COALESCE(
           (SELECT min(a.date) FROM public.appointments a
             WHERE a.patient_id = p.id AND a.visit_counted AND a.id <> _appt),
           CASE WHEN p.total_visits <= 1 THEN NULL ELSE p.first_visit END),
         last_visit   = COALESCE(
           (SELECT max(a.date) FROM public.appointments a
             WHERE a.patient_id = p.id AND a.visit_counted AND a.id <> _appt),
           CASE WHEN p.total_visits <= 1 THEN NULL ELSE p.last_visit END)
   WHERE p.id = _pid;
END;
$$;

-- Delete a provisional patient if (and only if) nothing depends on it. Returns true when
-- the row was removed. Safe to call for any patient id: real patients are left alone.
CREATE OR REPLACE FUNCTION public.release_provisional_patient(_pid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  p   public.patients%ROWTYPE;
  fk  record;
  hit boolean;
BEGIN
  IF _pid IS NULL THEN RETURN false; END IF;

  SELECT * INTO p FROM public.patients WHERE id = _pid;
  IF NOT FOUND OR NOT p.auto_created OR p.total_visits <> 0
     OR COALESCE(btrim(p.notes), '') <> '' THEN
    RETURN false;
  END IF;

  -- Same lock key the booking trigger takes, so a booking racing with this cleanup either
  -- finishes first (we then see its appointment) or waits and creates a fresh patient.
  IF p.phone <> '' THEN
    PERFORM pg_advisory_xact_lock(hashtext('patient:' || p.doctor_id::text || p.phone));
  END IF;

  -- Still has a live or finished appointment? Then the patient is real.
  IF EXISTS (SELECT 1 FROM public.appointments a
              WHERE a.patient_id = _pid
                AND a.status::text IN ('pending', 'confirmed', 'completed')) THEN
    RETURN false;
  END IF;

  -- Anything else pointing at this patient (found from the catalog, so tables added
  -- later are covered too). Medical history is never deleted by an automatic cleanup.
  FOR fk IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f'
       AND c.confrelid = 'public.patients'::regclass
       AND c.conrelid <> 'public.appointments'::regclass
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)', fk.tbl, fk.col) INTO hit USING _pid;
    IF hit THEN RETURN false; END IF;
  END LOOP;

  DELETE FROM public.patients WHERE id = _pid;   -- appointments.patient_id -> NULL
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.uncount_patient_visit(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_provisional_patient(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. BEFORE trigger: create/link the patient, count and un-count visits
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_appointment_patient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  do_ensure boolean := false;
  do_count  boolean := false;
  v_pid     uuid;
  v_phone   text := btrim(COALESCE(NEW.patient_phone, ''));
  v_internal boolean := (auth.role() IS NULL OR auth.role() = 'service_role');
  v_clinic  boolean := (auth.uid() IS NOT NULL
                        AND (auth.uid() = NEW.doctor_id OR public.staff_doctor_id(auth.uid()) = NEW.doctor_id));
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- patient_id may only ever point at THIS doctor's patients, and the counted flag is
    -- ours alone. (Setting patient_id to NULL is allowed: that is what a release does.)
    IF NEW.patient_id IS NOT NULL AND NEW.patient_id IS DISTINCT FROM OLD.patient_id
       AND NOT EXISTS (SELECT 1 FROM public.patients WHERE id = NEW.patient_id AND doctor_id = NEW.doctor_id) THEN
      NEW.patient_id := OLD.patient_id;
    END IF;
    IF NOT v_internal THEN
      NEW.visit_counted := OLD.visit_counted;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_clinic THEN
      do_ensure := true;
    END IF;
    IF NEW.status::text = 'completed' THEN
      NEW.completed_at := COALESCE(NEW.completed_at, now());
    END IF;
  ELSE
    IF NEW.serving_started_at IS NOT NULL AND OLD.serving_started_at IS NULL THEN
      do_ensure := true;
    END IF;
    IF NEW.status::text = 'completed' AND OLD.status::text <> 'completed' THEN
      do_ensure := true;
      NEW.completed_at := now();
    END IF;
    -- Re-opening a finished appointment puts it back in the waiting line. If the patient
    -- was released when it was cancelled, staff re-opening it brings the patient back.
    IF NEW.status::text IN ('pending', 'confirmed') AND OLD.status::text IN ('completed', 'cancelled', 'no_show') THEN
      NEW.serving_started_at := NULL;
      NEW.skipped_at := NULL;
      NEW.completed_at := NULL;
      IF v_clinic THEN do_ensure := true; END IF;
    END IF;
  END IF;

  -- A visit counts only while the appointment is completed.
  IF NEW.status::text = 'completed' AND NOT NEW.visit_counted THEN
    do_ensure := true;
    do_count := true;
  ELSIF TG_OP = 'UPDATE' AND NEW.status::text <> 'completed' AND NEW.visit_counted THEN
    IF NEW.patient_id IS NOT NULL THEN
      PERFORM public.uncount_patient_visit(NEW.patient_id, NEW.id);
    END IF;
    NEW.visit_counted := false;
  END IF;

  IF do_ensure AND NEW.patient_id IS NULL THEN
    IF v_phone <> '' THEN
      PERFORM pg_advisory_xact_lock(hashtext('patient:' || NEW.doctor_id::text || v_phone));
      SELECT id INTO v_pid FROM public.patients
       WHERE doctor_id = NEW.doctor_id AND phone = v_phone
         AND lower(btrim(name)) = lower(btrim(NEW.patient_name))
       LIMIT 1;
    END IF;
    IF v_pid IS NULL THEN
      INSERT INTO public.patients (doctor_id, name, phone, email, age, gender, first_visit, last_visit, total_visits, auto_created)
      VALUES (NEW.doctor_id, btrim(NEW.patient_name), v_phone, NEW.patient_email, NEW.patient_age,
              NEW.patient_gender, NULL, NULL, 0, true)
      RETURNING id INTO v_pid;
    END IF;
    NEW.patient_id := v_pid;
  END IF;

  IF do_count AND NEW.patient_id IS NOT NULL THEN
    UPDATE public.patients
       SET total_visits = total_visits + 1,
           first_visit  = LEAST(COALESCE(first_visit, NEW.date), NEW.date),
           last_visit   = GREATEST(COALESCE(last_visit, NEW.date), NEW.date),
           email        = COALESCE(NULLIF(email, ''), NEW.patient_email, email)
     WHERE id = NEW.patient_id;
    NEW.visit_counted := true;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. AFTER triggers: release a provisional patient when the booking goes away
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_patient_after_appointment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.patient_id IS NOT NULL THEN
      IF OLD.visit_counted THEN
        PERFORM public.uncount_patient_visit(OLD.patient_id, OLD.id);
      END IF;
      PERFORM public.release_provisional_patient(OLD.patient_id);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.patient_id IS NOT NULL THEN
    PERFORM public.release_provisional_patient(NEW.patient_id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.release_patient_after_appointment_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_a5_release_patient_on_close ON public.appointments;
CREATE TRIGGER trg_a5_release_patient_on_close
AFTER UPDATE OF status ON public.appointments
FOR EACH ROW
WHEN (NEW.status::text IN ('cancelled', 'no_show') AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.release_patient_after_appointment_change();

DROP TRIGGER IF EXISTS trg_a5_release_patient_on_delete ON public.appointments;
CREATE TRIGGER trg_a5_release_patient_on_delete
AFTER DELETE ON public.appointments
FOR EACH ROW
WHEN (OLD.patient_id IS NOT NULL)
EXECUTE FUNCTION public.release_patient_after_appointment_change();

-- ---------------------------------------------------------------------------
-- 5. Clean up ghosts created by the first version of the sync (applied 2026-10-29):
--    zero visits, only cancelled/no-show appointments, no notes, no records.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT p.id FROM public.patients p
     WHERE p.created_at >= timestamptz '2026-10-29 00:00:00+00'
       AND p.total_visits = 0
       AND EXISTS (SELECT 1 FROM public.appointments a WHERE a.patient_id = p.id)
       AND NOT EXISTS (SELECT 1 FROM public.appointments a
                        WHERE a.patient_id = p.id AND a.status::text NOT IN ('cancelled', 'no_show'))
  LOOP
    UPDATE public.patients SET auto_created = true WHERE id = r.id;
    IF public.release_provisional_patient(r.id) THEN n := n + 1; END IF;
  END LOOP;
  RAISE NOTICE 'released % provisional patients', n;
END $$;

NOTIFY pgrst, 'reload schema';
