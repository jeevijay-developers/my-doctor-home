-- Deleting a clinic (superadmin "Delete doctor") failed with
--   update or delete on table "practitioners" violates foreign key constraint
--   "prescriptions_practitioner_fk" on table "prescriptions".
-- prescriptions.doctor_id has never had a foreign key to profiles, so deleting a
-- profile cascades to practitioners but not to prescriptions; the composite FK
-- (practitioner_id, doctor_id) then blocks the practitioners delete.
-- Fix: remove the clinic's prescriptions when its profile row goes. Done in a BEFORE
-- DELETE trigger so every path (auth user delete, SQL fallback, any future one) works.
-- Deleting a single practitioner is NOT affected: that still goes through the RPCs.

CREATE OR REPLACE FUNCTION public.delete_clinic_prescriptions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.prescriptions WHERE doctor_id = OLD.id;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_clinic_prescriptions() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_a0_delete_clinic_prescriptions ON public.profiles;
CREATE TRIGGER trg_a0_delete_clinic_prescriptions
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.delete_clinic_prescriptions();
