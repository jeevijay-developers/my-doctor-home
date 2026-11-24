import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_SLOT_DURATION_MINUTES } from "@/lib/timeSlots";
import { findNextAvailable, type HoursRow, type NextAvailable, type SlotCounts } from "@/lib/doctorSite/nextAvailable";

type State = { status: "loading" } | { status: "found"; slot: NextAvailable } | { status: "none" };

type SlotRow = { time_slot: string; booked: number };
type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: SlotRow[] | null; error: { code?: string } | null }>;
};

// Same read-only RPC (and HH:MM key normalisation) as useSlotAvailability.
// If the database still has the older two-argument get_slot_counts (PGRST202 for
// the three-argument call), fall back to it: it counts every booking type, which
// can only make the card more conservative, never advertise a taken slot.
const fetchClinicCounts = (doctorId: string) => async (dateKey: string): Promise<SlotCounts> => {
  const client = supabase as unknown as RpcClient;
  let { data, error } = await client.rpc("get_slot_counts", { _doctor_id: doctorId, _date: dateKey, _appointment_type: "clinic" });
  if (error?.code === "PGRST202") ({ data, error } = await client.rpc("get_slot_counts", { _doctor_id: doctorId, _date: dateKey }));
  if (error) throw error;
  const counts: SlotCounts = {};
  for (const row of data ?? []) {
    const key = String(row.time_slot).replace(/^(\d{2}:\d{2}):\d{2}(\.\d+)?$/, "$1");
    counts[key] = (counts[key] || 0) + Number(row.booked);
  }
  return counts;
};

/**
 * Earliest free clinic slot for the hero's quick-book card. Runs once the page
 * is idle so it never competes with the hero image for the network.
 */
export function useNextAvailable(
  doctorId: string | undefined,
  workingHours: HoursRow[],
  slotMinutes: number | null | undefined,
  advanceDays: number | null | undefined,
) {
  const [state, setState] = useState<State>({ status: "loading" });
  const hoursKey = JSON.stringify(workingHours.map((h) => [h.day_of_week, h.is_open, h.start_time, h.end_time, h.start_time_2, h.end_time_2]));

  useEffect(() => {
    if (!doctorId) return;
    let cancelled = false;
    const run = () =>
      findNextAvailable({
        workingHours,
        slotMinutes: slotMinutes || DEFAULT_SLOT_DURATION_MINUTES,
        // The booking window can be up to a year; the hero only looks two weeks ahead
        // (one RPC per open day at most) and otherwise offers "Choose a time".
        advanceDays: Math.min(advanceDays || 7, 14),
        fetchCounts: fetchClinicCounts(doctorId),
      })
        .then((slot) => !cancelled && setState(slot ? { status: "found", slot } : { status: "none" }))
        .catch(() => !cancelled && setState({ status: "none" }));

    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const handle = idle ? idle(run, { timeout: 1500 }) : window.setTimeout(run, 300);
    return () => {
      cancelled = true;
      if (idle) (window as Window & { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(handle);
      else window.clearTimeout(handle);
    };
    // workingHours is compared by value through hoursKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId, hoursKey, slotMinutes, advanceDays]);

  return state;
}
