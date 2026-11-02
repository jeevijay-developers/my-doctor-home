import { describe, expect, it } from "vitest";
import { formatIstDate, istDayKey } from "./istDate";

describe("istDayKey", () => {
  it("rolls over at 18:30 UTC", () => {
    expect(istDayKey(new Date("2026-11-28T18:29:59.999Z"))).toBe("2026-11-28");
    expect(istDayKey(new Date("2026-11-28T18:30:00.000Z"))).toBe("2026-11-29");
  });
  it("handles early-UTC instants (already the same IST day)", () => {
    expect(istDayKey(new Date("2026-11-28T00:00:00Z"))).toBe("2026-11-28");
  });
  it("crosses month and year edges", () => {
    expect(istDayKey(new Date("2026-01-31T18:30:00Z"))).toBe("2026-02-01");
    expect(istDayKey(new Date("2026-12-31T18:29:59Z"))).toBe("2026-12-31");
    expect(istDayKey(new Date("2026-12-31T18:30:00Z"))).toBe("2027-01-01");
  });
  it("handles leap-day boundaries", () => {
    expect(istDayKey(new Date("2028-02-28T18:30:00Z"))).toBe("2028-02-29");
    expect(istDayKey(new Date("2028-02-29T18:30:00Z"))).toBe("2028-03-01");
    expect(istDayKey(new Date("2027-02-28T18:30:00Z"))).toBe("2027-03-01");
  });
  it("is zero-padded ISO-like", () => {
    expect(istDayKey(new Date("2026-03-05T10:00:00Z"))).toBe("2026-03-05");
  });
  it("two instants straddling the boundary differ", () => {
    expect(istDayKey(new Date("2026-06-14T18:29:00Z"))).not.toBe(istDayKey(new Date("2026-06-14T18:31:00Z")));
  });
});

describe("formatIstDate", () => {
  it("formats Date and ISO string alike", () => {
    expect(formatIstDate(new Date("2026-11-28T10:00:00Z"))).toBe("Nov 28, 2026");
    expect(formatIstDate("2026-11-28T10:00:00Z")).toBe("Nov 28, 2026");
  });
  it("uses the IST calendar day, not UTC", () => {
    expect(formatIstDate("2026-11-28T18:30:00Z")).toBe("Nov 29, 2026");
    expect(formatIstDate("2026-12-31T20:00:00Z")).toBe("Jan 1, 2027");
  });
  it("treats a date-only string as UTC midnight (still the same IST day)", () => {
    expect(formatIstDate("2026-11-28")).toBe("Nov 28, 2026");
  });
});
