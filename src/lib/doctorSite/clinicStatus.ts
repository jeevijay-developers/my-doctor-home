// Live "Open now / Closed" status for a clinic, judged in IST (every clinic on the
// platform is in India), whatever time zone the visitor's browser is in.

export type WorkingHoursRow = {
  day_of_week: number; // 0 = Sunday
  is_open: boolean;
  start_time: string | null;
  end_time: string | null;
  start_time_2?: string | null;
  end_time_2?: string | null;
};

export type ClinicStatus =
  | { state: "open"; until: string; label: string }
  | { state: "later-today"; opensAt: string; label: string }
  | { state: "closed"; opensAt: string; opensDay: string; label: string }
  | { state: "unknown"; label: string };

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const IST_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Current IST weekday (0 = Sunday) and minutes since midnight. */
export const istNow = (now: Date = new Date()) => {
  const parts = IST_PARTS.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { day: WEEKDAY_INDEX[get("weekday")] ?? now.getDay(), minutes: Number(get("hour")) * 60 + Number(get("minute")) };
};

const toMinutes = (time: string | null | undefined) => {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  return Number.isNaN(h) ? null : h * 60 + (Number.isNaN(m) ? 0 : m);
};

/** "17:30:00" -> "5:30 PM" (no locale surprises: always 12-hour with AM/PM). */
export const formatClock = (time: string | null | undefined) => {
  const minutes = toMinutes(time);
  if (minutes === null) return "";
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${period}`;
};

/** Open intervals of a day in minutes, sorted, ignoring half-filled or inverted pairs. */
export const dayIntervals = (row: WorkingHoursRow | undefined) => {
  if (!row?.is_open) return [] as { start: number; end: number; startLabel: string; endLabel: string }[];
  return [
    [row.start_time, row.end_time],
    [row.start_time_2 ?? null, row.end_time_2 ?? null],
  ]
    .map(([s, e]) => ({ start: toMinutes(s), end: toMinutes(e), startLabel: formatClock(s), endLabel: formatClock(e) }))
    .filter((i): i is { start: number; end: number; startLabel: string; endLabel: string } =>
      i.start !== null && i.end !== null && i.end > i.start)
    .sort((a, b) => a.start - b.start);
};

export function getClinicStatus(hours: WorkingHoursRow[] | null | undefined, now: Date = new Date()): ClinicStatus {
  const rows = hours ?? [];
  if (!rows.some((r) => dayIntervals(r).length > 0)) return { state: "unknown", label: "" };

  const { day, minutes } = istNow(now);
  const today = dayIntervals(rows.find((r) => r.day_of_week === day));

  const current = today.find((i) => minutes >= i.start && minutes < i.end);
  if (current) return { state: "open", until: current.endLabel, label: `Open now · until ${current.endLabel}` };

  const laterToday = today.find((i) => i.start > minutes);
  if (laterToday) return { state: "later-today", opensAt: laterToday.startLabel, label: `Opens today at ${laterToday.startLabel}` };

  for (let offset = 1; offset <= 7; offset++) {
    const nextDay = (day + offset) % 7;
    const first = dayIntervals(rows.find((r) => r.day_of_week === nextDay))[0];
    if (first) {
      const dayLabel = offset === 1 ? "tomorrow" : DAY_NAMES[nextDay];
      return { state: "closed", opensAt: first.startLabel, opensDay: dayLabel, label: `Closed · opens ${dayLabel} at ${first.startLabel}` };
    }
  }
  return { state: "unknown", label: "" };
}

/** Today's hours as a short string ("9:00 AM – 1:00 PM, 5:00 PM – 8:00 PM"), IST. */
export function todaysHours(hours: WorkingHoursRow[] | null | undefined, now: Date = new Date()) {
  const { day } = istNow(now);
  return dayIntervals((hours ?? []).find((r) => r.day_of_week === day))
    .map((i) => `${i.startLabel} – ${i.endLabel}`)
    .join(", ");
}
