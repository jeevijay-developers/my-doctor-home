import { DEFAULT_PLAN_PRICES } from "@/components/superadmin/SASubscriptions";

export const TIER_LABELS: Record<string, string> = {
  free: "Basic",
  pro: "Basic",
  premium: "Premium",
};

export const TIER_PRICES: Record<string, number> = DEFAULT_PLAN_PRICES;

export function hasNoActivePlan(planStatus: string): boolean {
  return planStatus === "expired" || planStatus === "cancelled";
}

export function getTierFeatures(tier: "pro" | "premium", cap: number): string[] {
  if (tier === "premium") {
    return [
      "All features included in Basic plan",
      "Unlimited Appointment Booking",
      "Online Consultation (Zoom)",
      "Billing & Invoices",
      "AI Blog Writer",
    ];
  }
  return [
    "Website Builder",
    `Appointment Booking (up to ${cap}/month)`,
    "Patient Records",
    "Manual Blog Posts",
    "Basic Analytics",
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
