// The hero fields of My Website -> Hero Banner, and how the public site reads them.
// Shared by the admin editor and the site so both agree on what is "the doctor's own".

import { isDefaultDescription, isDefaultHeadline, PLATFORM_DEFAULT_CLAIMS } from "./doctorFacts";

// Wording the platform pre-fills in every new clinic's settings (column defaults). The site
// never shows it (it is not the doctor's own), so the editor shows these fields as empty.
const DEFAULT_LABELS: Record<string, string> = {
  hero_location_label: "clinic location",
  hero_hours_label: "consultation",
  hero_primary_button_label: "book appointment",
  hero_secondary_button_label: "call now",
  hero_directions_label: "get directions",
};

type HeroSettingsLike = Record<string, unknown> & {
  hero_headline_line1?: string | null;
  hero_headline_line2?: string | null;
  hero_description?: string | null;
  hero_stat_text?: string | null;
};

/**
 * Blanks the platform's pre-filled hero text, so the editor shows exactly what the site uses:
 * an empty field means "use the automatic text", anything typed appears on the site.
 */
export function withoutPlatformDefaults<T extends HeroSettingsLike>(settings: T): T {
  const next: HeroSettingsLike = { ...settings };
  if (isDefaultHeadline(next.hero_headline_line1, next.hero_headline_line2)) {
    next.hero_headline_line1 = "";
    next.hero_headline_line2 = "";
  }
  if (isDefaultDescription(next.hero_description)) next.hero_description = "";
  if (PLATFORM_DEFAULT_CLAIMS.has(String(next.hero_stat_text ?? "").trim().toLowerCase())) next.hero_stat_text = "";
  for (const [key, value] of Object.entries(DEFAULT_LABELS)) {
    if (String(next[key] ?? "").trim().toLowerCase() === value) next[key] = "";
  }
  return next as T;
}

export type HeroBadge = { value: string; label: string; icon: string };

/**
 * The floating badge on the hero photo: the doctor's own badge text when they wrote one,
 * else their rating, else their experience. Null when the doctor switched the badge off.
 */
export function heroPhotoBadge(
  settings: { show_hero_stat_badge?: boolean | null; hero_stat_text?: string | null; hero_stat_icon?: string | null } | null | undefined,
  facts: { id: string; value: string; label: string }[],
): HeroBadge | null {
  if (settings?.show_hero_stat_badge === false) return null;
  const own = String(settings?.hero_stat_text ?? "").trim();
  if (own && !PLATFORM_DEFAULT_CLAIMS.has(own.toLowerCase())) {
    return { value: own, label: "", icon: settings?.hero_stat_icon || "Award" };
  }
  const rating = facts.find((f) => f.id === "rating");
  if (rating) return { value: `${rating.value} / 5`, label: rating.label, icon: "Star" };
  const experience = facts.find((f) => f.id === "experience");
  if (experience) return { value: experience.value, label: "Experience", icon: "Award" };
  return null;
}

// --- Live preview: My Website sends unsaved settings to the preview frame. ---------------

export const PREVIEW_SETTINGS_MESSAGE = "doctylia:preview-settings";

export type PreviewSettingsMessage = { type: typeof PREVIEW_SETTINGS_MESSAGE; slug: string; settings: Record<string, unknown> };

/** Accepts only our own message, from the page that framed us, on the same site. */
export function readPreviewMessage(event: MessageEvent, slug: string | undefined): Record<string, unknown> | null {
  if (typeof window === "undefined" || window.parent === window) return null;
  if (event.origin !== window.location.origin || event.source !== window.parent) return null;
  const data = event.data as Partial<PreviewSettingsMessage> | null;
  if (!data || data.type !== PREVIEW_SETTINGS_MESSAGE || !slug || data.slug !== slug) return null;
  return data.settings && typeof data.settings === "object" ? data.settings : null;
}
