// The ONE definition of "multi-doctor clinic" and of "indexable doctor page" for everything that
// runs on the edge: crawler HTML (handleSeoRequest), meta/JSON-LD (doctorSeo) and, by a hand-kept
// copy in supabase/functions/_shared/practitionerSitemap.ts, the sitemap. A test keeps the two in sync.
//
// NOTE: no imports on purpose (bundled by Vercel; also mirrored into Deno).

/** A clinic is a team clinic when it has at least this many ACTIVE doctors (listed or not, bookable or not). */
export const MULTI_DOCTOR_MIN_ACTIVE = 2;

/**
 * A doctor page is thin until the doctor has written a real bio. Below this many characters (after
 * collapsing whitespace) the page is served `noindex, follow` and left out of the sitemap.
 */
export const MIN_INDEXABLE_BIO_CHARS = 60;

export interface TeamMemberLike {
  slug: string;
  is_active?: boolean;
  directory_listed?: boolean | null;
  bio?: string | null;
  specialization?: string | null;
}

/** Active doctors that have a slug, in the order given. */
export function activeTeam<T extends TeamMemberLike>(list?: T[] | null): T[] {
  return (Array.isArray(list) ? list : []).filter((p) => p && p.slug && p.is_active !== false);
}

/**
 * Multi-doctor = 2+ ACTIVE doctors. Doctors who opted out of the directory (directory_listed = false)
 * still count: their page exists and the clinic is visibly a team on the client. They are only left out
 * of what we advertise (crawler list, embedded JSON-LD members, sitemap).
 */
export function isMultiDoctorClinic(list?: TeamMemberLike[] | null): boolean {
  return activeTeam(list).length >= MULTI_DOCTOR_MIN_ACTIVE;
}

/** Active doctors who have not opted out of the directory (null/absent counts as listed). */
export function listedTeam<T extends TeamMemberLike>(list?: T[] | null): T[] {
  return activeTeam(list).filter((p) => p.directory_listed !== false);
}

export function hasIndexableBio(bio?: string | null): boolean {
  return (bio ?? "").replace(/\s+/g, " ").trim().length >= MIN_INDEXABLE_BIO_CHARS;
}

/** A per-doctor page may be indexed only when the doctor is listed AND has a real bio. */
export function isPractitionerIndexable(p: TeamMemberLike): boolean {
  return p.directory_listed !== false && hasIndexableBio(p.bio);
}

/** Distinct specialties (case-insensitive), most common first, then in doctor order. */
export function distinctSpecialties(list?: TeamMemberLike[] | null): string[] {
  const seen = new Map<string, { label: string; count: number; first: number }>();
  activeTeam(list).forEach((d, i) => {
    const label = (d.specialization ?? "").trim().replace(/\s+/g, " ");
    if (!label) return;
    const key = label.toLowerCase();
    const hit = seen.get(key);
    if (hit) hit.count += 1;
    else seen.set(key, { label, count: 1, first: i });
  });
  return [...seen.values()].sort((a, b) => b.count - a.count || a.first - b.first).map((s) => s.label);
}
