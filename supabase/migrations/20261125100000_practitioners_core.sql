-- Multi-doctor clinics, P0 part 1: the practitioners table.
-- Spec: docs/superpowers/specs/2026-11-25-multi-doctor-clinic-design.md
--
-- A clinic is still a profiles row: doctor_id stays the tenant key everywhere and no
-- existing policy changes. This adds the doctors who see patients at a clinic. Every
-- clinic gets exactly one PRIMARY practitioner: the owner, linked to the owner's login.
-- Nothing user-visible changes in P0; clients can read practitioners but not write them.

CREATE TABLE IF NOT EXISTS public.practitioners (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id               uuid UNIQUE,
  display_name          text NOT NULL CHECK (btrim(display_name) <> ''),
  slug                  text NOT NULL CHECK (slug <> ''),
  specialization        text,
  qualifications        text,
  experience_years      integer,
  bio                   text,
  photo_url             text,
  registration_number   text,
  signature_url         text,
  hpr_id                text,
  consultation_fee      numeric CHECK (consultation_fee IS NULL OR consultation_fee >= 0),
  slot_duration_minutes integer CHECK (slot_duration_minutes IS NULL OR slot_duration_minutes BETWEEN 5 AND 240),
  is_active             boolean NOT NULL DEFAULT true,
  is_bookable           boolean NOT NULL DEFAULT true,
  online_booking        boolean NOT NULL DEFAULT true,
  directory_listed      boolean NOT NULL DEFAULT true,
  is_primary            boolean NOT NULL DEFAULT false,
  sort_order            integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  -- The primary is the default doctor for old code paths, so it must take bookings.
  CONSTRAINT practitioners_primary_active CHECK (NOT is_primary OR (is_active AND is_bookable)),
  -- Target of the composite (practitioner_id, doctor_id) foreign keys: a row can only
  -- point at a practitioner of its own clinic.
  CONSTRAINT practitioners_id_doctor_key UNIQUE (id, doctor_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_practitioners_doctor_slug ON public.practitioners (doctor_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS uq_practitioners_one_primary ON public.practitioners (doctor_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS idx_practitioners_doctor_order ON public.practitioners (doctor_id, sort_order);

DROP TRIGGER IF EXISTS update_practitioners_updated_at ON public.practitioners;
CREATE TRIGGER update_practitioners_updated_at
  BEFORE UPDATE ON public.practitioners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: read-only for the clinic (owner and its staff) and platform admins in P0.
-- Writes go through SECURITY DEFINER functions; P1 adds the Doctors page policies.
ALTER TABLE public.practitioners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinic members can view practitioners" ON public.practitioners;
CREATE POLICY "Clinic members can view practitioners" ON public.practitioners
  FOR SELECT TO authenticated
  USING (auth.uid() = doctor_id OR public.staff_doctor_id(auth.uid()) = doctor_id);

DROP POLICY IF EXISTS "Platform admins can view practitioners" ON public.practitioners;
CREATE POLICY "Platform admins can view practitioners" ON public.practitioners
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- A clinic always has exactly one primary. Deferred, so a later "make Dr B primary"
-- can unset the old primary and set the new one in one transaction.
CREATE OR REPLACE FUNCTION public.practitioners_require_primary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = OLD.doctor_id)
     AND NOT EXISTS (SELECT 1 FROM public.practitioners WHERE doctor_id = OLD.doctor_id AND is_primary) THEN
    RAISE EXCEPTION 'PRIMARY_PRACTITIONER_REQUIRED' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_practitioners_primary_required ON public.practitioners;
CREATE CONSTRAINT TRIGGER trg_practitioners_primary_required
  AFTER UPDATE OR DELETE ON public.practitioners
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.practitioners_require_primary();

-- Creates the clinic's primary practitioner from the owner's profile if it is missing.
-- Idempotent and race-safe (advisory lock + the one-primary unique index).
CREATE OR REPLACE FUNCTION public.ensure_primary_practitioner(_doctor_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id   uuid;
  p      public.profiles%ROWTYPE;
  v_name text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('practitioner_primary:' || _doctor_id::text));
  SELECT id INTO v_id FROM public.practitioners WHERE doctor_id = _doctor_id AND is_primary;
  IF FOUND THEN
    RETURN v_id;
  END IF;

  SELECT * INTO p FROM public.profiles WHERE id = _doctor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CLINIC_NOT_FOUND' USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_name := COALESCE(NULLIF(btrim(p.full_name), ''), NULLIF(btrim(p.clinic_name), ''), 'Doctor');
  INSERT INTO public.practitioners (
    doctor_id, user_id, display_name, slug, specialization, qualifications, experience_years,
    bio, photo_url, registration_number, signature_url, is_primary)
  VALUES (
    _doctor_id, _doctor_id, v_name, COALESCE(NULLIF(public.directory_slugify(v_name), ''), 'doctor'),
    p.specialization, p.qualifications, p.experience_years,
    p.bio, p.profile_photo_url, p.registration_number, p.signature_url, true)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_primary_practitioner(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.primary_practitioner_id(_doctor_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.practitioners WHERE doctor_id = _doctor_id AND is_primary
$$;
REVOKE ALL ON FUNCTION public.primary_practitioner_id(uuid) FROM PUBLIC, anon, authenticated;

-- New clinics: create the primary practitioner the moment the profile exists.
-- Named to sort BEFORE on_profile_created, which inserts the clinic's working hours
-- (those rows need a practitioner since the next migration).
CREATE OR REPLACE FUNCTION public.create_primary_practitioner_for_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.ensure_primary_practitioner(NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_a0_primary_practitioner ON public.profiles;
CREATE TRIGGER on_profile_a0_primary_practitioner
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_primary_practitioner_for_profile();

-- Until P1 moves doctor details onto the Doctors page, the owner's profile stays the
-- source of truth for the owner's own practitioner row. The slug is NOT re-derived
-- (renames need redirects; P2).
CREATE OR REPLACE FUNCTION public.sync_owner_practitioner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.practitioners
     SET display_name        = COALESCE(NULLIF(btrim(NEW.full_name), ''), NULLIF(btrim(NEW.clinic_name), ''), 'Doctor'),
         specialization      = NEW.specialization,
         qualifications      = NEW.qualifications,
         experience_years    = NEW.experience_years,
         bio                 = NEW.bio,
         photo_url           = NEW.profile_photo_url,
         registration_number = NEW.registration_number,
         signature_url       = NEW.signature_url
   WHERE doctor_id = NEW.id AND user_id = NEW.id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_owner_practitioner ON public.profiles;
CREATE TRIGGER trg_sync_owner_practitioner
  AFTER UPDATE OF full_name, clinic_name, specialization, qualifications, experience_years,
                  bio, profile_photo_url, registration_number, signature_url
  ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_owner_practitioner();

-- Backfill: one primary practitioner per existing clinic.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.profiles LOOP
    PERFORM public.ensure_primary_practitioner(r.id);
  END LOOP;
END $$;
