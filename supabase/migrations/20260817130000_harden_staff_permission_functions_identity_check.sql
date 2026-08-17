-- Harden staff_doctor_id / staff_has_permission against identity spoofing.
-- Both are SECURITY DEFINER and, per the Supabase security advisor, are
-- reachable via PostgREST RPC (/rest/v1/rpc/...) by the `anon` role, since
-- `anon` must keep EXECUTE here: public booking-site queries (anonymous
-- patients viewing services/working hours/reviews/etc.) share those same
-- tables with the staff-scoped RLS policies that call these functions, and
-- Postgres requires the querying role to have EXECUTE on every function
-- referenced by ANY permissive policy on a table to evaluate them at all —
-- revoking EXECUTE from anon would break the public site outright.
--
-- Every legitimate caller (every RLS policy added in
-- staff_permission_policies.sql, plus get_doctor_plan_status) already only
-- ever passes auth.uid() as _user_id. So instead of touching grants, add
-- `_user_id = auth.uid()` to both functions' own WHERE clause: this closes
-- the direct-RPC path where anyone could pass an arbitrary staff member's
-- uuid and learn their doctor_id / permission grants, while every existing
-- internal use (which always already passes auth.uid()) is unaffected.
CREATE OR REPLACE FUNCTION public.staff_doctor_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT doctor_id FROM public.staff_members
  WHERE id = _user_id AND status = 'active' AND _user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.staff_has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((permissions ->> _permission)::boolean, false)
  FROM public.staff_members WHERE id = _user_id AND status = 'active' AND _user_id = auth.uid()
$$;
