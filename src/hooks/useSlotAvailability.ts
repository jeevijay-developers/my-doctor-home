import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Reusable hook that returns booked-slot counts and helpers so callers can
 * decide whether a given time_slot is full. It polls every 8s and refreshes
 * on realtime `appointments` changes for the given doctor+date.
 */
export const useSlotAvailability = (
  doctorId: string | null | undefined,
  date: string | null | undefined,
  maxPerSlot: number = 1
) => {
  const [counts, setCounts] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    if (!doctorId || !date) return;
    const { data } = await (supabase as any).rpc("get_slot_counts", {
      _doctor_id: doctorId,
      _date: date,
    });
    const map: Record<string, number> = {};
    (data || []).forEach((r: any) => {
      map[r.time_slot] = r.booked;
    });
    setCounts(map);
  }, [doctorId, date]);

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

  const isFull = (slot: string) => (counts[slot] || 0) >= maxPerSlot;
  const bookedIn = (slot: string) => counts[slot] || 0;

  return { counts, isFull, bookedIn, refresh, maxPerSlot };
};
