-- A doctor login edits only its own bio / photo / signature (20261127160000). Rolled back; prints 'pass'.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/24_doctor_self_edit.sql
BEGIN;
CREATE FUNCTION pg_temp.as_user(u uuid, r text DEFAULT 'authenticated') RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', CASE WHEN u IS NULL THEN '' ELSE json_build_object('sub', u, 'role', r)::text END, true)
$$;
DO $$
DECLARE
  d uuid := gen_random_uuid(); s_b uuid := gen_random_uuid(); s_c uuid := gen_random_uuid();
  s_rec uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
  pa uuid; pb uuid; pc uuid; r jsonb; row_b public.practitioners%ROWTYPE; before_b public.practitioners%ROWTYPE;
  base text := 'https://x.supabase.co/storage/v1/object/public/doctor-uploads/';
  n int;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  VALUES (d, 'authenticated', 'authenticated', d::text || '@example.test', '{"full_name":"Dr Self"}'::jsonb);
  INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
  SELECT u, 'authenticated', 'authenticated', u::text || '@example.test', '{"account_type":"staff"}'::jsonb
    FROM unnest(ARRAY[s_b, s_c, s_rec]) AS u;
  UPDATE public.profiles SET plan_tier = 'premium', plan_status = 'active', plan_end = now() + interval '30 days' WHERE id = d;
  INSERT INTO public.doctor_feature_overrides (doctor_id, feature_key, enabled, reason, granted_by) VALUES (d, 'multi_doctor', true, 'test', d);
  INSERT INTO public.clinic_doctor_seats (doctor_id, extra_seats, reason) VALUES (d, 3, 'test');
  pa := public.primary_practitioner_id(d);
  INSERT INTO public.practitioners (doctor_id, display_name, slug, registration_number, consultation_fee) VALUES (d, 'Dr Bee', 'dr-bee-self', 'REG-B', 500) RETURNING id INTO pb;
  INSERT INTO public.practitioners (doctor_id, display_name, slug, bio) VALUES (d, 'Dr Cee', 'dr-cee-self', 'cee bio') RETURNING id INTO pc;
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status, role, practitioner_id)
  VALUES (s_b, d, 'Dr Bee', 'drb-' || s_b, '+1531' || lpad((floor(random()*1e7))::int::text, 7, '0'), '{}'::jsonb, d, 'active', 'doctor', pb),
         (s_c, d, 'Dr Cee', 'drc-' || s_c, '+1532' || lpad((floor(random()*1e7))::int::text, 7, '0'), '{}'::jsonb, d, 'active', 'doctor', pc);
  UPDATE public.practitioners SET user_id = s_b WHERE id = pb;
  UPDATE public.practitioners SET user_id = s_c WHERE id = pc;
  INSERT INTO public.staff_members (id, doctor_id, staff_name, username, phone, permissions, created_by, status)
  VALUES (s_rec, d, 'Reception', 'rec-' || s_rec, '+1533' || lpad((floor(random()*1e7))::int::text, 7, '0'),
          '{"practitioners.manage": true, "profile.edit": true}'::jsonb, d, 'active');
  SELECT * INTO before_b FROM public.practitioners WHERE id = pb;

  SET LOCAL ROLE authenticated;
  -- own row: bio + photo + signature
  PERFORM pg_temp.as_user(s_b);
  r := public.update_my_practitioner_profile('  Hello bio  ', base || d || '/practitioners/' || pb || '/photo.jpg?v=123', base || d || '/practitioners/' || pb || '/signature.png');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'own edit refused: %', r; END IF;
  SELECT * INTO row_b FROM public.practitioners WHERE id = pb;
  IF row_b.bio <> 'Hello bio' OR row_b.photo_url IS NULL OR row_b.signature_url IS NULL THEN RAISE EXCEPTION 'own edit not applied'; END IF;
  -- whitelist: nothing else moved
  IF row_b.display_name <> before_b.display_name OR row_b.registration_number IS DISTINCT FROM before_b.registration_number
     OR row_b.consultation_fee IS DISTINCT FROM before_b.consultation_fee OR row_b.slug <> before_b.slug
     OR row_b.is_primary <> before_b.is_primary OR row_b.is_active <> before_b.is_active
     OR row_b.is_bookable <> before_b.is_bookable OR row_b.sort_order <> before_b.sort_order OR row_b.user_id IS DISTINCT FROM before_b.user_id THEN
    RAISE EXCEPTION 'a non-whitelisted field changed';
  END IF;
  -- NULL leaves alone, '' clears
  r := public.update_my_practitioner_profile(NULL, '', NULL);
  SELECT * INTO row_b FROM public.practitioners WHERE id = pb;
  IF NOT (r->>'ok')::boolean OR row_b.photo_url IS NOT NULL OR row_b.bio <> 'Hello bio' OR row_b.signature_url IS NULL THEN RAISE EXCEPTION 'null/clear semantics wrong'; END IF;
  -- too long bio, wrong-doctor URL, foreign host path, wrong file name, javascript URL
  r := public.update_my_practitioner_profile(repeat('x', 2001));
  IF r->>'error' <> 'INVALID' THEN RAISE EXCEPTION 'long bio accepted: %', r; END IF;
  r := public.update_my_practitioner_profile(NULL, base || d || '/practitioners/' || pc || '/photo.jpg');
  IF r->>'error' <> 'INVALID' THEN RAISE EXCEPTION 'other doctor photo URL accepted: %', r; END IF;
  r := public.update_my_practitioner_profile(NULL, base || gen_random_uuid() || '/practitioners/' || pb || '/photo.jpg');
  IF r->>'error' <> 'INVALID' THEN RAISE EXCEPTION 'other clinic photo URL accepted: %', r; END IF;
  r := public.update_my_practitioner_profile(NULL, base || d || '/practitioners/' || pb || '/evil.jpg');
  IF r->>'error' <> 'INVALID' THEN RAISE EXCEPTION 'odd file name accepted: %', r; END IF;
  r := public.update_my_practitioner_profile(NULL, base || d || '/practitioners/' || pb || '/signature.png');
  IF r->>'error' <> 'INVALID' THEN RAISE EXCEPTION 'signature file as photo accepted: %', r; END IF;
  r := public.update_my_practitioner_profile(NULL, 'javascript:alert(1)');
  IF r->>'error' <> 'INVALID' THEN RAISE EXCEPTION 'javascript url accepted: %', r; END IF;

  -- other doctor never touched
  PERFORM pg_temp.as_user(s_c);
  r := public.update_my_practitioner_profile('cee new');
  SELECT count(*) INTO n FROM public.practitioners WHERE id = pb AND bio = 'Hello bio';
  IF n <> 1 THEN RAISE EXCEPTION 'doctor C changed doctor B'; END IF;
  SELECT count(*) INTO n FROM public.practitioners WHERE id = pc AND bio = 'cee new';
  IF n <> 1 THEN RAISE EXCEPTION 'doctor C could not change own bio'; END IF;

  -- reception, owner and stranger are refused; owner still edits through upsert_practitioner
  PERFORM pg_temp.as_user(s_rec);
  r := public.update_my_practitioner_profile('rec');
  IF (r->>'ok')::boolean OR r->>'error' <> 'FORBIDDEN' THEN RAISE EXCEPTION 'reception not refused: %', r; END IF;
  PERFORM pg_temp.as_user(d);
  r := public.update_my_practitioner_profile('owner');
  IF (r->>'ok')::boolean OR r->>'error' <> 'FORBIDDEN' THEN RAISE EXCEPTION 'owner not refused: %', r; END IF;
  r := public.upsert_practitioner(pb, '{"bio":"owner set"}'::jsonb);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'owner upsert broke: %', r; END IF;
  SELECT count(*) INTO n FROM public.practitioners WHERE id = pb AND bio = 'owner set';
  IF n <> 1 THEN RAISE EXCEPTION 'owner upsert not applied'; END IF;
  PERFORM pg_temp.as_user(stranger);
  r := public.update_my_practitioner_profile('x');
  IF (r->>'ok')::boolean OR r->>'error' <> 'FORBIDDEN' THEN RAISE EXCEPTION 'stranger not refused: %', r; END IF;

  -- a deactivated doctor login is refused
  RESET ROLE; PERFORM pg_temp.as_user(NULL);
  UPDATE public.staff_members SET status = 'inactive' WHERE id = s_b;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user(s_b);
  r := public.update_my_practitioner_profile('after off');
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'inactive login not refused: %', r; END IF;
  RESET ROLE; PERFORM pg_temp.as_user(NULL);
  UPDATE public.staff_members SET status = 'active' WHERE id = s_b;

  -- storage policies: own two files only
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.as_user(s_b);
  INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('doctor-uploads', d || '/practitioners/' || pb || '/photo.jpg', s_b);
  INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('doctor-uploads', d || '/practitioners/' || pb || '/signature.png', s_b);
  UPDATE storage.objects SET metadata = '{}'::jsonb WHERE bucket_id = 'doctor-uploads' AND name = d || '/practitioners/' || pb || '/photo.jpg';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'doctor cannot overwrite own photo'; END IF;
  BEGIN INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('doctor-uploads', d || '/practitioners/' || pc || '/photo.jpg', s_b);
    RAISE EXCEPTION 'doctor wrote another doctor''s photo'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('doctor-uploads', d || '/practitioners/' || pb || '/other.jpg', s_b);
    RAISE EXCEPTION 'doctor wrote an arbitrary file'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('doctor-uploads', d || '/practitioners/' || pb || '/sub/photo.jpg', s_b);
    RAISE EXCEPTION 'doctor wrote a deeper path'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('doctor-uploads', d || '/profile.jpg', s_b);
    RAISE EXCEPTION 'doctor wrote the owner profile photo'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('doctor-uploads', gen_random_uuid() || '/practitioners/' || pb || '/photo.jpg', s_b);
    RAISE EXCEPTION 'doctor wrote into another clinic'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- a stranger cannot write doctor files
  PERFORM pg_temp.as_user(stranger);
  BEGIN INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('doctor-uploads', d || '/practitioners/' || pb || '/photo.jpg', stranger);
    RAISE EXCEPTION 'stranger wrote a doctor photo'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;

  -- anon: no execute
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.update_my_practitioner_profile('x');
    RAISE EXCEPTION 'anon could call it';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
END $$;
SELECT 'pass' AS result;
ROLLBACK;
