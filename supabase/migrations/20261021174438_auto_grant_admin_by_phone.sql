-- Auto-grant platform 'admin' role to a specific bootstrap phone number.
-- Whoever signs up or already has an account with this number (real MSG91
-- OTP signup, or the dev/mock get_or_create_dev_user path) is granted
-- 'admin' in user_roles IN ADDITION to the normal 'doctor' role, so
-- Auth.tsx's has_role('admin') check sends them to /superadmin instead of
-- the normal doctor dashboard. Matches on the last 10 digits so +91/91/bare
-- variants of the number all resolve the same way.
--
-- Real phone-OTP signup populates auth.users.phone directly; the dev/mock
-- path only ever sets raw_user_meta_data->>'phone' (phone column stays
-- NULL there) — so both are checked.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone_digits text;
BEGIN
  IF NEW.raw_user_meta_data->>'account_type' = 'staff' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'doctor');

  v_phone_digits := regexp_replace(COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone', ''), '[^\d]', '', 'g');
  IF right(v_phone_digits, 10) = '9752430783' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- One-time backfill: this number may already have an account created
-- before this migration existed.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin' FROM auth.users u
WHERE right(regexp_replace(COALESCE(u.phone, ''), '[^\d]', '', 'g'), 10) = '9752430783'
   OR right(regexp_replace(COALESCE(u.raw_user_meta_data->>'phone', ''), '[^\d]', '', 'g'), 10) = '9752430783'
ON CONFLICT (user_id, role) DO NOTHING;
