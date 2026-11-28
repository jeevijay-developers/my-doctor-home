// Doctor sub-page URLs for the sitemap. A clinic gets /dr/:slug/doctor/:doctorSlug entries only
// when it has at least two active practitioners; a single-doctor clinic's page is the clinic page.
//
// MIRROR: edge functions cannot import from src/, so the rules below are a hand-kept copy of
// src/lib/seo/clinicTeam.ts (MULTI_DOCTOR_MIN_ACTIVE, MIN_INDEXABLE_BIO_CHARS, isPractitionerIndexable).
// src/lib/seo/clinicTeam.test.ts imports both and fails if they drift.
export const MULTI_DOCTOR_MIN_ACTIVE = 2;
export const MIN_INDEXABLE_BIO_CHARS = 60;

export interface SitemapClinic { id: string; slug: string }
export interface SitemapPractitioner {
  doctor_id: string; slug: string; is_active: boolean; updated_at: string | null;
  /** false = opted out of the directory; absent/null (column not migrated yet) counts as listed. */
  directory_listed?: boolean | null;
  /** The doctor's own bio: the page is served noindex (so not listed) until it is a real one. */
  bio?: string | null;
}

export function isIndexableBio(bio?: string | null): boolean {
  return (bio ?? "").replace(/\s+/g, " ").trim().length >= MIN_INDEXABLE_BIO_CHARS;
}

export function practitionerSitemapEntries(
  clinics: SitemapClinic[],
  practitioners: SitemapPractitioner[],
): Array<{ path: string; updated_at: string | null }> {
  const slugById = new Map(clinics.map((c) => [c.id, c.slug]));
  const byClinic = new Map<string, SitemapPractitioner[]>();
  for (const p of practitioners) {
    if (!p.is_active || !p.slug?.trim() || !slugById.has(p.doctor_id)) continue;
    const list = byClinic.get(p.doctor_id) ?? [];
    list.push(p);
    byClinic.set(p.doctor_id, list);
  }
  const out: Array<{ path: string; updated_at: string | null }> = [];
  for (const [clinicId, list] of byClinic) {
    if (list.length < MULTI_DOCTOR_MIN_ACTIVE) continue;
    for (const p of list) {
      // Unlisted doctors still count toward the 2+ rule (their page exists) but are not advertised,
      // and a page without a real bio is served noindex, so it stays out of the sitemap too.
      if (p.directory_listed === false || !isIndexableBio(p.bio)) continue;
      out.push({
        path: `/dr/${encodeURIComponent(slugById.get(clinicId)!)}/doctor/${encodeURIComponent(p.slug.trim())}`,
        updated_at: p.updated_at,
      });
    }
  }
  return out;
}
