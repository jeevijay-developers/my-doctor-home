import { describe, expect, it } from "vitest";
import { DEFAULT_PLAN_PRICES, getEffectivePlanPrice } from "./planPrices";

describe("DEFAULT_PLAN_PRICES", () => {
  it("is ordered free < pro < premium", () => {
    expect(DEFAULT_PLAN_PRICES.free).toBe(0);
    expect(DEFAULT_PLAN_PRICES.pro).toBeGreaterThan(DEFAULT_PLAN_PRICES.free);
    expect(DEFAULT_PLAN_PRICES.premium).toBeGreaterThan(DEFAULT_PLAN_PRICES.pro);
  });
});

describe("getEffectivePlanPrice", () => {
  it("uses the tier default", () => {
    expect(getEffectivePlanPrice({ plan_tier: "pro" })).toBe(DEFAULT_PLAN_PRICES.pro);
    expect(getEffectivePlanPrice({ plan_tier: "premium" })).toBe(DEFAULT_PLAN_PRICES.premium);
  });
  it("treats null/undefined/empty tier as free", () => {
    expect(getEffectivePlanPrice({})).toBe(0);
    expect(getEffectivePlanPrice({ plan_tier: null })).toBe(0);
    expect(getEffectivePlanPrice({ plan_tier: "" })).toBe(0);
  });
  it("unknown tier is 0", () => {
    expect(getEffectivePlanPrice({ plan_tier: "enterprise" })).toBe(0);
  });
  it("custom price overrides, including a legitimate 0", () => {
    expect(getEffectivePlanPrice({ plan_tier: "pro", custom_plan_price: 999 })).toBe(999);
    expect(getEffectivePlanPrice({ plan_tier: "pro", custom_plan_price: 0 })).toBe(0);
  });
  it("null custom price falls through; numeric strings are coerced", () => {
    expect(getEffectivePlanPrice({ plan_tier: "pro", custom_plan_price: null })).toBe(DEFAULT_PLAN_PRICES.pro);
    expect(getEffectivePlanPrice({ plan_tier: "pro", custom_plan_price: "1200" as unknown as number })).toBe(1200);
  });
  it("honours a supplied price table", () => {
    expect(getEffectivePlanPrice({ plan_tier: "pro" }, { pro: 1 })).toBe(1);
    expect(getEffectivePlanPrice({ plan_tier: "premium" }, { pro: 1 })).toBe(0);
  });
});
