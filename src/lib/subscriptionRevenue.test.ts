import { describe, it, expect } from "vitest";
import { bucketPaymentStatus, computeRevenueTotals, computeEstimatedMRR, paymentKindLabel, seatPeriodsMonthly } from "./subscriptionRevenue";

describe("bucketPaymentStatus", () => {
  it("maps each raw payment_txn_status value to its UI bucket", () => {
    expect(bucketPaymentStatus("captured")).toBe("Paid");
    expect(bucketPaymentStatus("abandoned")).toBe("Abandoned");
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

describe("computeEstimatedMRR with custom plans and lapsed plans", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const plan = (over: Record<string, unknown> = {}) => ({
    doctor_id: "d1", request_id: "r1", base_tier: "premium", extra_features: [], removed_features: [],
    monthly_price: 800, valid_from: "2026-01-01T00:00:00Z", valid_until: null, status: "active" as const, ...over,
  });

  it("counts an active approved custom plan at its price, ahead of the manual and default price", () => {
    const profiles = [{ id: "d1", plan_status: "active", plan_tier: "premium", custom_plan_price: 2999, plan_end: null }];
    expect(computeEstimatedMRR(profiles, undefined, new Map([["d1", plan()]]), now)).toBe(800);
  });

  it("ignores a custom plan that has expired or belongs to another tier", () => {
    const profiles = [{ id: "d1", plan_status: "active", plan_tier: "premium", custom_plan_price: null, plan_end: null }];
    expect(computeEstimatedMRR(profiles, undefined, new Map([["d1", plan({ valid_until: "2026-05-01T00:00:00Z" })]]), now)).toBe(3999);
    expect(computeEstimatedMRR(profiles, undefined, new Map([["d1", plan({ base_tier: "pro" })]]), now)).toBe(3999);
  });

  it("does not count a doctor whose paid period has already ended", () => {
    const profiles = [{ id: "d1", plan_status: "active", plan_tier: "pro", custom_plan_price: null, plan_end: "2026-05-01T00:00:00Z" }];
    expect(computeEstimatedMRR(profiles, undefined, new Map(), now)).toBe(0);
  });
});

describe("paymentKindLabel", () => {
  it("labels plan and seat payments", () => {
    expect(paymentKindLabel(undefined, null)).toBe("Plan");
    expect(paymentKindLabel("plan", null)).toBe("Plan");
    expect(paymentKindLabel("plan", 2)).toBe("Plan + 2 seats");
    expect(paymentKindLabel("plan", 1)).toBe("Plan + 1 seat");
    expect(paymentKindLabel("seats", 3)).toBe("Doctor seats ×3");
    expect(paymentKindLabel("seats", null)).toBe("Doctor seats");
  });
});

describe("seat periods in estimated MRR", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const premium = [{ id: "d1", plan_status: "active", plan_tier: "premium", custom_plan_price: null, plan_end: null }];
  const period = (over: Record<string, unknown> = {}) => ({
    quantity: 2, starts_at: "2026-05-20T00:00:00Z", ends_at: "2026-06-20T00:00:00Z", plan_upgrade_payments: { unit_price: 500 }, ...over,
  });

  it("sums only periods active now, quantity x unit price", () => {
    const periods = [
      period(),
      period({ starts_at: "2026-06-10T00:00:00Z" }), // future
      period({ ends_at: "2026-05-30T00:00:00Z" }), // ended
    ];
    expect(seatPeriodsMonthly(periods, now)).toBe(1000);
    expect(computeEstimatedMRR(premium, undefined, new Map(), now, periods)).toBe(3999 + 1000);
  });

  it("reads an embedded payment given as an array and ignores a missing price", () => {
    expect(seatPeriodsMonthly([period({ plan_upgrade_payments: [{ unit_price: 300 }] }), period({ plan_upgrade_payments: null })], now)).toBe(600);
  });

  it("skips mock payments and an unknown (NULL) unit price", () => {
    const periods = [
      period({ plan_upgrade_payments: { unit_price: 500, is_mock: true } }),
      period({ plan_upgrade_payments: { unit_price: null } }),
      period(),
    ];
    expect(seatPeriodsMonthly(periods, now)).toBe(1000);
  });

  it("excludes needs_refund captured payments from the revenue totals", () => {
    const at = new Date("2026-06-01T10:00:00Z");
    const t = computeRevenueTotals([
      { amount: 100, status: "captured", created_at: at.toISOString() },
      { amount: 900, status: "captured", created_at: at.toISOString(), needs_refund: true },
    ], at);
    expect(t.today).toBe(100);
  });

  it("keeps today's MRR when no periods are given", () => {
    expect(computeEstimatedMRR(premium, undefined, new Map(), now)).toBe(3999);
    expect(computeEstimatedMRR(premium, undefined, new Map(), now, [])).toBe(3999);
  });
});
