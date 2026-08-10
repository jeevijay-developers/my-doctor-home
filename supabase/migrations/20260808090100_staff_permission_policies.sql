-- ============================================
-- STAFF MANAGEMENT — PERMISSION-SCOPED DATA ACCESS
-- ============================================
-- Every policy here is ADDITIVE: it is a brand new policy object alongside
-- each table's existing "Doctors can manage own X" policy, which is never
-- touched. Postgres RLS OR's together all permissive policies for the same
-- command, so the doctor's own access is completely unaffected — staff
-- simply get a second, narrower path in, gated by staff_doctor_id() (tenant
-- isolation) AND staff_has_permission() (the specific checkbox the doctor
-- granted). A staff member whose doctor_id doesn't match, or who lacks the
-- permission, satisfies neither the doctor policy nor the staff policy and
-- is rejected by RLS regardless of what the frontend does — real database
-- level enforcement, not just hidden UI.

-- ============================================
-- APPOINTMENTS — view / create / edit / cancel
-- ============================================
CREATE POLICY "Staff can view appointments with permission" ON public.appointments
  FOR SELECT USING (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'appointments.view')
  );
CREATE POLICY "Staff can create appointments with permission" ON public.appointments
  FOR INSERT WITH CHECK (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'appointments.create')
  );
-- USING is the coarse "has edit OR cancel" gate; the trigger below decides
-- which one is actually required for the specific fields being changed
-- (only a status->'cancelled' change requires appointments.cancel, anything
-- else requires appointments.edit).
CREATE POLICY "Staff can update appointments with permission" ON public.appointments
  FOR UPDATE USING (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND (
      public.staff_has_permission(auth.uid(), 'appointments.edit')
      OR public.staff_has_permission(auth.uid(), 'appointments.cancel')
    )
  ) WITH CHECK (
    public.staff_doctor_id(auth.uid()) = doctor_id
  );
-- No staff DELETE policy — deleting appointments isn't one of the checkbox
-- permissions, so only the doctor's own policy allows it.

CREATE OR REPLACE FUNCTION public.enforce_appointment_staff_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  only_status_changed boolean;
BEGIN
  IF public.staff_doctor_id(auth.uid()) IS NOT NULL THEN
    only_status_changed := (to_jsonb(NEW) - 'status') = (to_jsonb(OLD) - 'status');
    IF only_status_changed AND NEW.status = 'cancelled' THEN
      IF NOT public.staff_has_permission(auth.uid(), 'appointments.cancel') THEN
        RAISE EXCEPTION 'Not authorized to cancel appointments';
      END IF;
    ELSE
      IF NOT public.staff_has_permission(auth.uid(), 'appointments.edit') THEN
        RAISE EXCEPTION 'Not authorized to edit appointments';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_appointment_staff_permission
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_appointment_staff_permission();

-- ============================================
-- PATIENTS — view / add / edit  (no delete checkbox exists → staff never
-- gets DELETE on patients)
-- ============================================
CREATE POLICY "Staff can view patients with permission" ON public.patients
  FOR SELECT USING (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'patients.view')
  );
CREATE POLICY "Staff can add patients with permission" ON public.patients
  FOR INSERT WITH CHECK (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'patients.add')
  );
CREATE POLICY "Staff can edit patients with permission" ON public.patients
  FOR UPDATE USING (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'patients.edit')
  ) WITH CHECK (
    public.staff_doctor_id(auth.uid()) = doctor_id
  );

-- ============================================
-- PATIENT MEDICAL RECORDS — the doctor only grants a single "View Patient
-- Medical Records" checkbox (no separate edit toggle exists), so
-- patients.medical_records gates full CRUD on all 8 medical-record tables.
-- ============================================
CREATE POLICY "Staff can manage patient_conditions with permission" ON public.patient_conditions
  FOR ALL USING (public.staff_doctor_id(auth.uid()) = doctor_id AND public.staff_has_permission(auth.uid(), 'patients.medical_records'))
  WITH CHECK (public.staff_doctor_id(auth.uid()) = doctor_id AND public.staff_has_permission(auth.uid(), 'patients.medical_records'));
