-- ============================================
-- SCHEDULER — periodic invocation of checkup-reminder-worker
-- ============================================
-- Mirrors this project's existing pg_cron usage (see
-- 20260808061916_trial_auto_expiry_cron.sql), extended with pg_net since
-- this job has to reach an Edge Function over HTTP rather than run a plain
-- SQL statement in-process.
--
-- IMPORTANT — ONE-TIME MANUAL STEP REQUIRED AFTER THIS MIGRATION RUNS:
-- The service role key must never be committed to a migration file (it's a
-- secret, this file is in git). Instead this job reads it from Supabase
-- Vault at call time. Before the cron job can succeed, run ONCE in the
-- Supabase SQL Editor (or via the CLI), substituting your project's real
-- service role key from Project Settings → API:
--
--   select vault.create_secret('<your-service-role-key>', 'service_role_key');
--
-- Until that secret exists, cron.schedule below still runs on time, but
-- each invocation's Authorization header will be null and
-- checkup-reminder-worker will reject it with 401 — the worker function
-- itself is unaffected and can still be triggered manually via the
-- doctor-authenticated "Run Reminder Worker" button in the meantime.
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'checkup-reminder-worker',
  '0 * * * *', -- hourly, on the hour
  $$
  SELECT net.http_post(
    url := 'https://atmelijhxsjzjixhdfcu.supabase.co/functions/v1/checkup-reminder-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
