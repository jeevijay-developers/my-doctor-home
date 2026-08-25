import { describe, it, expect } from "vitest";
import { generateTimeSlots, DEFAULT_SLOT_DURATION_MINUTES } from "./timeSlots";

describe("generateTimeSlots", () => {
  it("defaults to 30-minute slots", () => {
    expect(generateTimeSlots("10:00", "12:00")).toEqual(["10:00", "10:30", "11:00", "11:30"]);
    expect(DEFAULT_SLOT_DURATION_MINUTES).toBe(30);
  });

  it("generates 15-minute slots", () => {
    expect(generateTimeSlots("10:00", "11:00", 15)).toEqual(["10:00", "10:15", "10:30", "10:45"]);
  });

  it("generates 5-minute slots", () => {
    expect(generateTimeSlots("10:00", "10:20", 5)).toEqual(["10:00", "10:05", "10:10", "10:15"]);
  });

  it("never generates a slot that would extend past the end time", () => {
    // 45-minute slots over a 10:00–12:00 window: a slot starting 11:30 would
    // end 12:15, past the boundary, so it must be excluded.
    expect(generateTimeSlots("10:00", "12:00", 45)).toEqual(["10:00", "10:45"]);
  });

  it("returns an empty array when start or end is missing", () => {
    expect(generateTimeSlots(null, "12:00", 15)).toEqual([]);
    expect(generateTimeSlots("10:00", null, 15)).toEqual([]);
  });

  it("falls back to the default duration for a non-positive interval", () => {
    expect(generateTimeSlots("10:00", "11:00", 0)).toEqual(generateTimeSlots("10:00", "11:00", 30));
  });
});