CREATE POLICY "Staff can manage patient_medications with permission" ON public.patient_medications
  FOR ALL USING (public.staff_doctor_id(auth.uid()) = doctor_id AND public.staff_has_permission(auth.uid(), 'patients.medical_records'))
  WITH CHECK (public.staff_doctor_id(auth.uid()) = doctor_id AND public.staff_has_permission(auth.uid(), 'patients.medical_records'));
CREATE POLICY "Staff can manage patient_allergies with permission" ON public.patient_allergies
  FOR ALL USING (public.staff_doctor_id(auth.uid()) = doctor_id AND public.staff_has_permission(auth.uid(), 'patients.medical_records'))
  WITH CHECK (public.staff_doctor_id(auth.uid()) = doctor_id AND public.staff_has_permission(auth.uid(), 'patients.medical_records'));
CREATE POLICY "Staff can manage patient_surgeries with permission" ON public.patient_surgeries
  FOR ALL USING (public.staff_doctor_id(auth.uid()) = doctor_id AND public.staff_has_permission(auth.uid(), 'patients.medical_records'))
  WITH CHECK (public.staff_doctor_id(auth.uid()) = doctor_id AND public.staff_has_permission(auth.uid(), 'patients.medical_records'));
CREATE POLICY "Staff can manage patient_family_history with permission" ON public.patient_family_history
  FOR ALL USING (public.staff_doctor_id(auth.uid()) = doctor_id AND public.staff_has_permission(auth.uid(), 'patients.medical_records'))
  WITH CHECK (public.staff_doctor_id(auth.uid()) = doctor_id AND public.staff_has_permission(auth.uid(), 'patients.medical_records'));
CREATE POLICY "Staff can manage patient_visits with permission" ON public.patient_visits
  FOR ALL USING (public.staff_doctor_id(auth.uid()) = doctor_id AND public.staff_has_permission(auth.uid(), 'patients.medical_records'))
  WITH CHECK (public.staff_doctor_id(auth.uid()) = doctor_id AND public.staff_has_permission(auth.uid(), 'patients.medical_records'));
CREATE POLICY "Staff can manage patient_vitals with permission" ON public.patient_vitals
  FOR ALL USING (public.staff_doctor_id(auth.uid()) = doctor_id AND public.staff_has_permission(auth.uid(), 'patients.medical_records'))
  WITH CHECK (public.staff_doctor_id(auth.uid()) = doctor_id AND public.staff_has_permission(auth.uid(), 'patients.medical_records'));
CREATE POLICY "Staff can manage patient_documents with permission" ON public.patient_documents
  FOR ALL USING (public.staff_doctor_id(auth.uid()) = doctor_id AND public.staff_has_permission(auth.uid(), 'patients.medical_records'))
  WITH CHECK (public.staff_doctor_id(auth.uid()) = doctor_id AND public.staff_has_permission(auth.uid(), 'patients.medical_records'));

-- patient-documents storage: paths are `${doctorId}/${patientId}/...`, so the
-- folder's doctor segment must match the staff member's own doctor, same as
-- the table policies above.
CREATE POLICY "Staff can upload patient documents with permission" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'patient-documents'
    AND public.staff_doctor_id(auth.uid())::text = (storage.foldername(name))[1]
    AND public.staff_has_permission(auth.uid(), 'patients.medical_records')
  );
CREATE POLICY "Staff can read patient documents with permission" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'patient-documents'
    AND public.staff_doctor_id(auth.uid())::text = (storage.foldername(name))[1]
    AND public.staff_has_permission(auth.uid(), 'patients.medical_records')
  );
CREATE POLICY "Staff can delete patient documents with permission" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'patient-documents'
    AND public.staff_doctor_id(auth.uid())::text = (storage.foldername(name))[1]
    AND public.staff_has_permission(auth.uid(), 'patients.medical_records')
  );

