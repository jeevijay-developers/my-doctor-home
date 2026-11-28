// Clinic website address helpers (spec 2026-11-28 D1/D2). The address is set by the database
// (automatically when a clinic gets its 2nd active doctor, 20261128130000_auto_clinic_address.sql);
// this file only builds links and re-points old ones.

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
