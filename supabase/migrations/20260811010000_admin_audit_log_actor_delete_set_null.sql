-- Fix: deleting a doctor account can fail with "update or delete on table
-- 'users' violates foreign key constraint 'admin_audit_log_admin_user_id_fkey'"
-- whenever that account has ever performed a superadmin action (tier
-- changes, trial extensions, bulk deletes, etc. via logAdminAction) — the
-- audit log's admin_user_id FK to auth.users(id) had no ON DELETE behavior
-- (default RESTRICT) and was NOT NULL, so Postgres blocked the delete
-- outright to avoid an orphaned reference.
--
-- Fix: SET NULL on delete, not CASCADE — an audit trail should survive the
-- deletion of the account that generated it (that's the point of an audit
-- log), it should just stop pointing at a row that no longer exists.
-- SAAuditLog.tsx already renders admin_user_id with optional chaining
-- (r.admin_user_id?.slice(0, 8)), so a null value here is already handled
-- safely with no frontend changes needed. New inserts via logAdminAction()
-- are unaffected — they always set admin_user_id to the current actor.
ALTER TABLE public.admin_audit_log ALTER COLUMN admin_user_id DROP NOT NULL;

ALTER TABLE public.admin_audit_log DROP CONSTRAINT admin_audit_log_admin_user_id_fkey;

ALTER TABLE public.admin_audit_log
  ADD CONSTRAINT admin_audit_log_admin_user_id_fkey
  FOREIGN KEY (admin_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
