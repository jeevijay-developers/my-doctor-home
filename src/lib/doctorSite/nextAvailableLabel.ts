// "Next: Today 4:30 pm" labels for the per-doctor next free slot. Everything is IST (the clinic's
// own calendar), whatever time zone the patient's browser is in. `date` is "YYYY-MM-DD" and
// `time` "HH:MM" or "HH:MM:SS" as get_public_next_available returns them.
import { istDayKey } from "../istDate";

export type NextSlot = { date: string; time: string };

const IST_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

const DAY_MS = 24 * 60 * 60 * 1000;

const isDateKey = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const parseTime = (s: unknown): [number, number] | null => {
  const m = typeof s === "string" ? /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(s) : null;
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? [h, min] : null;
};

/** "16:30:00" -> "4:30 pm". */
export const clockLabel = (time: string): string => {
  const t = parseTime(time);
  if (!t) return "";
  const [h, m] = t;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
};

/** Minutes since midnight IST for `now`. */
const istMinutes = (now: Date): number => {
  const [h, m] = IST_TIME.format(now).split(":").map(Number);
  return h * 60 + m;
};

/** True when the slot has already started (IST), so a stale answer is never shown. */
export const isSlotPast = (slot: NextSlot, now: Date = new Date()): boolean => {
  const t = parseTime(slot.time);
  if (!isDateKey(slot.date) || !t) return true;
  const today = istDayKey(now);
  if (slot.date < today) return true;
  return slot.date === today && t[0] * 60 + t[1] <= istMinutes(now);
};

/** "Today 4:30 pm", "Tomorrow 10:00 am", "Mon 12 Dec, 9:00 am". Empty when the slot is unusable or past. */
export const formatNextAvailable = (slot: NextSlot | null | undefined, now: Date = new Date()): string => {
  if (!slot || isSlotPast(slot, now)) return "";
  const clock = clockLabel(slot.time);
  if (!clock) return "";
  if (slot.date === istDayKey(now)) return `Today ${clock}`;
  if (slot.date === istDayKey(new Date(now.getTime() + DAY_MS))) return `Tomorrow ${clock}`;
  const [y, mo, d] = slot.date.split("-").map(Number);
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })
    .formatToParts(new Date(Date.UTC(y, mo - 1, d)));
  const part = (t: string) => day.find((p) => p.type === t)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")}, ${clock}`;
};