-- ============================================
-- PRESCRIPTIONS — view / create / edit
-- ============================================
CREATE POLICY "Staff can view prescriptions with permission" ON public.prescriptions
  FOR SELECT USING (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'prescriptions.view')
  );
CREATE POLICY "Staff can create prescriptions with permission" ON public.prescriptions
  FOR INSERT WITH CHECK (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'prescriptions.create')
  );
CREATE POLICY "Staff can edit prescriptions with permission" ON public.prescriptions
  FOR UPDATE USING (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'prescriptions.edit')
  ) WITH CHECK (
    public.staff_doctor_id(auth.uid()) = doctor_id
  );

-- ============================================
-- REVIEWS — view / manage (reviews are patient-submitted, doctor/staff never
-- create them — "manage" = update i.e. pin/hide + delete)
-- ============================================
CREATE POLICY "Staff can view reviews with permission" ON public.reviews
  FOR SELECT USING (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'reviews.view')
  );
CREATE POLICY "Staff can update reviews with permission" ON public.reviews
  FOR UPDATE USING (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'reviews.manage')
  ) WITH CHECK (
    public.staff_doctor_id(auth.uid()) = doctor_id
  );
CREATE POLICY "Staff can delete reviews with permission" ON public.reviews
  FOR DELETE USING (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'reviews.manage')
  );

-- ============================================
-- BLOG — view / create / edit / delete
-- ============================================
CREATE POLICY "Staff can view blog with permission" ON public.blog_posts
  FOR SELECT USING (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'blog.view')
  );
CREATE POLICY "Staff can create blog with permission" ON public.blog_posts
  FOR INSERT WITH CHECK (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'blog.create')
  );
CREATE POLICY "Staff can edit blog with permission" ON public.blog_posts
  FOR UPDATE USING (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'blog.edit')
  ) WITH CHECK (
    public.staff_doctor_id(auth.uid()) = doctor_id
  );
CREATE POLICY "Staff can delete blog with permission" ON public.blog_posts
  FOR DELETE USING (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'blog.delete')
  );

-- ============================================
-- MY WEBSITE — view / edit / settings, spans services, packages,
-- working_hours, gallery_photos and website_settings (the tables MyWebsite.tsx
-- edits as one unit). "Edit Website" and "Website Settings" are collapsed
-- into a single write gate (either grants write) since the underlying editor
-- doesn't split content vs settings into separate tables.
-- ============================================
CREATE POLICY "Staff can view services with permission" ON public.services
  FOR SELECT USING (public.staff_doctor_id(auth.uid()) = doctor_id AND public.staff_has_permission(auth.uid(), 'website.view'));
CREATE POLICY "Staff can write services with permission" ON public.services
  FOR INSERT WITH CHECK (public.staff_doctor_id(auth.uid()) = doctor_id AND (public.staff_has_permission(auth.uid(), 'website.edit') OR public.staff_has_permission(auth.uid(), 'website.settings')));
CREATE POLICY "Staff can update services with permission" ON public.services
  FOR UPDATE USING (public.staff_doctor_id(auth.uid()) = doctor_id AND (public.staff_has_permission(auth.uid(), 'website.edit') OR public.staff_has_permission(auth.uid(), 'website.settings')))
  WITH CHECK (public.staff_doctor_id(auth.uid()) = doctor_id);
CREATE POLICY "Staff can delete services with permission" ON public.services
  FOR DELETE USING (public.staff_doctor_id(auth.uid()) = doctor_id AND (public.staff_has_permission(auth.uid(), 'website.edit') OR public.staff_has_permission(auth.uid(), 'website.settings')));

CREATE POLICY "Staff can view packages with permission" ON public.packages
  FOR SELECT USING (public.staff_doctor_id(auth.uid()) = doctor_id AND public.staff_has_permission(auth.uid(), 'website.view'));
CREATE POLICY "Staff can write packages with permission" ON public.packages
  FOR INSERT WITH CHECK (public.staff_doctor_id(auth.uid()) = doctor_id AND (public.staff_has_permission(auth.uid(), 'website.edit') OR public.staff_has_permission(auth.uid(), 'website.settings')));
