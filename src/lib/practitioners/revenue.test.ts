import { describe, it, expect } from "vitest";
import { formatInr, istMonthRange, payoutCsv, revenueErrorMessage, type RevenueRow } from "./revenue";

const mode = { cash: 100, upi: 200, card: 0, online: 50, other: 0, unrecorded: 0 };
const row = (over: Partial<RevenueRow> = {}): RevenueRow => ({
  practitioner_id: "p1", display_name: "Dr. Asha", is_active: true, visits_completed: 4, paid_amount: 350, gst_amount: 18,
  by_mode: mode, refunds_count: 1, refunds_amount: 50, no_shows: 2, paid_no_shows_count: 1, paid_no_shows_amount: 100,
  platform_charge: 10, net: 340, net_after_refunds: 290, ...over,
});

describe("istMonthRange", () => {
  it("returns first and last IST calendar day of the month", () => {
    expect(istMonthRange(new Date("2026-11-15T10:00:00+05:30"))).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(istMonthRange(new Date("2028-02-10T10:00:00+05:30"))).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
  it("uses the IST date, not the UTC one, at the month boundary", () => {
    // 2026-10-31 20:00 UTC is already 1 Nov in India.
    expect(istMonthRange(new Date("2026-10-31T20:00:00Z"))).toEqual({ from: "2026-11-01", to: "2026-11-30" });
  });
});

describe("payoutCsv", () => {
  it("starts with a BOM and the agreed header", () => {
    const csv = payoutCsv([row()]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\n")[0]).toBe(
      "Doctor,Visits,Revenue ex-GST,GST,Cash,UPI,Card,Online,Refunds,Platform charge,Net,Net after refunds,Paid no-shows",
    );
  });
  it("writes one line per row with the values in column order", () => {
    const lines = payoutCsv([row()]).slice(1).split("\n");
    expect(lines[1]).toBe("Dr. Asha,4,350,18,100,200,0,50,50,10,340,290,100");
  });
  it("neutralises a formula-looking doctor name and quotes commas", () => {
    const lines = payoutCsv([row({ display_name: "=cmd|x" }), row({ display_name: "Dr. A, B" })]).slice(1).split("\n");
    expect(lines[1].startsWith("'=cmd|x,")).toBe(true);
    expect(lines[2].startsWith('"Dr. A, B",')).toBe(true);
  });
});

describe("revenueErrorMessage", () => {
  it("maps known codes and falls back", () => {
    expect(revenueErrorMessage("RANGE_TOO_LARGE")).toMatch(/366|year/i);
    expect(revenueErrorMessage("INVALID_RANGE")).toBeTruthy();
    expect(revenueErrorMessage("WHATEVER")).toMatch(/could not/i);
  });
});

describe("formatInr", () => {
  it("prints whole rupees without decimals and fractions with exactly two", () => {
    expect(formatInr(6000)).toBe("₹6,000");
    expect(formatInr(1234.5)).toBe("₹1,234.50");
    expect(formatInr(0.1 + 0.2)).toBe("₹0.30");
    expect(formatInr(null)).toBe("₹0");
  });
});
