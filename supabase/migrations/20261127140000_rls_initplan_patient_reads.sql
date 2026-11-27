-- Read-path speed for the patient list in multi-doctor clinics (and every other read of these four tables).
-- The permissive SELECT policies called auth.uid() / has_role() / sa_has_permission() / staff_*() once PER ROW
-- (about 0.2 ms each under RLS: a plain count of 5,000 patients took ~1.1 s, 15,000 appointments ~3.3 s, and the
-- patients_with_doctors view ~4.7 s). Wrapping each call in a scalar sub-select makes Postgres evaluate it once
-- per statement (an InitPlan). The functions are STABLE and depend only on the session, so the rule is
-- IDENTICAL; only the number of calls changes. Roles, commands and WITH CHECK clauses are untouched.
-- Check: npx supabase db query --linked -f supabase/tests/multi-doctor/22_rls_initplan_visibility.sql

ALTER POLICY "Admins can view all patients" ON public.patients
  USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)));
ALTER POLICY "Doctors can manage own patients" ON public.patients
  USING ((SELECT auth.uid()) = doctor_id);
ALTER POLICY "Staff can view patients with permission" ON public.patients
  USING ((SELECT public.staff_doctor_id((SELECT auth.uid()))) = doctor_id
         AND (SELECT public.staff_has_permission((SELECT auth.uid()), 'patients.view'::text)));
ALTER POLICY "Team can view patients" ON public.patients
  USING ((SELECT public.sa_has_permission((SELECT auth.uid()), 'phi.view'::text)));

ALTER POLICY "Admins can view all appointments" ON public.appointments
  USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)));
ALTER POLICY "Doctors can manage own appointments" ON public.appointments
  USING ((SELECT auth.uid()) = doctor_id);
ALTER POLICY "Staff can view appointments with permission" ON public.appointments
  USING ((SELECT public.staff_doctor_id((SELECT auth.uid()))) = doctor_id
         AND (SELECT public.staff_has_permission((SELECT auth.uid()), 'appointments.view'::text)));
ALTER POLICY "Team can view appointments" ON public.appointments
  USING ((SELECT public.sa_has_any_permission((SELECT auth.uid()), ARRAY['phi.view'::text, 'payments.view'::text])));

ALTER POLICY "Doctors can manage own patient visits" ON public.patient_visits
  USING ((SELECT auth.uid()) = doctor_id);
ALTER POLICY "Staff can manage patient_visits with permission" ON public.patient_visits
  USING ((SELECT public.staff_doctor_id((SELECT auth.uid()))) = doctor_id
         AND (SELECT public.staff_has_permission((SELECT auth.uid()), 'patients.medical_records'::text)));

ALTER POLICY "Doctors manage own prescriptions" ON public.prescriptions
  USING ((SELECT auth.uid()) = doctor_id);
ALTER POLICY "Staff can view prescriptions with permission" ON public.prescriptions
  USING ((SELECT public.staff_doctor_id((SELECT auth.uid()))) = doctor_id
         AND (SELECT public.staff_has_permission((SELECT auth.uid()), 'prescriptions.view'::text)));
