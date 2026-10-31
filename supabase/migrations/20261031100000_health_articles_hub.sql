-- Health Articles hub: one public index over every listed doctor's published posts.
-- Safe to re-run. Apply BEFORE deploying the matching frontend/Edge change.
-- Depends on directory_slugify() and profiles.directory_listed (20261027090000_doctor_directory.sql)
-- and blog_posts.slug (20261027120000_blog_post_slugs.sql).

ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS hub_hidden boolean NOT NULL DEFAULT false;
-- Set by the app when the doctor used the AI Blog Writer; drives the on-page AI disclosure (Task 7).
ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS ai_assisted boolean NOT NULL DEFAULT false;

-- hub_hidden is a moderation flag: doctors and staff (who can UPDATE their own posts
-- through RLS) must not be able to clear it. Service role / cron / migrations carry no
-- JWT role and are trusted, same convention as guard_appointment_writes.
CREATE OR REPLACE FUNCTION public.guard_blog_hub_hidden()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  was boolean := false;
BEGIN
  -- Same trust rule as guard_appointment_writes: no JWT role (cron, migrations) or the service role.
  -- Anon (role 'anon') is NOT trusted here; RLS gives it no write path to blog_posts anyway.
  IF auth.role() IS NULL OR auth.role() = 'service_role' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN was := OLD.hub_hidden; END IF;
  IF NEW.hub_hidden IS DISTINCT FROM was
     AND NOT (public.has_role(auth.uid(), 'admin') OR public.sa_has_permission(auth.uid(), 'moderation.manage')) THEN
    RAISE EXCEPTION 'HUB_HIDDEN_LOCKED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_blog_hub_hidden ON public.blog_posts;
CREATE TRIGGER guard_blog_hub_hidden
  BEFORE INSERT OR UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.guard_blog_hub_hidden();

-- Matches search_blog_posts' ORDER BY exactly (incl. NULLS LAST) so the planner can walk it.
DROP INDEX IF EXISTS public.idx_blog_posts_hub;
CREATE INDEX IF NOT EXISTS idx_blog_posts_hub
  ON public.blog_posts (published_at DESC NULLS LAST, id) WHERE is_published AND NOT hub_hidden;
CREATE INDEX IF NOT EXISTS idx_blog_posts_hub_category
  ON public.blog_posts (public.directory_slugify(category)) WHERE is_published AND NOT hub_hidden;

-- Slugs end up in public URLs and Edge-rendered HTML; doctors can PATCH blog_posts.slug
-- through PostgREST, so constrain the shape in the database (defence in depth).
-- NOT VALID: new/updated rows are checked, but a legacy row can never make this migration
-- fail. The sibling trigger blog_post_set_slug only GENERATES a slug when it is empty
-- (BEFORE trigger, so it runs before this CHECK); it does not sanitise a supplied one.
ALTER TABLE public.blog_posts DROP CONSTRAINT IF EXISTS blog_posts_slug_format;
ALTER TABLE public.blog_posts ADD CONSTRAINT blog_posts_slug_format
  CHECK (slug IS NULL OR slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$') NOT VALID;

-- Public listing. SECURITY DEFINER + explicit column list: card-safe fields only, and the
-- doctor-level filters RLS does not apply (RLS lets anon read any published post).
-- `content` is read only to compute reading_minutes for the returned page, never returned.
CREATE OR REPLACE FUNCTION public.search_blog_posts(
  p_query text DEFAULT NULL,
  p_category text DEFAULT NULL,     -- directory slug, e.g. 'heart-health'
  p_limit int DEFAULT 12,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid, slug text, title text, excerpt text, category text, featured_image_url text,
  published_at timestamptz, updated_at timestamptz, reading_minutes int,
  doctor_slug text, doctor_name text, doctor_specialization text, doctor_city text,
  doctor_photo_url text, total_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH params AS (
    SELECT
      nullif(btrim(lower(left(p_query, 100))), '') AS q,
      '%' || replace(replace(replace(nullif(btrim(lower(left(p_query, 100))), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS q_like
  ),
  -- Filter, order and paginate over NARROW rows only (id, sort key, window count): the window
  -- must see every eligible post, so it must not carry titles/excerpts, and never `content`
  -- (a wide window spilled to temp files). Card columns and content are fetched afterwards
  -- for just the returned page (<= 48 rows) by primary key.
  page AS (
    SELECT b.id, b.doctor_id, b.published_at, count(*) OVER () AS total_count
    FROM public.blog_posts b
    JOIN public.profiles p ON p.id = b.doctor_id
    CROSS JOIN params
    WHERE b.is_published AND NOT b.hub_hidden
      AND coalesce(btrim(b.slug), '') <> '' AND btrim(b.title) <> ''
      AND p.slug IS NOT NULL AND p.onboarding_completed = true
      AND p.directory_listed = true AND p.plan_status <> 'cancelled'
      AND (p_category IS NULL OR public.directory_slugify(b.category) = p_category)
      AND (
        params.q IS NULL
        OR lower(b.title) LIKE params.q_like
        OR lower(coalesce(b.excerpt, '')) LIKE params.q_like
        OR lower(coalesce(b.category, '')) LIKE params.q_like
        OR lower(p.full_name) LIKE params.q_like
      )
    ORDER BY b.published_at DESC NULLS LAST, b.id
    LIMIT least(greatest(coalesce(p_limit, 12), 1), 48)
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT
    b.id, b.slug, b.title, b.excerpt, b.category, b.featured_image_url,
    b.published_at, b.updated_at,
    greatest(1, ceil(array_length(
      regexp_split_to_array(btrim(regexp_replace(coalesce(b.content, ''), '<[^>]*>', ' ', 'g')), '\s+'), 1
    ) / 200.0))::int,
    p.slug, p.full_name, p.specialization, p.city, p.profile_photo_url,
    page.total_count
  FROM page
  JOIN public.blog_posts b ON b.id = page.id
  JOIN public.profiles p ON p.id = page.doctor_id
  ORDER BY page.published_at DESC NULLS LAST, page.id
$$;

-- Topic list with post counts. Label = most common spelling; ties prefer mixed case.
CREATE OR REPLACE FUNCTION public.blog_facets()
RETURNS TABLE (slug text, label text, post_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH eligible AS (
    SELECT btrim(b.category) AS category
    FROM public.blog_posts b
    JOIN public.profiles p ON p.id = b.doctor_id
    WHERE b.is_published AND NOT b.hub_hidden
      AND coalesce(btrim(b.slug), '') <> '' AND btrim(b.title) <> ''
      AND p.slug IS NOT NULL AND p.onboarding_completed = true
      AND p.directory_listed = true AND p.plan_status <> 'cancelled'
      AND public.directory_slugify(b.category) <> ''
  ),
  c AS (
    SELECT public.directory_slugify(category) AS s, category AS l, count(*) AS n
    FROM eligible GROUP BY 1, 2
  )
  SELECT s, (array_agg(l ORDER BY n DESC, (l = lower(l) OR l = upper(l)), l))[1], sum(n)::bigint
  FROM c GROUP BY s
  ORDER BY 3 DESC, 2
$$;

REVOKE ALL ON FUNCTION public.search_blog_posts(text, text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.blog_facets() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_blog_posts(text, text, int, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.blog_facets() TO anon, authenticated;
