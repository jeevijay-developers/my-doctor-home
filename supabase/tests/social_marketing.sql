-- Social media marketing add-on checks (run AFTER 20261127180000 is applied).
--   npx supabase db query --linked -f supabase/tests/social_marketing.sql
-- One transaction, rolled back; any failed check raises an exception.
BEGIN;

DO $$
DECLARE
  d uuid;
  a uuid;
  stranger uuid := gen_random_uuid();
  msg text;
  refused boolean;
  st text;
  n int;
  seen int;
BEGIN
  SELECT user_id INTO a FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF a IS NULL THEN RAISE EXCEPTION 'no superadmin to test with'; END IF;
  SELECT id INTO d FROM public.profiles WHERE id <> a ORDER BY created_at LIMIT 1;
  IF d IS NULL THEN RAISE EXCEPTION 'no doctor profile to test with'; END IF;

  -- trusted setup: a live custom plan for the doctor
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('app.plan_write_ok', 'on', true);
  DELETE FROM public.pending_plans WHERE doctor_id = d;
  DELETE FROM public.doctor_custom_plans WHERE doctor_id = d;
  UPDATE public.profiles SET plan_tier = 'pro', plan_status = 'active', plan_end = now() + interval '20 days', trial_end = NULL WHERE id = d;
  INSERT INTO public.doctor_custom_plans (doctor_id, base_tier, extra_features, removed_features, monthly_price, valid_from, status)
  VALUES (d, 'pro', '{}', '{}', 1800, now() - interval '1 hour', 'active');

  -- 1. A stranger (no superadmin permission) is refused by every RPC
  PERFORM set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  refused := false;
  BEGIN
    PERFORM public.save_social_marketing_scope(d, ARRAY['instagram'], 8, ARRAY['reel'], true, true, 'company', false, false, NULL, 'monthly', 5000, 'each_post', NULL, true, true, current_date, 'email');
  EXCEPTION WHEN raise_exception THEN refused := SQLERRM = 'not authorized'; END;
  IF NOT refused THEN RAISE EXCEPTION 'stranger could save a scope'; END IF;
  refused := false;
  BEGIN PERFORM public.activate_social_marketing(d);
  EXCEPTION WHEN raise_exception THEN refused := SQLERRM = 'not authorized'; END;
  IF NOT refused THEN RAISE EXCEPTION 'stranger could activate'; END IF;
  refused := false;
  BEGIN PERFORM public.end_social_marketing(d);
  EXCEPTION WHEN raise_exception THEN refused := SQLERRM = 'not authorized'; END;
  IF NOT refused THEN RAISE EXCEPTION 'stranger could end'; END IF;

  -- 2. A superadmin saves an incomplete scope: it stays a draft and cannot be activated
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  st := public.save_social_marketing_scope(d, ARRAY['instagram'], 8, ARRAY['reel'], true, true, 'company', false, false, NULL, 'monthly', 5000, 'each_post', 'note', false, false, NULL, NULL);
  IF st <> 'draft' THEN RAISE EXCEPTION 'expected draft, got %', st; END IF;
  refused := false;
  BEGIN PERFORM public.activate_social_marketing(d);
  EXCEPTION WHEN raise_exception THEN msg := SQLERRM; refused := msg LIKE 'SOCIAL_MARKETING_INCOMPLETE%'; END;
  IF NOT refused THEN RAISE EXCEPTION 'activation was not refused for a missing access/agreement'; END IF;
  IF msg NOT LIKE '%access_confirmed%' OR msg NOT LIKE '%agreement%' THEN RAISE EXCEPTION 'gate message wrong: %', msg; END IF;

  -- a draft is invisible to the clinic
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO seen FROM public.custom_plan_social_marketing WHERE doctor_id = d;
  RESET ROLE;
  IF seen <> 0 THEN RAISE EXCEPTION 'the clinic can see an unconfirmed draft'; END IF;

  -- 3. Complete it and activate
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  st := public.save_social_marketing_scope(d, ARRAY['instagram'], 8, ARRAY['reel'], true, true, 'company', false, false, NULL, 'monthly', 5000, 'each_post', 'note', true, true, current_date, 'WhatsApp 27 Nov');
  PERFORM public.activate_social_marketing(d);
  SELECT status INTO st FROM public.custom_plan_social_marketing WHERE doctor_id = d;
  IF st <> 'active' THEN RAISE EXCEPTION 'expected active, got %', st; END IF;

  -- the clinic now sees it
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO seen FROM public.custom_plan_social_marketing WHERE doctor_id = d;
  RESET ROLE;
  IF seen <> 1 THEN RAISE EXCEPTION 'the clinic cannot see its active record'; END IF;

  -- and cannot write it directly
  SET LOCAL ROLE authenticated;
  refused := false;
  BEGIN
    UPDATE public.custom_plan_social_marketing SET monthly_fee = 1 WHERE doctor_id = d;
    GET DIAGNOSTICS n = ROW_COUNT;
    refused := n = 0;
  EXCEPTION WHEN insufficient_privilege THEN refused := true; END;
  RESET ROLE;
  IF NOT refused THEN RAISE EXCEPTION 'the clinic could edit its own scope'; END IF;

  -- 4. Re-saving the SAME scope keeps it active
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  st := public.save_social_marketing_scope(d, ARRAY['instagram'], 8, ARRAY['reel'], true, true, 'company', false, false, NULL, 'monthly', 5000, 'each_post', 'edited note', true, true, current_date, 'WhatsApp 27 Nov');
  IF st <> 'active' THEN RAISE EXCEPTION 'a notes-only edit should keep it active, got %', st; END IF;

  -- 5. Changing the scope sends it back to draft and clears the agreement
  st := public.save_social_marketing_scope(d, ARRAY['instagram', 'facebook'], 8, ARRAY['reel'], true, true, 'company', false, false, NULL, 'monthly', 5000, 'each_post', 'edited note', true, true, current_date, 'WhatsApp 27 Nov');
  IF st <> 'draft' THEN RAISE EXCEPTION 'a scope change should reset to draft, got %', st; END IF;
  IF (SELECT agreed FROM public.custom_plan_social_marketing WHERE doctor_id = d) THEN RAISE EXCEPTION 'agreement survived a scope change'; END IF;

  -- 6. Paid ads need an ad-spend figure
  st := public.save_social_marketing_scope(d, ARRAY['instagram'], 8, ARRAY['reel'], true, true, 'company', false, true, NULL, 'monthly', 5000, 'each_post', NULL, true, true, current_date, 'ref');
  refused := false;
  BEGIN PERFORM public.activate_social_marketing(d);
  EXCEPTION WHEN raise_exception THEN refused := SQLERRM LIKE '%ad_spend_monthly%'; END;
  IF NOT refused THEN RAISE EXCEPTION 'paid ads were activated without an ad spend'; END IF;

  -- 7. Ending the custom plan ends the marketing record
  st := public.save_social_marketing_scope(d, ARRAY['instagram'], 8, ARRAY['reel'], true, true, 'company', false, false, NULL, 'monthly', 5000, 'each_post', NULL, true, true, current_date, 'ref');
  PERFORM public.activate_social_marketing(d);
  PERFORM public.cancel_custom_plan(d);
  SELECT status INTO st FROM public.custom_plan_social_marketing WHERE doctor_id = d;
  IF st <> 'ended' THEN RAISE EXCEPTION 'marketing survived its custom plan: %', st; END IF;

  RAISE NOTICE 'social_marketing checks passed';
END $$;

ROLLBACK;
