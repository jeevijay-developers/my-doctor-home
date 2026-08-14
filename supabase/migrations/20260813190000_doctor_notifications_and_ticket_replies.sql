-- Ticket replies: single reply per ticket (not a threaded messages table).
-- support_tickets already exists with no reply/threading model; a doctor's
-- own module surfaces this directly on the ticket, so one reply slot per
-- ticket is the simplest correct model for a first version. Superadmin can
-- re-send a reply, which overwrites the previous one along with replied_at.
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS reply text,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS replied_by uuid REFERENCES auth.users(id);

-- Doctor-facing in-app notifications (bell icon). Deliberately a new table,
-- not a reuse of notification_logs — that table is a patient-facing
-- WhatsApp/SMS delivery log (recipient is a patient, no read/unread state);
-- this is a doctor-facing in-app inbox with read/unread and no delivery
-- provider concept, a different shape entirely.
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('ticket_reply', 'direct_message', 'broadcast')),
  title text NOT NULL,
  message text NOT NULL,
  ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  sender_id uuid REFERENCES auth.users(id),
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_doctor ON public.notifications(doctor_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors view and update own notifications" ON public.notifications;
CREATE POLICY "Doctors view and update own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = doctor_id);

DROP POLICY IF EXISTS "Doctors mark own notifications read" ON public.notifications;
CREATE POLICY "Doctors mark own notifications read" ON public.notifications
  FOR UPDATE USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);

DROP POLICY IF EXISTS "Admins manage all notifications" ON public.notifications;
CREATE POLICY "Admins manage all notifications" ON public.notifications
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
