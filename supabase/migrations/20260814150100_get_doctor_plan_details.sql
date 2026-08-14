-- Superset of get_doctor_plan_status(uuid) — that one only returns
-- plan_status as scalar text, but grace-period computation also needs
-- trial_end. Same narrow-RPC pattern (bypasses profile.view-gated RLS on
-- purpose, scoped to the caller's own assigned doctor only). The old
-- function is left in place, just no longer called from the frontend.
CREATE OR REPLACE FUNCTION public.get_doctor_plan_details(_doctor_id uuid)
RETURNS TABLE(plan_status text, trial_end timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.plan_status::text, p.trial_end FROM public.profiles p
  WHERE p.id = _doctor_id AND public.staff_doctor_id(auth.uid()) = _doctor_id
$$;

GRANT EXECUTE ON FUNCTION public.get_doctor_plan_details(uuid) TO authenticated;
