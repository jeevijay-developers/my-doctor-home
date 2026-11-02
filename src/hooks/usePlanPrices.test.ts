import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePlanPrices, planPricesToRecord, FALLBACK_PLAN_PRICES } from "./usePlanPrices";

const settingsMock = vi.hoisted(() => vi.fn());
vi.mock("./usePlatformSettings", () => ({ usePlatformSettings: settingsMock }));

describe("usePlanPrices", () => {
  beforeEach(() => settingsMock.mockReset());

  it("falls back to 1499 / 3999 when keys are not seeded", () => {
    settingsMock.mockReturnValue({ settings: {}, loading: true });
    const { result } = renderHook(() => usePlanPrices());
    expect(result.current).toEqual({ proPrice: 1499, premiumPrice: 3999, loading: true });
    expect(FALLBACK_PLAN_PRICES).toEqual({ pro: 1499, premium: 3999, free: 0 });
  });

  it("uses platform defaults, coercing numeric strings to numbers", () => {
    settingsMock.mockReturnValue({ settings: { pro_default_price: "1999", premium_default_price: 4999 }, loading: false });
    const { result } = renderHook(() => usePlanPrices());
    expect(result.current.proPrice).toBe(1999);
    expect(result.current.premiumPrice).toBe(4999);
  });

  it("a price of 0 is honoured, not replaced by the fallback", () => {
    settingsMock.mockReturnValue({ settings: { pro_default_price: 0 }, loading: false });
    const { result } = renderHook(() => usePlanPrices());
    expect(result.current.proPrice).toBe(0);
    expect(result.current.premiumPrice).toBe(3999);
  });

  it("planPricesToRecord always includes free = 0", () => {
    expect(planPricesToRecord({ proPrice: 10, premiumPrice: 20 })).toEqual({ free: 0, pro: 10, premium: 20 });
  });
});
