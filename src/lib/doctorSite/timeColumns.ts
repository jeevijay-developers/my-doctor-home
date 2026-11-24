// Logic behind the booking time picker (hour | minute | AM/PM columns, like a native time input).
// The picker never lets a patient type or scroll to an arbitrary time: every column only offers
// values that exist in the list of FREE slots, so lunch breaks, closed hours and already-booked
// times simply are not there.

export type Period = "AM" | "PM";

export type ParsedSlot = {
  /** Original "HH:MM" (24-hour). */
  time: string;
  hour24: number;
  /** 1-12, as shown in the picker. */
  hour12: number;
  minute: number;
  period: Period;
};

export const pad2 = (n: number) => String(n).padStart(2, "0");

export function parseSlot(time: string): ParsedSlot {
  const [h, m] = time.split(":").map(Number);
  return {
    time,
    hour24: h,
    hour12: h % 12 || 12,
    minute: Number.isNaN(m) ? 0 : m,
    period: h >= 12 ? "PM" : "AM",
  };
}

/** "09:00 AM", the way the field shows it. */
export const formatField = (time: string) => {
  const p = parseSlot(time);
  return `${pad2(p.hour12)}:${pad2(p.minute)} ${p.period}`;
};

const unique = <T,>(values: T[]) => values.filter((v, i) => values.indexOf(v) === i);

const sortedParsed = (slots: string[]) => unique(slots).sort().map(parseSlot);

export type Columns = {
  /** Hours (1-12) that have a free slot in the current AM/PM, in clock order. */
  hours: number[];
  /** Minutes that have a free slot in the current hour and AM/PM. */
  minutes: number[];
  /** Which halves of the day have any free slot. */
  periods: Record<Period, boolean>;
  current: ParsedSlot | null;
};

/** What each column should offer when `current` is the selected slot. */
export function columnsFor(slots: string[], current: string): Columns {
  const parsed = sortedParsed(slots);
  const cur = parsed.find((p) => p.time === current) ?? parsed[0] ?? null;
  const periods = { AM: parsed.some((p) => p.period === "AM"), PM: parsed.some((p) => p.period === "PM") };
  if (!cur) return { hours: [], minutes: [], periods, current: null };
  const inPeriod = parsed.filter((p) => p.period === cur.period);
  return {
    hours: unique(inPeriod.map((p) => p.hour12)),
    minutes: unique(inPeriod.filter((p) => p.hour12 === cur.hour12).map((p) => p.minute)),
    periods,
    current: cur,
  };
}

/**
 * The slot to select after the patient changes one column. Keeps the other two columns as they
 * were when that combination is free, otherwise moves to the nearest free one, so the result is
 * always a real free slot.
 */
export function choose(slots: string[], current: string, change: { hour?: number; minute?: number; period?: Period }): string {
  const parsed = sortedParsed(slots);
  const cur = parsed.find((p) => p.time === current) ?? parsed[0];
  if (!cur) return current;

  const period = change.period ?? cur.period;
  const hour = change.hour ?? cur.hour12;
  const minute = change.minute ?? cur.minute;
  const inPeriod = parsed.filter((p) => p.period === period);

  const exact = inPeriod.find((p) => p.hour12 === hour && p.minute === minute);
  if (exact) return exact.time;

  const sameHour = inPeriod.filter((p) => p.hour12 === hour);
  if (sameHour.length > 0) return (sameHour.find((p) => p.minute >= minute) ?? sameHour[0]).time;

  // Switching AM/PM to a half that has no such hour: keep the nearest hour by clock position.
  if (inPeriod.length > 0) return inPeriod[0].time;
  return cur.time;
}
