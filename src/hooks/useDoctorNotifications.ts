import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type DoctorNotification = {
  id: string;
  source_type: "ticket_reply" | "direct_message" | "broadcast";
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
export function useDoctorNotifications(doctorId: string | undefined) {
  const [notifications, setNotifications] = useState<DoctorNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!doctorId) { setNotifications([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("notifications" as any)
      .select("id, source_type, title, message, ticket_id, is_read, created_at")
      .eq("doctor_id", doctorId)
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifications((data as unknown as DoctorNotification[]) ?? []);
    setLoading(false);
  }, [doctorId]);

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
