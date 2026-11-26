// Doctor sub-page URLs for the sitemap. A clinic gets /dr/:slug/doctor/:doctorSlug entries only
// when it has at least two active practitioners; a single-doctor clinic's page is the clinic page.
export interface SitemapClinic { id: string; slug: string }
export interface SitemapPractitioner { doctor_id: string; slug: string; is_active: boolean; updated_at: string | null }

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
    if (list.length < 2) continue;
    for (const p of list) {
      out.push({
        path: `/dr/${encodeURIComponent(slugById.get(clinicId)!)}/doctor/${encodeURIComponent(p.slug.trim())}`,
        updated_at: p.updated_at,
      });
    }
  }
  return out;
}
