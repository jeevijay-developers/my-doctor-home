import { describe, expect, it } from "vitest";
import { buildAppointmentIcs } from "./ics";

const base = {
  uid: "ABC1234",
  title: "Visit with Dr. Asha Rao",
  date: new Date(2026, 10, 25), // 25 Nov 2026
  time: "16:30",
  durationMinutes: 30,
  now: new Date("2026-11-24T06:00:00Z"),
};

describe("buildAppointmentIcs", () => {
  it("converts the clinic's IST wall-clock time to UTC", () => {
    const ics = buildAppointmentIcs(base);
    expect(ics).toContain("DTSTART:20261125T110000Z"); // 16:30 IST = 11:00 UTC
    expect(ics).toContain("DTEND:20261125T113000Z");
    expect(ics).toContain("DTSTAMP:20261124T060000Z");
  });

  it("rolls the UTC date back when IST is just after midnight", () => {
    const ics = buildAppointmentIcs({ ...base, time: "00:15" });
    expect(ics).toContain("DTSTART:20261124T184500Z");
  });

  it("is a well-formed calendar with CRLF line endings and a reminder", () => {
    const ics = buildAppointmentIcs(base);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:ABC1234@doctylia.com");
    expect(ics).toContain("TRIGGER:-PT60M");
    expect(ics.replace(/\r\n/g, "").includes("\n")).toBe(false);
  });

  it("escapes special characters and folds long lines", () => {
    const ics = buildAppointmentIcs({
      ...base,
      location: "Little Steps, Plot 4; Kothrud, Pune",
      description: `Token: ABC1234\n${"A very long note. ".repeat(10)}`,
    });
    expect(ics).toContain("LOCATION:Little Steps\\, Plot 4\\; Kothrud\\, Pune");
    expect(ics).toContain("\\nA very long note.");
    for (const line of ics.split("\r\n")) expect(line.length).toBeLessThanOrEqual(75);
  });

  it("is marked tentative until the clinic confirms, confirmed otherwise", () => {
    expect(buildAppointmentIcs(base)).toContain("STATUS:CONFIRMED");
    expect(buildAppointmentIcs({ ...base, status: "TENTATIVE" })).toContain("STATUS:TENTATIVE");
  });

  it("folds on UTF-8 bytes, so a Devanagari clinic name never produces an over-long line or a split character", () => {
    const ics = buildAppointmentIcs({ ...base, location: "श्री गणेश बाल चिकित्सालय, कोथरूड, पुणे महाराष्ट्र भारत" });
    const encoder = new TextEncoder();
    for (const line of ics.split("\r\n")) expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    // unfolding restores the exact text
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("LOCATION:श्री गणेश बाल चिकित्सालय\\, कोथरूड\\, पुणे महाराष्ट्र भारत");
  });

  it("never makes a zero-length event", () => {
    const ics = buildAppointmentIcs({ ...base, durationMinutes: 0 });
    expect(ics).toContain("DTEND:20261125T110500Z");
  });
});
