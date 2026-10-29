import { useCallback, useEffect, useId, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type DoctorNotification = {
  id: string;
  source_type: "ticket_reply" | "direct_message" | "broadcast" | "trial_warning" | "cap_warning" | "plan_warning" | "plan_request" | "paid_no_show";
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
  // Counted on the server, so unread items older than the 30 shown still count.
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const requestSeq = useRef(0);
  const instanceId = useId();

  // Expiry/cap warnings (trial_warning, cap_warning, plan_warning) are
  // inserted server-side by SECURITY DEFINER cron functions — never
  // client-side. A recipient's own session has no INSERT policy on this
  // table (by design: recipients only read/mark-read their own
  // notifications, never write them), and mirroring that logic here would
  // duplicate the cron's dedup/eligibility rules in a second place that
  // drifts out of sync with it.
  const refresh = useCallback(async () => {
    if (!recipientUserId) { setNotifications([]); setUnreadTotal(0); setLoading(false); return; }
    const seq = ++requestSeq.current;
    const [list, unread] = await Promise.all([
      supabase
        .from("notifications" as any)
        .select("id, source_type, title, message, ticket_id, is_read, created_at")
        .eq("recipient_user_id", recipientUserId)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("notifications" as any)
        .select("id", { count: "exact", head: true })
        .eq("recipient_user_id", recipientUserId)
        .eq("is_read", false),
    ]);
    if (seq !== requestSeq.current) return;
    if (list.error) {
      // Keep what we had rather than blanking the inbox on a transient error.
      console.error("Failed to load notifications:", list.error.message);
    } else {
      setNotifications((list.data as unknown as DoctorNotification[]) ?? []);
      if (!unread.error) setUnreadTotal(unread.count ?? 0);
    }
    setLoading(false);
  }, [recipientUserId]);

  useEffect(() => { refresh(); }, [refresh]);

  // New notifications (a ticket reply, a plan decision, a cron warning) show up
  // without a reload.
  useEffect(() => {
    if (!recipientUserId) return;
    const channel = supabase
      .channel(`notifications-${recipientUserId}-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${recipientUserId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [recipientUserId, instanceId, refresh]);

  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setUnreadTotal((c) => Math.max(0, c - 1));
    const { error } = await supabase.from("notifications" as any).update({ is_read: true } as any).eq("id", id);
    if (error) refresh();
  }, [refresh]);

  const markAllAsRead = useCallback(async () => {
    if (!recipientUserId || unreadTotal === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadTotal(0);
    // By recipient, not by the loaded ids, so unread items beyond the first 30 are cleared too.
    const { error } = await supabase
      .from("notifications" as any)
      .update({ is_read: true } as any)
      .eq("recipient_user_id", recipientUserId)
      .eq("is_read", false);
    if (error) refresh();
  }, [recipientUserId, unreadTotal, refresh]);

  return { notifications, unreadCount: unreadTotal, loading, refresh, markAsRead, markAllAsRead };
}
