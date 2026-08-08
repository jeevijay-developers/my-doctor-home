CREATE OR REPLACE FUNCTION public.enforce_monthly_appointment_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cap integer;
  taken integer;
BEGIN
  -- Unlike enforce_slot_capacity(), this does NOT exempt doctor-originated
  -- inserts - the cap blocks both the doctor's own manual creation and
  -- public/patient booking, by design.
  IF public.doctor_has_premium_access(NEW.doctor_id) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE((value)::int, 500) INTO cap
  FROM public.platform_settings WHERE key = 'basic_appointment_cap';
  IF cap IS NULL THEN cap := 500; END IF;

  SELECT COUNT(*) INTO taken
  FROM public.appointments
  WHERE doctor_id = NEW.doctor_id
    AND status <> 'cancelled'
    AND date_trunc('month', date) = date_trunc('month', NEW.date);

  IF taken >= cap THEN
    RAISE EXCEPTION 'MONTHLY_APPOINTMENT_CAP_REACHED: Basic plan is limited to % appointments per month', cap
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_appointment_cap ON public.appointments;
CREATE TRIGGER enforce_appointment_cap
  BEFORE INSERT ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_monthly_appointment_cap();
