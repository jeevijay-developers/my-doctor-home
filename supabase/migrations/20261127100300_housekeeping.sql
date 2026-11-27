-- Multi-doctor P3 (DB3b): retention for the clinical "record opened" log. The log is a client-called
-- convenience log, not an audit trail (see CLAUDE.md), so it is kept for one year and then purged
-- by a daily job, the same way the plan-expiry jobs are scheduled.

CREATE OR REPLACE FUNCTION public.purge_clinical_access_log()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM public.clinical_access_log WHERE created_at < now() - interval '1 year';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_clinical_access_log() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_clinical_access_log() TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('purge-clinical-access-log')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-clinical-access-log');
  PERFORM cron.schedule('purge-clinical-access-log', '50 3 * * *', 'SELECT public.purge_clinical_access_log();');
END $$;

NOTIFY pgrst, 'reload schema';
