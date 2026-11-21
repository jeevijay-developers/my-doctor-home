// Support hours shown on the Contact page: Monday to Saturday, 9 AM to 7 PM IST.
const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  hour: "numeric",
  hourCycle: "h23",
});

export const SUPPORT_HOURS_LABEL = "Mon-Sat, 9 AM - 7 PM IST";

/** True while the support team is inside its published hours (judged in IST, whatever the browser's zone). */
export function isSupportOnline(now: Date = new Date()): boolean {
  const parts = PARTS.formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  if (!weekday || Number.isNaN(hour)) return false;
  return weekday !== "Sun" && hour >= 9 && hour < 19;
}
