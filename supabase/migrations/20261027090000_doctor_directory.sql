-- Doctor directory: location detail, opt-out flag, and public search RPCs.
-- Safe to re-run. Apply BEFORE deploying the matching frontend.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS locality text,
  ADD COLUMN IF NOT EXISTS pincode text,
  ADD COLUMN IF NOT EXISTS directory_listed boolean NOT NULL DEFAULT true;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_pincode_format;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pincode_format CHECK (pincode IS NULL OR pincode ~ '^[1-9][0-9]{5}$');

-- Same rule as src/lib/directory/slug.ts: lowercase, runs of non [a-z0-9] -> '-', trim '-'.
CREATE OR REPLACE FUNCTION public.directory_slugify(t text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT trim(both '-' from regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', '-', 'g'))
$$;

CREATE INDEX IF NOT EXISTS idx_profiles_dir_city
  ON public.profiles (public.directory_slugify(city))
  WHERE slug IS NOT NULL AND onboarding_completed = true AND directory_listed = true;
CREATE INDEX IF NOT EXISTS idx_profiles_dir_specialty
  ON public.profiles (public.directory_slugify(specialization))
  WHERE slug IS NOT NULL AND onboarding_completed = true AND directory_listed = true;
CREATE INDEX IF NOT EXISTS idx_profiles_dir_name_trgm
  ON public.profiles USING gin (lower(full_name) extensions.gin_trgm_ops)
  WHERE slug IS NOT NULL AND onboarding_completed = true AND directory_listed = true;
CREATE INDEX IF NOT EXISTS idx_reviews_doctor_visible
  ON public.reviews (doctor_id) WHERE is_visible = true;

-- Public search. SECURITY DEFINER + explicit column list: anon never reads
-- profiles directly through this path and only sees directory-safe fields.
CREATE OR REPLACE FUNCTION public.search_doctors(
  p_query text DEFAULT NULL,
  p_city text DEFAULT NULL,        -- directory slug, e.g. 'kota'
  p_specialty text DEFAULT NULL,   -- directory slug, e.g. 'dermatologist'
  p_limit int DEFAULT 24,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid, slug text, full_name text, specialization text, qualifications text,
  experience_years int, clinic_name text, city text, state text, locality text,
  consultation_fee numeric, profile_photo_url text,
  avg_rating numeric, review_count bigint, total_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH params AS (
    SELECT
      nullif(btrim(lower(p_query)), '') AS q,
      '%' || replace(replace(replace(nullif(btrim(lower(p_query)), ''), '\', '\'), '%', '\%'), '_', '\_') || '%' AS q_like
  )
  SELECT
    p.id, p.slug, p.full_name, p.specialization, p.qualifications,
    p.experience_years::int, p.clinic_name, p.city, p.state, p.locality,
    p.consultation_fee::numeric, p.profile_photo_url,
    round(rv.avg_rating::numeric, 1), coalesce(rv.review_count, 0),
    count(*) OVER ()
  FROM public.profiles p
  CROSS JOIN params
  LEFT JOIN LATERAL (
    SELECT avg(r.rating) AS avg_rating, count(*) AS review_count
    FROM public.reviews r
    WHERE r.doctor_id = p.id AND r.is_visible = true
  ) rv ON true
  WHERE p.slug IS NOT NULL
    AND p.onboarding_completed = true
    AND p.directory_listed = true
    AND p.plan_status <> 'cancelled'
    AND (p_city IS NULL OR public.directory_slugify(p.city) = p_city)
    AND (p_specialty IS NULL OR public.directory_slugify(p.specialization) = p_specialty)
    AND (
      params.q IS NULL
      OR lower(p.full_name) LIKE params.q_like
      OR lower(p.full_name) % params.q
      OR lower(coalesce(p.specialization, '')) LIKE params.q_like
      OR lower(coalesce(p.clinic_name, '')) LIKE params.q_like
      OR lower(coalesce(p.city, '')) LIKE params.q_like
      OR lower(coalesce(p.locality, '')) LIKE params.q_like
    )
  ORDER BY
    CASE WHEN params.q IS NULL THEN 0
         ELSE similarity(lower(p.full_name), params.q) END DESC,
    rv.avg_rating DESC NULLS LAST,
    rv.review_count DESC NULLS LAST,
    (p.profile_photo_url IS NOT NULL) DESC,
    p.full_name ASC
  LIMIT least(greatest(coalesce(p_limit, 24), 1), 100)
  OFFSET greatest(coalesce(p_offset, 0), 0)
$$;

-- Cities (or, when p_city is given, specialties within that city) with doctor counts.
-- Label = most common spelling; on ties, a mixed-case spelling ("Kota") beats "KOTA"/"kota".
CREATE OR REPLACE FUNCTION public.directory_facets(p_city text DEFAULT NULL)
RETURNS TABLE (kind text, slug text, label text, doctor_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH listed AS (
    SELECT btrim(p.city) AS city, btrim(p.specialization) AS specialization
    FROM public.profiles p
    WHERE p.slug IS NOT NULL AND p.onboarding_completed = true
      AND p.directory_listed = true AND p.plan_status <> 'cancelled'
      AND (p_city IS NULL OR public.directory_slugify(p.city) = p_city)
  ),
  c AS (
    SELECT public.directory_slugify(city) AS s, city AS l, count(*) AS n
    FROM listed WHERE p_city IS NULL AND public.directory_slugify(city) <> ''
    GROUP BY 1, 2
  ),
  sp AS (
    SELECT public.directory_slugify(specialization) AS s, specialization AS l, count(*) AS n
    FROM listed WHERE public.directory_slugify(specialization) <> ''
    GROUP BY 1, 2
  )
  SELECT 'city'::text, s, (array_agg(l ORDER BY n DESC, (l = lower(l) OR l = upper(l)), l))[1], sum(n)::bigint
  FROM c GROUP BY s
  UNION ALL
  SELECT 'specialty'::text, s, (array_agg(l ORDER BY n DESC, (l = lower(l) OR l = upper(l)), l))[1], sum(n)::bigint
  FROM sp GROUP BY s
  ORDER BY 1, 4 DESC, 3
$$;

REVOKE ALL ON FUNCTION public.search_doctors(text, text, text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.directory_facets(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_doctors(text, text, text, int, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.directory_facets(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.directory_slugify(text) TO anon, authenticated;
