-- Multi-doctor P1 part 3b: a doctor login writes prescriptions only under their own name.
-- Closes a gap in 20261126100200: a doctor-role login could INSERT a prescription naming another
-- doctor as author (that doctor's signature on the slip), or UPDATE practitioner_id to someone else.
-- Both policies are RESTRICTIVE and true for anyone who is not a doctor-role login of the clinic,
-- so owners and reception keep today's access (they may still choose any doctor as the author).
-- Check: npx supabase db query --linked -f supabase/tests/multi-doctor/07b_prescription_author.sql

-- True iff the caller is an active doctor-role login of this clinic. Never NULL.
CREATE OR REPLACE FUNCTION public.is_doctor_login(_doctor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    EXISTS (SELECT 1 FROM public.staff_members
             WHERE id = auth.uid() AND doctor_id = _doctor_id AND role = 'doctor' AND status = 'active'),
    false)
$$;
REVOKE ALL ON FUNCTION public.is_doctor_login(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_doctor_login(uuid) TO authenticated;

-- RLS WITH CHECK runs after the BEFORE triggers, so a missing author has already been filled
-- by trg_a00_fill_practitioner. my_practitioner_id() is NULL if the login has no active doctor
-- row: the comparison is then NULL, which RLS refuses (fail closed).
DROP POLICY IF EXISTS "Doctor logins write as themselves" ON public.prescriptions;
CREATE POLICY "Doctor logins write as themselves" ON public.prescriptions
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_doctor_login(doctor_id)
              OR practitioner_id = public.my_practitioner_id(doctor_id));

DROP POLICY IF EXISTS "Doctor logins keep themselves as author" ON public.prescriptions;
CREATE POLICY "Doctor logins keep themselves as author" ON public.prescriptions
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (NOT public.is_doctor_login(doctor_id)
              OR practitioner_id = public.my_practitioner_id(doctor_id));

NOTIFY pgrst, 'reload schema';
