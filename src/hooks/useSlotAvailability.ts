import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Reusable hook that returns booked-slot counts and helpers so callers can
 * decide whether a given time_slot is full. It polls every 8s and refreshes
 * on realtime `appointments` changes for the given doctor+date.
 *
 * refresh() returns the fresh counts map so callers can check it directly
 * without relying on React state (which updates asynchronously and would give
 * a stale value if read immediately after await refresh() — the classic
 * stale-closure bug).
 */
const EMPTY: Record<string, number> = {};

export const useSlotAvailability = (
  doctorId: string | null | undefined,
  date: string | null | undefined,
  appointmentType: "clinic" | "online" = "clinic",
  /** Multi-doctor clinics only. Left out of the request when not given, so single-doctor calls are unchanged. */
  practitionerId?: string | null,
) => {
  // Counts are stored with the doctor/date/type they were fetched for, so counts of another
  // key are never shown and a slow earlier response can never overwrite a newer key's counts.
  const key = `${doctorId ?? ""}|${date ?? ""}|${appointmentType}|${practitionerId ?? ""}`;
  const keyRef = useRef(key);
  keyRef.current = key;
  const [stored, setStored] = useState<{ key: string; map: Record<string, number> }>({ key, map: {} });
  const counts = stored.key === key ? stored.map : EMPTY;

  const refresh = useCallback(async (): Promise<Record<string, number>> => {
    if (!doctorId || !date) return {};
    const requestKey = key;
    const args: Record<string, unknown> = { _doctor_id: doctorId, _date: date, _appointment_type: appointmentType };
    if (practitionerId) args._practitioner_id = practitionerId;
    const { data } = await (supabase as any).rpc("get_slot_counts", args);
    const map: Record<string, number> = {};
    (data || []).forEach((r: any) => {
      // get_slot_counts returns time(HH:MM:SS); the UI looks slots up as HH:MM.
      const key = String(r.time_slot).replace(/^(\d{2}:\d{2}):\d{2}(\.\d+)?$/, "$1");
      map[key] = (map[key] || 0) + Number(r.booked);
    });
    if (keyRef.current === requestKey) setStored({ key: requestKey, map });
    return map; // callers can read this directly — no stale closure
  }, [doctorId, date, appointmentType, practitionerId, key]);

  useEffect(() => {
    refresh();
    if (!doctorId || !date) return;
    const interval = setInterval(refresh, 8000);
    const channel = supabase
      .channel(`slots-${doctorId}-${date}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter: `doctor_id=eq.${doctorId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [doctorId, date, refresh]);

  const isFull = (slot: string) => (counts[slot] || 0) >= 1;
  const bookedIn = (slot: string) => counts[slot] || 0;

  return { counts, isFull, bookedIn, refresh };
};
