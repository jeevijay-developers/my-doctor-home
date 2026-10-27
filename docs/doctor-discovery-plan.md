# Doctor discovery & SEO plan

Goal: a patient who does not know a doctor's URL can find the doctor's Doctylia site by name, by specialty + city, or via Google / AI answer engines, at tens of thousands of doctors.

## Problems found in the audit

1. Doctor pages are client-rendered. Crawlers, WhatsApp/Facebook previews and AI bots get the generic Doctylia `index.html`; the doctor's SEO Title / Description only exist after JS runs.
2. No directory or search anywhere. `/dr/:slug` is only reachable with the link.
3. Location data is free-text `city` only (no locality, pincode); specialization is free text for some rows.
4. Sitemap is a single urlset (50,000-URL limit) and has no hub pages.
5. Doctor JSON-LD is built inline in the page component, so any server copy would drift.

## Architecture (5 layers)

| # | Layer | Delivered as |
|---|---|---|
| 1 | Server-delivered SEO for `/dr/:slug` | Vercel Edge function `api/seo.ts` injects title/meta/canonical/OG/JSON-LD + crawlable body into `index.html`; CDN-cached (`s-maxage` + SWR); 301 for renamed slugs, real 404 for unknown/cancelled |
| 2 | Hub pages | `/doctors`, `/doctors/:city`, `/doctors/:city/:specialty`, same Edge function, `noindex` when fewer than 3 doctors (thin-page guard) |
| 3 | Search | Postgres only: `pg_trgm` typo-tolerant name match + city/specialty slug filters, exposed via `search_doctors` / `directory_facets` RPCs (SECURITY DEFINER, safe columns only, no view of `profiles`) |
| 4 | Discovery plumbing | Sitemap includes hubs and switches to a sitemap index above 45k URLs; "Find a Doctor" links in landing nav/footer |
| 5 | Off-site (not code in this change) | Google Business Profile per doctor, Search Console, IndexNow |

## Improvements over the first proposal

- **Doctor consent:** `profiles.directory_listed` (default true) lets a doctor opt out of the directory without losing their own page.
- **No competitor links on a doctor's branded site:** hub to profile links only; profile pages never show other doctors.
- **One source of truth for SEO output:** `src/lib/seo/doctorSeo.ts` builds meta + JSON-LD for both the Edge function and the client page.
- **One slug function:** `src/lib/directory/slug.ts` is mirrored for Deno (`supabase/functions/_shared/directorySlug.ts`) and a test fails if they diverge; SQL `directory_slugify()` implements the same rule.
- **Graceful degradation:** if Supabase or the migration is unavailable, the Edge function serves the plain SPA shell instead of failing.
- **Safe rollout:** new profile fields (locality, pincode, directory_listed) save in a second update, so profile saving cannot break if the migration is late.
- **Ranking is merit-based:** rating, review count, profile completeness. No paid placement (avoids medical-advertising issues).

## Deferred (needs a product decision)

- Latitude/longitude + "near me" (needs a geocoding provider; PostGIS).
- Slug format with specialty + city (needs slug_history migration plan for existing doctors).
- Dedicated search engine (Typesense/Meilisearch): only if Postgres search gets slow or facets grow.
- Blog post SEO via Edge (same pattern as doctor pages, UUID URLs should get slugs first).
- Legal review of Indian medical-advertising rules before enabling public ratings/rankings.

## Rollout order

1. Apply migration `20261027090000_doctor_directory.sql` (Supabase).
2. Deploy to Vercel (needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` available to functions; they are already project env vars for the build).
3. Verify: `curl -A Googlebot https://doctylia.com/dr/<slug>` shows the doctor's title; Rich Results Test; WhatsApp preview.
4. Submit sitemap in Search Console; ask doctors to fill locality/pincode.
