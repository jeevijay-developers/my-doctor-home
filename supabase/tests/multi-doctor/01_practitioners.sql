-- Multi-doctor P0, part 1: practitioners table. Rolled back; prints one row 'pass'.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/01_practitioners.sql
BEGIN;
DO $$
DECLARE
  d uuid := gen_random_uuid();
  p public.practitioners%ROWTYPE;
  n int;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  VALUES (d, 'authenticated', 'authenticated', d::text || '@example.test', '{"full_name":"Dr. Asha Rao"}'::jsonb);

  -- 1. A new signup gets exactly one primary practitioner, linked to the owner's login.
  SELECT count(*) INTO n FROM public.practitioners WHERE doctor_id = d;
  IF n <> 1 THEN RAISE EXCEPTION 'expected 1 practitioner for a new clinic, got %', n; END IF;
  SELECT * INTO p FROM public.practitioners WHERE doctor_id = d;
  IF NOT p.is_primary OR p.user_id IS DISTINCT FROM d OR p.display_name <> 'Dr. Asha Rao'
     OR p.slug <> 'dr-asha-rao' OR NOT (p.is_active AND p.is_bookable AND p.online_booking) THEN
    RAISE EXCEPTION 'bad primary practitioner: %', row_to_json(p);
  END IF;
  IF public.primary_practitioner_id(d) IS DISTINCT FROM p.id THEN
    RAISE EXCEPTION 'primary_practitioner_id() wrong';
  END IF;

  -- 2. Every existing clinic was backfilled with exactly one primary.
  SELECT count(*) INTO n FROM public.profiles pr
   WHERE NOT EXISTS (SELECT 1 FROM public.practitioners x WHERE x.doctor_id = pr.id AND x.is_primary);
  IF n <> 0 THEN RAISE EXCEPTION '% clinics have no primary practitioner', n; END IF;

  -- 3. Calling ensure_primary_practitioner again never creates a second one.
  PERFORM public.ensure_primary_practitioner(d);
  SELECT count(*) INTO n FROM public.practitioners WHERE doctor_id = d;
  IF n <> 1 THEN RAISE EXCEPTION 'ensure_primary_practitioner is not idempotent (%)', n; END IF;

  -- 4. Editing the owner's profile flows to the owner's practitioner row.
  UPDATE public.profiles
     SET full_name = 'Dr. Asha R. Rao', specialization = 'Dermatology', registration_number = 'MCI-123'
   WHERE id = d;
  SELECT * INTO p FROM public.practitioners WHERE doctor_id = d;
  IF p.display_name <> 'Dr. Asha R. Rao' OR p.specialization <> 'Dermatology' OR p.registration_number <> 'MCI-123' THEN
    RAISE EXCEPTION 'owner fields not synced: %', row_to_json(p);
  END IF;
  IF p.slug <> 'dr-asha-rao' THEN RAISE EXCEPTION 'slug must not follow renames in P0'; END IF;

  -- 5. A primary must stay active and bookable.
  BEGIN
    UPDATE public.practitioners SET is_active = false WHERE doctor_id = d;
    RAISE EXCEPTION 'primary practitioner was deactivated';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 6. A clinic cannot be left without a primary (deferred check, forced now).
  BEGIN
    UPDATE public.practitioners SET is_primary = false WHERE doctor_id = d;
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'clinic was left without a primary practitioner';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PRIMARY_PRACTITIONER_REQUIRED' THEN RAISE; END IF;
  END;

  -- 7. Signed-in clinic users can read their practitioners but not write them (P0).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.practitioners WHERE doctor_id = d;
  IF n <> 1 THEN RESET ROLE; RAISE EXCEPTION 'owner cannot read own practitioners (%)', n; END IF;
  UPDATE public.practitioners SET display_name = 'Hacked' WHERE doctor_id = d;
  GET DIAGNOSTICS n = ROW_COUNT;
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'client update of practitioners was allowed'; END IF;

  -- 8. Anonymous visitors cannot read the table.
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM public.practitioners;
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'anon can read practitioners'; END IF;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
