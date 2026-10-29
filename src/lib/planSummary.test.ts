import { describe, expect, it } from "vitest";
import { planTierName, summarizePlan } from "./planSummary";

const now = new Date("2026-10-29T10:00:00Z");
const inDays = (n: number, extraHours = 0) => new Date(now.getTime() + n * 86_400_000 + extraHours * 3_600_000).toISOString();

describe("summarizePlan", () => {
  it("counts whole days left and names the end date for a paid plan", () => {
    const s = summarizePlan({ plan_tier: "premium", plan_status: "active", plan_end: inDays(30) }, now);
    expect(s.kind).toBe("paid");
    expect(s.daysLeft).toBe(30);
    expect(s.chip).toBe("Premium · 30 days left");
    expect(s.detail).toMatch(/active until Nov 28, 2026 \(30 days left\)/);
    expect(s.urgency).toBe("ok");
  });

  it("rounds a partial day up and says 'ends today' inside the last 24 hours", () => {
    const s = summarizePlan({ plan_tier: "pro", plan_status: "active", plan_end: inDays(0, 5) }, now);
    expect(s.daysLeft).toBe(1);
    expect(s.endsToday).toBe(true);
    expect(s.chip).toBe("Pro · ends today");
    expect(s.urgency).toBe("critical");
  });

  it("raises urgency in the last week and last three days", () => {
    expect(summarizePlan({ plan_tier: "pro", plan_status: "active", plan_end: inDays(7) }, now).urgency).toBe("soon");
    expect(summarizePlan({ plan_tier: "pro", plan_status: "active", plan_end: inDays(3) }, now).urgency).toBe("critical");
    expect(summarizePlan({ plan_tier: "pro", plan_status: "active", plan_end: inDays(8) }, now).urgency).toBe("ok");
  });

  it("uses trial_end for a trial", () => {
    const s = summarizePlan({ plan_tier: "free", plan_status: "trial", trial_end: inDays(4) }, now);
    expect(s.kind).toBe("trial");
    expect(s.chip).toBe("Free trial · 4 days left");
  });

  it("treats a plan past its end date as ended even before the nightly job flips the status", () => {
    const s = summarizePlan({ plan_tier: "premium", plan_status: "active", plan_end: inDays(-1) }, now);
    expect(s.kind).toBe("expired");
    expect(s.urgency).toBe("ended");
    expect(s.chip).toBe("Premium plan ended");
  });

  it("reports an expired trial and a suspended account plainly", () => {
    expect(summarizePlan({ plan_tier: "free", plan_status: "expired", trial_end: inDays(-2) }, now).chip).toBe("Free trial ended");
    expect(summarizePlan({ plan_tier: "pro", plan_status: "cancelled", plan_end: inDays(10) }, now).chip).toBe("Account suspended");
  });

  it("copes with a missing profile and with no end date", () => {
    expect(summarizePlan(null, now).kind).toBe("unknown");
    const s = summarizePlan({ plan_tier: "premium", plan_status: "active", plan_end: null }, now);
    expect(s.chip).toBe("Premium");
    expect(s.daysLeft).toBeNull();
  });

  it("never shows a day count for a suspended account, on any screen size", () => {
    const s = summarizePlan({ plan_tier: "pro", plan_status: "cancelled", plan_end: inDays(10) }, now);
    expect(s.short).toBe("Suspended");
    expect(s.chip).toBe("Account suspended");
    expect(s.urgency).toBe("ended");
  });

  it("gives a short label for narrow screens", () => {
    expect(summarizePlan({ plan_tier: "premium", plan_status: "active", plan_end: inDays(30) }, now).short).toBe("30d");
    expect(summarizePlan({ plan_tier: "premium", plan_status: "active", plan_end: inDays(-1) }, now).short).toBe("Ended");
    expect(summarizePlan({ plan_tier: "premium", plan_status: "active", plan_end: null }, now).short).toBe("Premium");
  });

  it("decides 'ends today' by the clinic's (IST) calendar day, not a rolling 24 hours", () => {
    // 22:00 IST on Oct 29 (= 16:30Z)
    const lateEvening = new Date("2026-10-29T16:30:00Z");
    // ends 00:30 IST on Oct 30: only 2.5 hours away, but tomorrow's date
    const afterMidnight = summarizePlan({ plan_tier: "pro", plan_status: "active", plan_end: "2026-10-29T19:00:00Z" }, lateEvening);
    expect(afterMidnight.endsToday).toBe(false);
    expect(afterMidnight.daysLeft).toBe(1);
    // ends 23:30 IST the same evening
    const sameEvening = summarizePlan({ plan_tier: "pro", plan_status: "active", plan_end: "2026-10-29T18:00:00Z" }, lateEvening);
    expect(sameEvening.endsToday).toBe(true);
  });

  it("names the end date in IST whatever the browser's time zone", () => {
    // 20:00Z on Nov 28 is already Nov 29 in India
    const s = summarizePlan({ plan_tier: "premium", plan_status: "active", plan_end: "2026-11-28T20:00:00Z" }, now);
    expect(s.detail).toMatch(/active until Nov 29, 2026/);
  });

  it("calls a trial that has run out 'ended' and never labels the Free tier 'Pro'", () => {
    expect(summarizePlan({ plan_tier: "free", plan_status: "trial", trial_end: inDays(-1) }, now).chip).toBe("Free trial ended");
    expect(planTierName("free")).toBe("Free");
    expect(summarizePlan({ plan_tier: "free", plan_status: "active", plan_end: inDays(5) }, now).chip).toBe("Free · 5 days left");
  });
});
