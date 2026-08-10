import { describe, it, expect } from "vitest";
import { TIER_LABELS, TIER_PRICES, hasNoActivePlan, getTierFeatures, getSubscriptionCardStates } from "./planFeatures";

describe("planFeatures", () => {
  it("labels free and pro identically as Pro, premium as Premium", () => {
    expect(TIER_LABELS.free).toBe("Pro");
    expect(TIER_LABELS.pro).toBe("Pro");
    expect(TIER_LABELS.premium).toBe("Premium");
  });

  it("exposes real prices", () => {
    expect(TIER_PRICES.pro).toBe(1499);
    expect(TIER_PRICES.premium).toBe(3999);
  });

  it("hasNoActivePlan is true only for expired and cancelled", () => {
    expect(hasNoActivePlan("expired")).toBe(true);
    expect(hasNoActivePlan("cancelled")).toBe(true);
    expect(hasNoActivePlan("trial")).toBe(false);
    expect(hasNoActivePlan("active")).toBe(false);
  });

  it("getTierFeatures includes the live cap for pro, omits it for premium", () => {
    const basic = getTierFeatures("pro", 100);
    expect(basic.some((f) => f.includes("100"))).toBe(true);
    expect(basic).not.toContain("Online consultation");

    const premium = getTierFeatures("premium", 100);
    expect(premium).toContain("All features included in Pro plan");
    expect(premium).toContain("Online consultation");
    expect(premium).toContain("Billing & invoices");
    expect(premium).toContain("AI blog writer");
    expect(premium.some((f) => f.includes("Regular checkup alert") && f.includes("Coming soon"))).toBe(true);
    expect(premium.some((f) => f.includes("Staff roles & access") && f.includes("Coming soon"))).toBe(true);
  });

  it("trial: premium is current via trial, basic has no CTA", () => {
    const { basic, premium } = getSubscriptionCardStates("trial", "free", true);
    expect(premium.isCurrent).toBe(true);
    expect(premium.showCta).toBe(false);
    expect(basic.showCta).toBe(false);
  });

  it("active premium tier: premium current, basic informational only", () => {
    const { basic, premium } = getSubscriptionCardStates("active", "premium", true);
    expect(premium.isCurrent).toBe(true);
    expect(premium.showCta).toBe(false);
    expect(basic.isCurrent).toBe(false);
    expect(basic.showCta).toBe(false);
  });

  it("active basic tier: basic current with no CTA, premium shows CTA", () => {
    const { basic, premium } = getSubscriptionCardStates("active", "pro", false);
    expect(basic.isCurrent).toBe(true);
    expect(basic.showCta).toBe(false);
    expect(premium.showCta).toBe(true);
  });

  it("expired: neither card is current, both show a CTA", () => {
    const { basic, premium } = getSubscriptionCardStates("expired", "free", false);
    expect(basic.isCurrent).toBe(false);
    expect(basic.showCta).toBe(true);
    expect(premium.isCurrent).toBe(false);
    expect(premium.showCta).toBe(true);
  });

  it("cancelled: same treatment as expired", () => {
    const { basic, premium } = getSubscriptionCardStates("cancelled", "free", false);
    expect(basic.showCta).toBe(true);
    expect(premium.showCta).toBe(true);
  });
});
