import { describe, expect, it } from "vitest";
import { clinicOpenDays, hoursLines, openingHoursSpecification } from "./clinicHours";

const row = (day: number, s: string | null, e: string | null, extra: object = {}) => ({
  day_of_week: day, is_open: true, start_time: s, end_time: e, start_time_2: null, end_time_2: null, practitioner_id: "p1", ...extra,
});

describe("clinicHours", () => {
  it("returns nothing when no row is open", () => {
    expect(openingHoursSpecification([])).toEqual([]);
    expect(openingHoursSpecification(undefined)).toEqual([]);
    expect(openingHoursSpecification([row(1, "09:00", "13:00", { is_open: false })])).toEqual([]);
    expect(hoursLines([row(1, null, null)])).toEqual([]);
  });
  it("merges overlapping hours of several doctors into the clinic's open window", () => {
    const days = clinicOpenDays([row(1, "09:00:00", "13:00:00"), row(1, "12:00", "17:00", { practitioner_id: "p2" }), row(1, "18:00", "20:00", { practitioner_id: "p2" })]);
    expect(days).toEqual([{ day: 1, name: "Monday", intervals: [["09:00", "17:00"], ["18:00", "20:00"]] }]);
  });
  it("uses the second session and groups days with identical hours; Monday first, Sunday last", () => {
    const rows = [
      row(1, "09:00", "13:00", { start_time_2: "16:00", end_time_2: "19:00" }),
      row(2, "09:00", "13:00", { start_time_2: "16:00", end_time_2: "19:00" }),
      row(0, "10:00", "12:00"),
    ];
    expect(openingHoursSpecification(rows)).toEqual([
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday"], opens: "09:00", closes: "13:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday"], opens: "16:00", closes: "19:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: "Sunday", opens: "10:00", closes: "12:00" },
    ]);
  });
  it("drops invalid or reversed times", () => {
    expect(clinicOpenDays([row(1, "bad", "13:00"), row(2, "13:00", "09:00"), row(3, "25:00", "26:00")])).toEqual([]);
  });
  it("formats readable 12-hour lines", () => {
    expect(hoursLines([row(1, "00:00", "12:30", { start_time_2: "16:00", end_time_2: "19:00" })])).toEqual([
      { label: "Monday", text: "12:00 AM - 12:30 PM, 4:00 PM - 7:00 PM" },
    ]);
  });
});
