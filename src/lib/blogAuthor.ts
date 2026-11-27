import type { PublicPractitioner } from "@/lib/practitioners/types";

/** "Dr. X" without doubling the prefix (and never mistaking "Drake" for one). */
export const authorDisplayName = (name: string): string => {
  const n = name.trim();
  return /^dr\.?\s/i.test(n) ? n : `Dr. ${n}`;
};

/**
 * The practitioner to credit on a public article, or null for the clinic byline.
 * Only when the post names a doctor AND the clinic has 2+ active doctors AND that
 * doctor is among them; anything else (unknown team, failed fetch) stays the clinic.
 */
export function resolveBlogAuthor(
  post: { practitioner_id?: string | null },
  team: PublicPractitioner[] | null,
): { practitioner: PublicPractitioner; clinicTeamSize: number } | null {
  if (!post.practitioner_id || !team || team.length < 2) return null;
  const practitioner = team.find((d) => d.id === post.practitioner_id);
  return practitioner ? { practitioner, clinicTeamSize: team.length } : null;
}

/** Link target for the author's own page, only when they are listed. */
export const authorHref = (clinicSlug: string, p: PublicPractitioner): string | null =>
  p.directory_listed && p.slug ? `/dr/${clinicSlug}/doctor/${p.slug}` : null;
