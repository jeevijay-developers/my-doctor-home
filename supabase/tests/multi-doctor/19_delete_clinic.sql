-- Deleting a clinic that has prescriptions must work (rolled back; prints one 'pass' row).
BEGIN;
DO $$
DECLARE d uuid; p uuid; n int;
BEGIN
  -- pick a clinic that really has prescriptions; fall back to any prescription owner
  SELECT doctor_id INTO d FROM public.prescriptions LIMIT 1;
  IF d IS NULL THEN RAISE NOTICE 'no prescriptions in db; nothing to rehearse'; RETURN; END IF;
  DELETE FROM auth.users WHERE id = d;
  SELECT count(*) INTO n FROM public.prescriptions WHERE doctor_id = d;
  IF n <> 0 THEN RAISE EXCEPTION 'prescriptions left behind: %', n; END IF;
  SELECT count(*) INTO n FROM public.practitioners WHERE doctor_id = d;
  IF n <> 0 THEN RAISE EXCEPTION 'practitioners left behind: %', n; END IF;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
