-- Staff → Superadmin support tickets + Superadmin → Staff notifications.
--
-- Problem: support_tickets.doctor_id (FK -> profiles) was also being used as
-- "who submitted this", so a staff member's own auth uid (which has no
-- profiles row — see staff_management_core migration) violated the FK on
-- insert. Separately, notifications.doctor_id was the only addressing field,
-- so a superadmin reply could only ever reach the doctor, never the specific
-- staff member who actually opened the ticket.
--
-- Fix: keep doctor_id as the clinic/tenant grouping field (a doctor should
-- still see every ticket raised under their account, staff-submitted or
-- not — matches the existing "Doctors can manage own tickets" FOR ALL
-- policy, left untouched below). Add a separate "who actually submitted /
-- who this is actually for" identity field to each table, decoupled from
-- the clinic-grouping field.

-- ============================================
-- support_tickets: track the actual submitter separately from doctor_id
-- ============================================
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS submitted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_by_name text NOT NULL DEFAULT '';

-- Backfill: every existing ticket was submitted by the doctor themselves.
UPDATE public.support_tickets t
SET submitted_by_user_id = t.doctor_id,
    submitted_by_name = COALESCE(p.full_name, '')
FROM public.profiles p
WHERE t.doctor_id = p.id AND t.submitted_by_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_support_tickets_submitted_by ON public.support_tickets(submitted_by_user_id);

-- Staff can submit their own ticket under their doctor's clinic grouping.
DROP POLICY IF EXISTS "Staff can submit own tickets" ON public.support_tickets;
CREATE POLICY "Staff can submit own tickets" ON public.support_tickets
  FOR INSERT WITH CHECK (
    public.staff_doctor_id((select auth.uid())) = doctor_id
    AND submitted_by_user_id = (select auth.uid())
  );

-- Staff can view only the tickets they personally submitted — a support
-- ticket is a personal channel to superadmin, not shared clinic data, so
-- staff do NOT get visibility into the doctor's own tickets or co-staff's
-- tickets here (unlike the doctor, who already sees everything under their
-- doctor_id via the existing FOR ALL policy below).
DROP POLICY IF EXISTS "Staff can view own tickets" ON public.support_tickets;
CREATE POLICY "Staff can view own tickets" ON public.support_tickets
  FOR SELECT USING (submitted_by_user_id = (select auth.uid()));

-- ============================================
-- notifications: address a notification to whoever it's actually for
-- (doctor or a specific staff member), not just the clinic's doctor_id.
-- ============================================
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS recipient_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Backfill: every existing notification was doctor-addressed.
UPDATE public.notifications
SET recipient_user_id = doctor_id
WHERE recipient_user_id IS NULL;

ALTER TABLE public.notifications
  ALTER COLUMN recipient_user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_user_id, created_at DESC);

-- Replace the doctor_id-only visibility policies with recipient_user_id —
-- this is what actually lets a staff member see a reply addressed to them
-- (previously impossible: auth.uid() = doctor_id can never be true for a
-- staff member's own session).
DROP POLICY IF EXISTS "Doctors view and update own notifications" ON public.notifications;
CREATE POLICY "Recipients view own notifications" ON public.notifications
  FOR SELECT USING ((select auth.uid()) = recipient_user_id);

DROP POLICY IF EXISTS "Doctors mark own notifications read" ON public.notifications;
CREATE POLICY "Recipients mark own notifications read" ON public.notifications
  FOR UPDATE USING ((select auth.uid()) = recipient_user_id) WITH CHECK ((select auth.uid()) = recipient_user_id);
