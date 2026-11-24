import { describe, expect, it } from "vitest";
import { demoDays, demoSlotsFor, formatDemoTime, istNow } from "./demoSlots";
import { columnsFor } from "./doctorSite/timeColumns";

// Tue 24 Nov 2026, 10:10 AM IST (04:40 UTC).
const NOW = new Date("2026-11-24T04:40:00Z");

describe("demo slots", () => {
  it("reads the clock in IST", () => {
    expect(istNow(NOW)).toEqual({ year: 2026, month: 11, day: 24, minutes: 10 * 60 + 10 });
  });

  it("any minute from 10:00 AM to 7:00 PM can be chosen", () => {
    const slots = demoSlotsFor(new Date(2026, 10, 25), NOW);
    expect(slots[0]).toBe("10:00");
    expect(slots[1]).toBe("10:01");
    expect(slots).toContain("13:37");
    expect(slots.at(-1)).toBe("19:00");
    expect(slots).toHaveLength(9 * 60 + 1);
  });

  it("the time picker offers every minute of an hour", () => {
    const cols = columnsFor(demoSlotsFor(new Date(2026, 10, 25), NOW), "14:00");
    expect(cols.minutes).toHaveLength(60);
    expect(cols.hours).toEqual([12, 1, 2, 3, 4, 5, 6, 7]); // noon to 7 PM in the PM column
  });

  it("today, only from an hour from now", () => {
    expect(demoSlotsFor(new Date(2026, 10, 24), NOW)[0]).toBe("11:10");
  });

  it("never on a Sunday", () => {
    expect(demoSlotsFor(new Date(2026, 10, 29), NOW)).toEqual([]);
    expect(demoDays(NOW).some((d) => d.getDay() === 0)).toBe(false);
  });

  it("drops today once it is too late for a demo", () => {
    const evening = new Date("2026-11-24T12:45:00Z"); // 6:15 PM IST: the next start would be 7:15 PM
    expect(demoDays(evening)[0].getDate()).toBe(25);
  });

  it("formats the chosen time for the team", () => {
    expect(formatDemoTime(new Date(2026, 10, 25), "14:07")).toBe("Wed, 25 Nov 2026, 2:07 PM IST");
  });
});
