// Product-demo times offered on the Book a Demo page (/demo). A demo can start at any
// minute from 10:00 AM to 7:00 PM IST, Monday to Saturday (support days, src/lib/contactHours.ts).
// Everything is judged in IST, whatever the visitor's own time zone.

export const DEMO_DAYS_AHEAD = 14;
const OPEN_MIN = 10 * 60; // 10:00 AM, the first start time
const LAST_MIN = 19 * 60; // 7:00 PM, the last start time
const LEAD_MINUTES = 60; // the team needs an hour's notice for a same-day demo

const IST = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const pad = (n: number) => String(n).padStart(2, "0");

/** Today's date and the minute of the day, in IST. */
export function istNow(now: Date = new Date()) {
  const parts = Object.fromEntries(IST.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

const sameDay = (a: Date, b: { year: number; month: number; day: number }) =>
  a.getFullYear() === b.year && a.getMonth() + 1 === b.month && a.getDate() === b.day;

/**
 * Every start time ("HH:MM", IST, one minute apart) from 10:00 to 19:00 on a calendar day;
 * none on Sundays, and today only from an hour from now.
 */
export function demoSlotsFor(day: Date, now: Date = new Date()): string[] {
  if (day.getDay() === 0) return [];
  const today = istNow(now);
  const earliest = Math.max(OPEN_MIN, sameDay(day, today) ? today.minutes + LEAD_MINUTES : OPEN_MIN);
  const slots: string[] = [];
  for (let m = earliest; m <= LAST_MIN; m++) slots.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  return slots;
}

/**
 * The bookable days, as calendar dates matching the IST calendar (today in India first).
 * Days with no time left (Sundays, or today too late in the day) are left out.
 */
export function demoDays(now: Date = new Date(), count = DEMO_DAYS_AHEAD): Date[] {
  const today = istNow(now);
  const days: Date[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(today.year, today.month - 1, today.day + i);
    if (demoSlotsFor(d, now).length > 0) days.push(d);
  }
  return days;
}

/** "Tue, 25 Nov 2026, 11:07 AM IST" for the enquiry and the thank-you note. */
export function formatDemoTime(day: Date, time: string): string {
  const [h, m] = time.split(":").map(Number);
  const date = day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return `${date}, ${h % 12 || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"} IST`;
}
