// Date math for checkup scheduling — duplicated (not imported) in
// src/lib/checkupReminders.ts for the frontend's "Next Reminder" preview,
// per this repo's established cross-runtime convention (edge functions run
// on Deno and can't import from src/). Keep both copies in sync.
export type Frequency =
  | "weekly" | "every_15_days" | "monthly" | "every_3_months" | "every_6_months" | "yearly" | "custom";

function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Advances a YYYY-MM-DD date string forward by one cycle of the given
// frequency. Operates in UTC date-only arithmetic to avoid timezone drift
// (these map to Postgres `date` columns, which have no time component).
// Month arithmetic clamps the day to the last day of the target month
// (31 Jan + 1 month = 28/29 Feb), never rolling over into the next month.
// Same algorithm as src/lib/checkupReminders.ts.
function addMonthsClamped(d: Date, months: number): void {
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
}

export function addFrequency(dateStr: string, frequency: Frequency, customIntervalDays: number | null): string {
  const d = parseDateOnly(dateStr);
  switch (frequency) {
    case "weekly": d.setUTCDate(d.getUTCDate() + 7); break;
    case "every_15_days": d.setUTCDate(d.getUTCDate() + 15); break;
    case "monthly": addMonthsClamped(d, 1); break;
    case "every_3_months": addMonthsClamped(d, 3); break;
    case "every_6_months": addMonthsClamped(d, 6); break;
    case "yearly": addMonthsClamped(d, 12); break;
    case "custom": d.setUTCDate(d.getUTCDate() + (customIntervalDays && customIntervalDays > 0 ? customIntervalDays : 30)); break;
  }
  return formatDateOnly(d);
}

export function subtractDays(dateStr: string, days: number): string {
  const d = parseDateOnly(dateStr);
  d.setUTCDate(d.getUTCDate() - Math.max(0, days));
  return formatDateOnly(d);
}
