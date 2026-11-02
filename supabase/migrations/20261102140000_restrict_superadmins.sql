-- Restrict platform superadmin access to exactly two phone accounts: 8871876376 and 9752430783.
-- Everyone else loses the 'admin' role and any superadmin-team membership is deactivated
-- (reversible: status = 'inactive', the row is kept). Accounts themselves are NOT deleted.
DO $$
DECLARE
  keep_ids uuid[];
  removed int;
  deactivated int;
BEGIN
  SELECT array_agg(id) INTO keep_ids
    FROM auth.users
   WHERE right(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) IN ('8871876376', '9752430783');

  -- Safety: never run if it would leave nobody (or only one) able to administer the platform.
  IF keep_ids IS NULL OR array_length(keep_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Expected both keeper superadmin accounts, found %', COALESCE(array_length(keep_ids, 1), 0);
  END IF;
  -- ...and both must already hold the admin role.
  IF (SELECT count(*) FROM public.user_roles WHERE role = 'admin' AND user_id = ANY (keep_ids)) < 2 THEN
    RAISE EXCEPTION 'Keeper accounts do not both hold the admin role; refusing to continue';
  END IF;

  DELETE FROM public.user_roles WHERE role = 'admin' AND NOT (user_id = ANY (keep_ids));
  GET DIAGNOSTICS removed = ROW_COUNT;

  UPDATE public.superadmin_team_members SET status = 'inactive', updated_at = now()
   WHERE status = 'active' AND NOT (id = ANY (keep_ids));
  GET DIAGNOSTICS deactivated = ROW_COUNT;

  RAISE NOTICE 'admin roles removed: %, team members deactivated: %', removed, deactivated;
END $$;
