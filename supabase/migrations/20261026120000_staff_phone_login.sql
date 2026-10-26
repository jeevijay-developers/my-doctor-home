-- Staff now sign in with phone + OTP from the main login page (same flow as
-- doctors) instead of username + password on /staff-login.
--
-- Staff auth users therefore carry a confirmed auth.users.phone, mirrored
-- here in staff_members.phone (E.164, e.g. +919876543210) for display/editing.
-- The legacy username/password staff accounts have no phone and are removed;
-- doctors re-create staff with a phone number.

-- One-time removal of all existing (phone-less) staff. Deleting the auth user
-- cascades to staff_members (id REFERENCES auth.users ON DELETE CASCADE).
DELETE FROM auth.users WHERE id IN (SELECT id FROM public.staff_members);

ALTER TABLE public.staff_members ADD COLUMN phone text;
ALTER TABLE public.staff_members ALTER COLUMN phone SET NOT NULL;
ALTER TABLE public.staff_members
  ADD CONSTRAINT staff_members_phone_e164 CHECK (phone ~ '^\+[1-9][0-9]{7,14}$');
CREATE UNIQUE INDEX idx_staff_members_phone ON public.staff_members (phone);

-- Staff cannot change their own phone (it is their login identity); the owning
-- doctor / staff.edit holders change it through the update-staff-phone edge
-- function, which also updates auth.users.
CREATE OR REPLACE FUNCTION public.enforce_staff_member_update_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.staff_doctor_id(auth.uid()) IS NOT NULL THEN
    IF NEW.staff_name IS DISTINCT FROM OLD.staff_name
       OR NEW.username IS DISTINCT FROM OLD.username
       OR NEW.permissions IS DISTINCT FROM OLD.permissions
       OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id
       OR NEW.phone IS DISTINCT FROM OLD.phone THEN
      IF NOT public.staff_has_permission(auth.uid(), 'staff.edit') THEN
        RAISE EXCEPTION 'Not authorized to edit staff';
      END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT public.staff_has_permission(auth.uid(), 'staff.disable') THEN
        RAISE EXCEPTION 'Not authorized to change staff status';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Records a staff member's login (replaces the write the old staff-login edge
-- function did). No-op for non-staff callers.
CREATE OR REPLACE FUNCTION public.touch_staff_login()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.staff_members SET last_login_at = now() WHERE id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.touch_staff_login() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_staff_login() TO authenticated;

-- Service-role only: ends every session of a user (used when a staff member's
-- login phone changes so the previous number's holder is logged out).
CREATE OR REPLACE FUNCTION public.revoke_user_sessions(_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  DELETE FROM auth.sessions WHERE user_id = _user_id;
$$;
REVOKE ALL ON FUNCTION public.revoke_user_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(uuid) TO service_role;
