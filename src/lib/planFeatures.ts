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

export function getDoctorTierPrice(
  tier: "pro" | "premium",
  profile?: { plan_tier?: string | null; custom_plan_price?: number | null } | null
): number {
  if (!profile || profile.custom_plan_price == null) {
    return TIER_PRICES[tier] ?? 0;
  }
  const currentTier = profile.plan_tier || "pro";
  if (currentTier === tier || ((currentTier === "free" || currentTier === "trial") && tier === "pro")) {
    return Number(profile.custom_plan_price);
  }
  return TIER_PRICES[tier] ?? 0;
}

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
      "Regular checkup alert",
      "Staff roles & access",
    ];
  }
  return [
    "Your branded website",
    "Online appointment booking",
    `Up to ${cap} appointments/month`,
    "Basic analytics",
  ];
}

export type CardState = { badge: string; isCurrent: boolean; showCta: boolean; ctaLabel?: string };

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
      premium: { badge: "Current Plan", isCurrent: true, showCta: true, ctaLabel: "Renew / Schedule" },
      basic: { badge: "Included in your plan", isCurrent: false, showCta: true, ctaLabel: "Switch to Pro (Schedule)" },
    };
  }
  if (planStatus === "active") {
    return {
      basic: { badge: "Current Plan", isCurrent: true, showCta: true, ctaLabel: "Renew / Schedule" },
      premium: { badge: "", isCurrent: false, showCta: true, ctaLabel: "Upgrade to Premium" },
    };
  }
  // hasNoActivePlan(planStatus): expired or cancelled
  return {
    basic: { badge: "Your access level", isCurrent: false, showCta: true, ctaLabel: "Reactivate" },
    premium: { badge: "", isCurrent: false, showCta: true, ctaLabel: "Reactivate" },
  };
}
