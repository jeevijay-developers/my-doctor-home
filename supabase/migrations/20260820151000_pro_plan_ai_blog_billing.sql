-- Move AI Blog Writer and Billing & Invoices into the Pro plan baseline.
-- Idempotent if 20260820150000 already seeded these keys as premium.
UPDATE public.features
SET default_min_tier = 'pro'
WHERE key IN ('ai_blog_writer', 'billing_invoices');

-- Invoice writes previously required doctor_has_premium_access. Gate on the
-- billing_invoices feature instead so Pro (and Premium) doctors can INSERT.
DROP POLICY IF EXISTS "Doctors manage own invoices" ON public.invoices;
CREATE POLICY "Doctors manage own invoices"
  ON public.invoices FOR ALL
  USING (doctor_id = auth.uid())
  WITH CHECK (
    (doctor_id = auth.uid())
    AND public.doctor_has_feature(doctor_id, 'billing_invoices')
  );

DROP POLICY IF EXISTS "Staff can manage invoices with permission" ON public.invoices;
CREATE POLICY "Staff can manage invoices with permission"
  ON public.invoices FOR ALL
  USING (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'billing.manage')
  )
  WITH CHECK (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'billing.manage')
    AND public.doctor_has_feature(doctor_id, 'billing_invoices')
  );
