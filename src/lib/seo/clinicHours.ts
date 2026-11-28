// Working-hours helpers for the crawler HTML and JSON-LD of a clinic. day_of_week: 0 = Sunday.
// NOTE: no imports on purpose (bundled by Vercel).

export interface HoursRowLike {
  day_of_week: number;
  is_open?: boolean | null;
  start_time?: string | null;
  end_time?: string | null;
  start_time_2?: string | null;
  end_time_2?: string | null;
  practitioner_id?: string | null;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** Monday first: how people read a week. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** "09:00:00" / "9:00" -> "09:00"; anything else -> null. */
function hm(t?: string | null): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((t ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export interface DayHours { day: number; name: string; intervals: Array<[string, string]> }

/** Open intervals per day (merged when rows of several doctors overlap), Monday first, closed days omitted. */
export function clinicOpenDays(rows?: HoursRowLike[] | null): DayHours[] {
  const out: DayHours[] = [];
  for (const day of DAY_ORDER) {
    const iv: Array<[string, string]> = [];
    for (const r of rows ?? []) {
      if (!r || r.day_of_week !== day || !r.is_open) continue;
      for (const [s, e] of [[r.start_time, r.end_time], [r.start_time_2, r.end_time_2]] as const) {
        const a = hm(s);
        const b = hm(e);
        if (a && b && b > a) iv.push([a, b]);
      }
    }
    iv.sort((x, y) => x[0].localeCompare(y[0]));
    const merged: Array<[string, string]> = [];
    for (const [s, e] of iv) {
      const last = merged[merged.length - 1];
      if (last && s <= last[1]) {
        if (e > last[1]) last[1] = e;
      } else merged.push([s, e]);
    }
    if (merged.length) out.push({ day, name: DAY_NAMES[day], intervals: merged });
  }
  return out;
}

/** schema.org OpeningHoursSpecification list; days with identical hours share one entry. Empty when nothing is open. */
export function openingHoursSpecification(rows?: HoursRowLike[] | null): Array<Record<string, unknown>> {
  const groups = new Map<string, { days: string[]; opens: string; closes: string }>();
  for (const d of clinicOpenDays(rows)) {
    for (const [opens, closes] of d.intervals) {
      const key = `${opens}-${closes}`;
      const g = groups.get(key) ?? { days: [], opens, closes };
      g.days.push(d.name);
      groups.set(key, g);
    }
  }
  return [...groups.values()].map((g) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: g.days.length === 1 ? g.days[0] : g.days,
    opens: g.opens,
    closes: g.closes,
  }));
}

function twelveHour(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** [{ label: "Monday", text: "9:00 AM - 1:00 PM, 4:00 PM - 7:00 PM" }] for the crawler body. */
export function hoursLines(rows?: HoursRowLike[] | null): Array<{ label: string; text: string }> {
  return clinicOpenDays(rows).map((d) => ({
    label: d.name,
    text: d.intervals.map(([s, e]) => `${twelveHour(s)} - ${twelveHour(e)}`).join(", "),
  }));
}
