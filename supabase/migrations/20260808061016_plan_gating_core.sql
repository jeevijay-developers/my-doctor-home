-- Single source of truth for "does this doctor have Premium-level access."
-- Mirrors the existing has_role() pattern (SQL language, STABLE, SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.doctor_has_premium_access(_doctor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _doctor_id
      AND (plan_status = 'trial' OR plan_tier = 'premium')
  )
$$;

-- Seed the configurable cap (idempotent - safe to re-run).
INSERT INTO public.platform_settings (key, value)
VALUES ('basic_appointment_cap', '500'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Read-only usage summary for the frontend. Not itself an enforcement point -
-- enforce_monthly_appointment_cap() (Task 3) is the actual authority; this
-- function mirrors its exact counting logic so displayed numbers never drift
-- from what's enforced.
CREATE OR REPLACE FUNCTION public.get_appointment_cap_usage(_doctor_id uuid)
RETURNS TABLE(is_premium boolean, appointments_used int, appointments_cap int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  premium boolean;
  cap_val int;
  used_val int;
BEGIN
  premium := public.doctor_has_premium_access(_doctor_id);

  IF premium THEN
    RETURN QUERY SELECT true, 0, 0;
    RETURN;
  END IF;

  SELECT COALESCE((value)::int, 500) INTO cap_val
  FROM public.platform_settings WHERE key = 'basic_appointment_cap';
  IF cap_val IS NULL THEN cap_val := 500; END IF;

  SELECT COUNT(*)::int INTO used_val
  FROM public.appointments
  WHERE doctor_id = _doctor_id
    AND status <> 'cancelled'
    AND date_trunc('month', date) = date_trunc('month', CURRENT_DATE);

  RETURN QUERY SELECT false, used_val, cap_val;
END;
$$;

GRANT EXECUTE ON FUNCTION public.doctor_has_premium_access(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_appointment_cap_usage(uuid) TO authenticated;
