-- Multi-doctor P3 DB3a: doctor-aware services, reviews, blog authors, public doctors and the directory.
-- Rolled back; prints 'pass'. Synthetic data only.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/15_doctor_content.sql
BEGIN;
-- pg_temp copies of the OLD (pre-DB3) bodies, copied from the live definitions, to prove that the
-- new directory functions return exactly the same thing for single-doctor clinics.
CREATE FUNCTION pg_temp.old_search_doctors(p_query text DEFAULT NULL, p_city text DEFAULT NULL, p_specialty text DEFAULT NULL, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, slug text, full_name text, specialization text, qualifications text, experience_years integer, clinic_name text, city text, state text, locality text, consultation_fee numeric, profile_photo_url text, avg_rating numeric, review_count bigint, total_count bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $old1$
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
$old1$;
CREATE FUNCTION pg_temp.old_directory_facets(p_city text DEFAULT NULL)
 RETURNS TABLE(kind text, slug text, label text, doctor_count bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $old2$
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
$old2$;
CREATE FUNCTION pg_temp.as_user(u uuid, r text DEFAULT 'authenticated') RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', CASE WHEN u IS NULL AND r = 'anon' THEN '{"role":"anon"}' WHEN u IS NULL THEN '' ELSE json_build_object('sub', u, 'role', r)::text END, true)
$$;
DO $$
DECLARE
  d  uuid := gen_random_uuid();   -- synthetic polyclinic (owner Dr Zz Owner)
  d2 uuid := gen_random_uuid();   -- another clinic, not onboarded
  d3 uuid := gen_random_uuid();   -- polyclinic whose doctors are all unlisted
  d4 uuid := gen_random_uuid();   -- plain single-doctor clinic
  s_ok uuid := gen_random_uuid(); -- staff with website.edit + reviews.manage
  s_no uuid := gen_random_uuid(); -- staff without website.edit
  stranger uuid := gen_random_uuid();
  pa uuid; pb uuid; pc uuid; pd uuid; p_other uuid; pa3 uuid; pb3 uuid;
  sv_plain uuid; sv_b uuid; sv_a uuid; sv_dup1 uuid; sv_dup2 uuid; sv_other uuid;
  rv uuid;
  r jsonb; n int; m int; price numeric; deflt numeric; t text; v_priv boolean;
  v_old jsonb; v_new jsonb;
  v_real_poly boolean;
  cities text[]; specs text[];
  c text; sp text;
  slug_d text := 'zz-poly-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  combos jsonb;
  k jsonb;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  -- ===== 0. Directory: for every REAL clinic the new functions return exactly what the old ones did =====
  v_real_poly := EXISTS (SELECT 1 FROM public.profiles p
                          WHERE (SELECT count(*) FROM public.practitioners x WHERE x.doctor_id = p.id AND x.is_active) >= 2);
  IF v_real_poly THEN
    RAISE NOTICE 'a real clinic already has 2+ doctors: old-vs-new equality skipped (synthetic checks still run)';
  ELSE
    SELECT array_agg(slug ORDER BY doctor_count DESC, slug) INTO cities FROM pg_temp.old_directory_facets(NULL) WHERE kind = 'city';
    SELECT array_agg(slug ORDER BY doctor_count DESC, slug) INTO specs FROM pg_temp.old_directory_facets(NULL) WHERE kind = 'specialty';
    c := cities[1];  sp := specs[1];
    combos := jsonb_build_array(
      jsonb_build_array(NULL, NULL, NULL, 100, 0),
      jsonb_build_array(NULL, NULL, NULL, 24, 0),
      jsonb_build_array(NULL, c, NULL, 100, 0),
      jsonb_build_array(NULL, NULL, sp, 100, 0),
      jsonb_build_array(NULL, c, sp, 100, 0),
      jsonb_build_array('dr', NULL, NULL, 100, 0),
      jsonb_build_array('a', NULL, NULL, 100, 0),
      jsonb_build_array('%', NULL, NULL, 100, 0),
      jsonb_build_array('zzz-no-such-doctor', NULL, NULL, 100, 0),
      jsonb_build_array(NULL, NULL, NULL, 5, 5),
      jsonb_build_array(NULL, NULL, NULL, 5, 100));
    FOR k IN SELECT * FROM jsonb_array_elements(combos) LOOP
      SELECT jsonb_agg(to_jsonb(o)) INTO v_old FROM pg_temp.old_search_doctors(
        k->>0, k->>1, k->>2, (k->>3)::int, (k->>4)::int) o;
      SELECT jsonb_agg(to_jsonb(x) - 'practitioner_slug') INTO v_new FROM public.search_doctors(
        k->>0, k->>1, k->>2, (k->>3)::int, (k->>4)::int) x;
      IF v_old IS DISTINCT FROM v_new THEN
        RAISE EXCEPTION 'search_doctors differs from the old function for params %', k;
      END IF;
      IF (SELECT bool_or(practitioner_slug IS NOT NULL) FROM public.search_doctors(k->>0, k->>1, k->>2, (k->>3)::int, (k->>4)::int)) THEN
        RAISE EXCEPTION 'practitioner_slug set for a single-doctor clinic row';
      END IF;
    END LOOP;
    IF (SELECT count(*) FROM pg_temp.old_search_doctors(NULL, NULL, NULL, 100, 0)) = 0 THEN
      RAISE NOTICE 'directory has no listed clinics: equality was trivial';
    END IF;
    SELECT jsonb_agg(to_jsonb(o) ORDER BY o.kind, o.slug) INTO v_old FROM pg_temp.old_directory_facets(NULL) o;
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.kind, x.slug) INTO v_new FROM public.directory_facets(NULL) x;
    IF v_old IS DISTINCT FROM v_new THEN RAISE EXCEPTION 'directory_facets(NULL) differs from the old function'; END IF;
    IF c IS NOT NULL THEN
      SELECT jsonb_agg(to_jsonb(o) ORDER BY o.kind, o.slug) INTO v_old FROM pg_temp.old_directory_facets(c) o;
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.kind, x.slug) INTO v_new FROM public.directory_facets(c) x;
      IF v_old IS DISTINCT FROM v_new THEN RAISE EXCEPTION 'directory_facets(city) differs from the old function'; END IF;
    END IF;
  END IF;

  -- ===== Setup =====
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"full_name":"Dr Zz Owner"}'::jsonb
    FROM unnest(ARRAY[d, d2, d3, d4]) AS u;
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"account_type":"staff"}'::jsonb
    FROM unnest(ARRAY[s_ok, s_no]) AS u;
  UPDATE public.profiles SET plan_tier = 'premium', plan_status = 'active', plan_end = now() + interval '30 days',
         onboarding_completed = true, slug = slug_d, city = 'Zzcity', specialization = 'Generalist',
         full_name = 'Dr Zz Owner', clinic_name = 'Zz Clinic', consultation_fee = 400, directory_listed = true
   WHERE id = d;
  UPDATE public.profiles SET onboarding_completed = true, slug = slug_d || '-3', city = 'Zzcity', specialization = 'Generalist',
         full_name = 'Dr Zz Three', plan_status = 'active', directory_listed = true WHERE id = d3;
  UPDATE public.profiles SET onboarding_completed = true, slug = slug_d || '-4', city = 'Zzcity', specialization = 'Generalist',
         full_name = 'Dr Zz Four', plan_status = 'active', directory_listed = true WHERE id = d4;
  UPDATE public.profiles SET onboarding_completed = false WHERE id = d2;
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status)
  VALUES (s_ok, d, 'Web', 'web-' || s_ok, '+1561' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"website.edit": true, "website.view": true, "reviews.manage": true, "reviews.view": true}'::jsonb, d, 'active'),
         (s_no, d, 'NoWeb', 'noweb-' || s_no, '+1562' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"website.view": true}'::jsonb, d, 'active');
  pa := public.primary_practitioner_id(d);
  p_other := public.primary_practitioner_id(d2);
  pa3 := public.primary_practitioner_id(d3);
  UPDATE public.practitioners SET display_name = 'Dr Zz Owner', specialization = 'Generalist', directory_listed = true WHERE id = pa;
  INSERT INTO public.practitioners (doctor_id, display_name, slug, specialization, consultation_fee, is_bookable)
  VALUES (d, 'Dr Zz Bee', 'dr-zz-bee', 'Dermatology', 700, false) RETURNING id INTO pb;
  INSERT INTO public.practitioners (doctor_id, display_name, slug, is_bookable, directory_listed)
  VALUES (d, 'Dr Zz Cee', 'dr-zz-cee', false, false) RETURNING id INTO pc;
  INSERT INTO public.practitioners (doctor_id, display_name, slug, is_bookable, is_active)
  VALUES (d, 'Dr Zz Dee', 'dr-zz-dee', false, false) RETURNING id INTO pd;
  UPDATE public.practitioners SET directory_listed = false WHERE id = pa3;
  INSERT INTO public.practitioners (doctor_id, display_name, slug, is_bookable, directory_listed)
  VALUES (d3, 'Dr Zz Three B', 'dr-zz-three-b', false, false) RETURNING id INTO pb3;

  -- ===== 1. Services: "no rows = every doctor offers it" =====
  INSERT INTO public.services (doctor_id, name, price, type, active, sort_order) VALUES (d, 'Zz Consult', 500, 'both', true, 1) RETURNING id INTO sv_plain;
  INSERT INTO public.services (doctor_id, name, price, type, active, sort_order) VALUES (d, 'Zz Skin Peel', 900, 'both', true, 2) RETURNING id INTO sv_b;
  INSERT INTO public.services (doctor_id, name, price, type, active, sort_order) VALUES (d, 'Zz Scaling', 650, 'both', true, 3) RETURNING id INTO sv_a;
  INSERT INTO public.services (doctor_id, name, price, type, active, sort_order) VALUES (d, 'Zz Dup', 300, 'both', true, 4) RETURNING id INTO sv_dup1;
  INSERT INTO public.services (doctor_id, name, price, type, active, sort_order) VALUES (d, 'Zz Dup', 350, 'both', true, 5) RETURNING id INTO sv_dup2;
  INSERT INTO public.services (doctor_id, name, price, type, active, sort_order) VALUES (d2, 'Zz Other Clinic', 111, 'both', true, 1) RETURNING id INTO sv_other;

  -- Unmapped services price exactly as before for any doctor.
  IF public.public_booking_price(d, 'Zz Consult', 'clinic', pa) <> 500 OR public.public_booking_price(d, 'Zz Consult', 'clinic', pb) <> 500
     OR public.public_booking_price(d, 'Zz Consult', 'clinic', NULL) <> 500 THEN
    RAISE EXCEPTION 'unmapped service price changed';
  END IF;
  deflt := public.public_booking_price(d, 'Zz No Such Service', 'clinic', pa);
  -- The mapping: owner maps the peel to Dr B only, scaling to Dr A only.
  PERFORM pg_temp.as_user(d);
  SET LOCAL ROLE authenticated;
  r := public.set_service_practitioners(sv_b, ARRAY[pb]);
  RESET ROLE;
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION 'owner could not map service: %', r; END IF;
  SET LOCAL ROLE authenticated;
  r := public.set_service_practitioners(sv_a, ARRAY[pa, pa]);   -- duplicates are fine
  RESET ROLE;
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION 'owner could not map service (dups): %', r; END IF;
  PERFORM pg_temp.as_user(NULL);
  IF (SELECT count(*) FROM public.service_practitioners WHERE service_id IN (sv_a, sv_b)) <> 2 THEN RAISE EXCEPTION 'mapping rows wrong'; END IF;
  IF public.public_booking_price(d, 'Zz Skin Peel', 'clinic', pb) <> 900 THEN RAISE EXCEPTION 'mapped doctor should get the service price'; END IF;
  IF public.public_booking_price(d, 'Zz Skin Peel', 'clinic', pa) <> public.public_booking_price(d, 'Zz No Such Service', 'clinic', pa) THEN
    RAISE EXCEPTION 'a service mapped only to another doctor must fall back to the default fee';
  END IF;
  IF public.public_booking_price(d, 'Zz Scaling', 'clinic', pa) <> 650 OR public.public_booking_price(d, 'Zz Scaling', 'clinic', pb) = 650 THEN
    RAISE EXCEPTION 'scaling mapping wrong';
  END IF;
  -- Same-name services: the one mapped to me wins, else the unmapped one.
  PERFORM pg_temp.as_user(d);
  SET LOCAL ROLE authenticated;
  r := public.set_service_practitioners(sv_dup2, ARRAY[pb]);
  RESET ROLE;
  PERFORM pg_temp.as_user(NULL);
  IF public.public_booking_price(d, 'Zz Dup', 'clinic', pb) <> 350 OR public.public_booking_price(d, 'Zz Dup', 'clinic', pa) <> 300 THEN
    RAISE EXCEPTION 'duplicate-name preference wrong: pb % pa %', public.public_booking_price(d, 'Zz Dup', 'clinic', pb), public.public_booking_price(d, 'Zz Dup', 'clinic', pa);
  END IF;
  -- Empty array = offered by all again.
  PERFORM pg_temp.as_user(d);
  SET LOCAL ROLE authenticated;
  r := public.set_service_practitioners(sv_b, ARRAY[]::uuid[]);
  RESET ROLE;
  PERFORM pg_temp.as_user(NULL);
  IF NOT COALESCE((r->>'ok')::boolean, false) OR EXISTS (SELECT 1 FROM public.service_practitioners WHERE service_id = sv_b) THEN
    RAISE EXCEPTION 'empty array should clear the mapping: %', r;
  END IF;
  IF public.public_booking_price(d, 'Zz Skin Peel', 'clinic', pa) <> 900 THEN RAISE EXCEPTION 'cleared mapping should offer to all'; END IF;
  -- Cascade: deleting the service removes its mapping rows.
  DELETE FROM public.services WHERE id = sv_a;
  IF EXISTS (SELECT 1 FROM public.service_practitioners WHERE service_id = sv_a) THEN RAISE EXCEPTION 'mapping rows survived the service'; END IF;

  -- Who may set it.
  PERFORM pg_temp.as_user(s_ok);
  SET LOCAL ROLE authenticated;
  r := public.set_service_practitioners(sv_b, ARRAY[pa, pb]);
  RESET ROLE;
  IF NOT COALESCE((r->>'ok')::boolean, false) THEN RAISE EXCEPTION 'staff with website.edit refused: %', r; END IF;
  PERFORM pg_temp.as_user(s_no);
  SET LOCAL ROLE authenticated;
  r := public.set_service_practitioners(sv_b, ARRAY[pb]);
  RESET ROLE;
  IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'staff without website.edit: %', r; END IF;
  PERFORM pg_temp.as_user(stranger);
  SET LOCAL ROLE authenticated;
  r := public.set_service_practitioners(sv_b, ARRAY[pb]);
  RESET ROLE;
  IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RAISE EXCEPTION 'stranger: %', r; END IF;
  PERFORM pg_temp.as_user(NULL, 'anon');
  SET LOCAL ROLE anon;
  v_priv := false;
  BEGIN
    r := public.set_service_practitioners(sv_b, ARRAY[pb]);
    IF r->>'error' IS DISTINCT FROM 'FORBIDDEN' THEN RESET ROLE; RAISE EXCEPTION 'anon set a mapping: %', r; END IF;
  EXCEPTION WHEN insufficient_privilege THEN v_priv := true;
  END;
  RESET ROLE;
  -- Validation: someone else's doctor, an inactive doctor, someone else's service, an unknown service.
  PERFORM pg_temp.as_user(d);
  SET LOCAL ROLE authenticated;
  r := public.set_service_practitioners(sv_b, ARRAY[p_other]);
  RESET ROLE;
  IF r->>'error' IS DISTINCT FROM 'INVALID_PRACTITIONER' THEN RAISE EXCEPTION 'foreign doctor: %', r; END IF;
  SET LOCAL ROLE authenticated;
  r := public.set_service_practitioners(sv_b, ARRAY[pd]);
  RESET ROLE;
  IF r->>'error' IS DISTINCT FROM 'INVALID_PRACTITIONER' THEN RAISE EXCEPTION 'inactive doctor: %', r; END IF;
  SET LOCAL ROLE authenticated;
  r := public.set_service_practitioners(sv_other, ARRAY[pa]);
  RESET ROLE;
  IF r->>'error' IS DISTINCT FROM 'NOT_FOUND' THEN RAISE EXCEPTION 'foreign service: %', r; END IF;
  SET LOCAL ROLE authenticated;
  r := public.set_service_practitioners(gen_random_uuid(), ARRAY[pa]);
  RESET ROLE;
  IF r->>'error' IS DISTINCT FROM 'NOT_FOUND' THEN RAISE EXCEPTION 'unknown service: %', r; END IF;
  -- A failed call leaves the previous mapping untouched.
  IF (SELECT count(*) FROM public.service_practitioners WHERE service_id = sv_b) <> 2 THEN RAISE EXCEPTION 'failed call changed the mapping'; END IF;

  -- Reading the mapping table directly: members only; anon and strangers get nothing.
  PERFORM pg_temp.as_user(d);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.service_practitioners;
  RESET ROLE;
  IF n <> 3 THEN RAISE EXCEPTION 'owner should read their 3 mapping rows, saw %', n; END IF;
  PERFORM pg_temp.as_user(stranger);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.service_practitioners;
  v_priv := false;
  BEGIN
    INSERT INTO public.service_practitioners (service_id, practitioner_id, doctor_id) VALUES (sv_b, pc, d);
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN v_priv := true;
  END;
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'stranger reads % mapping rows', n; END IF;
  IF NOT v_priv THEN RAISE EXCEPTION 'stranger wrote a mapping row'; END IF;
  PERFORM pg_temp.as_user(NULL, 'anon');
  SET LOCAL ROLE anon;
  v_priv := false;
  BEGIN
    SELECT count(*) INTO n FROM public.service_practitioners;
    IF n <> 0 THEN RESET ROLE; RAISE EXCEPTION 'anon reads % mapping rows', n; END IF;
  EXCEPTION WHEN insufficient_privilege THEN v_priv := true;
  END;
  RESET ROLE;
  -- Cross-clinic rows are impossible (composite FKs).
  BEGIN
    INSERT INTO public.service_practitioners (service_id, practitioner_id, doctor_id) VALUES (sv_b, p_other, d);
    RAISE EXCEPTION 'cross-clinic mapping accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  -- The public RPC: anon gets the rows of a live, onboarded clinic and nothing for others.
  PERFORM pg_temp.as_user(NULL, 'anon');
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM public.get_public_service_practitioners(d);
  RESET ROLE;
  IF n <> 3 THEN RAISE EXCEPTION 'public RPC returned % rows for the onboarded clinic', n; END IF;
  PERFORM pg_temp.as_user(NULL);
  INSERT INTO public.service_practitioners (service_id, practitioner_id, doctor_id) VALUES (sv_other, p_other, d2);
  SELECT count(*) INTO n FROM public.get_public_service_practitioners(d2);
  IF n <> 0 THEN RAISE EXCEPTION 'public RPC leaked a not-onboarded clinic'; END IF;
  UPDATE public.profiles SET onboarding_completed = true, plan_status = 'cancelled' WHERE id = d2;
  SELECT count(*) INTO n FROM public.get_public_service_practitioners(d2);
  IF n <> 0 THEN RAISE EXCEPTION 'public RPC leaked a cancelled clinic'; END IF;
  UPDATE public.profiles SET onboarding_completed = false, plan_status = 'trial' WHERE id = d2;
  IF (SELECT count(*) FROM public.get_public_service_practitioners(gen_random_uuid())) <> 0 THEN RAISE EXCEPTION 'unknown clinic returned rows'; END IF;

  -- ===== 2. Reviews =====
  -- The hole: an anonymous visitor could post an already verified, pinned review.
  PERFORM pg_temp.as_user(NULL, 'anon');
  SET LOCAL ROLE anon;
  INSERT INTO public.reviews (doctor_id, patient_name, rating, review_text, is_verified, is_pinned)
  VALUES (d, 'Anon Reviewer', 5, 'zz anon', true, true) RETURNING id INTO rv;
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM public.reviews WHERE id = rv AND (is_verified OR is_pinned)) THEN RAISE EXCEPTION 'anon review kept verified/pinned'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.reviews WHERE id = rv AND is_visible) THEN RAISE EXCEPTION 'is_visible default changed for anon reviews'; END IF;
  -- Any other signed-in stranger is treated the same.
  PERFORM pg_temp.as_user(stranger);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.reviews (doctor_id, patient_name, rating, review_text, is_verified, is_pinned)
  VALUES (d, 'Stranger Reviewer', 4, 'zz stranger', true, true) RETURNING id INTO rv;
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM public.reviews WHERE id = rv AND (is_verified OR is_pinned)) THEN RAISE EXCEPTION 'stranger review kept verified/pinned'; END IF;
  -- A doctor choice: valid doctor stored; foreign / inactive refused.
  PERFORM pg_temp.as_user(NULL, 'anon');
  SET LOCAL ROLE anon;
  INSERT INTO public.reviews (doctor_id, patient_name, rating, practitioner_id) VALUES (d, 'Anon For B', 5, pb) RETURNING id INTO rv;
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM public.reviews WHERE id = rv AND practitioner_id = pb) THEN RAISE EXCEPTION 'practitioner_id not stored'; END IF;
  FOREACH t IN ARRAY ARRAY['foreign', 'inactive'] LOOP
    PERFORM pg_temp.as_user(NULL, 'anon');
    SET LOCAL ROLE anon;
    BEGIN
      INSERT INTO public.reviews (doctor_id, patient_name, rating, practitioner_id)
      VALUES (d, 'Anon Bad', 3, CASE WHEN t = 'foreign' THEN p_other ELSE pd END);
      RESET ROLE;
      RAISE EXCEPTION 'review with a % doctor accepted', t;
    EXCEPTION WHEN check_violation THEN
      RESET ROLE;
      IF SQLERRM <> 'PRACTITIONER_MISMATCH' THEN RAISE; END IF;
    END;
  END LOOP;
  -- Owner, staff and the service role keep full control.
  PERFORM pg_temp.as_user(d);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.reviews (doctor_id, patient_name, rating, is_verified, is_pinned) VALUES (d, 'Owner Added', 5, true, true) RETURNING id INTO rv;
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM public.reviews WHERE id = rv AND is_verified AND is_pinned) THEN RAISE EXCEPTION 'owner lost verify/pin on insert'; END IF;
  PERFORM pg_temp.as_user(s_ok);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.reviews (doctor_id, patient_name, rating, is_verified, is_pinned) VALUES (d, 'Staff Added', 5, true, true) RETURNING id INTO rv;
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM public.reviews WHERE id = rv AND is_verified AND is_pinned) THEN RAISE EXCEPTION 'staff lost verify/pin on insert'; END IF;
  PERFORM pg_temp.as_user(NULL);
  INSERT INTO public.reviews (doctor_id, patient_name, rating, is_verified, is_pinned) VALUES (d, 'Service Added', 5, true, true) RETURNING id INTO rv;
  IF NOT EXISTS (SELECT 1 FROM public.reviews WHERE id = rv AND is_verified AND is_pinned) THEN RAISE EXCEPTION 'service role lost verify/pin on insert'; END IF;
  -- Moderation by the owner still works on an anon review.
  PERFORM pg_temp.as_user(d);
  SET LOCAL ROLE authenticated;
  UPDATE public.reviews SET is_pinned = true, is_verified = true WHERE doctor_id = d AND patient_name = 'Anon Reviewer';
  GET DIAGNOSTICS n = ROW_COUNT;
  RESET ROLE;
  IF n <> 1 OR NOT EXISTS (SELECT 1 FROM public.reviews WHERE doctor_id = d AND patient_name = 'Anon Reviewer' AND is_pinned AND is_verified) THEN
    RAISE EXCEPTION 'owner could not pin/verify a review afterwards';
  END IF;
  PERFORM pg_temp.as_user(NULL);

  -- ===== 3. Blog authors =====
  INSERT INTO public.blog_posts (doctor_id, title, slug, is_published, published_at, category, practitioner_id)
  VALUES (d, 'ZzUniqBlogTitleQ one', 'zz-uniq-blog-one', true, now(), 'Zzcat', pb);
  INSERT INTO public.blog_posts (doctor_id, title, slug, is_published, published_at, category)
  VALUES (d, 'ZzUniqBlogTitleQ two', 'zz-uniq-blog-two', true, now(), 'Zzcat');
  INSERT INTO public.blog_posts (doctor_id, title, slug, is_published, published_at, category, practitioner_id)
  VALUES (d, 'ZzUniqBlogTitleQ three', 'zz-uniq-blog-three', true, now(), 'Zzcat', pc);
  INSERT INTO public.blog_posts (doctor_id, title, slug, is_published, published_at, category, practitioner_id)
  VALUES (d, 'ZzUniqBlogTitleQ four', 'zz-uniq-blog-four', true, now(), 'Zzcat', pa);
  BEGIN
    INSERT INTO public.blog_posts (doctor_id, title, slug, is_published, practitioner_id)
    VALUES (d, 'ZzUniqBlogTitleQ bad', 'zz-uniq-blog-bad', false, p_other);
    RAISE EXCEPTION 'blog post with another clinic''s doctor accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PRACTITIONER_MISMATCH' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.blog_posts SET practitioner_id = p_other WHERE doctor_id = d AND slug = 'zz-uniq-blog-two';
    RAISE EXCEPTION 'blog update to another clinic''s doctor accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'PRACTITIONER_MISMATCH' THEN RAISE; END IF;
  END;
  UPDATE public.blog_posts SET title = 'ZzUniqBlogTitleQ two!' WHERE doctor_id = d AND slug = 'zz-uniq-blog-two';  -- other edits unaffected
  -- search_blog_posts: new trailing columns, only for a real polyclinic author who is listed + active.
  IF (SELECT count(*) FROM public.search_blog_posts('zzuniqblogtitleq', NULL, 48, 0)) <> 4 THEN RAISE EXCEPTION 'blog search should find the 4 posts'; END IF;
  SELECT pg_get_function_result('public.search_blog_posts(text,text,integer,integer)'::regprocedure) INTO t;
  IF t NOT LIKE '%total_count bigint, practitioner_name text, practitioner_slug text)' THEN RAISE EXCEPTION 'blog search columns not appended at the end: %', t; END IF;
  IF (SELECT practitioner_name FROM public.search_blog_posts('zzuniqblogtitleq one', NULL, 48, 0)) IS DISTINCT FROM 'Dr Zz Bee'
     OR (SELECT practitioner_slug FROM public.search_blog_posts('zzuniqblogtitleq one', NULL, 48, 0)) IS DISTINCT FROM 'dr-zz-bee' THEN
    RAISE EXCEPTION 'post one should carry Dr Bee';
  END IF;
  IF (SELECT practitioner_name FROM public.search_blog_posts('zzuniqblogtitleq two', NULL, 48, 0)) IS NOT NULL THEN RAISE EXCEPTION 'post without author got a name'; END IF;
  IF (SELECT practitioner_name FROM public.search_blog_posts('zzuniqblogtitleq three', NULL, 48, 0)) IS NOT NULL THEN RAISE EXCEPTION 'unlisted doctor named'; END IF;
  IF (SELECT practitioner_name FROM public.search_blog_posts('zzuniqblogtitleq four', NULL, 48, 0)) IS DISTINCT FROM 'Dr Zz Owner' THEN RAISE EXCEPTION 'post four should carry Dr Owner'; END IF;
  UPDATE public.practitioners SET is_active = false WHERE id IN (pb, pc);   -- only Dr A active: no longer a polyclinic
  IF (SELECT count(*) FROM public.search_blog_posts('zzuniqblogtitleq', NULL, 48, 0) WHERE practitioner_name IS NOT NULL) <> 0 THEN
    RAISE EXCEPTION 'single-doctor clinic posts must carry no practitioner';
  END IF;
  UPDATE public.practitioners SET is_active = true WHERE id IN (pb, pc);

  -- ===== 4. get_public_practitioners =====
  INSERT INTO public.reviews (doctor_id, patient_name, rating, practitioner_id, is_visible) VALUES (d, 'Zz R1', 4, pb, true), (d, 'Zz R2', 5, pb, true), (d, 'Zz R3', 1, pb, false);
  INSERT INTO public.reviews (doctor_id, patient_name, rating, is_visible) VALUES (d, 'Zz R4', 3, true);
  SELECT pg_get_function_result('public.get_public_practitioners(uuid)'::regprocedure) INTO t;
  IF t NOT LIKE '%is_owner boolean, directory_listed boolean, review_count integer, avg_rating numeric)' THEN
    RAISE EXCEPTION 'get_public_practitioners columns not appended at the end: %', t;
  END IF;
  PERFORM pg_temp.as_user(NULL, 'anon');
  SET LOCAL ROLE anon;
  SELECT review_count, avg_rating INTO n, price FROM public.get_public_practitioners(d) WHERE id = pb;
  SELECT review_count INTO m FROM public.get_public_practitioners(d) WHERE id = pa;
  RESET ROLE;
  IF n <> 3 OR price IS DISTINCT FROM 4.7 THEN RAISE EXCEPTION 'Dr B rating wrong: % %', n, price; END IF;
  IF m <> 0 OR (SELECT avg_rating FROM public.get_public_practitioners(d) WHERE id = pa) IS NOT NULL THEN RAISE EXCEPTION 'Dr A with no reviews should have 0 / NULL'; END IF;
  IF (SELECT directory_listed FROM public.get_public_practitioners(d) WHERE id = pc) IS DISTINCT FROM false THEN RAISE EXCEPTION 'directory_listed not exposed'; END IF;
  IF (SELECT count(*) FROM public.get_public_practitioners(d)) <> 3 THEN RAISE EXCEPTION 'inactive doctor leaked into public list'; END IF;
  PERFORM pg_temp.as_user(NULL);

  -- ===== 5. Directory: polyclinics emit one row per listed doctor =====
  -- d: Dr A + Dr B listed, Dr C unlisted, Dr D inactive. d3: nobody listed (clinic row). d4: single doctor.
  SELECT count(*) INTO n FROM public.search_doctors(NULL, 'zzcity', NULL, 100, 0);
  IF n <> 4 THEN RAISE EXCEPTION 'expected 4 directory rows (A, B, d3 clinic, d4 clinic), got %', n; END IF;
  IF (SELECT count(DISTINCT total_count) FROM public.search_doctors(NULL, 'zzcity', NULL, 100, 0)) <> 1
     OR (SELECT max(total_count) FROM public.search_doctors(NULL, 'zzcity', NULL, 100, 0)) <> 4 THEN
    RAISE EXCEPTION 'total_count must count the same rows as returned';
  END IF;
  SELECT pg_get_function_result('public.search_doctors(text,text,text,integer,integer)'::regprocedure) INTO t;
  IF t NOT LIKE '%total_count bigint, practitioner_slug text)' THEN RAISE EXCEPTION 'search_doctors column not appended at the end: %', t; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.search_doctors(NULL, 'zzcity', NULL, 100, 0)
                  WHERE id = pb AND slug = slug_d AND practitioner_slug = 'dr-zz-bee' AND full_name = 'Dr Zz Bee'
                    AND specialization = 'Dermatology' AND consultation_fee = 700 AND avg_rating = 4.7 AND review_count = 3) THEN
    RAISE EXCEPTION 'Dr B directory row wrong';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.search_doctors(NULL, 'zzcity', NULL, 100, 0)
                  WHERE id = pa AND slug = slug_d AND practitioner_slug IS NOT NULL AND full_name = 'Dr Zz Owner'
                    AND avg_rating IS NULL AND review_count = 0) THEN
    RAISE EXCEPTION 'Dr A directory row wrong (clinic reviews must not leak into a doctor row)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.search_doctors(NULL, 'zzcity', NULL, 100, 0) WHERE id IN (pc, pd, d)) THEN
    RAISE EXCEPTION 'unlisted/inactive doctor or the polyclinic''s own row listed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.search_doctors(NULL, 'zzcity', NULL, 100, 0) WHERE id = d3 AND practitioner_slug IS NULL AND full_name = 'Dr Zz Three')
     OR NOT EXISTS (SELECT 1 FROM public.search_doctors(NULL, 'zzcity', NULL, 100, 0) WHERE id = d4 AND practitioner_slug IS NULL AND full_name = 'Dr Zz Four') THEN
    RAISE EXCEPTION 'clinic rows (no listed doctor / single doctor) wrong';
  END IF;
  IF (SELECT count(*) FROM public.search_doctors('bee', 'zzcity', NULL, 100, 0)) <> 1 THEN RAISE EXCEPTION 'search by doctor name failed'; END IF;
  IF (SELECT count(*) FROM public.search_doctors(NULL, 'zzcity', 'dermatology', 100, 0)) <> 1 THEN RAISE EXCEPTION 'specialty filter should use the doctor''s specialty'; END IF;
  IF (SELECT count(*) FROM public.search_doctors(NULL, 'zzcity', NULL, 2, 0)) <> 2
     OR (SELECT max(total_count) FROM public.search_doctors(NULL, 'zzcity', NULL, 2, 0)) <> 4 THEN RAISE EXCEPTION 'pagination/total_count wrong'; END IF;
  -- Facets count the same rows.
  SELECT sum(doctor_count) INTO n FROM public.directory_facets('zzcity') WHERE kind = 'specialty';
  IF n <> 4 THEN RAISE EXCEPTION 'specialty facets count % rows, expected 4', n; END IF;
  SELECT doctor_count INTO n FROM public.directory_facets(NULL) WHERE kind = 'city' AND slug = 'zzcity';
  IF n <> 4 THEN RAISE EXCEPTION 'city facet counts % rows, expected 4', n; END IF;
  SELECT doctor_count INTO n FROM public.directory_facets('zzcity') WHERE kind = 'specialty' AND slug = 'dermatology';
  IF n IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'dermatology facet should be 1, got %', n; END IF;
  -- Opt-outs: the clinic-level flag hides everyone; a single-doctor polyclinic collapses back to the clinic row.
  UPDATE public.profiles SET directory_listed = false WHERE id = d;
  IF EXISTS (SELECT 1 FROM public.search_doctors(NULL, 'zzcity', NULL, 100, 0) WHERE id IN (pa, pb)) THEN RAISE EXCEPTION 'unlisted clinic still in directory'; END IF;
  UPDATE public.profiles SET directory_listed = true WHERE id = d;
  UPDATE public.practitioners SET is_active = false WHERE id IN (pb, pc);   -- Dr A alone is active: single-doctor again
  IF NOT EXISTS (SELECT 1 FROM public.search_doctors(NULL, 'zzcity', NULL, 100, 0) WHERE id = d AND practitioner_slug IS NULL)
     OR EXISTS (SELECT 1 FROM public.search_doctors(NULL, 'zzcity', NULL, 100, 0) WHERE id IN (pa, pb)) THEN
    RAISE EXCEPTION 'a clinic left with one active doctor must show its plain clinic row';
  END IF;
  UPDATE public.practitioners SET is_active = true WHERE id IN (pb, pc);
  -- Anon can call both.
  PERFORM pg_temp.as_user(NULL, 'anon');
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM public.search_doctors(NULL, 'zzcity', NULL, 100, 0);
  SELECT count(*) INTO m FROM public.directory_facets('zzcity');
  RESET ROLE;
  IF n <> 4 OR m = 0 THEN RAISE EXCEPTION 'anon directory calls wrong: % %', n, m; END IF;
  -- The internal source is not public (P3 hardening: the SECURITY DEFINER function became the view directory_entries_v).
  PERFORM pg_temp.as_user(NULL, 'anon');
  SET LOCAL ROLE anon;
  v_priv := false;
  BEGIN
    PERFORM count(*) FROM public.directory_entries_v;
  EXCEPTION WHEN insufficient_privilege THEN v_priv := true;
  END;
  RESET ROLE;
  IF NOT v_priv THEN RAISE EXCEPTION 'anon can read directory_entries_v'; END IF;
  PERFORM pg_temp.as_user(NULL);
END $$;
SELECT 'pass' AS result;
ROLLBACK;
