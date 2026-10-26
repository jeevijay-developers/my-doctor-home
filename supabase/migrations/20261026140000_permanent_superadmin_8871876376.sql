-- Permanent superadmin: 8871876376.
--
-- This number previously had a doctor account (profile, patients,
-- appointments, staff). That account is removed (cascades from auth.users) and
-- the number becomes a pure superadmin: whoever signs up/logs in with it gets
-- the 'admin' role only — no profiles row and no 'doctor' role, so it never
-- appears in the doctors list or goes through doctor onboarding. Auth.tsx
-- already routes has_role('admin') users to /superadmin.
--
-- The existing bootstrap number (9752430783) keeps its old behaviour (doctor +
-- admin).

DELETE FROM auth.users
WHERE right(regexp_replace(COALESCE(phone, ''), '[^\d]', '', 'g'), 10) = '8871876376';

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

  v_phone_digits := regexp_replace(COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone', ''), '[^\d]', '', 'g');

  -- Permanent superadmin-only number.
  IF right(v_phone_digits, 10) = '8871876376' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'doctor');

  IF right(v_phone_digits, 10) = '9752430783' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
