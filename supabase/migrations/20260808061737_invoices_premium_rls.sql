-- The only existing policy governing INSERT on public.invoices is "Doctors manage
-- own invoices" (cmd = ALL, qual/with_check = doctor_id = auth.uid()), not a
-- dedicated INSERT-only policy. To require premium access on writes without losing
-- the doctor's existing SELECT/UPDATE/DELETE ownership access, this recreates the
-- same ALL policy with the original USING clause unchanged and ANDs the premium
-- check onto WITH CHECK (which governs INSERT and UPDATE).
DROP POLICY IF EXISTS "Doctors manage own invoices" ON public.invoices;
CREATE POLICY "Doctors manage own invoices"
  ON public.invoices FOR ALL
  USING (doctor_id = auth.uid())
  WITH CHECK (
    (doctor_id = auth.uid())
    AND public.doctor_has_premium_access(doctor_id)
  );
