import { describe, it, expect } from "vitest";
import { hoursFor, clinicHoursUnion, type HoursRow } from "./hours";

const row = (p: string, d: number, s: string | null, e: string | null, s2: string | null = null, e2: string | null = null, open = true): HoursRow =>
  ({ practitioner_id: p, day_of_week: d, is_open: open, start_time: s, end_time: e, start_time_2: s2, end_time_2: e2 });

describe("hoursFor", () => {
  it("keeps only the chosen doctor's rows", () => {
    const rows = [row("a", 1, "09:00:00", "13:00:00"), row("b", 1, "15:00:00", "19:00:00")];
    expect(hoursFor(rows, "b")).toEqual([rows[1]]);
  });
});

describe("clinicHoursUnion", () => {
  it("returns the very same array for a single doctor (no change for single-doctor clinics)", () => {
    const rows = [row("a", 1, "09:00:00", "13:00:00", "17:00:00", "20:00:00"), row("a", 2, null, null, null, null, false)];
    expect(clinicHoursUnion(rows)).toBe(rows);
  });
  it("merges overlapping doctors' hours per day", () => {
    const rows = [row("a", 1, "09:00:00", "13:00:00"), row("b", 1, "12:00:00", "16:00:00")];
    const d1 = clinicHoursUnion(rows).find((r) => r.day_of_week === 1)!;
    expect(d1).toMatchObject({ is_open: true, start_time: "09:00:00", end_time: "16:00:00", start_time_2: null, end_time_2: null });
  });
  it("keeps two separate sessions and folds any further ones into the second", () => {
    const rows = [row("a", 3, "09:00:00", "11:00:00"), row("b", 3, "13:00:00", "14:00:00"), row("c", 3, "17:00:00", "19:00:00")];
    const d3 = clinicHoursUnion(rows).find((r) => r.day_of_week === 3)!;
    expect(d3).toMatchObject({ start_time: "09:00:00", end_time: "11:00:00", start_time_2: "13:00:00", end_time_2: "19:00:00" });
  });
  it("marks a day closed when no doctor works it, and returns all 7 days", () => {
    const rows = [row("a", 1, "09:00:00", "13:00:00"), row("b", 2, "09:00:00", "13:00:00")];
    const out = clinicHoursUnion(rows);
    expect(out).toHaveLength(7);
    expect(out.find((r) => r.day_of_week === 0)).toMatchObject({ is_open: false, start_time: null });
  });
});
