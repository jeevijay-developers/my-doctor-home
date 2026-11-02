import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { computeTrialAccess, graceEndsAtFrom, useTrialStatus, TrialStatusProvider } from "./TrialStatusContext";

const NOW = new Date("2026-10-31T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

describe("computeTrialAccess", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("is full for active/trial/null statuses", () => {
    expect(computeTrialAccess("active", null)).toBe("full");
    expect(computeTrialAccess("trial", hoursAgo(1000))).toBe("full");
    expect(computeTrialAccess(null, null)).toBe("full");
    expect(computeTrialAccess(undefined, undefined)).toBe("full");
  });

  it("is blocked when cancelled regardless of dates", () => {
    expect(computeTrialAccess("cancelled", null)).toBe("blocked");
    expect(computeTrialAccess("cancelled", hoursAgo(1))).toBe("blocked");
  });

  it("expired: grace for 48h after trial_end, then blocked", () => {
    expect(computeTrialAccess("expired", hoursAgo(1))).toBe("grace");
    expect(computeTrialAccess("expired", hoursAgo(47.9))).toBe("grace");
    expect(computeTrialAccess("expired", hoursAgo(48.1))).toBe("blocked");
  });

  it("expired exactly at the 48h boundary is blocked", () => {
    expect(computeTrialAccess("expired", hoursAgo(48))).toBe("blocked");
  });

  it("expired with no dates at all is blocked", () => {
    expect(computeTrialAccess("expired", null)).toBe("blocked");
  });

  it("a lapsed paid plan counts grace from plan_end when trial_end is cleared", () => {
    expect(computeTrialAccess("expired", null, hoursAgo(10))).toBe("grace");
    expect(computeTrialAccess("expired", null, hoursAgo(60))).toBe("blocked");
  });

  it("trial_end takes precedence over plan_end", () => {
    expect(computeTrialAccess("expired", hoursAgo(60), hoursAgo(1))).toBe("blocked");
  });
});

describe("graceEndsAtFrom", () => {
  it("returns null without trial end", () => {
    expect(graceEndsAtFrom(null)).toBeNull();
    expect(graceEndsAtFrom(undefined)).toBeNull();
  });
  it("adds exactly 48 hours", () => {
    expect(graceEndsAtFrom("2026-10-01T00:00:00Z")!.toISOString()).toBe("2026-10-03T00:00:00.000Z");
  });
});

describe("useTrialStatus", () => {
  it("defaults to full access", () => {
    const { result } = renderHook(() => useTrialStatus());
    expect(result.current.accessLevel).toBe("full");
    expect(result.current.graceEndsAt).toBeNull();
  });
  it("reads the provider value", () => {
    const value = { accessLevel: "grace" as const, isStaff: true, graceEndsAt: new Date(0), kind: "plan" as const };
    const { result } = renderHook(() => useTrialStatus(), {
      wrapper: ({ children }) => <TrialStatusProvider value={value}>{children}</TrialStatusProvider>,
    });
    expect(result.current).toEqual(value);
  });
});
