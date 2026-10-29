// The clinic runs on Indian time. These format an instant as the IST calendar date whatever
// time zone the browser is in, so "ends Nov 28" means the same day for the doctor, the
// superadmin and a patient travelling abroad.
const DATE = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", month: "short", day: "numeric", year: "numeric" });
const DAY_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });

/** "Nov 28, 2026" */
export const formatIstDate = (d: Date | string): string => DATE.format(typeof d === "string" ? new Date(d) : d);

/** "2026-11-28": compare two instants by IST calendar day. */
export const istDayKey = (d: Date): string => DAY_KEY.format(d);
