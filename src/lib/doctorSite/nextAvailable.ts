// Finds the earliest bookable slot for the hero's quick-book card (spec §6.6).
// Uses exactly the booking widget's rules so the two can never disagree:
// slots from `generateTimeSlots` for both sessions, past slots today hidden
// (browser clock, as the widget does), and a slot counts as taken once it has
// one booking (`useSlotAvailability().isFull`).

import { addDays, format, isSameDay } from "date-fns";
import { DEFAULT_SLOT_DURATION_MINUTES, generateTimeSlots } from "../timeSlots";

export type HoursRow = {
  day_of_week: number;
  is_open: boolean;
  start_time: string | null;
  end_time: string | null;
  start_time_2?: string | null;
  end_time_2?: string | null;
};

export type SlotCounts = Record<string, number>;

export type NextAvailable = { date: Date; dateKey: string; time: string };

export const slotsForDay = (row: HoursRow | undefined, slotMinutes: number) =>
  row?.is_open
    ? [
        ...generateTimeSlots(row.start_time, row.end_time, slotMinutes),
        ...generateTimeSlots(row.start_time_2 ?? null, row.end_time_2 ?? null, slotMinutes),
      ]
    : [];

const isFuture = (date: Date, time: string, now: Date) => {
  if (!isSameDay(date, now)) return true;
  const [h, m] = time.split(":").map(Number);
  const slot = new Date(now);
  slot.setHours(h, m, 0, 0);
  return slot.getTime() > now.getTime();
};

/**
 * Walks open days from today for up to `advanceDays`, asking `fetchCounts`
 * (the read-only `get_slot_counts` RPC) only for days that still have future
 * slots, and returns the first free one. Stops at the first hit, so a typical
 * page load makes a single RPC.
 */
export async function findNextAvailable({
  workingHours,
  slotMinutes = DEFAULT_SLOT_DURATION_MINUTES,
  advanceDays = 7,
  now = new Date(),
  fetchCounts,
}: {
  workingHours: HoursRow[];
  slotMinutes?: number;
  advanceDays?: number;
  now?: Date;
  fetchCounts: (dateKey: string) => Promise<SlotCounts>;
}): Promise<NextAvailable | null> {
  for (let offset = 0; offset < Math.max(1, advanceDays); offset++) {
    const date = addDays(now, offset);
    const candidates = slotsForDay(workingHours.find((h) => h.day_of_week === date.getDay()), slotMinutes)
      .filter((time) => isFuture(date, time, now));
    if (candidates.length === 0) continue;

    const dateKey = format(date, "yyyy-MM-dd");
    const counts = await fetchCounts(dateKey);
    const free = candidates.find((time) => (counts[time] || 0) < 1);
    if (free) return { date, dateKey, time: free };
  }
  return null;
}

/** "Today", "Tomorrow" or "Thu, 27 Nov". */
export const relativeDayLabel = (date: Date, now: Date = new Date()) => {
  if (isSameDay(date, now)) return "Today";
  if (isSameDay(date, addDays(now, 1))) return "Tomorrow";
  return format(date, "EEE, d MMM");
};

/** "16:30" -> "4:30 PM". */
export const slotLabel = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${period}`;
};

/** Event the hero dispatches; BookingWidget listens and jumps straight to patient details. */
export const SELECT_SLOT_EVENT = "doctylia:select-slot";
export type SelectSlotDetail = { dateKey: string; time: string; type: "clinic" | "online" };
