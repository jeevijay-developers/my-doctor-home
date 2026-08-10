import { DEFAULT_PLAN_PRICES } from "@/components/superadmin/SASubscriptions";

export const TIER_LABELS: Record<string, string> = {
  free: "Pro",
  pro: "Pro",
  premium: "Premium",
};

export const TIER_TAGLINES: Record<"pro" | "premium", string> = {
  pro: "Perfect for solo doctors going digital",
  premium: "For growing practices that need everything",
};

export const TIER_PRICES: Record<string, number> = DEFAULT_PLAN_PRICES;

// Fallback shown when appointmentsCap is 0 — either usePlanAccess is still loading,
// or the viewing doctor is Premium (whose real cap is legitimately 0/inapplicable)
// but the Pro card still needs a real number to describe what Pro actually includes.
// Matches the live platform_settings.basic_appointment_cap default.
export const DEFAULT_APPOINTMENT_CAP = 100;

export function hasNoActivePlan(planStatus: string): boolean {
  return planStatus === "expired" || planStatus === "cancelled";
}

export function getTierFeatures(tier: "pro" | "premium", cap: number): string[] {
  if (tier === "premium") {
    return [
      `All features included in ${TIER_LABELS.pro} plan`,
      "Unlimited appointments",
      "Online consultation",
      "AI blog writer",
      "Billing & invoices",
      "Patient records",
      "Regular checkup alert (Coming soon)",
      "Staff roles & access (Coming soon)",
    ];
  }
  return [
    "Your branded website",
    "Online appointment booking",
    `Up to ${cap} appointments/month`,
    "Basic analytics",
  ];
}

export type CardState = { badge: string; isCurrent: boolean; showCta: boolean };

export function getSubscriptionCardStates(
  planStatus: string,
  planTier: string,
  isPremium: boolean
): { basic: CardState; premium: CardState } {
  if (planStatus === "trial") {
    return {
      premium: { badge: "Included via your trial", isCurrent: true, showCta: false },
      basic: { badge: "What you'll have after your trial ends", isCurrent: false, showCta: false },
    };
  }
  if (isPremium) {
    return {
      premium: { badge: "Current Plan", isCurrent: true, showCta: false },
      basic: { badge: "Included in your plan", isCurrent: false, showCta: false },
    };
  }
  if (planStatus === "active") {
    return {
      basic: { badge: "Current Plan", isCurrent: true, showCta: false },
      premium: { badge: "", isCurrent: false, showCta: true },
    };
  }
  // hasNoActivePlan(planStatus): expired or cancelled
  return {
    basic: { badge: "Your access level", isCurrent: false, showCta: true },
    premium: { badge: "", isCurrent: false, showCta: true },
  };
}
