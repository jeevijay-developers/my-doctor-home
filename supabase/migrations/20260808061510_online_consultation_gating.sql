CREATE OR REPLACE FUNCTION public.enforce_online_consultation_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.show_online_consultation = true
     AND (OLD.show_online_consultation IS DISTINCT FROM true)
     AND NOT public.doctor_has_premium_access(NEW.doctor_id) THEN
    RAISE EXCEPTION 'ONLINE_CONSULTATION_REQUIRES_PREMIUM: Online Consultation is a Premium-only feature'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gate_online_consultation ON public.website_settings;
CREATE TRIGGER gate_online_consultation
  BEFORE UPDATE ON public.website_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_online_consultation_gate();

CREATE OR REPLACE FUNCTION public.auto_disable_online_consultation_on_downgrade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  was_premium boolean;
  is_premium boolean;
BEGIN
  was_premium := (OLD.plan_status = 'trial' OR OLD.plan_tier = 'premium');
  is_premium := (NEW.plan_status = 'trial' OR NEW.plan_tier = 'premium');

  IF was_premium AND NOT is_premium THEN
    UPDATE public.website_settings
    SET show_online_consultation = false
    WHERE doctor_id = NEW.id AND show_online_consultation = true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS disable_online_consultation_on_downgrade ON public.profiles;
CREATE TRIGGER disable_online_consultation_on_downgrade
  AFTER UPDATE OF plan_tier, plan_status ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_disable_online_consultation_on_downgrade();
