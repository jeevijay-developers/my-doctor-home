import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type DoctorNotification = {
  id: string;
  source_type: "ticket_reply" | "direct_message" | "broadcast" | "trial_warning" | "cap_warning" | "plan_warning";
  title: string;
  message: string;
  ticket_id: string | null;
  is_read: boolean;
  created_at: string;
};

// Backs the admin panel's notification bell — see AdminLayout.tsx. Source
// table is "notifications" (see the 2026-08-13 migration), a doctor-facing
// in-app inbox distinct from notification_logs (patient-facing WhatsApp/SMS
// delivery log, no read/unread state).
//
// Keyed by recipient_user_id (the actual logged-in person — doctor OR a
// specific staff member), NOT doctor_id: a staff member's own auth uid is
// never equal to doctor_id, so filtering by doctor_id would silently show a
// staff session zero notifications, even ones addressed to them. Callers
// must pass the real auth user id (useProfile().authUserId), not
// profile.id (which is deliberately the doctor's id for staff sessions).
export function useDoctorNotifications(recipientUserId: string | undefined) {
  const [notifications, setNotifications] = useState<DoctorNotification[]>([]);
  const [loading, setLoading] = useState(true);

  // Expiry/cap warnings (trial_warning, cap_warning, plan_warning) are
  // inserted server-side by SECURITY DEFINER cron functions — never
  // client-side. A recipient's own session has no INSERT policy on this
  // table (by design: recipients only read/mark-read their own
  // notifications, never write them), and mirroring that logic here would
  // duplicate the cron's dedup/eligibility rules in a second place that
  // drifts out of sync with it.
  const refresh = useCallback(async () => {
    if (!recipientUserId) { setNotifications([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("notifications" as any)
      .select("id, source_type, title, message, ticket_id, is_read, created_at")
      .eq("recipient_user_id", recipientUserId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) console.error("Failed to load notifications:", error.message);
    setNotifications((data as unknown as DoctorNotification[]) ?? []);
    setLoading(false);
  }, [recipientUserId]);

  useEffect(() => { refresh(); }, [refresh]);

  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    await supabase.from("notifications" as any).update({ is_read: true } as any).eq("id", id);
  }, []);

  const markAllAsRead = useCallback(async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase.from("notifications" as any).update({ is_read: true } as any).in("id", unreadIds);
  }, [notifications]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return { notifications, unreadCount, loading, refresh, markAsRead, markAllAsRead };
}
