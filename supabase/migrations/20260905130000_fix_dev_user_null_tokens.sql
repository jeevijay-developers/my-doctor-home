-- get_or_create_dev_user's manual INSERT into auth.users left several
-- token/change columns NULL. Supabase-created users always have these as
-- empty string, and GoTrue's admin API (generateLink, verifyOtp, etc.)
-- fails with "Database error finding user" when it scans a NULL into them.
-- Backfill existing dev rows and make the function stop reintroducing NULLs.
UPDATE auth.users
SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, '')
WHERE email LIKE 'dev.%@doctylia.com';

CREATE OR REPLACE FUNCTION public.get_or_create_dev_user(_phone text, _full_name text DEFAULT 'Dev Doctor'::text, _is_signup boolean DEFAULT false)
 RETURNS TABLE(user_id uuid, email text, password text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id uuid;
  v_email text;
  v_digits text;
  v_password text;
  v_encrypted_pw text;
  v_onboarding boolean;
BEGIN
  v_digits := regexp_replace(_phone, '[^\d]', '', 'g');
  IF v_digits = '' THEN
    v_digits := '9752430783';
  END IF;

  v_email := 'dev.' || v_digits || '@doctylia.com';
  v_password := 'DevPassword123!' || substring(v_digits from GREATEST(1, length(v_digits)-3));
  v_onboarding := NOT _is_signup;

  -- Generate valid $2a$10$ bcrypt password hash
  v_encrypted_pw := extensions.crypt(v_password, extensions.gen_salt('bf', 10));

  -- Check if user already exists in auth.users
  SELECT u.id INTO v_user_id FROM auth.users u WHERE u.email = v_email;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();

    -- Insert into auth.users
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      email_change_token_current,
      phone_change,
      phone_change_token,
      reauthentication_token
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      v_email,
      v_encrypted_pw,
      NOW(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object('full_name', _full_name, 'phone', _phone),
      'authenticated',
      'authenticated',
      NOW(),
      NOW(),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    );

    -- Insert into auth.identities (MANDATORY for Supabase GoTrue Auth!)
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_user_id,
      jsonb_build_object('sub', v_user_id, 'email', v_email, 'full_name', _full_name, 'email_verified', true),
      'email',
      v_user_id::text,
      NOW(),
      NOW(),
      NOW()
    );

    -- Create profile record in public.profiles with appropriate onboarding_completed status
    INSERT INTO public.profiles (
      id,
      full_name,
      phone,
      onboarding_completed,
      plan_tier,
      plan_status
    ) VALUES (
      v_user_id,
      _full_name,
      _phone,
      v_onboarding,
      'pro',
      'active'
    ) ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      phone = EXCLUDED.phone,
      onboarding_completed = v_onboarding,
      plan_status = 'active';
  ELSE
    -- Ensure existing user has valid $2a$10$ bcrypt password, provider, and
    -- non-NULL token columns (a NULL here breaks GoTrue's admin API calls).
    UPDATE auth.users
    SET encrypted_password = v_encrypted_pw,
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        raw_app_meta_data = '{"provider": "email", "providers": ["email"]}'::jsonb,
        confirmation_token = COALESCE(confirmation_token, ''),
        recovery_token = COALESCE(recovery_token, ''),
        email_change_token_new = COALESCE(email_change_token_new, ''),
        email_change = COALESCE(email_change, ''),
        email_change_token_current = COALESCE(email_change_token_current, ''),
        phone_change = COALESCE(phone_change, ''),
        phone_change_token = COALESCE(phone_change_token, ''),
        reauthentication_token = COALESCE(reauthentication_token, '')
    WHERE id = v_user_id;

    -- Ensure auth.identities entry exists for existing user
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_user_id,
      jsonb_build_object('sub', v_user_id, 'email', v_email, 'full_name', _full_name, 'email_verified', true),
      'email',
      v_user_id::text,
      NOW(),
      NOW(),
      NOW()
    ) ON CONFLICT (provider, provider_id) DO UPDATE SET
      identity_data = EXCLUDED.identity_data,
      updated_at = NOW();

    -- If this is an explicit signup call, set onboarding_completed = false
    IF _is_signup THEN
      UPDATE public.profiles
      SET onboarding_completed = false
      WHERE id = v_user_id;
    END IF;
  END IF;

  RETURN QUERY SELECT v_user_id, v_email, v_password;
END;
$function$;
