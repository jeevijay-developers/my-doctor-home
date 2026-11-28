-- Automatic clinic website address (spec 2026-11-28-multi-doctor-public-site-design.md, D1; replaces the
-- earlier opt-in banner). When a clinic has 2 or more ACTIVE doctors its address switches to the clinic
-- name, once. The old address is archived by profiles_slug_guard and keeps redirecting. Never reverts
-- (deactivating a doctor, a rename of the clinic, a 3rd doctor all leave it alone: slug_locked = true).

-- ---------- 1. suggestion logic without an auth lookup ----------
CREATE OR REPLACE FUNCTION public.clinic_slug_suggestion(_clinic uuid, _name text, _city text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE base text; cty text; cand text; i int;
BEGIN
  base := public.directory_slugify(_name);
  IF base = '' THEN base := 'clinic'; END IF;
  base := trim(both '-' from left(base, 44));
  IF char_length(base) < 3 THEN base := base || '-clinic'; END IF;
  cty := trim(both '-' from left(public.directory_slugify(_city), 20));
  IF public.clinic_slug_problem(base, _clinic) IS NULL THEN RETURN base; END IF;
  IF cty <> '' THEN
    cand := trim(both '-' from left(base || '-' || cty, 50));
    IF public.clinic_slug_problem(cand, _clinic) IS NULL THEN RETURN cand; END IF;
  END IF;
  FOR i IN 2..500 LOOP
    cand := base || '-' || i;
    IF public.clinic_slug_problem(cand, _clinic) IS NULL THEN RETURN cand; END IF;
  END LOOP;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.clinic_slug_suggestion(uuid, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.suggest_clinic_slug(_clinic_name text, _city text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE c uuid := public.my_slug_clinic_id();
BEGIN
  IF c IS NULL THEN RETURN NULL; END IF;
  RETURN public.clinic_slug_suggestion(c, _clinic_name, _city);
END $$;
REVOKE ALL ON FUNCTION public.suggest_clinic_slug(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suggest_clinic_slug(text, text) TO authenticated;

-- ---------- 2. notification type (keep whatever types already exist) ----------
DO $$
DECLARE def text; vals text[];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'public.notifications'::regclass AND conname = 'notifications_source_type_check';
  IF def IS NOT NULL AND def NOT LIKE '%clinic_address%' THEN
    SELECT array_agg(DISTINCT m[1]) INTO vals FROM regexp_matches(def, '''([a-z_]+)''', 'g') AS m;
    vals := array_append(vals, 'clinic_address'::text);
    ALTER TABLE public.notifications DROP CONSTRAINT notifications_source_type_check;
    EXECUTE format('ALTER TABLE public.notifications ADD CONSTRAINT notifications_source_type_check CHECK (source_type = ANY (%L::text[]))', vals);
  END IF;
END $$;

-- ---------- 3. the switch itself ----------
CREATE OR REPLACE FUNCTION public.apply_team_clinic_address(_clinic uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record; n int; sug text;
BEGIN
  -- Row lock: two doctors added at once switch the address once.
  SELECT id, slug, slug_locked, clinic_name, city, onboarding_completed INTO r
    FROM public.profiles WHERE id = _clinic FOR UPDATE;
  IF NOT FOUND OR r.slug_locked IS TRUE OR r.onboarding_completed IS NOT TRUE
     OR btrim(coalesce(r.clinic_name, '')) = '' THEN
    RETURN;
  END IF;
  SELECT count(*) INTO n FROM public.practitioners WHERE doctor_id = _clinic AND is_active;
  IF n < 2 THEN RETURN; END IF;

  sug := public.clinic_slug_suggestion(_clinic, r.clinic_name, r.city);
  IF sug IS NULL THEN RETURN; END IF;

  IF sug IS NOT DISTINCT FROM r.slug THEN
    UPDATE public.profiles SET slug_locked = true WHERE id = _clinic;
    RETURN;
  END IF;

  UPDATE public.profiles SET slug = sug, slug_locked = true WHERE id = _clinic;
  INSERT INTO public.notifications (doctor_id, recipient_user_id, source_type, title, message)
  VALUES (_clinic, _clinic, 'clinic_address', 'Your website address changed',
          'Your website address is now doctylia.com/dr/' || sug || '. Your old link keeps working.');
END $$;
REVOKE ALL ON FUNCTION public.apply_team_clinic_address(uuid) FROM PUBLIC, anon, authenticated;

-- Trigger wrapper: a failure here (collision race, anything) must never block adding a doctor or
-- renaming the clinic. The sub-transaction rolls back its own partial work.
CREATE OR REPLACE FUNCTION public.trg_auto_clinic_address()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  BEGIN
    IF TG_TABLE_NAME = 'practitioners' THEN
      PERFORM public.apply_team_clinic_address(NEW.doctor_id);
    ELSE
      PERFORM public.apply_team_clinic_address(NEW.id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'auto clinic address skipped: % (%)', SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.trg_auto_clinic_address() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_z_auto_clinic_address_ins ON public.practitioners;
CREATE TRIGGER trg_z_auto_clinic_address_ins
  AFTER INSERT ON public.practitioners
  FOR EACH ROW WHEN (NEW.is_active)
  EXECUTE FUNCTION public.trg_auto_clinic_address();

DROP TRIGGER IF EXISTS trg_z_auto_clinic_address_upd ON public.practitioners;
CREATE TRIGGER trg_z_auto_clinic_address_upd
  AFTER UPDATE OF is_active ON public.practitioners
  FOR EACH ROW WHEN (NEW.is_active AND OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION public.trg_auto_clinic_address();

DROP TRIGGER IF EXISTS trg_z_auto_clinic_address_name ON public.profiles;
CREATE TRIGGER trg_z_auto_clinic_address_name
  AFTER UPDATE OF clinic_name ON public.profiles
  FOR EACH ROW WHEN (OLD.clinic_name IS DISTINCT FROM NEW.clinic_name AND NEW.slug_locked IS NOT TRUE AND btrim(coalesce(NEW.clinic_name, '')) <> '')
  EXECUTE FUNCTION public.trg_auto_clinic_address();

-- ---------- 4. one-time backfill (harmless: skips locked/blank/solo clinics, one failure never stops it) ----------
DO $$
DECLARE c uuid;
BEGIN
  FOR c IN
    SELECT p.id FROM public.profiles p
     WHERE p.slug_locked IS NOT TRUE AND p.onboarding_completed IS TRUE
       AND btrim(coalesce(p.clinic_name, '')) <> ''
       AND (SELECT count(*) FROM public.practitioners x WHERE x.doctor_id = p.id AND x.is_active) >= 2
  LOOP
    BEGIN
      PERFORM public.apply_team_clinic_address(c);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auto clinic address backfill skipped %: %', c, SQLERRM;
    END;
  END LOOP;
END $$;
