/**
 * The published_at to store: keep the original date while a post stays published
 * (edits must not re-date it), stamp `now` when it is (re)published, clear it for drafts.
 * The Health Articles hub orders by this and JSON-LD reports it as datePublished.
 */
export function nextPublishedAt(
  prev: { is_published: boolean; published_at: string | null } | null,
  willPublish: boolean,
  now: Date = new Date(),
): string | null {
  if (!willPublish) return null;
  if (prev?.is_published && prev.published_at) return prev.published_at;
  return now.toISOString();
}
