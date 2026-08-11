-- Root-cause fix: delete-doctor-account's password confirmation used
-- supabase.auth.signInWithPassword() server-side, but this project has
-- captcha protection enabled on the password grant endpoint — GoTrue logs
-- confirm every such request is rejected with "400: captcha protection:
-- request disallowed (no captcha_token found)" BEFORE the password is even
-- checked, so it failed identically for a correct or incorrect password.
-- An edge function has no way to supply a solved captcha token.
--
-- Fix: verify the password directly against auth.users.encrypted_password
-- (bcrypt, confirmed via its "$2a$" prefix) using pgcrypto's crypt(), which
-- is already installed (schema: extensions) since GoTrue itself relies on
-- it for hashing. This never touches GoTrue's HTTP API, so captcha
-- protection doesn't apply — same reasoning as admin_delete_auth_user's
-- direct-SQL fallback: a real, complete check via the same data GoTrue
-- itself uses, not a suppressed check or fake pass. Reachable only by
-- service_role, exactly like that function.
CREATE OR REPLACE FUNCTION public.admin_verify_password(_user_id uuid, _password text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT encrypted_password = extensions.crypt(_password, encrypted_password)
  FROM auth.users
  WHERE id = _user_id;
$$;

REVOKE ALL ON FUNCTION public.admin_verify_password(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_verify_password(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_verify_password(uuid, text) TO service_role;