CREATE POLICY "Staff can update packages with permission" ON public.packages
  FOR UPDATE USING (public.staff_doctor_id(auth.uid()) = doctor_id AND (public.staff_has_permission(auth.uid(), 'website.edit') OR public.staff_has_permission(auth.uid(), 'website.settings')))
  WITH CHECK (public.staff_doctor_id(auth.uid()) = doctor_id);
CREATE POLICY "Staff can delete packages with permission" ON public.packages
  FOR DELETE USING (public.staff_doctor_id(auth.uid()) = doctor_id AND (public.staff_has_permission(auth.uid(), 'website.edit') OR public.staff_has_permission(auth.uid(), 'website.settings')));

CREATE POLICY "Staff can view working_hours with permission" ON public.working_hours
  FOR SELECT USING (public.staff_doctor_id(auth.uid()) = doctor_id AND public.staff_has_permission(auth.uid(), 'website.view'));
CREATE POLICY "Staff can write working_hours with permission" ON public.working_hours
  FOR INSERT WITH CHECK (public.staff_doctor_id(auth.uid()) = doctor_id AND (public.staff_has_permission(auth.uid(), 'website.edit') OR public.staff_has_permission(auth.uid(), 'website.settings')));
CREATE POLICY "Staff can update working_hours with permission" ON public.working_hours
  FOR UPDATE USING (public.staff_doctor_id(auth.uid()) = doctor_id AND (public.staff_has_permission(auth.uid(), 'website.edit') OR public.staff_has_permission(auth.uid(), 'website.settings')))
  WITH CHECK (public.staff_doctor_id(auth.uid()) = doctor_id);
CREATE POLICY "Staff can delete working_hours with permission" ON public.working_hours
  FOR DELETE USING (public.staff_doctor_id(auth.uid()) = doctor_id AND (public.staff_has_permission(auth.uid(), 'website.edit') OR public.staff_has_permission(auth.uid(), 'website.settings')));

CREATE POLICY "Staff can view gallery_photos with permission" ON public.gallery_photos
  FOR SELECT USING (public.staff_doctor_id(auth.uid()) = doctor_id AND public.staff_has_permission(auth.uid(), 'website.view'));
CREATE POLICY "Staff can write gallery_photos with permission" ON public.gallery_photos
  FOR INSERT WITH CHECK (public.staff_doctor_id(auth.uid()) = doctor_id AND (public.staff_has_permission(auth.uid(), 'website.edit') OR public.staff_has_permission(auth.uid(), 'website.settings')));
CREATE POLICY "Staff can update gallery_photos with permission" ON public.gallery_photos
  FOR UPDATE USING (public.staff_doctor_id(auth.uid()) = doctor_id AND (public.staff_has_permission(auth.uid(), 'website.edit') OR public.staff_has_permission(auth.uid(), 'website.settings')))
  WITH CHECK (public.staff_doctor_id(auth.uid()) = doctor_id);
CREATE POLICY "Staff can delete gallery_photos with permission" ON public.gallery_photos
  FOR DELETE USING (public.staff_doctor_id(auth.uid()) = doctor_id AND (public.staff_has_permission(auth.uid(), 'website.edit') OR public.staff_has_permission(auth.uid(), 'website.settings')));

CREATE POLICY "Staff can view website_settings with permission" ON public.website_settings
  FOR SELECT USING (public.staff_doctor_id(auth.uid()) = doctor_id AND public.staff_has_permission(auth.uid(), 'website.view'));
CREATE POLICY "Staff can write website_settings with permission" ON public.website_settings
  FOR INSERT WITH CHECK (public.staff_doctor_id(auth.uid()) = doctor_id AND (public.staff_has_permission(auth.uid(), 'website.edit') OR public.staff_has_permission(auth.uid(), 'website.settings')));
