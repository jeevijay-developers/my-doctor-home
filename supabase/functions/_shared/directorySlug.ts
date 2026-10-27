// Slug rule for directory URLs (/doctors/:city/:specialty). Mirrored by hand in
// supabase/functions/_shared/directorySlug.ts (Deno can't import from src/;
// slug.test.ts fails if the two files differ) and by public.directory_slugify()
// in SQL - all three must stay identical or hub filters stop matching.

/** Hubs with fewer doctors than this are served `noindex` and left out of the sitemap. */
export const DIRECTORY_MIN_INDEXABLE = 3;

export function directorySlug(input: string | null | undefined): string {
  return (input ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
