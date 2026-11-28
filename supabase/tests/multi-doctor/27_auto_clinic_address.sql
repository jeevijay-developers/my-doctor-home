-- Automatic clinic address (20261128130000). Rolled back; prints one 'pass' row.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/27_auto_clinic_address.sql
BEGIN;
CREATE FUNCTION pg_temp.mk(nm text, sl text, locked boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE d uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  VALUES (d, 'authenticated', 'authenticated', d::text || '@example.test', '{"full_name":"Dr Auto"}'::jsonb);
  UPDATE public.profiles SET slug = sl, onboarding_completed = true, clinic_name = nm, city = 'Kota',
         slug_locked = locked, plan_tier = 'premium', plan_status = 'active', plan_end = now() + interval '30 days'
   WHERE id = d;
  INSERT INTO public.doctor_feature_overrides (doctor_id, feature_key, enabled, reason, granted_by)
  VALUES (d, 'multi_doctor', true, 'test: auto address', d);
  INSERT INTO public.clinic_doctor_seats (doctor_id, extra_seats, reason) VALUES (d, 5, 'test');
  PERFORM public.ensure_primary_practitioner(d);
  RETURN d;
END $$;
CREATE FUNCTION pg_temp.add_doc(d uuid, n text, act boolean DEFAULT true) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE p uuid;
BEGIN
  INSERT INTO public.practitioners (doctor_id, display_name, slug, sort_order, is_active, is_bookable) VALUES (d, 'Dr ' || n, 'dr-' || n, 1 + (random()*1000)::int, act, act)
  RETURNING id INTO p;
  RETURN p;
END $$;
CREATE FUNCTION pg_temp.slug_of(d uuid) RETURNS text LANGUAGE sql AS $$ SELECT slug FROM public.profiles WHERE id = d $$;
CREATE FUNCTION pg_temp.locked_of(d uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT slug_locked FROM public.profiles WHERE id = d $$;

DO $$
DECLARE
  tag text := substr(md5(random()::text), 1, 8);
  a uuid; b uuid; c uuid; e uuid; f uuid; g uuid; h1 uuid; h2 uuid; x uuid; y uuid;
  p2 uuid; p3 uuid; pe uuid;
  base_a text := 'aa' || tag || '-clinic';
  t text; n int;
BEGIN
  -- A: first doctor alone changes nothing; the 2nd switches to the clinic name, archives the old one, notifies.
  a := pg_temp.mk('Aa' || tag || ' Clinic', 'dr-a-' || tag);
  IF pg_temp.slug_of(a) <> 'dr-a-' || tag OR pg_temp.locked_of(a) THEN RAISE EXCEPTION 'single doctor clinic changed'; END IF;
  p2 := pg_temp.add_doc(a, 'two');
  IF pg_temp.slug_of(a) <> base_a THEN RAISE EXCEPTION 'address not switched: %', pg_temp.slug_of(a); END IF;
  IF NOT pg_temp.locked_of(a) THEN RAISE EXCEPTION 'not locked after switch'; END IF;
  SELECT count(*) INTO n FROM public.slug_history WHERE doctor_id = a AND old_slug = 'dr-a-' || tag;
  IF n <> 1 THEN RAISE EXCEPTION 'old address not archived (%)', n; END IF;
  IF public.resolve_clinic_slug('dr-a-' || tag) IS DISTINCT FROM base_a THEN RAISE EXCEPTION 'old address does not resolve'; END IF;
  SELECT count(*) INTO n FROM public.notifications WHERE doctor_id = a AND source_type = 'clinic_address' AND message LIKE '%/dr/' || base_a || '.%';
  IF n <> 1 THEN RAISE EXCEPTION 'owner notification missing (%)', n; END IF;

  -- 3rd doctor, deactivating one, going back to 1 doctor, clinic rename: address never moves again.
  p3 := pg_temp.add_doc(a, 'three');
  UPDATE public.practitioners SET is_active = false WHERE id IN (p2, p3);
  UPDATE public.practitioners SET is_active = true WHERE id = p2;                 -- reactivate fires, locked: no-op
  UPDATE public.profiles SET clinic_name = 'Totally Renamed ' || tag WHERE id = a;
  IF pg_temp.slug_of(a) <> base_a THEN RAISE EXCEPTION 'address moved again: %', pg_temp.slug_of(a); END IF;
  SELECT count(*) INTO n FROM public.slug_history WHERE doctor_id = a;
  IF n <> 1 THEN RAISE EXCEPTION 'history changed (%)', n; END IF;
  SELECT count(*) INTO n FROM public.notifications WHERE doctor_id = a AND source_type = 'clinic_address';
  IF n <> 1 THEN RAISE EXCEPTION 'second notification (%)', n; END IF;

  -- B: single doctor stays; deactivated 2nd doctor never counted.
  b := pg_temp.mk('Bb' || tag || ' Clinic', 'dr-b-' || tag);
  PERFORM pg_temp.add_doc(b, 'bee', false);
  UPDATE public.profiles SET clinic_name = 'Bb' || tag || ' Renamed' WHERE id = b;
  IF pg_temp.slug_of(b) <> 'dr-b-' || tag OR pg_temp.locked_of(b) THEN RAISE EXCEPTION 'single active doctor clinic changed'; END IF;

  -- C: an owner-locked address is respected.
  c := pg_temp.mk('Cc' || tag || ' Clinic', 'my-own-' || tag, true);
  PERFORM pg_temp.add_doc(c, 'cee');
  IF pg_temp.slug_of(c) <> 'my-own-' || tag THEN RAISE EXCEPTION 'locked address changed'; END IF;

  -- D: blank clinic name: unchanged until a name is set, then it switches.
  e := pg_temp.mk('', 'dr-e-' || tag);
  PERFORM pg_temp.add_doc(e, 'eee');
  IF pg_temp.slug_of(e) <> 'dr-e-' || tag OR pg_temp.locked_of(e) THEN RAISE EXCEPTION 'blank clinic name switched'; END IF;
  UPDATE public.profiles SET clinic_name = '   ' WHERE id = e;
  IF pg_temp.slug_of(e) <> 'dr-e-' || tag THEN RAISE EXCEPTION 'whitespace name switched'; END IF;
  UPDATE public.profiles SET clinic_name = 'Ee' || tag || ' Care' WHERE id = e;
  IF pg_temp.slug_of(e) <> 'ee' || tag || '-care' THEN RAISE EXCEPTION 'late name did not switch: %', pg_temp.slug_of(e); END IF;

  -- E: collisions: name taken -> name-city; that taken too -> -2.
  x := pg_temp.mk('Xx', 'ff' || tag || '-care');               -- holds the plain name address
  f := pg_temp.mk('Ff' || tag || ' Care', 'dr-f-' || tag);
  PERFORM pg_temp.add_doc(f, 'eff');
  IF pg_temp.slug_of(f) <> 'ff' || tag || '-care-kota' THEN RAISE EXCEPTION 'name-city fallback wrong: %', pg_temp.slug_of(f); END IF;
  x := pg_temp.mk('Xx2', 'gg' || tag || '-care');            -- plain name taken
  y := pg_temp.mk('Xy', 'gg' || tag || '-care-kota');        -- name-city taken too
  g := pg_temp.mk('Gg' || tag || ' Care', 'dr-g-' || tag);
  PERFORM pg_temp.add_doc(g, 'gee');
  IF pg_temp.slug_of(g) <> 'gg' || tag || '-care-2' THEN RAISE EXCEPTION 'numbered fallback wrong: %', pg_temp.slug_of(g); END IF;

  -- F: a failing switch never blocks the doctor insert (simulated by a broken apply function).
  h1 := pg_temp.mk('Hh' || tag || ' Clinic', 'dr-h-' || tag);
  EXECUTE $f$CREATE OR REPLACE FUNCTION public.apply_team_clinic_address(_clinic uuid) RETURNS void
             LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''boom''; END'$f$;
  pe := pg_temp.add_doc(h1, 'hache');
  IF pe IS NULL OR NOT EXISTS (SELECT 1 FROM public.practitioners WHERE id = pe) THEN RAISE EXCEPTION 'doctor insert blocked by failing switch'; END IF;
  IF pg_temp.slug_of(h1) <> 'dr-h-' || tag THEN RAISE EXCEPTION 'address changed despite failure'; END IF;

  -- G: legacy-format slugs on single-doctor clinics are untouched.
  h2 := pg_temp.mk('Ii' || tag, 'Legacy_Slug_' || tag);
  IF pg_temp.slug_of(h2) <> 'Legacy_Slug_' || tag THEN RAISE EXCEPTION 'legacy slug changed'; END IF;

  RAISE NOTICE 'ok';
END $$;
SELECT 'pass' AS result;
ROLLBACK;
