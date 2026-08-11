-- Root-cause fix for "Database error loading user" on doctor deletion.
--
-- Investigation (see delete-doctor-account/index.ts comment for the full
-- writeup): supabase.auth.admin.deleteUser() calls GoTrue's admin API,
-- which internally does its own read of auth.users (joined with
-- auth.identities/mfa/etc.) before it will delete a row. "Database error
-- loading user" is GoTrue's generic wrapper around a failure in THAT read
-- step. Nothing in this project's migrations touches auth.users' RLS,
-- grants, or adds any DELETE trigger (confirmed: the only trigger on
-- auth.users is on_auth_user_created, AFTER INSERT only, so it cannot fire
-- during a delete) — so this isn't something our own schema is doing to
-- the row. It matches a well-documented GoTrue behavior where accounts
-- whose auth.identities row is missing or malformed (e.g. rows created by
-- test/E2E seed scripts that inserted into auth.users directly rather than
-- through a real sign-up) fail GoTrue's internal load, and therefore fail
-- admin.deleteUser() too, for any such account.
--
-- Fix: a SECURITY DEFINER fallback that deletes the auth.users row directly
-- via SQL, used ONLY when the GoTrue Admin API itself couldn't load/delete
-- the row. This is a real, permanent deletion (not a fake success) —
-- auth.users still cascades into profiles/user_roles/doctor_notes/
-- staff_members exactly as it would via the Admin API, since those
-- ON DELETE CASCADE foreign keys live on the tables themselves, not inside
-- GoTrue. It does not touch RLS or JWT verification: this function is
-- reachable ONLY by the service_role (revoked from anon/authenticated), so
-- the only caller is delete-doctor-account's already admin-gated edge
-- function — never a client-side call, and no weaker than the Admin API
-- path it's a fallback for.
CREATE OR REPLACE FUNCTION public.admin_delete_auth_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_auth_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_auth_user(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_auth_user(uuid) TO service_role;
