// Old clinic slug -> 301 on the edge. Relative imports only (bundled by Vercel); no DOM, no supabase-js.
// Used by the SEO handlers (practitioner / blog / post pages) that look a clinic up by slug and find nothing.

export interface SlugUpstream {
  /** Supabase project URL, e.g. https://xyz.supabase.co (a trailing slash is tolerated). */
  url: string;
  /** Publishable (anon) key. */
  key: string;
}

/**
 * Ask `resolve_clinic_slug` for the clinic's current slug. Returns it when it differs from `slug`,
 * otherwise (unknown slug, same slug, any HTTP/network error) null so the caller serves its normal 404.
 */
export async function resolveOldSlug(
  up: SlugUpstream,
  slug: string,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await fetchFn(`${up.url.replace(/\/+$/, "")}/rest/v1/rpc/resolve_clinic_slug`, {
      method: "POST",
      headers: { apikey: up.key, Authorization: `Bearer ${up.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ _slug: slug }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data === "string" && data && data !== slug ? data : null;
  } catch {
    return null;
  }
}

/**
 * 301 to the same page under `newSlug`, keeping everything after `/dr/<old>` and the query string.
 * `url` is the incoming request URL (string or URL); the old slug is its second path segment.
 * Returns null when the path is not under /dr/<slug> or newSlug is the slug already in the URL.
 */
export function redirectForOldSlug(url: string | URL, newSlug: string): Response | null {
  const u = typeof url === "string" ? new URL(url) : url;
  const m = /^\/dr\/([^/]+)(\/.*)?$/.exec(u.pathname);
  if (!m || m[1] === newSlug) return null;
  const location = `${u.origin}/dr/${newSlug}${m[2] ?? ""}${u.search}`;
  return new Response(null, {
    status: 301,
    headers: { Location: location, "Cache-Control": "public, max-age=0, s-maxage=3600" },
  });
}
