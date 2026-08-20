import { usePlatformSettings } from "./usePlatformSettings";

export const FALLBACK_PLAN_PRICES = { pro: 1499, premium: 3999, free: 0 } as const;

export interface PlanPrices {
  proPrice: number;
  premiumPrice: number;
  loading: boolean;
}

/**
 * Reads the current platform-wide default plan prices from `platform_settings`.
 * Falls back to the legacy hardcoded values (1499 / 3999) while loading or if
 * the keys haven't been seeded yet — so the UI is never blank.
 *
 * Custom per-doctor overrides (`custom_plan_price` on `profiles`) are NOT
 * handled here — this hook only returns the global defaults.
 */
export function usePlanPrices(): PlanPrices {
  const { settings, loading } = usePlatformSettings();

  const proPrice =
    settings.pro_default_price != null
      ? Number(settings.pro_default_price)
      : FALLBACK_PLAN_PRICES.pro;

  const premiumPrice =
    settings.premium_default_price != null
      ? Number(settings.premium_default_price)
      : FALLBACK_PLAN_PRICES.premium;

  return { proPrice, premiumPrice, loading };
}

/** Convenience: build a Record<string, number> compatible with DEFAULT_PLAN_PRICES. */
export function planPricesToRecord(prices: Pick<PlanPrices, "proPrice" | "premiumPrice">): Record<string, number> {
  return { free: 0, pro: prices.proPrice, premium: prices.premiumPrice };
}
