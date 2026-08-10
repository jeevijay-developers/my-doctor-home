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
export function addFrequency(dateStr: string, frequency: Frequency, customIntervalDays: number | null): string {
  const d = parseDateOnly(dateStr);
  switch (frequency) {
    case "weekly": d.setUTCDate(d.getUTCDate() + 7); break;
    case "every_15_days": d.setUTCDate(d.getUTCDate() + 15); break;
    case "monthly": d.setUTCMonth(d.getUTCMonth() + 1); break;
    case "every_3_months": d.setUTCMonth(d.getUTCMonth() + 3); break;
    case "every_6_months": d.setUTCMonth(d.getUTCMonth() + 6); break;
    case "yearly": d.setUTCFullYear(d.getUTCFullYear() + 1); break;
    case "custom": d.setUTCDate(d.getUTCDate() + (customIntervalDays && customIntervalDays > 0 ? customIntervalDays : 30)); break;
  }
  return formatDateOnly(d);
}

export function subtractDays(dateStr: string, days: number): string {
  const d = parseDateOnly(dateStr);
  d.setUTCDate(d.getUTCDate() - Math.max(0, days));
  return formatDateOnly(d);
}
