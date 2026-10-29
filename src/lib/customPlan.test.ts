import { describe, it, expect } from "vitest";
import { applyCustomPlanToBullets, customPlanApplication, diffFeatureSelection, isCustomPlanActive, type CustomPlan } from "./customPlan";
import { getDoctorTierPrice } from "./planFeatures";

const basePlan: CustomPlan = {
  doctor_id: "d1",
  request_id: "r1",
  base_tier: "pro",
  extra_features: ["online_consultation"],
  removed_features: ["ai_blog_writer"],
  monthly_price: 999,
  valid_from: "2026-01-01T00:00:00Z",
  valid_until: null,
  status: "active",
};

const now = new Date("2026-06-01T00:00:00Z");

describe("isCustomPlanActive", () => {
  it("is active inside the window with no end date", () => {
    expect(isCustomPlanActive(basePlan, now)).toBe(true);
  });
  it("is inactive once valid_until has passed, even if status is still active", () => {
    expect(isCustomPlanActive({ ...basePlan, valid_until: "2026-05-31T00:00:00Z" }, now)).toBe(false);
  });
  it("is inactive before valid_from", () => {
    expect(isCustomPlanActive({ ...basePlan, valid_from: "2026-07-01T00:00:00Z" }, now)).toBe(false);
  });
  it("is inactive when cancelled, expired or missing", () => {
    expect(isCustomPlanActive({ ...basePlan, status: "cancelled" }, now)).toBe(false);
    expect(isCustomPlanActive({ ...basePlan, status: "expired" }, now)).toBe(false);
    expect(isCustomPlanActive(null, now)).toBe(false);
  });
});

describe("applyCustomPlanToBullets", () => {
  const proBullets = ["Your branded website", "AI blog writer", "Billing & invoices"];

  it("drops removed bullets, adds extras, and lists removed features as removed on the base tier card", () => {
    const out = applyCustomPlanToBullets(proBullets, basePlan, "pro");
    expect(out.find((b) => b.text === "AI blog writer" && b.kind === "base")).toBeUndefined();
    expect(out).toContainEqual({ text: "Online consultation", kind: "added" });
    expect(out).toContainEqual({ text: "AI blog writer", kind: "removed" });
    expect(out).toContainEqual({ text: "Billing & invoices", kind: "base" });
  });

  it("leaves the other tier's card untouched", () => {
    const out = applyCustomPlanToBullets(["All features included in Pro plan"], basePlan, "premium");
    expect(out).toEqual([{ text: "All features included in Pro plan", kind: "base" }]);
  });

  it("returns plain bullets when there is no active plan", () => {
    const out = applyCustomPlanToBullets(proBullets, { ...basePlan, status: "expired" }, "pro");
    expect(out.every((b) => b.kind === "base")).toBe(true);
  });
});

describe("getDoctorTierPrice with a custom plan", () => {
  const prices = { free: 0, pro: 1499, premium: 3999 };

  it("uses the custom plan price for its base tier", () => {
    expect(getDoctorTierPrice("pro", { plan_tier: "pro", custom_plan_price: 1200 }, prices, basePlan)).toBe(999);
  });
  it("does not leak the custom price into a different tier", () => {
    expect(getDoctorTierPrice("premium", { plan_tier: "pro" }, prices, basePlan)).toBe(3999);
  });
  it("ignores an inactive plan and falls back to the manual custom price", () => {
    expect(getDoctorTierPrice("pro", { plan_tier: "pro", custom_plan_price: 1200 }, prices, { ...basePlan, status: "cancelled" })).toBe(1200);
  });
});

describe("diffFeatureSelection", () => {
  const keys = ["a", "b", "c"];
  it("computes additions and removals against the current set", () => {
    expect(diffFeatureSelection(new Set(["a", "b"]), new Set(["b", "c"]), keys)).toEqual({ add: ["c"], remove: ["a"] });
  });
  it("is empty when nothing changed", () => {
    expect(diffFeatureSelection(new Set(["a"]), new Set(["a"]), keys)).toEqual({ add: [], remove: [] });
  });
});

describe("customPlanApplication", () => {
  it("applies when the doctor is on the tier the plan was built on", () => {
    expect(customPlanApplication(basePlan, "pro", now)).toBe("applies");
  });
  it("is a mismatch when the doctor is on another tier: it looks active but changes nothing", () => {
    expect(customPlanApplication(basePlan, "premium", now)).toBe("tier_mismatch");
    // A plan built on 'free' can never match a Pro or Premium doctor.
    expect(customPlanApplication({ ...basePlan, base_tier: "free" }, "premium", now)).toBe("tier_mismatch");
  });
  it("is none outside its dates or when there is no plan", () => {
    expect(customPlanApplication({ ...basePlan, valid_until: "2026-05-31T00:00:00Z" }, "pro", now)).toBe("none");
    expect(customPlanApplication(null, "pro", now)).toBe("none");
  });
});
