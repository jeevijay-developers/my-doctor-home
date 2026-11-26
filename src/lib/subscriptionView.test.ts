import { describe, it, expect } from "vitest";
import { classifyPlan, countByView, describeExpiry, matchesView } from "./subscriptionView";
import type { CustomPlan } from "./customPlan";

const NOW = new Date("2026-11-26T06:00:00Z");
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

const plan = (over: Partial<CustomPlan> = {}): CustomPlan => ({
  doctor_id: "d", request_id: null, base_tier: "pro", extra_features: [], removed_features: [],
  monthly_price: 999, valid_from: inDays(-10), valid_until: null, status: "active", ...over,
});

describe("classifyPlan", () => {
  it("active paid plan", () => {
    const c = classifyPlan({ plan_tier: "pro", plan_status: "active", plan_end: inDays(30) }, null, NOW);
    expect(c).toMatchObject({ bucket: "active_paid", tier: "pro", isCustom: false, expiringSoon: false });
    expect(matchesView(c, "pro")).toBe(true);
    expect(matchesView(c, "premium")).toBe(false);
  });

  it("a paid plan whose end date passed is expired even if plan_status still says active", () => {
    const c = classifyPlan({ plan_tier: "premium", plan_status: "active", plan_end: inDays(-2) }, null, NOW);
    expect(c.bucket).toBe("expired");
    expect(matchesView(c, "premium")).toBe(false);
    expect(describeExpiry(c)).toBe("2 days ago");
  });

  it("a trial whose end passed is expired, not in trial", () => {
    expect(classifyPlan({ plan_tier: "free", plan_status: "trial", trial_end: inDays(-1) }, null, NOW).bucket).toBe("expired");
  });

  it("expired free-tier doctor falls back to trial_end for the end date", () => {
    const c = classifyPlan({ plan_tier: "free", plan_status: "expired", trial_end: inDays(-5) }, null, NOW);
    expect(c.bucket).toBe("expired");
    expect(describeExpiry(c)).toBe("5 days ago");
  });

  it("running trial and expiring-soon thresholds", () => {
    const trial = classifyPlan({ plan_tier: "free", plan_status: "trial", trial_end: inDays(3) }, null, NOW);
    expect(trial).toMatchObject({ bucket: "trial", expiringSoon: true });
    const soon = classifyPlan({ plan_tier: "pro", plan_status: "active", plan_end: inDays(7) }, null, NOW);
    expect(soon.expiringSoon).toBe(true);
    const later = classifyPlan({ plan_tier: "pro", plan_status: "active", plan_end: inDays(8) }, null, NOW);
    expect(later.expiringSoon).toBe(false);
  });

  it("suspended wins over dates", () => {
    expect(classifyPlan({ plan_tier: "pro", plan_status: "cancelled", plan_end: inDays(-9) }, null, NOW).bucket).toBe("suspended");
  });

  it("free is only a trial tier: a free-tier doctor who is not on a trial has no plan, so reads as expired", () => {
    expect(classifyPlan({ plan_tier: "free", plan_status: "active" }, null, NOW).bucket).toBe("expired");
    expect(classifyPlan({ plan_tier: null, plan_status: null }, null, NOW).bucket).toBe("expired");
    expect(classifyPlan({ plan_tier: "free", plan_status: "active", plan_end: inDays(20) }, null, NOW).bucket).toBe("expired");
    expect(classifyPlan({ plan_tier: "free", plan_status: "trial", trial_end: inDays(5) }, null, NOW).bucket).toBe("trial");
  });

  it("custom: manual price counts; approved plan counts only on its base tier", () => {
    const row = { plan_tier: "pro", plan_status: "active", plan_end: inDays(30) };
    expect(classifyPlan({ ...row, custom_plan_price: 1200 }, null, NOW).isCustom).toBe(true);
    expect(classifyPlan(row, plan({ base_tier: "pro" }), NOW).isCustom).toBe(true);
    expect(classifyPlan(row, plan({ base_tier: "premium" }), NOW).isCustom).toBe(false);
    expect(classifyPlan(row, plan({ valid_until: inDays(-1) }), NOW).isCustom).toBe(false);
  });

  it("countByView adds up", () => {
    const list = [
      classifyPlan({ plan_tier: "pro", plan_status: "active", plan_end: inDays(3) }, null, NOW),
      classifyPlan({ plan_tier: "premium", plan_status: "active", plan_end: inDays(40), custom_plan_price: 1 }, null, NOW),
      classifyPlan({ plan_tier: "free", plan_status: "trial", trial_end: inDays(10) }, null, NOW),
      classifyPlan({ plan_tier: "free", plan_status: "expired", trial_end: inDays(-3) }, null, NOW),
    ];
    expect(countByView(list)).toEqual({
      all: 4, pro: 1, premium: 1, custom: 1, trial: 1, expiring: 1, expired: 1, suspended: 0,
    });
  });
});

describe("describeExpiry", () => {
  it("reads naturally", () => {
    const d = (n: number) => describeExpiry(classifyPlan({ plan_tier: "pro", plan_status: "active", plan_end: inDays(n) }, null, NOW));
    expect(d(12)).toBe("in 12 days");
    expect(d(0.5)).toBe("tomorrow");
  });
});
