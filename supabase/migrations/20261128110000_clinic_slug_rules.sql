-- Clinic website address rules (spec 2026-11-28-multi-doctor-public-site-design.md, D1 + D2).
-- Slug format/reserved words, atomic slug_history written by the database, a public resolver for old
-- slugs, a name-based suggestion, and an owner/staff RPC. Existing slugs are never re-validated:
-- rules apply only when a slug CHANGES (and format rules only to renames, so first-time onboarding
-- with the legacy generator keeps working).

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS slug_locked boolean NOT NULL DEFAULT false;

-- ---------- pure helpers ----------
CREATE OR REPLACE FUNCTION public.slug_is_reserved(_slug text)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
AS $$
  SELECT lower(coalesce(_slug, '')) = ANY (ARRAY[
    'auth','admin','superadmin','doctors','doctor','dr','health-articles','health','articles','rx','pricing','about',
    'features','contact','demo','terms','privacy','refund-policy','refund','onboarding','api','assets','fonts','blog',
    'queue','manage','www','app','login','signup','register','settings','support','help','sitemap','robots','static',
    'public','doctylia','null','undefined','new','edit','dashboard','profile'
  ])
$$;

CREATE OR REPLACE FUNCTION public.slug_is_valid(_slug text)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
AS $$
  SELECT _slug IS NOT NULL
     AND char_length(_slug) BETWEEN 3 AND 50
     AND _slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     AND NOT public.slug_is_reserved(_slug)
$$;

-- Why a slug cannot be used by clinic _clinic: NULL = fine. Own current slug / own history are fine.
CREATE OR REPLACE FUNCTION public.clinic_slug_problem(_slug text, _clinic uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _slug IS NULL OR char_length(_slug) NOT BETWEEN 3 AND 50 OR _slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RETURN 'SLUG_INVALID';
  END IF;
  IF public.slug_is_reserved(_slug) THEN RETURN 'SLUG_RESERVED'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE slug = _slug AND id IS DISTINCT FROM _clinic)
     OR EXISTS (SELECT 1 FROM public.slug_history WHERE old_slug = _slug AND doctor_id IS DISTINCT FROM _clinic) THEN
    RETURN 'SLUG_TAKEN';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.clinic_slug_problem(text, uuid) FROM PUBLIC, anon, authenticated;

-- ---------- trigger: validate + archive ----------
CREATE OR REPLACE FUNCTION public.profiles_slug_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.slug IS NOT DISTINCT FROM OLD.slug OR NEW.slug IS NULL THEN RETURN NEW; END IF;
  -- Never take another clinic's old address (always checked, also for first assignment).
  IF EXISTS (SELECT 1 FROM public.slug_history WHERE old_slug = NEW.slug AND doctor_id <> NEW.id) THEN
    RAISE EXCEPTION 'SLUG_TAKEN' USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(OLD.slug, '') <> '' THEN
    -- A rename: full format + reserved rules.
    IF NEW.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR char_length(NEW.slug) NOT BETWEEN 3 AND 50 THEN
      RAISE EXCEPTION 'SLUG_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF public.slug_is_reserved(NEW.slug) THEN
      RAISE EXCEPTION 'SLUG_RESERVED' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.slug_history (doctor_id, old_slug) VALUES (NEW.id, OLD.slug) ON CONFLICT (old_slug) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_a0_profiles_slug_guard ON public.profiles;
CREATE TRIGGER trg_a0_profiles_slug_guard
  BEFORE UPDATE OF slug ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_slug_guard();

-- History is written only by the trigger now (a client could otherwise squat any address).
DROP POLICY IF EXISTS "Doctors can insert their own slug history" ON public.slug_history;
REVOKE INSERT ON public.slug_history FROM authenticated;