CREATE POLICY "Staff can update website_settings with permission" ON public.website_settings
  FOR UPDATE USING (public.staff_doctor_id(auth.uid()) = doctor_id AND (public.staff_has_permission(auth.uid(), 'website.edit') OR public.staff_has_permission(auth.uid(), 'website.settings')))
  WITH CHECK (public.staff_doctor_id(auth.uid()) = doctor_id);
CREATE POLICY "Staff can delete website_settings with permission" ON public.website_settings
  FOR DELETE USING (public.staff_doctor_id(auth.uid()) = doctor_id AND (public.staff_has_permission(auth.uid(), 'website.edit') OR public.staff_has_permission(auth.uid(), 'website.settings')));

-- doctor-uploads storage: profile photo upload lives under Profile in the UI.
CREATE POLICY "Staff can upload doctor files with permission" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'doctor-uploads'
    AND public.staff_doctor_id(auth.uid())::text = (storage.foldername(name))[1]
    AND public.staff_has_permission(auth.uid(), 'profile.edit')
  );
CREATE POLICY "Staff can update doctor files with permission" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'doctor-uploads'
    AND public.staff_doctor_id(auth.uid())::text = (storage.foldername(name))[1]
    AND public.staff_has_permission(auth.uid(), 'profile.edit')
  );

-- ============================================
-- BILLING — view / manage (invoices). Premium gating on writes is preserved.
-- ============================================
CREATE POLICY "Staff can view invoices with permission" ON public.invoices
  FOR SELECT USING (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'billing.view')
  );
CREATE POLICY "Staff can manage invoices with permission" ON public.invoices
  FOR ALL USING (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'billing.manage')
  ) WITH CHECK (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'billing.manage')
    AND public.doctor_has_premium_access(doctor_id)
  );

-- ============================================
-- PROFILE — view / edit, of the DOCTOR's own profiles row (not the staff
-- member's own auth identity, which has no profiles row at all).
-- ============================================
CREATE POLICY "Staff can view assigned doctor profile" ON public.profiles
  FOR SELECT USING (
    public.staff_doctor_id(auth.uid()) = id
    AND public.staff_has_permission(auth.uid(), 'profile.view')
  );
CREATE POLICY "Staff can update assigned doctor profile" ON public.profiles
  FOR UPDATE USING (
    public.staff_doctor_id(auth.uid()) = id
    AND public.staff_has_permission(auth.uid(), 'profile.edit')
  ) WITH CHECK (
    public.staff_doctor_id(auth.uid()) = id
  );

-- Even with profile.edit, staff must never be able to touch billing/plan
-- fields on the doctor's profile — those aren't part of any checkbox and
-- must stay exclusively doctor-controlled.
CREATE OR REPLACE FUNCTION public.guard_staff_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.staff_doctor_id(auth.uid()) IS NOT NULL THEN
    IF NEW.plan_status IS DISTINCT FROM OLD.plan_status
       OR NEW.plan_tier IS DISTINCT FROM OLD.plan_tier
       OR NEW.trial_start IS DISTINCT FROM OLD.trial_start
       OR NEW.trial_end IS DISTINCT FROM OLD.trial_end
       OR NEW.custom_plan_price IS DISTINCT FROM OLD.custom_plan_price THEN
      RAISE EXCEPTION 'Staff are not permitted to change billing/plan settings';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_staff_profile_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_staff_profile_update();

-- ============================================
-- Account-suspension check for staff sessions (ProtectedRoute.tsx)
-- ============================================
-- Suspension must not be gate-able behind "View Profile" — any active staff
-- member of a suspended doctor should be blocked, regardless of what other
-- permissions they hold. This narrow RPC exposes ONLY plan_status, and only
-- to that doctor's own active staff, bypassing the profile.view-gated RLS
-- policy above on purpose for this one check.
CREATE OR REPLACE FUNCTION public.get_doctor_plan_status(_doctor_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT plan_status::text FROM public.profiles
  WHERE id = _doctor_id AND public.staff_doctor_id(auth.uid()) = _doctor_id
$$;

GRANT EXECUTE ON FUNCTION public.get_doctor_plan_status(uuid) TO authenticated;
