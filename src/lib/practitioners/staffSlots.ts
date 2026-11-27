import { DEFAULT_SLOT_DURATION_MINUTES, generateTimeSlots } from "../timeSlots";
import { hoursFor, type HoursRow } from "./hours";

/** The list staff booking used before it followed working hours. Only used when a clinic has no hours at all. */
export const LEGACY_STAFF_SLOTS = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00"];

export type StaffSlotMode =
  /** No hours configured anywhere: the legacy list. */
  | "default"
  /** Slots made from the doctor's hours for that weekday. */
  | "hours"
  /** The doctor is closed that day (or has no hours row for it): walk-in only. */
  | "closed"
  /** Multi-doctor clinic and no doctor chosen yet. */
  | "no_doctor";

/** Weekday (0 = Sunday) of a "YYYY-MM-DD" calendar date, whatever the browser's time zone is. */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();
}

export interface StaffSlotInput {
  /** Every working_hours row of the clinic (rows without a numeric day_of_week are ignored). */
  rows: HoursRow[];
  date: string;
  isMulti: boolean;
  /** The doctor chosen in the dialog (multi-doctor clinics). */
  practitionerId: string | null;
  /** The clinic's primary doctor, whose rows a single-doctor clinic uses. */
  primaryId: string | null;
  durationMinutes: number | null | undefined;
}

/** Bookable "HH:MM" start times for staff booking, before past times today are removed. */
export function staffSlotsFor(i: StaffSlotInput): { slots: string[]; mode: StaffSlotMode } {
  const rows = i.rows.filter((r) => typeof r.day_of_week === "number");
  if (rows.length === 0) return { slots: LEGACY_STAFF_SLOTS, mode: "default" };
  let own: HoursRow[];
  if (i.isMulti) {
    if (!i.practitionerId) return { slots: [], mode: "no_doctor" };
    own = hoursFor(rows, i.practitionerId);
  } else {
    const primary = i.primaryId ? hoursFor(rows, i.primaryId) : [];
    own = primary.length > 0 ? primary : rows;
  }
  const wh = own.find((r) => r.day_of_week === weekdayOf(i.date));
  if (!wh?.is_open) return { slots: [], mode: "closed" };
  const step = i.durationMinutes && i.durationMinutes > 0 ? i.durationMinutes : DEFAULT_SLOT_DURATION_MINUTES;
  const slots = [
    ...generateTimeSlots(wh.start_time, wh.end_time, step),
    ...generateTimeSlots(wh.start_time_2, wh.end_time_2, step),
  ];
  return { slots, mode: slots.length ? "hours" : "closed" };
}
