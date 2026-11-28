import type { PublicPractitioner } from "@/lib/practitioners/types";
import { doctorProfilePath } from "@/lib/doctorSite/teamClinic";

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

/** A clinic with 2+ active doctors: articles are credited per doctor and the copy is about the clinic. */
export const isTeamList = (team: PublicPractitioner[] | null | undefined): team is PublicPractitioner[] =>
  !!team && team.length >= 2;

/**
 * The `?author=` value that stands for the clinic itself. A doctor's slug wins if it is literally
 * "clinic"; the underscore can never appear in a generated slug, so the fallback cannot collide.
 */
export const clinicAuthorKey = (team: PublicPractitioner[] | null | undefined): string =>
  (team ?? []).some((d) => d.slug === "clinic") ? "_clinic" : "clinic";

/**
 * Which `?author=` bucket a post belongs to: its doctor's slug when that doctor is still among the
 * clinic's active doctors, otherwise the clinic (no doctor, or the doctor was deactivated). An
 * unlisted doctor keeps their own bucket, same as the byline (named, just not linked).
 */
export const postAuthorKey = (post: { practitioner_id?: string | null }, team: PublicPractitioner[] | null): string => {
  const hit = resolveBlogAuthor(post, team);
  return hit ? hit.practitioner.slug : clinicAuthorKey(team);
};

export interface AuthorFilterOption { key: string; label: string; count: number }

/** Chips for the article list: each doctor with posts (team order), then the clinic. Empty unless there is a real choice. */
export function authorFilterOptions<T extends { practitioner_id?: string | null }>(posts: T[], team: PublicPractitioner[] | null): AuthorFilterOption[] {
  if (!isTeamList(team)) return [];
  const counts = new Map<string, number>();
  for (const p of posts) {
    const k = postAuthorKey(p, team);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  if (counts.size < 2) return [];
  const options: AuthorFilterOption[] = team
    .filter((d) => counts.has(d.slug))
    .map((d) => ({ key: d.slug, label: authorDisplayName(d.display_name), count: counts.get(d.slug)! }));
  const clinicKey = clinicAuthorKey(team);
  if (counts.has(clinicKey)) options.push({ key: clinicKey, label: "Clinic", count: counts.get(clinicKey)! });
  return options;
}

/** Posts of one author bucket. A missing or unknown key (e.g. a stale link) shows everything. */
export function filterPostsByAuthor<T extends { practitioner_id?: string | null }>(posts: T[], team: PublicPractitioner[] | null, key: string | null): T[] {
  if (!key || !isTeamList(team)) return posts;
  const options = authorFilterOptions(posts, team);
  if (!options.some((o) => o.key === key)) return posts;
  return posts.filter((p) => postAuthorKey(p, team) === key);
}

/** Up to three "more articles": the same author's first (date order kept), then the rest. */
export function pickRelatedPosts<T extends { practitioner_id?: string | null }>(
  candidates: T[],
  authorId: string | null,
  max = 3,
): { posts: T[]; allSameAuthor: boolean } {
  const same = authorId ? candidates.filter((p) => p.practitioner_id === authorId) : [];
  const rest = authorId ? candidates.filter((p) => p.practitioner_id !== authorId) : candidates;
  const posts = [...same, ...rest].slice(0, max);
  return { posts, allSameAuthor: posts.length > 0 && !!authorId && posts.every((p) => p.practitioner_id === authorId) };
}

/** A doctor's bio as one plain-text line, cut at a word. Never markup. */
export function shortBio(bio: string | null | undefined, max = 220): string {
  const text = (bio ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.5 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

/** Link target for the author's own page, only when they are listed. */
export const authorHref = (clinicSlug: string, p: PublicPractitioner): string | null =>
  p.directory_listed && p.slug ? doctorProfilePath(clinicSlug, p.slug) : null;
