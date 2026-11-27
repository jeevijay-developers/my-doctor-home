import { describe, expect, it } from "vitest";
import { parseSeatQty, parseRenewalSeats, quoteErrorResponse, renewalTotalRupees, seatPriceFromSetting } from "./seatOrder.ts";

describe("parseSeatQty", () => {
  it("accepts positive integers", () => {
    expect(parseSeatQty(1)).toBe(1);
    expect(parseSeatQty(14)).toBe(14);
  });
  it("caps the quantity at 1000", () => {
    expect(parseSeatQty(1000)).toBe(1000);
    expect(parseSeatQty(1001)).toBeNull();
    expect(parseSeatQty(1e9)).toBeNull();
  });
  it("rejects everything else", () => {
    for (const v of [0, -1, 1.5, "2", null, undefined, NaN, Infinity, {}, [], true]) {
      expect(parseSeatQty(v)).toBeNull();
    }
  });
});

describe("seatPriceFromSetting", () => {
  it("returns positive finite numbers only", () => {
    expect(seatPriceFromSetting(499)).toBe(499);
    expect(seatPriceFromSetting(99.5)).toBe(99.5);
    for (const v of [null, undefined, 0, -5, "499", NaN, Infinity, {}]) expect(seatPriceFromSetting(v)).toBeNull();
  });
});

describe("parseRenewalSeats", () => {
  it("treats absent / null / 0 as no seats", () => {
    expect(parseRenewalSeats(undefined, 15)).toEqual({ ok: true, seats: 0 });
    expect(parseRenewalSeats(null, 15)).toEqual({ ok: true, seats: 0 });
    expect(parseRenewalSeats(0, 15)).toEqual({ ok: true, seats: 0 });
  });
  it("accepts 1..max-1", () => {
    expect(parseRenewalSeats(3, 15)).toEqual({ ok: true, seats: 3 });
    expect(parseRenewalSeats(14, 15)).toEqual({ ok: true, seats: 14 });
  });
  it("rejects above max-1 with SEAT_MAX", () => {
    expect(parseRenewalSeats(15, 15)).toEqual({ ok: false, error: "SEAT_MAX" });
  });
  it("rejects negative, fractional and non-numbers with INVALID_QTY", () => {
    for (const v of [-1, 1.5, "2", NaN, true, {}]) {
      expect(parseRenewalSeats(v, 15)).toEqual({ ok: false, error: "INVALID_QTY" });
    }
  });
});

describe("renewalTotalRupees", () => {
  it("adds seats x price in whole paise", () => {
    expect(renewalTotalRupees(3999, 2, 499)).toBe(4997);
    expect(renewalTotalRupees(1499.5, 3, 99.33)).toBe(1797.49);
  });
  it("avoids float drift", () => {
    expect(renewalTotalRupees(0.1, 3, 0.2)).toBe(0.7);
  });
});

describe("quoteErrorResponse", () => {
  it("maps known codes", () => {
    expect(quoteErrorResponse("NOT_ENABLED")).toEqual({ status: 403, error: "NOT_ENABLED" });
    expect(quoteErrorResponse("PLAN_NOT_ELIGIBLE")).toEqual({ status: 409, error: "PLAN_NOT_ELIGIBLE" });
    expect(quoteErrorResponse("PRICE_NOT_SET")).toEqual({ status: 409, error: "PRICE_NOT_SET" });
    expect(quoteErrorResponse("INVALID_QTY")).toEqual({ status: 400, error: "INVALID_QTY" });
    expect(quoteErrorResponse("SEAT_MAX")).toEqual({ status: 400, error: "SEAT_MAX" });
  });
  it("unknown codes are a 500, never passed through", () => {
    expect(quoteErrorResponse("WHATEVER")).toEqual({ status: 500, error: "QUOTE_FAILED" });
    expect(quoteErrorResponse(undefined)).toEqual({ status: 500, error: "QUOTE_FAILED" });
  });
});