-- ---------- public resolver ----------
CREATE OR REPLACE FUNCTION public.resolve_clinic_slug(_slug text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT p.slug FROM public.profiles p WHERE p.slug = lower(btrim(_slug)) AND p.onboarding_completed = true),
    (SELECT p.slug FROM public.slug_history h JOIN public.profiles p ON p.id = h.doctor_id
      WHERE h.old_slug = lower(btrim(_slug)) AND p.slug IS NOT NULL AND p.onboarding_completed = true)
  )
$$;
REVOKE ALL ON FUNCTION public.resolve_clinic_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_clinic_slug(text) TO anon, authenticated, service_role;

-- ---------- caller's clinic (owner, or staff with profile.edit) ----------
CREATE OR REPLACE FUNCTION public.my_slug_clinic_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid())) THEN (SELECT auth.uid())
    WHEN COALESCE(public.staff_has_permission((SELECT auth.uid()), 'profile.edit'), false)
      THEN public.staff_doctor_id((SELECT auth.uid()))
    ELSE NULL END
$$;
REVOKE ALL ON FUNCTION public.my_slug_clinic_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_slug_clinic_id() TO authenticated;

-- ---------- availability ----------
CREATE OR REPLACE FUNCTION public.is_clinic_slug_available(_slug text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE c uuid := public.my_slug_clinic_id(); p text;
BEGIN
  IF c IS NULL THEN RETURN jsonb_build_object('available', false, 'code', 'NOT_ALLOWED'); END IF;
  p := public.clinic_slug_problem(lower(btrim(_slug)), c);
  RETURN jsonb_build_object('available', p IS NULL, 'code', p);
END $$;
REVOKE ALL ON FUNCTION public.is_clinic_slug_available(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_clinic_slug_available(text) TO authenticated;

-- ---------- suggestion ----------
CREATE OR REPLACE FUNCTION public.suggest_clinic_slug(_clinic_name text, _city text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  c uuid := public.my_slug_clinic_id();
  base text; cty text; cand text; i int;
BEGIN
  IF c IS NULL THEN RETURN NULL; END IF;
  base := public.directory_slugify(_clinic_name);
  IF base = '' THEN base := 'clinic'; END IF;
  base := trim(both '-' from left(base, 44));
  IF char_length(base) < 3 THEN base := base || '-clinic'; END IF;
  cty := trim(both '-' from left(public.directory_slugify(_city), 20));
  IF public.clinic_slug_problem(base, c) IS NULL THEN RETURN base; END IF;
  IF cty <> '' THEN
    cand := trim(both '-' from left(base || '-' || cty, 50));
    IF public.clinic_slug_problem(cand, c) IS NULL THEN RETURN cand; END IF;
  END IF;
  FOR i IN 2..500 LOOP
    cand := base || '-' || i;
    IF public.clinic_slug_problem(cand, c) IS NULL THEN RETURN cand; END IF;
  END LOOP;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.suggest_clinic_slug(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suggest_clinic_slug(text, text) TO authenticated;

-- ---------- set ----------
CREATE OR REPLACE FUNCTION public.set_clinic_slug(_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE c uuid := public.my_slug_clinic_id(); s text := lower(btrim(coalesce(_slug, ''))); p text;
BEGIN
  IF c IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'NOT_ALLOWED'); END IF;
  -- Keeping the current address is always allowed (it may be a legacy slug); it just locks it in.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = c AND slug = s) THEN
    UPDATE public.profiles SET slug_locked = true WHERE id = c;
    RETURN jsonb_build_object('ok', true, 'slug', s);
  END IF;
  p := public.clinic_slug_problem(s, c);
  IF p IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', p); END IF;
  BEGIN
    UPDATE public.profiles SET slug = s, slug_locked = true WHERE id = c;
  EXCEPTION
    WHEN unique_violation THEN RETURN jsonb_build_object('ok', false, 'error', 'SLUG_TAKEN');
    WHEN raise_exception THEN RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
  END;
  RETURN jsonb_build_object('ok', true, 'slug', s);
END $$;
REVOKE ALL ON FUNCTION public.set_clinic_slug(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_clinic_slug(text) TO authenticated;
