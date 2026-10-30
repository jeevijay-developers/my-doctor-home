-- 1) Directory search also matches a 6-digit pincode (exact) and escapes
--    backslashes properly in the LIKE pattern.
-- 2) profiles.google_maps_url: the doctor's Google Maps / Business Profile link,
--    published as schema.org hasMap and used as a "Google reviews / directions" link.
-- Safe to re-run. Depends on 20261027090000_doctor_directory.sql.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS google_maps_url text;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_google_maps_url_format;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_google_maps_url_format
  CHECK (google_maps_url IS NULL OR (google_maps_url ~ '^https://[^\s]+$' AND length(google_maps_url) <= 500));

CREATE INDEX IF NOT EXISTS idx_profiles_dir_pincode
  ON public.profiles (pincode)
  WHERE slug IS NOT NULL AND onboarding_completed = true AND directory_listed = true AND pincode IS NOT NULL;

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
      '%' || replace(replace(replace(nullif(btrim(lower(p_query)), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS q_like
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
      OR p.pincode = params.q
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

REVOKE ALL ON FUNCTION public.search_doctors(text, text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_doctors(text, text, text, int, int) TO anon, authenticated;
