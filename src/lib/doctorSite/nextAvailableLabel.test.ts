import { describe, expect, it } from "vitest";
import { clockLabel, formatNextAvailable, isSlotPast } from "./nextAvailableLabel";

// 2026-11-28 10:00 IST = 04:30 UTC
const NOW = new Date("2026-11-28T04:30:00Z");

describe("formatNextAvailable (IST)", () => {
  it("says Today / Tomorrow / a dated day", () => {
    expect(formatNextAvailable({ date: "2026-11-28", time: "16:30:00" }, NOW)).toBe("Today 4:30 pm");
    expect(formatNextAvailable({ date: "2026-11-29", time: "10:00" }, NOW)).toBe("Tomorrow 10:00 am");
    expect(formatNextAvailable({ date: "2026-12-14", time: "09:00:00" }, NOW)).toBe("Mon 14 Dec, 9:00 am");
  });
  it("handles noon and midnight", () => {
    expect(clockLabel("12:00:00")).toBe("12:00 pm");
    expect(clockLabel("00:00")).toBe("12:00 am");
  });
  it("is empty for missing, malformed or past slots", () => {
    expect(formatNextAvailable(null, NOW)).toBe("");
    expect(formatNextAvailable({ date: "nope", time: "10:00" }, NOW)).toBe("");
    expect(formatNextAvailable({ date: "2026-11-28", time: "25:00" }, NOW)).toBe("");
    expect(formatNextAvailable({ date: "2026-11-28", time: "09:30:00" }, NOW)).toBe("");
    expect(formatNextAvailable({ date: "2026-11-27", time: "23:00" }, NOW)).toBe("");
    expect(isSlotPast({ date: "2026-11-28", time: "10:00" }, NOW)).toBe(true);
    expect(isSlotPast({ date: "2026-11-28", time: "10:01" }, NOW)).toBe(false);
  });
  it("uses IST, not the browser's zone: 18:45 UTC on the 28th is already the 29th in IST", () => {
    const late = new Date("2026-11-28T18:45:00Z"); // 00:15 IST on the 29th
    expect(formatNextAvailable({ date: "2026-11-29", time: "09:00" }, late)).toBe("Today 9:00 am");
    expect(formatNextAvailable({ date: "2026-11-30", time: "09:00" }, late)).toBe("Tomorrow 9:00 am");
  });
  it("midnight rollover: the same slot flips from Tomorrow to Today at 00:00 IST", () => {
    const slot = { date: "2026-11-29", time: "09:00:00" };
    expect(formatNextAvailable(slot, new Date("2026-11-28T18:29:00Z"))).toBe("Tomorrow 9:00 am"); // 23:59 IST
    expect(formatNextAvailable(slot, new Date("2026-11-28T18:30:00Z"))).toBe("Today 9:00 am"); // 00:00 IST
  });
});
