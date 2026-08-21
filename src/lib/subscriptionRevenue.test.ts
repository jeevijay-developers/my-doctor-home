import { describe, it, expect } from "vitest";
import { bucketPaymentStatus, computeRevenueTotals, computeEstimatedMRR } from "./subscriptionRevenue";

describe("bucketPaymentStatus", () => {
  it("maps each raw payment_txn_status value to its UI bucket", () => {
    expect(bucketPaymentStatus("captured")).toBe("Paid");
    expect(bucketPaymentStatus("created")).toBe("Pending");
    expect(bucketPaymentStatus("authorized")).toBe("Pending");
    expect(bucketPaymentStatus("failed")).toBe("Failed");
    expect(bucketPaymentStatus("refunded")).toBe("Refunded");
  });
});

describe("computeRevenueTotals", () => {
  // 2026-08-11 is a Tuesday; the week (Sun-start) runs 2026-08-09..2026-08-15.
  const now = new Date("2026-08-11T12:00:00.000Z");

  it("sums only captured payments within each window", () => {
    const payments = [
      { amount: 100, status: "captured" as const, created_at: "2026-08-11T09:00:00.000Z" }, // today
      { amount: 200, status: "captured" as const, created_at: "2026-08-09T09:00:00.000Z" }, // this week, not today
      { amount: 300, status: "captured" as const, created_at: "2026-08-02T09:00:00.000Z" }, // this month, not this week
      { amount: 400, status: "failed" as const, created_at: "2026-08-11T09:00:00.000Z" }, // excluded: not captured
      { amount: 500, status: "captured" as const, created_at: "2026-07-01T09:00:00.000Z" }, // excluded: last month
    ];
    const totals = computeRevenueTotals(payments, now);
    expect(totals.today).toBe(100);
    expect(totals.week).toBe(300);
    expect(totals.month).toBe(600);
  });

  it("includes mock payments in the totals (mock payments are not excluded)", () => {
    const payments = [{ amount: 99, status: "captured" as const, created_at: "2026-08-11T09:00:00.000Z" }];
    expect(computeRevenueTotals(payments, now).today).toBe(99);
  });
});

describe("computeEstimatedMRR", () => {
  it("sums active pro/premium doctors using custom price or default tier price", () => {
    const profiles = [
      { plan_status: "active", plan_tier: "pro", custom_plan_price: null }, // default 1499
      { plan_status: "active", plan_tier: "premium", custom_plan_price: 2999 }, // custom override
      { plan_status: "trial", plan_tier: "premium", custom_plan_price: null }, // excluded: not active
      { plan_status: "active", plan_tier: "free", custom_plan_price: null }, // excluded: free tier
      { plan_status: "cancelled", plan_tier: "pro", custom_plan_price: null }, // excluded: cancelled
    ];
    expect(computeEstimatedMRR(profiles)).toBe(1499 + 2999);
  });

  it("uses provided custom defaultPrices if passed", () => {
    const profiles = [
      { plan_status: "active", plan_tier: "pro", custom_plan_price: null },
      { plan_status: "active", plan_tier: "premium", custom_plan_price: null },
    ];
    const customDefaults = { free: 0, pro: 1999, premium: 4999 };
    expect(computeEstimatedMRR(profiles, customDefaults)).toBe(1999 + 4999);
  });
});
