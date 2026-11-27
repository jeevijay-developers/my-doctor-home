-- Multi-doctor P3 (DB3a): services, reviews, blog authors, public doctor cards and the directory
-- become doctor-aware. Everything is additive: new columns default to NULL, no backfill, and a
-- clinic with fewer than 2 ACTIVE doctors gets exactly the same results as before.

-- 1. Services: which doctor offers what. No rows for a service = every doctor offers it. ------
ALTER TABLE public.services DROP CONSTRAINT IF EXISTS services_id_doctor_key;
ALTER TABLE public.services ADD CONSTRAINT services_id_doctor_key UNIQUE (id, doctor_id);

CREATE TABLE IF NOT EXISTS public.service_practitioners (
  service_id      uuid NOT NULL,
  practitioner_id uuid NOT NULL,
  doctor_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (service_id, practitioner_id),
  FOREIGN KEY (service_id, doctor_id)      REFERENCES public.services (id, doctor_id)      ON DELETE CASCADE,
  FOREIGN KEY (practitioner_id, doctor_id) REFERENCES public.practitioners (id, doctor_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_service_practitioners_doctor ON public.service_practitioners (doctor_id);
CREATE INDEX IF NOT EXISTS idx_service_practitioners_practitioner ON public.service_practitioners (practitioner_id);

ALTER TABLE public.service_practitioners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Clinic members can view service doctors" ON public.service_practitioners;
CREATE POLICY "Clinic members can view service doctors" ON public.service_practitioners
  FOR SELECT TO authenticated
  USING (auth.uid() = doctor_id OR public.staff_doctor_id(auth.uid()) = doctor_id OR public.has_role(auth.uid(), 'admin'));
-- Writes only through set_service_practitioners(); the public reads through
-- get_public_service_practitioners(). No client write policy and no anon access.
REVOKE ALL ON public.service_practitioners FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.service_practitioners FROM authenticated;
GRANT SELECT ON public.service_practitioners TO authenticated;

-- Owner, or staff with website.edit. An empty array = offered by all doctors.
CREATE OR REPLACE FUNCTION public.set_service_practitioners(_service_id uuid, _practitioner_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_clinic uuid;
  v_ids    uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;
  v_clinic := CASE
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN v_uid
    WHEN COALESCE(public.staff_has_permission(v_uid, 'website.edit'), false) THEN public.staff_doctor_id(v_uid)
  END;
  IF v_clinic IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;
  PERFORM 1 FROM public.services WHERE id = _service_id AND doctor_id = v_clinic FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;
  v_ids := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(_practitioner_ids, ARRAY[]::uuid[])) AS x);
  IF EXISTS (SELECT 1 FROM unnest(v_ids) AS x
              WHERE x IS NULL
                 OR NOT EXISTS (SELECT 1 FROM public.practitioners
                                 WHERE id = x AND doctor_id = v_clinic AND is_active)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_PRACTITIONER');
  END IF;
  DELETE FROM public.service_practitioners
   WHERE service_id = _service_id AND NOT (practitioner_id = ANY (v_ids));
  INSERT INTO public.service_practitioners (service_id, practitioner_id, doctor_id)
  SELECT _service_id, x, v_clinic FROM unnest(v_ids) AS x
  ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'count', COALESCE(array_length(v_ids, 1), 0));
END;
$$;
REVOKE ALL ON FUNCTION public.set_service_practitioners(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_service_practitioners(uuid, uuid[]) TO authenticated;

-- The public booking site: which services are limited to which doctors (live, onboarded clinics only).
CREATE OR REPLACE FUNCTION public.get_public_service_practitioners(_doctor_id uuid)
RETURNS TABLE(service_id uuid, practitioner_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT sp.service_id, sp.practitioner_id
    FROM public.service_practitioners sp
    JOIN public.services s ON s.id = sp.service_id AND s.active
    JOIN public.profiles pr ON pr.id = sp.doctor_id
   WHERE sp.doctor_id = _doctor_id
     AND pr.onboarding_completed = true
     AND pr.plan_status <> 'cancelled'
$$;
REVOKE ALL ON FUNCTION public.get_public_service_practitioners(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_service_practitioners(uuid) TO anon, authenticated, service_role;

-- public_booking_price: same body as live (20261125100200) except the service match now skips
-- services mapped only to OTHER doctors (falling back to the default fee) and prefers one mapped to
-- this doctor over an unmapped one of the same name.
CREATE OR REPLACE FUNCTION public.public_booking_price(_doctor_id uuid, _service_name text, _type text, _practitioner_id uuid DEFAULT NULL::uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fee numeric;
  v_online numeric;
  v_default numeric;
  v_price numeric;
  v_pid uuid;
BEGIN
  SELECT NULLIF(consultation_fee, 0) INTO v_fee FROM public.practitioners
   WHERE id = _practitioner_id AND doctor_id = _doctor_id;
  IF v_fee IS NULL THEN
    SELECT COALESCE(NULLIF(consultation_fee, 0), 500) INTO v_fee FROM public.profiles WHERE id = _doctor_id;
  END IF;
  v_fee := COALESCE(v_fee, 500);
  SELECT NULLIF(online_fee, 0) INTO v_online FROM public.website_settings WHERE doctor_id = _doctor_id;
  v_default := CASE WHEN _type = 'online' THEN COALESCE(v_online, v_fee) ELSE v_fee END;

  -- A NULL doctor means the primary (same rule as the booking RPCs).
  v_pid := COALESCE(_practitioner_id, public.primary_practitioner_id(_doctor_id));

  SELECT s.price INTO v_price FROM public.services s
   WHERE s.doctor_id = _doctor_id AND s.active = true
     AND lower(btrim(s.name)) = lower(btrim(COALESCE(_service_name, '')))
     AND (s.type = _type OR s.type = 'both')
     AND (NOT EXISTS (SELECT 1 FROM public.service_practitioners sp WHERE sp.service_id = s.id)
          OR EXISTS (SELECT 1 FROM public.service_practitioners sp
                      WHERE sp.service_id = s.id AND sp.practitioner_id = v_pid))
   ORDER BY (s.price > 0) DESC,
            EXISTS (SELECT 1 FROM public.service_practitioners sp
                     WHERE sp.service_id = s.id AND sp.practitioner_id = v_pid) DESC,
            s.sort_order
   LIMIT 1;

  IF v_price IS NOT NULL AND v_price > 0 THEN
    RETURN v_price;
  END IF;
  RETURN v_default;
END;
$function$;

-- 2. Reviews: which doctor, and close the "anonymous review arrives verified and pinned" hole. --
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS practitioner_id uuid REFERENCES public.practitioners(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_practitioner ON public.reviews (practitioner_id) WHERE practitioner_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_review_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_trusted boolean;
BEGIN
  IF NEW.practitioner_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.practitioner_id IS DISTINCT FROM OLD.practitioner_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.practitioners
                    WHERE id = NEW.practitioner_id AND doctor_id = NEW.doctor_id AND is_active) THEN
      RAISE EXCEPTION 'PRACTITIONER_MISMATCH' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    -- The clinic owner, its staff and the service role (no JWT role: cron, migrations) may set
    -- these; everyone else (anon, any other signed-in user) always starts unverified and unpinned.
    v_trusted := COALESCE(auth.role() IS NULL OR auth.role() = 'service_role'
                          OR auth.uid() = NEW.doctor_id
                          OR public.staff_doctor_id(auth.uid()) = NEW.doctor_id, false);
    IF NOT v_trusted THEN
      NEW.is_verified := false;
      NEW.is_pinned := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_review_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_a0_reviews_guard ON public.reviews;
CREATE TRIGGER trg_a0_reviews_guard
  BEFORE INSERT OR UPDATE OF practitioner_id ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.guard_review_write();

-- 3. Blog posts: optional author (a doctor of the same clinic). No backfill. -------------------
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS practitioner_id uuid REFERENCES public.practitioners(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_blog_posts_practitioner ON public.blog_posts (practitioner_id) WHERE practitioner_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_blog_practitioner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.practitioner_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.practitioner_id IS DISTINCT FROM OLD.practitioner_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.practitioners
                    WHERE id = NEW.practitioner_id AND doctor_id = NEW.doctor_id) THEN
      RAISE EXCEPTION 'PRACTITIONER_MISMATCH' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_blog_practitioner() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_blog_practitioner ON public.blog_posts;
CREATE TRIGGER trg_blog_practitioner
  BEFORE INSERT OR UPDATE OF practitioner_id ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.guard_blog_practitioner();

-- 4. get_public_practitioners: + directory_listed, review_count, avg_rating (appended at the end). --
DROP FUNCTION IF EXISTS public.get_public_practitioners(uuid);
CREATE FUNCTION public.get_public_practitioners(_doctor_id uuid)
 RETURNS TABLE(id uuid, display_name text, slug text, specialization text, qualifications text, experience_years integer, bio text, photo_url text, registration_number text, consultation_fee numeric, slot_duration_minutes integer, online_booking boolean, bookable boolean, is_primary boolean, sort_order integer, is_owner boolean, directory_listed boolean, review_count integer, avg_rating numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.display_name, p.slug, p.specialization, p.qualifications,
         p.experience_years, p.bio, p.photo_url, p.registration_number,
         p.consultation_fee, p.slot_duration_minutes, p.online_booking,
         COALESCE(p.online_booking AND public.practitioner_within_seats(p.id), false) AS bookable,
         p.is_primary, p.sort_order,
         (p.user_id IS NOT DISTINCT FROM p.doctor_id) AS is_owner,
         p.directory_listed,
         COALESCE(rv.review_count, 0)::integer AS review_count,
         round(rv.avg_rating::numeric, 1) AS avg_rating
    FROM public.practitioners p
    JOIN public.profiles pr ON pr.id = p.doctor_id
    LEFT JOIN LATERAL (
      SELECT count(*) AS review_count, avg(r.rating) AS avg_rating
        FROM public.reviews r
       WHERE r.practitioner_id = p.id AND r.is_visible = true
    ) rv ON true
   WHERE p.doctor_id = _doctor_id
     AND p.is_active
     AND pr.onboarding_completed = true
     AND pr.plan_status <> 'cancelled'
   ORDER BY p.is_primary DESC, p.sort_order, p.display_name
$function$;
REVOKE ALL ON FUNCTION public.get_public_practitioners(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_practitioners(uuid) TO anon, authenticated, service_role;

-- 5. search_blog_posts: + practitioner_name, practitioner_slug (appended at the end). Set only when
--    the post has an author who is active AND directory_listed AND the clinic has 2+ active doctors.
DROP FUNCTION IF EXISTS public.search_blog_posts(text, text, integer, integer);
CREATE FUNCTION public.search_blog_posts(p_query text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_limit integer DEFAULT 12, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, slug text, title text, excerpt text, category text, featured_image_url text, published_at timestamp with time zone, updated_at timestamp with time zone, reading_minutes integer, doctor_slug text, doctor_name text, doctor_specialization text, doctor_city text, doctor_photo_url text, total_count bigint, practitioner_name text, practitioner_slug text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
    page.total_count,
    au.display_name, au.slug
  FROM page
  JOIN public.blog_posts b ON b.id = page.id
  JOIN public.profiles p ON p.id = page.doctor_id
  LEFT JOIN LATERAL (
    SELECT pr.display_name, pr.slug
      FROM public.practitioners pr
     WHERE pr.id = b.practitioner_id AND pr.doctor_id = b.doctor_id
       AND pr.is_active AND pr.directory_listed
       AND (SELECT count(*) FROM public.practitioners x WHERE x.doctor_id = b.doctor_id AND x.is_active) >= 2
  ) au ON true
  ORDER BY page.published_at DESC NULLS LAST, page.id
$function$;
REVOKE ALL ON FUNCTION public.search_blog_posts(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_blog_posts(text, text, integer, integer) TO anon, authenticated, service_role;

-- 6. Directory ----------------------------------------------------------------------------------
-- One shared definition of "what the directory lists", so search results, their total_count and the
-- facets always count the same rows. A clinic with 2+ ACTIVE doctors lists one entry per
-- directory_listed active doctor INSTEAD of the clinic entry (id = the doctor's id, slug = the
-- clinic's); if none of its doctors is listed, or the clinic has fewer than 2 active doctors, it
-- lists the plain clinic entry exactly as before.
CREATE OR REPLACE FUNCTION public.directory_entries()
RETURNS TABLE(id uuid, slug text, full_name text, specialization text, qualifications text,
              experience_years integer, clinic_name text, city text, state text, locality text,
              pincode text, consultation_fee numeric, profile_photo_url text,
              avg_rating numeric, review_count bigint, practitioner_slug text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  WITH clinics AS (
    SELECT p.id, p.slug, p.full_name, p.specialization, p.qualifications, p.experience_years,
           p.clinic_name, p.city, p.state, p.locality, p.pincode, p.consultation_fee, p.profile_photo_url,
           (SELECT count(*) FROM public.practitioners x WHERE x.doctor_id = p.id AND x.is_active) AS n_active
      FROM public.profiles p
     WHERE p.slug IS NOT NULL AND p.onboarding_completed = true
       AND p.directory_listed = true AND p.plan_status <> 'cancelled'
  ),
  listed AS (
    SELECT pr.*
      FROM public.practitioners pr
      JOIN clinics c ON c.id = pr.doctor_id
     WHERE c.n_active >= 2 AND pr.is_active AND pr.directory_listed
  )
  SELECT c.id, c.slug, c.full_name, c.specialization, c.qualifications, c.experience_years::int,
         c.clinic_name, c.city, c.state, c.locality, c.pincode, c.consultation_fee::numeric, c.profile_photo_url,
         rv.avg_rating::numeric, coalesce(rv.review_count, 0), NULL::text
    FROM clinics c
    LEFT JOIN LATERAL (
      SELECT avg(r.rating) AS avg_rating, count(*) AS review_count
        FROM public.reviews r
       WHERE r.doctor_id = c.id AND r.is_visible = true
    ) rv ON true
   WHERE NOT (c.n_active >= 2 AND EXISTS (SELECT 1 FROM listed l WHERE l.doctor_id = c.id))
  UNION ALL
  SELECT l.id, c.slug, l.display_name,
         COALESCE(l.specialization, c.specialization), COALESCE(l.qualifications, c.qualifications),
         COALESCE(l.experience_years, c.experience_years)::int,
         c.clinic_name, c.city, c.state, c.locality, c.pincode,
         COALESCE(l.consultation_fee, c.consultation_fee)::numeric,
         COALESCE(l.photo_url, c.profile_photo_url),
         rv.avg_rating::numeric, coalesce(rv.review_count, 0), l.slug
    FROM listed l
    JOIN clinics c ON c.id = l.doctor_id
    LEFT JOIN LATERAL (
      SELECT avg(r.rating) AS avg_rating, count(*) AS review_count
        FROM public.reviews r
       WHERE r.practitioner_id = l.id AND r.is_visible = true
    ) rv ON true
$$;
REVOKE ALL ON FUNCTION public.directory_entries() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.directory_entries() TO service_role;

DROP FUNCTION IF EXISTS public.search_doctors(text, text, text, integer, integer);
CREATE FUNCTION public.search_doctors(p_query text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_specialty text DEFAULT NULL::text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, slug text, full_name text, specialization text, qualifications text, experience_years integer, clinic_name text, city text, state text, locality text, consultation_fee numeric, profile_photo_url text, avg_rating numeric, review_count bigint, total_count bigint, practitioner_slug text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH params AS (
    SELECT
      nullif(btrim(lower(p_query)), '') AS q,
      '%' || replace(replace(replace(nullif(btrim(lower(p_query)), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS q_like
  )
  SELECT
    e.id, e.slug, e.full_name, e.specialization, e.qualifications,
    e.experience_years, e.clinic_name, e.city, e.state, e.locality,
    e.consultation_fee, e.profile_photo_url,
    round(e.avg_rating::numeric, 1), e.review_count,
    count(*) OVER (),
    e.practitioner_slug
  FROM public.directory_entries() e
  CROSS JOIN params
  WHERE (p_city IS NULL OR public.directory_slugify(e.city) = p_city)
    AND (p_specialty IS NULL OR public.directory_slugify(e.specialization) = p_specialty)
    AND (
      params.q IS NULL
      OR lower(e.full_name) LIKE params.q_like
      OR lower(e.full_name) % params.q
      OR lower(coalesce(e.specialization, '')) LIKE params.q_like
      OR lower(coalesce(e.clinic_name, '')) LIKE params.q_like
      OR lower(coalesce(e.city, '')) LIKE params.q_like
      OR lower(coalesce(e.locality, '')) LIKE params.q_like
      OR e.pincode = params.q
    )
  ORDER BY
    CASE WHEN params.q IS NULL THEN 0
         ELSE similarity(lower(e.full_name), params.q) END DESC,
    e.avg_rating DESC NULLS LAST,
    e.review_count DESC NULLS LAST,
    (e.profile_photo_url IS NOT NULL) DESC,
    e.full_name ASC,
    e.id ASC
  LIMIT least(greatest(coalesce(p_limit, 24), 1), 100)
  OFFSET greatest(coalesce(p_offset, 0), 0)
$function$;
REVOKE ALL ON FUNCTION public.search_doctors(text, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_doctors(text, text, text, integer, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.directory_facets(p_city text DEFAULT NULL::text)
 RETURNS TABLE(kind text, slug text, label text, doctor_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH listed AS (
    SELECT btrim(e.city) AS city, btrim(e.specialization) AS specialization
    FROM public.directory_entries() e
    WHERE (p_city IS NULL OR public.directory_slugify(e.city) = p_city)
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
$function$;
REVOKE ALL ON FUNCTION public.directory_facets(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.directory_facets(text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
