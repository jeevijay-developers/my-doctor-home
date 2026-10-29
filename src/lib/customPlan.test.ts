import { describe, it, expect } from "vitest";
import {
  applyCustomPlanToBullets, controlFromLimit, customPlanApplication, describeAppointmentsLimit, diffFeatureSelection, isCustomPlanActive,
  isValidAppointmentsLimit, limitFromControl, type CustomPlan,
} from "./customPlan";
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

describe("monthly appointment limit", () => {
  it("validates a whole number from 1 to 100000", () => {
    expect(isValidAppointmentsLimit(300)).toBe(true);
    expect(isValidAppointmentsLimit(0)).toBe(false);
    expect(isValidAppointmentsLimit(-1)).toBe(false); // -1 means unlimited and is never typed
    expect(isValidAppointmentsLimit(2.5)).toBe(false);
    expect(isValidAppointmentsLimit(100001)).toBe(false);
  });

  it("turns the control into the value to send, and back", () => {
    expect(limitFromControl("keep", "")).toEqual({ value: null, valid: true });
    expect(limitFromControl("unlimited", "")).toEqual({ value: -1, valid: true });
    expect(limitFromControl("number", "300")).toEqual({ value: 300, valid: true });
    expect(limitFromControl("number", "")).toEqual({ value: null, valid: false });
    expect(limitFromControl("number", "abc")).toEqual({ value: null, valid: false });
    expect(limitFromControl("number", "0")).toEqual({ value: null, valid: false });
    expect(controlFromLimit(null)).toEqual({ mode: "keep", numberText: "" });
    expect(controlFromLimit(-1)).toEqual({ mode: "unlimited", numberText: "" });
    expect(controlFromLimit(300)).toEqual({ mode: "number", numberText: "300" });
  });

  it("describes a limit in words", () => {
    expect(describeAppointmentsLimit(null, 100)).toBe("Standard (100 per month)");
    expect(describeAppointmentsLimit(null)).toBe("Standard limit");
    expect(describeAppointmentsLimit(-1)).toBe("Unlimited");
    expect(describeAppointmentsLimit(300)).toBe("300 per month");
  });

  const proBullets = ["Your branded website", "Online appointment booking", "Up to 100 appointments/month", "Basic analytics"];

  it("replaces the Pro card's appointment line with the custom limit", () => {
    const withLimit = applyCustomPlanToBullets(proBullets, { ...basePlan, monthly_appointments_limit: 300, extra_features: [], removed_features: [] }, "pro");
    expect(withLimit.map((b) => b.text)).not.toContain("Up to 100 appointments/month");
    expect(withLimit).toContainEqual({ text: "Up to 300 appointments/month", kind: "added" });

    const unlimited = applyCustomPlanToBullets(proBullets, { ...basePlan, monthly_appointments_limit: -1, extra_features: [], removed_features: [] }, "pro");
    expect(unlimited).toContainEqual({ text: "Unlimited appointments", kind: "added" });
  });

  it("leaves the standard line alone with no custom limit, and never touches another tier's card", () => {
    const standard = applyCustomPlanToBullets(proBullets, { ...basePlan, monthly_appointments_limit: null, extra_features: [], removed_features: [] }, "pro");
    expect(standard.map((b) => b.text)).toContain("Up to 100 appointments/month");
    const premiumCard = applyCustomPlanToBullets(["Unlimited appointments"], { ...basePlan, monthly_appointments_limit: 300 }, "premium");
    expect(premiumCard).toEqual([{ text: "Unlimited appointments", kind: "base" }]);
  });
});
