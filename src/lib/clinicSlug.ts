// Clinic website address helpers (spec 2026-11-28 D1/D2). The database is the authority
// (slug_is_valid / clinic_slug_problem in 20261128110000_clinic_slug_rules.sql); this file only
// gives instant feedback and builds links, so keep the numbers and the reserved list in sync by hand.
import { directorySlug } from "./directory/slug";

export const CLINIC_SLUG_MIN = 3;
export const CLINIC_SLUG_MAX = 50;

export const RESERVED_SLUGS: readonly string[] = [
  "auth", "admin", "superadmin", "doctors", "doctor", "dr", "health-articles", "health", "articles", "rx", "pricing",
  "about", "features", "contact", "demo", "terms", "privacy", "refund-policy", "refund", "onboarding", "api", "assets",
  "fonts", "blog", "queue", "manage", "www", "app", "login", "signup", "register", "settings", "support", "help",
  "sitemap", "robots", "static", "public", "doctylia", "null", "undefined", "new", "edit", "dashboard", "profile",
];

export type SlugErrorCode = "SLUG_INVALID" | "SLUG_TAKEN" | "SLUG_RESERVED" | "NOT_ALLOWED";

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Lower-cases and trims what the owner typed; spaces and punctuation become dashes. */
export function normalizeSlugInput(input: string): string {
  return directorySlug(input);
}

/** Instant, offline check. NULL means the format is fine (the database still checks availability). */
export function validateSlugFormat(slug: string): SlugErrorCode | null {
  if (slug.length < CLINIC_SLUG_MIN || slug.length > CLINIC_SLUG_MAX || !SLUG_RE.test(slug)) return "SLUG_INVALID";
  if (RESERVED_SLUGS.includes(slug)) return "SLUG_RESERVED";
  return null;
}

export function slugErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case "SLUG_INVALID":
      return `Use ${CLINIC_SLUG_MIN}-${CLINIC_SLUG_MAX} letters, numbers or single dashes (no dash at the start or end).`;
    case "SLUG_RESERVED":
      return "This word is reserved. Please choose another address.";
    case "SLUG_TAKEN":
      return "This address is already used by another clinic. Please choose another.";
    case "NOT_ALLOWED":
      return "You do not have permission to change the website address.";
    default:
      return "Could not save the website address. Please try again.";
  }
}

export function clinicSitePath(slug: string): string {
  return `/dr/${slug}`;
}

/** Display form without protocol, e.g. `doctylia.com/dr/sunrise-clinic`. */
export function clinicDisplayUrl(slug: string, host = "doctylia.com"): string {
  return `${host}${clinicSitePath(slug)}`;
}

/**
 * Re-point a /dr/<oldSlug>... location at the clinic's current slug, keeping the rest of the path
 * (`/blog`, `/manage`, `/queue`, `/doctor/x`, ...) and the query string. Returns null when the
 * path is not under /dr/<oldSlug>.
 */
export function swapSlugInPath(pathname: string, oldSlug: string, newSlug: string, search = "", hash = ""): string | null {
  const prefix = `/dr/${oldSlug}`;
  if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return null;
  return `/dr/${newSlug}${pathname.slice(prefix.length)}${search}${hash}`;
}

/** The banner suggests a switch only when the suggestion differs from the current address. */
export function shouldOfferAddressBanner(opts: {
  activePractitioners: number;
  currentSlug: string | null | undefined;
  suggestedSlug: string | null | undefined;
  dismissed: boolean;
  isOwner: boolean;
  slugLocked?: boolean | null;
}): boolean {
  const { activePractitioners, currentSlug, suggestedSlug, dismissed, isOwner, slugLocked } = opts;
  if (!isOwner || dismissed || slugLocked) return false;
  if (activePractitioners < 2) return false;
  if (!currentSlug || !suggestedSlug) return false;
  return currentSlug !== suggestedSlug;
}

export const addressBannerKey = (clinicId: string) => `doctylia:clinic-address-banner-dismissed:${clinicId}`;

export function isAddressBannerDismissed(clinicId: string): boolean {
  try {
    return window.localStorage.getItem(addressBannerKey(clinicId)) === "1";
  } catch {
    return false;
  }
}

export function dismissAddressBanner(clinicId: string): void {
  try {
    window.localStorage.setItem(addressBannerKey(clinicId), "1");
  } catch {
    /* private mode: the banner simply shows again */
  }
}
