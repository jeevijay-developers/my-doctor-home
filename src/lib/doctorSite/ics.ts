// "Add to calendar" for the booking confirmation: a standards-compliant .ics file
// built in the browser (no dependency, nothing sent anywhere). Clinic times are
// Indian wall-clock times, so they are converted to UTC from IST (+05:30, no DST).

const IST_OFFSET_MINUTES = 330;

const pad = (n: number) => String(n).padStart(2, "0");

const toUtcStamp = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
};

/** RFC 5545 text escaping. */
const escapeText = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

const encoder = new TextEncoder();

/** Lines longer than 75 octets (UTF-8 bytes, not characters) are folded with CRLF + space, never inside a character. */
const fold = (line: string) => {
  const chunks: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) {
      chunks.push(current);
      current = " "; // a continuation line starts with one space (1 octet)
      bytes = 1;
    }
    current += char;
    bytes += size;
  }
  chunks.push(current);
  return chunks.join("\r\n");
};

export type IcsEvent = {
  /** Stable id so re-importing updates instead of duplicating. */
  uid: string;
  title: string;
  /** Calendar date of the visit (only year/month/day are read). */
  date: Date;
  /** Clinic wall-clock start, "HH:MM". */
  time: string;
  durationMinutes: number;
  location?: string;
  description?: string;
  /** Minutes before the visit for the reminder alarm. */
  reminderMinutes?: number;
  /** TENTATIVE until the clinic confirms; defaults to CONFIRMED. */
  status?: "CONFIRMED" | "TENTATIVE";
  now?: Date;
};

export function buildAppointmentIcs(event: IcsEvent): string {
  const [hours, minutes] = event.time.split(":").map(Number);
  const startUtc =
    Date.UTC(event.date.getFullYear(), event.date.getMonth(), event.date.getDate(), hours, minutes) -
    IST_OFFSET_MINUTES * 60_000;
  const endUtc = startUtc + Math.max(5, event.durationMinutes) * 60_000;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Doctylia//Appointment//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}@doctylia.com`,
    `DTSTAMP:${toUtcStamp((event.now ?? new Date()).getTime())}`,
    `DTSTART:${toUtcStamp(startUtc)}`,
    `DTEND:${toUtcStamp(endUtc)}`,
    `STATUS:${event.status ?? "CONFIRMED"}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(event.title)}`,
    `TRIGGER:-PT${event.reminderMinutes ?? 60}M`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

export function downloadIcs(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
