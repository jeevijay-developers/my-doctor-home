import { describe, expect, it } from "vitest";
import { isSupportOnline } from "./contactHours";

// 2026-11-23 is a Monday. IST is UTC+5:30.
const ist = (iso: string) => new Date(`${iso}+05:30`);

describe("isSupportOnline", () => {
  it("is online on a weekday during hours", () => {
    expect(isSupportOnline(ist("2026-11-23T10:30:00"))).toBe(true);
  });

  it("opens at 9:00 and closes at 19:00 IST", () => {
    expect(isSupportOnline(ist("2026-11-23T08:59:00"))).toBe(false);
    expect(isSupportOnline(ist("2026-11-23T09:00:00"))).toBe(true);
    expect(isSupportOnline(ist("2026-11-23T18:59:00"))).toBe(true);
    expect(isSupportOnline(ist("2026-11-23T19:00:00"))).toBe(false);
  });

  it("is online on Saturday and offline on Sunday", () => {
    expect(isSupportOnline(ist("2026-11-28T12:00:00"))).toBe(true);
    expect(isSupportOnline(ist("2026-11-29T12:00:00"))).toBe(false);
  });

  it("uses IST regardless of the instant's UTC date", () => {
    // 2026-11-23 20:00 UTC is Tuesday 01:30 IST -> closed
    expect(isSupportOnline(new Date("2026-11-23T20:00:00Z"))).toBe(false);
  });
});
