-- A doctor login (staff_members.role = 'doctor') must not read other doctors' money.
--  1. get_practitioner_revenue (the clinic-wide per-doctor report) refuses doctor logins with
--     DOCTOR_LOGIN even if the owner gave them billing.view. Their own view is get_my_practitioner_revenue.
--  2. Invoices: a RESTRICTIVE policy narrows a doctor login (if the owner granted billing.view/manage)
--     to invoices whose snapshotted practitioner_id is their own. Owner and non-doctor staff are
--     untouched (the function returns true for them). payments / doctor_ledger have no staff policy
--     at all (owner + platform admins only), so nothing to narrow there.
-- Check: npx supabase db query --linked -f supabase/tests/multi-doctor/21_doctor_login_money.sql

CREATE OR REPLACE FUNCTION public.invoice_row_visible(_doctor_id uuid, _practitioner_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mine uuid;
BEGIN
  IF v_uid IS NULL OR v_uid = _doctor_id THEN
    RETURN true;
  END IF;
  SELECT practitioner_id INTO v_mine FROM public.staff_members
   WHERE id = v_uid AND doctor_id = _doctor_id AND role = 'doctor' AND status = 'active';
  IF NOT FOUND THEN
    RETURN true;                      -- not a doctor login: normal permissions decide
  END IF;
  RETURN COALESCE(_practitioner_id = v_mine, false);   -- unattributed invoices are not a doctor's to see
END;
$$;
REVOKE ALL ON FUNCTION public.invoice_row_visible(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoice_row_visible(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Doctor logins see only their own invoices" ON public.invoices;
CREATE POLICY "Doctor logins see only their own invoices" ON public.invoices
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.invoice_row_visible(doctor_id, practitioner_id));
DROP POLICY IF EXISTS "Doctor logins change only their own invoices" ON public.invoices;
CREATE POLICY "Doctor logins change only their own invoices" ON public.invoices
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.invoice_row_visible(doctor_id, practitioner_id));
DROP POLICY IF EXISTS "Doctor logins delete only their own invoices" ON public.invoices;
CREATE POLICY "Doctor logins delete only their own invoices" ON public.invoices
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.invoice_row_visible(doctor_id, practitioner_id));

-- Same body as 20261127100100 (as amended by 20261127100500), plus the doctor-login refusal.
CREATE OR REPLACE FUNCTION public.get_practitioner_revenue(_from date, _to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_clinic uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
    v_clinic := v_uid;
  ELSIF EXISTS (SELECT 1 FROM public.staff_members WHERE id = v_uid AND role = 'doctor') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DOCTOR_LOGIN');
  ELSIF COALESCE(public.staff_has_permission(v_uid, 'billing.view'), false) THEN
    v_clinic := public.staff_doctor_id(v_uid);
  END IF;
  IF v_clinic IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;
  IF _from IS NULL OR _to IS NULL OR _from > _to THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_RANGE');
  END IF;
  IF _to - _from > 365 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RANGE_TOO_LARGE');
  END IF;
  RETURN jsonb_build_object('ok', true, 'from', _from, 'to', _to)
         || public.practitioner_revenue_core(v_clinic, _from, _to);
END;
$$;
REVOKE ALL ON FUNCTION public.get_practitioner_revenue(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_practitioner_revenue(date, date) TO authenticated;
