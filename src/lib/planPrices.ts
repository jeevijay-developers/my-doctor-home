// Default plan prices (INR / month). Single source of truth for default pricing.
// Kept as a static fallback constant for code that can't read the DB (the live
// values come from platform_settings via usePlanPrices). Lives in lib/ — not in
// a superadmin component — so lib code never imports from UI.
export const DEFAULT_PLAN_PRICES: Record<string, number> = {
  free: 0,
  pro: 1499,
  premium: 3999,
};

export const getEffectivePlanPrice = (
  profile: { plan_tier?: string | null; custom_plan_price?: number | null },
  defaultPrices: Record<string, number> = DEFAULT_PLAN_PRICES,
) => {
  if (profile.custom_plan_price != null) return Number(profile.custom_plan_price);
  return defaultPrices[profile.plan_tier || "free"] ?? 0;
};
