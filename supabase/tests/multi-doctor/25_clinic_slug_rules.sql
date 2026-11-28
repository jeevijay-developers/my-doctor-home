-- Clinic website address rules (20261128110000). Rolled back; prints one 'pass' row.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/25_clinic_slug_rules.sql
BEGIN;
CREATE FUNCTION pg_temp.as_user(u uuid, r text DEFAULT 'authenticated') RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', CASE WHEN u IS NULL THEN '' ELSE json_build_object('sub', u, 'role', r)::text END, true)
$$;
DO $$
DECLARE
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  s_ok uuid := gen_random_uuid(); s_no uuid := gen_random_uuid();
  tag text := substr(md5(random()::text), 1, 8);
  a_old text := 'dr-a-' || tag; a_new text := 'new-a-' || tag;
  b_slug text := 'dr-b-' || tag; nm text := 'Zq' || tag || ' Clinic';
  r jsonb; t text; n int; raised boolean;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"full_name":"Dr Slug"}'::jsonb FROM unnest(ARRAY[a, b, c]) u;
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"account_type":"staff"}'::jsonb FROM unnest(ARRAY[s_ok, s_no]) u;
  UPDATE public.profiles SET slug = a_old, onboarding_completed = true, clinic_name = nm, city = 'Kota' WHERE id = a;
  UPDATE public.profiles SET slug = b_slug, onboarding_completed = true WHERE id = b;
  UPDATE public.profiles SET onboarding_completed = true WHERE id = c;
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status)
  VALUES (s_ok, a, 'Reception', 'rc-' || s_ok, '+1551' || lpad((floor(random()*1e7))::int::text, 7, '0'), '{"profile.edit": true}'::jsonb, a, 'active'),
         (s_no, a, 'Other', 'ot-' || s_no, '+1552' || lpad((floor(random()*1e7))::int::text, 7, '0'), '{}'::jsonb, a, 'active');

  -- helpers
  IF NOT public.slug_is_valid('abc') OR public.slug_is_valid('ab') OR public.slug_is_valid('-abc') OR public.slug_is_valid('abc-')
     OR public.slug_is_valid('a--b') OR public.slug_is_valid('ABC') OR public.slug_is_valid('a_b') OR public.slug_is_valid(repeat('a', 51))
     OR NOT public.slug_is_valid(repeat('a', 50)) OR public.slug_is_valid('admin') OR public.slug_is_valid('health-articles') THEN
    RAISE EXCEPTION 'slug_is_valid wrong';
  END IF;

  SET LOCAL ROLE authenticated;

  -- stranger (staff without profile.edit) is refused everywhere
  PERFORM pg_temp.as_user(s_no);
  r := public.set_clinic_slug('stranger-' || tag);
  IF r->>'error' IS DISTINCT FROM 'NOT_ALLOWED' THEN RAISE EXCEPTION 'stranger set not refused: %', r; END IF;
  r := public.is_clinic_slug_available('stranger-' || tag);
  IF r->>'code' IS DISTINCT FROM 'NOT_ALLOWED' THEN RAISE EXCEPTION 'stranger availability not refused: %', r; END IF;
  IF public.suggest_clinic_slug('x', NULL) IS NOT NULL THEN RAISE EXCEPTION 'stranger got a suggestion'; END IF;
  -- no client write to slug_history
  BEGIN
    INSERT INTO public.slug_history (doctor_id, old_slug) VALUES (a, 'squat-' || tag);
    RAISE EXCEPTION 'client insert into slug_history allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- staff with profile.edit renames: ok, history written, locked
  PERFORM pg_temp.as_user(s_ok);
  r := public.set_clinic_slug(a_new);
  IF NOT (r->>'ok')::boolean OR r->>'slug' <> a_new THEN RAISE EXCEPTION 'staff rename failed: %', r; END IF;
  RESET ROLE;
  SELECT slug INTO t FROM public.profiles WHERE id = a;
  IF t <> a_new THEN RAISE EXCEPTION 'slug not updated'; END IF;
  IF NOT (SELECT slug_locked FROM public.profiles WHERE id = a) THEN RAISE EXCEPTION 'slug_locked not set'; END IF;
  SELECT count(*) INTO n FROM public.slug_history WHERE doctor_id = a AND old_slug = a_old;
  IF n <> 1 THEN RAISE EXCEPTION 'old slug not archived (%)', n; END IF;

  -- resolver (anon): old -> new, current -> itself, unknown -> null
  SET LOCAL ROLE anon;
  IF public.resolve_clinic_slug(a_old) IS DISTINCT FROM a_new THEN RAISE EXCEPTION 'old slug does not resolve'; END IF;
  IF public.resolve_clinic_slug(a_new) IS DISTINCT FROM a_new THEN RAISE EXCEPTION 'current slug does not resolve'; END IF;
  IF public.resolve_clinic_slug('nope-' || tag) IS NOT NULL THEN RAISE EXCEPTION 'unknown slug resolved'; END IF;
  BEGIN
    PERFORM public.set_clinic_slug('anon-' || tag);
    RAISE EXCEPTION 'anon may call set_clinic_slug';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- owner B: reserved, invalid, too short, hijack of A's old slug, another clinic's current slug
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user(b);
  IF public.set_clinic_slug('admin')->>'error' <> 'SLUG_RESERVED' THEN RAISE EXCEPTION 'reserved accepted'; END IF;
  IF public.set_clinic_slug('Bad_Slug')->>'error' <> 'SLUG_INVALID' THEN RAISE EXCEPTION 'invalid accepted'; END IF;
  IF public.set_clinic_slug('ab')->>'error' <> 'SLUG_INVALID' THEN RAISE EXCEPTION 'short accepted'; END IF;
  IF public.set_clinic_slug(a_old)->>'error' <> 'SLUG_TAKEN' THEN RAISE EXCEPTION 'hijack of old slug accepted'; END IF;
  IF public.set_clinic_slug(a_new)->>'error' <> 'SLUG_TAKEN' THEN RAISE EXCEPTION 'current slug of another clinic accepted'; END IF;
  IF (public.is_clinic_slug_available(a_old)->>'available')::boolean THEN RAISE EXCEPTION 'availability says old slug is free'; END IF;
  IF NOT (public.is_clinic_slug_available('free-' || tag)->>'available')::boolean THEN RAISE EXCEPTION 'free slug reported taken'; END IF;
  -- a direct profile update is guarded too (also for the old client path)
  raised := false;
  BEGIN UPDATE public.profiles SET slug = a_old WHERE id = b;
  EXCEPTION WHEN raise_exception THEN raised := true; END;
  IF NOT raised THEN RAISE EXCEPTION 'direct hijack allowed'; END IF;
  raised := false;
  BEGIN UPDATE public.profiles SET slug = 'blog' WHERE id = b;
  EXCEPTION WHEN raise_exception THEN raised := true; END;
  IF NOT raised THEN RAISE EXCEPTION 'direct reserved rename allowed'; END IF;

  -- a direct rename by the client is archived by the trigger (old client insert is gone)
  UPDATE public.profiles SET slug = 'b-direct-' || tag WHERE id = b;
  RESET ROLE;
  SELECT count(*) INTO n FROM public.slug_history WHERE doctor_id = b AND old_slug = b_slug;
  IF n <> 1 THEN RAISE EXCEPTION 'direct rename not archived'; END IF;

  -- renaming back to one's own old slug works; the history row stays
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user(a);
  r := public.set_clinic_slug(a_old);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'rename back refused: %', r; END IF;
  RESET ROLE;
  SELECT count(*) INTO n FROM public.slug_history WHERE doctor_id = a AND old_slug IN (a_old, a_new);
  IF n <> 2 THEN RAISE EXCEPTION 'history lost (%)', n; END IF;

  -- suggestions: name, then name-city, then -2; never random; fallback for non-Latin / empty
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user(a);
  t := public.suggest_clinic_slug(nm, 'Kota');
  IF t <> lower('zq' || tag || '-clinic') THEN RAISE EXCEPTION 'suggestion wrong: %', t; END IF;
  RESET ROLE;
  UPDATE public.profiles SET slug = lower('zq' || tag || '-clinic') WHERE id = c;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user(a);
  t := public.suggest_clinic_slug(nm, 'Kota');
  IF t <> lower('zq' || tag || '-clinic-kota') THEN RAISE EXCEPTION 'name-city suggestion wrong: %', t; END IF;
  RESET ROLE;
  UPDATE public.profiles SET slug = lower('zq' || tag || '-clinic-kota') WHERE id = b;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user(a);
  t := public.suggest_clinic_slug(nm, 'Kota');
  IF t <> lower('zq' || tag || '-clinic-2') THEN RAISE EXCEPTION 'numbered suggestion wrong: %', t; END IF;
  -- your own current address is not a collision
  t := public.suggest_clinic_slug(replace(a_old, '-', ' '), NULL);
  IF t <> a_old THEN RAISE EXCEPTION 'own slug counted as collision: %', t; END IF;
  t := public.suggest_clinic_slug('क्लिनिक', NULL);
  IF t IS NULL OR t !~ '^clinic(-[0-9]+)?$' THEN RAISE EXCEPTION 'non-Latin fallback wrong: %', t; END IF;
  t := public.suggest_clinic_slug('', '');
  IF t IS NULL OR t !~ '^clinic(-[0-9]+)?$' THEN RAISE EXCEPTION 'empty fallback wrong: %', t; END IF;
  t := public.suggest_clinic_slug(repeat('abc ', 40), NULL);
  IF char_length(t) > 50 OR NOT public.slug_is_valid(t) THEN RAISE EXCEPTION 'long name suggestion invalid: %', t; END IF;
  t := public.suggest_clinic_slug('Dr', NULL);
  IF NOT public.slug_is_valid(t) THEN RAISE EXCEPTION 'short name suggestion invalid: %', t; END IF;

  RESET ROLE;
  -- legacy slugs are not rejected retroactively; unchanged slug updates and first assignment still work
  UPDATE public.profiles SET slug = NULL WHERE id = c;
  UPDATE public.profiles SET slug = 'Legacy_Slug_' || tag WHERE id = c;       -- first assignment, no format rule
  UPDATE public.profiles SET full_name = 'Dr Renamed' WHERE id = c;           -- slug untouched
  UPDATE public.profiles SET slug = slug WHERE id = c;
  RAISE NOTICE 'ok';
END $$;
SELECT 'pass' AS result;
ROLLBACK;
