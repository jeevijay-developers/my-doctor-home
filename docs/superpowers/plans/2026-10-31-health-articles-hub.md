# Health Articles Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One public, SEO/AEO/GEO-optimised page (`/health-articles`) that lists the published blog posts of every doctor on Doctylia, so a patient can browse all doctors' articles in one place instead of visiting each doctor's site.

**Architecture:** The hub is an *index* over the existing `blog_posts` table. Each article keeps its single canonical URL on the doctor's own site (`/dr/:slug/blog/:post`), so there is no duplicate content and doctors keep their branded traffic. The hub reads through two `SECURITY DEFINER` RPCs (same pattern as `search_doctors`), is server-rendered for crawlers by the existing Vercel Edge function `api/seo.ts`, and is added to the dynamic sitemap.

**Tech Stack:** Vite + React + TS + Tailwind/shadcn, Supabase (Postgres RPC, RLS, Deno edge functions), Vercel Edge (`api/seo.ts`), Vitest (+ `tests/db` against local Supabase).

---

## What the audit found (read this before the tasks)

### How the blog module works today

| Area | Fact | File |
|---|---|---|
| Data | `blog_posts(id, doctor_id, title, slug, excerpt, content, category, featured_image_url, is_published, published_at, created_at, updated_at)`. `slug` is trigger-generated and unique per doctor. Published = `is_published = true` (no status enum, no review step). | `20260320223815_*.sql`, `20261027120000_blog_post_slugs.sql` |
| Doctor write | RLS "Doctors can manage own blogs" (`auth.uid() = doctor_id`, ALL). Staff act as the doctor via `blog.view/create/edit/delete` (`staff_has_permission`). Route `/admin/blog` is wrapped in `PermissionGate blog.view`. | `20260808090100_staff_permission_policies.sql`, `src/lib/staffPermissions.ts` |
| Plan gating | Writing/publishing is **not** plan-gated. Only the *AI Blog Writer* is (`ai_blog_writer` feature, Pro+). | `BlogPage.tsx`, `src/lib/features.ts` |
| Public read | RLS "Public can view published blogs" (`is_published = true`) lets anon read any published post, **regardless of the doctor's state**. Doctor-level checks (onboarded, not `cancelled`) happen only in the page code and the Edge function. | `20260320223815_*.sql`, `handleSeoRequest.ts` |
| Doctor site | `/dr/:slug/blog` (list) and `/dr/:slug/blog/:post` (article). `website_settings.show_blog` only controls the nav link/preview section on the doctor's own site; it auto-flips on at first publish (`blog_auto_enabled`). | `BlogListPage.tsx`, `BlogPostPage.tsx`, `BlogPage.tsx` |
| SEO today | Edge function injects head + JSON-LD + crawlable body for blog list/post (`blogSeo.ts`); empty blog = `noindex`; legacy UUID URLs 301 to slug URLs; sitemap lists posts and per-doctor blog indexes. JSON-LD: `BlogPosting` + `Physician` author + `reviewedBy` + breadcrumbs. | `src/lib/seo/blogSeo.ts`, `supabase/functions/sitemap/index.ts` |
| Superadmin | `SAModeration` (`/superadmin/moderation`, `moderation.view`) lists all posts grouped by doctor and can **publish/unpublish** (writes `is_published`, logs `publish_blog_post`/`unpublish_blog_post`). Owners (`user_roles` admin) and Team members with `moderation.manage` have UPDATE policies on `blog_posts`. | `SAModeration.tsx`, `20261026150000_superadmin_team.sql` |
| Directory consent | `profiles.directory_listed` (default true) is the doctor's opt-out from `/doctors` discovery. | `20261027090000_doctor_directory.sql`, `ProfilePage.tsx` |

### Problems the hub would amplify (fixed in this plan)

1. **`published_at` is overwritten on every save** (`BlogPage.tsx` `save()` sets `published_at = now` whenever the post is published, including plain edits). A feed ordered by `published_at` would bounce edited posts to the top and `datePublished` in JSON-LD would lie. -> Task 1.
2. **Superadmin "Unpublish" is not enforceable.** The doctor can flip the post straight back on. Fine for one doctor's site, not for a platform-wide page that carries the platform's name. -> Task 8 adds an admin-only `hub_hidden` flag.
3. **Anon can read published posts of suspended/unfinished doctors.** The hub RPC must apply the doctor-level filters itself (onboarded, slug set, not `cancelled`, `directory_listed`). -> Task 2.
4. **`src/integrations/supabase/types.ts` is stale** (no `slug`, no new RPCs). Do not hand-edit it (CLAUDE.md). Cast `supabase.rpc as any` like `DoctorDirectory.tsx` does.

### Decisions baked in (change in one place if you disagree)

| Decision | Choice | Why |
|---|---|---|
| URL | `/health-articles`, `/health-articles/:category` (constant `ARTICLES_BASE`) | Matches the "Health Articles" naming already used on doctor sites and carries the search phrase. |
| Canonical for each article | Stays on the doctor's site | No duplicate content; hub is a listing, not a copy. |
| Doctor consent | Reuse `profiles.directory_listed` (default true). A doctor who is off the directory is off the hub. | One switch, only ever *narrows* what is shown. |
| Moderation lever | New `blog_posts.hub_hidden`, writable only by superadmin owner / `moderation.manage` | Reuses the existing permission, so **no new permission keys** and nothing to keep in sync across `src/lib/superadminPermissions.ts`, `supabase/functions/_shared/superadminPermissions.ts` and the team migration. |
| Staff permissions | No change. Staff with `blog.edit` publish as before and the post appears on the hub if the doctor is listed. | Hub is derived data. |
| Ranking | Newest first. No paid placement. | Medical-advertising safety (see `docs/doctor-discovery-plan.md`). |
| Thin-page guard | Category hubs with < `DIRECTORY_MIN_INDEXABLE` (3) posts are `noindex` and out of the sitemap. Empty hub is `noindex`. | Same rule as `/doctors/:city`. |
| Title wording | "written by doctors", **not** "verified doctors" | The platform has no verification step; a YMYL page must not claim one. |
| AI disclosure | `blog_posts.ai_assisted` is set automatically when a doctor uses the AI Blog Writer; the article shows "Drafted with AI assistance, reviewed and published by Dr X" | Google asks sites to disclose AI use where readers would wonder, and trust is the top signal for health content. Not retroactive for existing posts. **New product behaviour - tell me if you want it optional.** |
| Not built | `FAQPage` markup, `llms.txt` | Google ended FAQ rich results (May 7 2026) and says AI text files are not needed; see Research findings. |

---

## Research findings and what they changed (2026-10-31)

Primary = Google/Vercel documentation read directly. Secondary = SEO write-ups that I could not tie to a primary source; treated as hints, not facts.

| # | Finding | Source | Effect on this plan |
|---|---|---|---|
| 1 | Google: AI Overviews / AI Mode need **no special optimisation**. A page must be indexed and snippet-eligible; "all existing SEO fundamentals continue to be worthwhile". "You don't need to create new machine readable files, AI text files, or markup", and there is no special schema. Crawlable robots/CDN, internal links, text content, structured data that matches visible text, page experience. | Primary: [AI features and your website](https://developers.google.com/search/docs/appearance/ai-features) | Keep the SEO-fundamentals approach. **`llms.txt` removed from Task 10.** |
| 2 | **FAQ rich results were discontinued: "will no longer appear in Google Search starting May 7, 2026"**; the documentation was removed June 15 2026. This also ends the old health/government exception. | Primary: [FAQ structured data](https://developers.google.com/search/docs/appearance/structured-data/faqpage) | **`FAQPage` markup and `extractFaq` removed from Task 7.** Answer-first content stays, as visible text. |
| 3 | Article markup: no required properties; `author` should be a `Person` (or `Organization`), `author.name` is the name only - **no honorifics or job titles** (use `honorificPrefix`, `jobTitle`), plus `url`/`sameAs`; ISO 8601 dates with timezone. | Primary: [Article structured data](https://developers.google.com/search/docs/appearance/structured-data/article) | **Existing bug found:** `blogSeo.ts` emits the author as `Physician` named "Dr. X". Fixed in Task 7B. |
| 4 | **GPTBot, ClaudeBot and PerplexityBot do not execute JavaScript** (they may download JS files but do not run them); Googlebot and Applebot render fully. Vercel: "Prioritize server-side rendering for critical content". Caveat: the study sample skews to small and mid-sized sites. | Primary: [Vercel - The rise of the AI crawler](https://vercel.com/blog/the-rise-of-the-ai-crawler) | **Biggest gap found:** the Edge article body is one plain paragraph truncated at 3,000 chars with headings/lists stripped. Task 7A/7C now serve the full structured article. |
| 5 | Pagination: unique URLs (`?page=n`), real `<a href>` links, each page its own canonical (never page 1), `rel=prev/next` no longer used, filtered/search variants should be `noindex`. | Primary: [Pagination and incremental page loading](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading) | Plan already matches. No change (the `rel` attributes are harmless). |
| 6 | Sitemaps: Google **ignores `priority` and `changefreq`**; `lastmod` is used only if consistently and verifiably accurate. | Primary: [Build a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) | Hub `lastmod` now uses the newest **publish** date (moderation toggles move `updated_at`). Do not spend effort on priority/changefreq. |
| 7 | Helpful-content guidance: show **who** wrote it (bylines that link to author information), **how** it was made (disclose AI/automation where readers would wonder), and **why**; health (YMYL) content gets extra weight on E-E-A-T and must match expert consensus; trust is the most important signal. | Primary: [Creating helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) | **Gap found:** `BlogPostPage` says "Reviewed by" with no link to the doctor, and AI drafts are not disclosed. Task 7D adds a linked "Written by" byline and an automatic AI-assistance disclosure. |
| 8 | GEO research (Princeton, KDD 2024) reports that adding cited sources, statistics and quotations lifted visibility in generative answers while keyword stuffing did not; one vendor study reports fresher pages get cited more. Observational, figures vary by source. | Secondary | Cheap, safe use: the AI writer prompt now asks for a direct answer first, question-style headings, "When to see a doctor", named guideline sources, and **forbids invented statistics** (Task 7E). No stuffing tactics. |
| 9 | `llms.txt`: Google says AI text files are not needed; logged evidence shows major AI crawlers rarely or never request it; no found correlation with citations. | Mostly secondary | Not built. Revisit only if an AI vendor documents support. |
| 10 | IndexNow notifies Bing, Yandex, Seznam, Naver and others of new/changed URLs; **Google does not use it**. Bing says Bing and Copilot share one crawl/index foundation and added an AI Performance (citations) report in Bing Webmaster Tools. | Secondary | Not a code task here. Added to rollout as a manual step (verify the site in Bing Webmaster Tools); IndexNow ping on publish listed as a follow-up. |

**Net effect on the plan:** two additions with real leverage (Task 7A/7C crawler-visible article body; Task 7D/7E authorship and AI honesty), one correction of an existing bug (author schema), two items removed because evidence says they do nothing or are misleading (FAQPage, `llms.txt`), and a measurable success check (Task 11).

---

## Global Constraints

- Files under `src/lib/seo/` and `src/lib/directory/` are bundled by Vercel: **relative imports only, no `@/`**.
- Do not edit `src/integrations/supabase/client.ts` or `types.ts` (auto-generated).
- Do not touch `supabase/functions/mcp/`.
- Slug rule is `directorySlug()` / SQL `directory_slugify()`; do not invent a new one. Category slugs use it.
- Tests are colocated; DB tests live in `tests/db` (`npm run test:db`), edge tests in `supabase/functions/**` (`npm run test:edge`), the rest `npm run test`.
- Type-check with `npx tsc --noEmit -p tsconfig.app.json` (two old errors remain in `SADoctorDetail.tsx` and `NotFound.tsx`; do not add new ones).
- Radix Tabs in tests: call `.focus()` before `fireEvent.click()`.
- Fonts are self-hosted; do not add Google Fonts (CSP blocks them).
- Colour/theme: use existing tokens (`text-primary`, `bg-royal`, `text-muted-foreground`); on dark surfaces use `text-teal-bright`.
- The hub must never expose private doctor data: only the columns returned by the RPC below.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/lib/blogPublish.ts` + `.test.ts` | Create | `nextPublishedAt()`: keep original publish date on edits |
| `src/components/admin/BlogPage.tsx` | Modify | Use `nextPublishedAt`; record `ai_assisted`; show hub notice |
| `supabase/migrations/20261031100000_health_articles_hub.sql` | Create | `hub_hidden` + guard trigger, `ai_assisted`, indexes, `search_blog_posts`, `blog_facets` |
| `tests/db/healthArticlesHub.test.ts` | Create | RPC eligibility + guard trigger tests |
| `src/lib/seo/healthArticlesSeo.ts` + `.test.ts` | Create | Paths, head, JSON-LD, crawlable body for the hub (shared by Edge + client) |
| `src/lib/seo/handleSeoRequest.ts` (+ test) | Modify | `kind=articles` route |
| `vercel.json` | Modify | Rewrites for `/health-articles[/:category]` |
| `supabase/functions/sitemap/index.ts` (+ test) | Modify | Hub + category URLs |
| `src/components/blog/HubArticleCard.tsx` | Create | Shared article card (hub page + homepage strip) |
| `src/pages/HealthArticlesHub.tsx` + `.test.tsx` | Create | The page |
| `src/App.tsx` | Modify | Two routes |
| `src/lib/seo/articleHtml.ts` + `.test.ts` | Create | Safe, structure-preserving article HTML for crawlers that do not run JS |
| `src/lib/seo/blogSeo.ts` (+ test) | Modify | Person author, full crawler body, hub membership |
| `src/pages/BlogPostPage.tsx` (+ test) | Modify | Linked "Written by" byline, AI disclosure |
| `supabase/functions/ai-blog-writer/index.ts` (+ test) | Modify | Answer-first, sourced, no-invented-numbers prompt |
| `src/components/superadmin/SAModeration.tsx` (+ test) | Modify | "Hide from hub" toggle |
| `src/components/admin/ProfilePage.tsx` | Modify | Consent copy |
| `src/components/landing/LandingNavbar.tsx`, `LandingFooter.tsx`, `LatestArticles.tsx`, `src/pages/LandingPage.tsx` | Modify/Create | Homepage discovery + internal links |
| `CLAUDE.md` | Modify | Document the hub rules |

---

### Task 1: Stop edits from rewriting `published_at`

**Files:**
- Create: `src/lib/blogPublish.ts`
- Test: `src/lib/blogPublish.test.ts`
- Modify: `src/components/admin/BlogPage.tsx` (`save()` ~line 157, `togglePublish()` ~line 186)

**Interfaces:**
- Produces: `nextPublishedAt(prev: { is_published: boolean; published_at: string | null } | null, willPublish: boolean, now?: Date): string | null`

- [ ] **Step 1: Write the failing test** — `src/lib/blogPublish.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { nextPublishedAt } from "./blogPublish";

const now = new Date("2026-10-31T10:00:00Z");

describe("nextPublishedAt", () => {
  it("stamps now for a brand-new published post", () => {
    expect(nextPublishedAt(null, true, now)).toBe("2026-10-31T10:00:00.000Z");
  });
  it("keeps the original date when a published post is edited and stays published", () => {
    expect(nextPublishedAt({ is_published: true, published_at: "2026-01-05T00:00:00.000Z" }, true, now)).toBe("2026-01-05T00:00:00.000Z");
  });
  it("stamps now when a draft is published", () => {
    expect(nextPublishedAt({ is_published: false, published_at: null }, true, now)).toBe("2026-10-31T10:00:00.000Z");
  });
  it("stamps now if a published row somehow has no date", () => {
    expect(nextPublishedAt({ is_published: true, published_at: null }, true, now)).toBe("2026-10-31T10:00:00.000Z");
  });
  it("clears the date when saved as a draft", () => {
    expect(nextPublishedAt({ is_published: true, published_at: "2026-01-05T00:00:00.000Z" }, false, now)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/blogPublish.test.ts`
Expected: FAIL, "Failed to resolve import ./blogPublish".

- [ ] **Step 3: Implement** — `src/lib/blogPublish.ts`

```ts
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
```

- [ ] **Step 4: Use it in `BlogPage.tsx`**

Add `import { nextPublishedAt } from "@/lib/blogPublish";` next to the other `@/lib` imports, then replace:

```ts
      published_at: form.is_published ? new Date().toISOString() : null,
```
with
```ts
      published_at: nextPublishedAt(editing, form.is_published),
```
and in `togglePublish` replace
```ts
      published_at: newStatus ? new Date().toISOString() : null,
```
with
```ts
      published_at: nextPublishedAt(post, newStatus),
```

- [ ] **Step 5: Run tests** — `npx vitest run src/lib/blogPublish.test.ts src/components/admin/BlogPage.test.tsx`. Expected: PASS (the existing BlogPage tests must still pass; if one asserted `published_at` was refreshed on edit, update it to the new rule).

- [ ] **Step 6: Commit**

```bash
git add src/lib/blogPublish.ts src/lib/blogPublish.test.ts src/components/admin/BlogPage.tsx
git commit -m "fix: keep a post's original published_at when it is edited"
```

---

### Task 2: Database layer (flag, guard, indexes, RPCs)

**Files:**
- Create: `supabase/migrations/20261031100000_health_articles_hub.sql`
- Test: `tests/db/healthArticlesHub.test.ts`

**Interfaces:**
- Produces (SQL):
  - `blog_posts.hub_hidden boolean NOT NULL DEFAULT false`
  - `blog_posts.ai_assisted boolean NOT NULL DEFAULT false`
  - `search_blog_posts(p_query text, p_category text, p_limit int, p_offset int)` returning `id, slug, title, excerpt, category, featured_image_url, published_at, updated_at, reading_minutes, doctor_slug, doctor_name, doctor_specialization, doctor_city, doctor_photo_url, total_count`
  - `blog_facets()` returning `slug, label, post_count`
- Eligibility (single definition, used by both RPCs): post `is_published AND NOT hub_hidden`, has a slug and title; doctor has `slug`, `onboarding_completed`, `directory_listed`, `plan_status <> 'cancelled'`.

- [ ] **Step 1: Write the migration**

```sql
-- Health Articles hub: one public index over every listed doctor's published posts.
-- Safe to re-run. Apply BEFORE deploying the matching frontend/Edge change.
-- Depends on directory_slugify() and profiles.directory_listed (20261027090000_doctor_directory.sql)
-- and blog_posts.slug (20261027120000_blog_post_slugs.sql).

ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS hub_hidden boolean NOT NULL DEFAULT false;
-- Set by the app when the doctor used the AI Blog Writer; drives the on-page AI disclosure (Task 7).
ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS ai_assisted boolean NOT NULL DEFAULT false;

-- hub_hidden is a moderation flag: doctors and staff (who can UPDATE their own posts
-- through RLS) must not be able to clear it. Service role / cron / migrations carry no
-- user id and are trusted, same convention as guard_appointment_writes.
CREATE OR REPLACE FUNCTION public.guard_blog_hub_hidden()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  was boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN was := OLD.hub_hidden; END IF;
  IF NEW.hub_hidden IS DISTINCT FROM was
     AND NOT (public.has_role(auth.uid(), 'admin') OR public.sa_has_permission(auth.uid(), 'moderation.manage')) THEN
    RAISE EXCEPTION 'HUB_HIDDEN_LOCKED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_blog_hub_hidden ON public.blog_posts;
CREATE TRIGGER guard_blog_hub_hidden
  BEFORE INSERT OR UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.guard_blog_hub_hidden();

CREATE INDEX IF NOT EXISTS idx_blog_posts_hub
  ON public.blog_posts (published_at DESC) WHERE is_published AND NOT hub_hidden;
CREATE INDEX IF NOT EXISTS idx_blog_posts_hub_category
  ON public.blog_posts (public.directory_slugify(category)) WHERE is_published AND NOT hub_hidden;

-- Public listing. SECURITY DEFINER + explicit column list: card-safe fields only, and the
-- doctor-level filters RLS does not apply (RLS lets anon read any published post).
-- `content` is read only to compute reading_minutes for the returned page, never returned.
CREATE OR REPLACE FUNCTION public.search_blog_posts(
  p_query text DEFAULT NULL,
  p_category text DEFAULT NULL,     -- directory slug, e.g. 'heart-health'
  p_limit int DEFAULT 12,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid, slug text, title text, excerpt text, category text, featured_image_url text,
  published_at timestamptz, updated_at timestamptz, reading_minutes int,
  doctor_slug text, doctor_name text, doctor_specialization text, doctor_city text,
  doctor_photo_url text, total_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH params AS (
    SELECT
      nullif(btrim(lower(p_query)), '') AS q,
      '%' || replace(replace(replace(nullif(btrim(lower(p_query)), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS q_like
  ),
  page AS (
    SELECT
      b.id, b.slug, b.title, b.excerpt, b.category, b.featured_image_url,
      b.published_at, b.updated_at, b.content,
      p.slug AS doctor_slug, p.full_name AS doctor_name, p.specialization AS doctor_specialization,
      p.city AS doctor_city, p.profile_photo_url AS doctor_photo_url,
      count(*) OVER () AS total_count
    FROM public.blog_posts b
    JOIN public.profiles p ON p.id = b.doctor_id
    CROSS JOIN params
    WHERE b.is_published AND NOT b.hub_hidden
      AND coalesce(btrim(b.slug), '') <> '' AND btrim(b.title) <> ''
      AND p.slug IS NOT NULL AND p.onboarding_completed = true
      AND p.directory_listed = true AND p.plan_status <> 'cancelled'
      AND (p_category IS NULL OR public.directory_slugify(b.category) = p_category)
      AND (
        params.q IS NULL
        OR lower(b.title) LIKE params.q_like
        OR lower(coalesce(b.excerpt, '')) LIKE params.q_like
        OR lower(coalesce(b.category, '')) LIKE params.q_like
        OR lower(p.full_name) LIKE params.q_like
      )
    ORDER BY b.published_at DESC NULLS LAST, b.id
    LIMIT least(greatest(coalesce(p_limit, 12), 1), 48)
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT
    page.id, page.slug, page.title, page.excerpt, page.category, page.featured_image_url,
    page.published_at, page.updated_at,
    greatest(1, ceil(array_length(
      regexp_split_to_array(btrim(regexp_replace(coalesce(page.content, ''), '<[^>]*>', ' ', 'g')), '\s+'), 1
    ) / 200.0))::int,
    page.doctor_slug, page.doctor_name, page.doctor_specialization, page.doctor_city,
    page.doctor_photo_url, page.total_count
  FROM page
  ORDER BY page.published_at DESC NULLS LAST, page.id
$$;

-- Topic list with post counts. Label = most common spelling; ties prefer mixed case.
CREATE OR REPLACE FUNCTION public.blog_facets()
RETURNS TABLE (slug text, label text, post_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH eligible AS (
    SELECT btrim(b.category) AS category
    FROM public.blog_posts b
    JOIN public.profiles p ON p.id = b.doctor_id
    WHERE b.is_published AND NOT b.hub_hidden
      AND coalesce(btrim(b.slug), '') <> '' AND btrim(b.title) <> ''
      AND p.slug IS NOT NULL AND p.onboarding_completed = true
      AND p.directory_listed = true AND p.plan_status <> 'cancelled'
      AND public.directory_slugify(b.category) <> ''
  ),
  c AS (
    SELECT public.directory_slugify(category) AS s, category AS l, count(*) AS n
    FROM eligible GROUP BY 1, 2
  )
  SELECT s, (array_agg(l ORDER BY n DESC, (l = lower(l) OR l = upper(l)), l))[1], sum(n)::bigint
  FROM c GROUP BY s
  ORDER BY 3 DESC, 2
$$;

REVOKE ALL ON FUNCTION public.search_blog_posts(text, text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.blog_facets() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_blog_posts(text, text, int, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.blog_facets() TO anon, authenticated;
```

- [ ] **Step 2: Write the DB test** — `tests/db/healthArticlesHub.test.ts` (uses the fixtures in `tests/db/helpers.ts`: doctors A/B, `as("doctorB")`, `as("owner")`, `admin`, `anonClient`, `tracker`)

```ts
// The Health Articles hub RPCs: who is eligible, what leaks, who may hide a post.
import { admin, anonClient, as, errText, ids, MARK, must, purgeTestData, tracker, uniq } from "./helpers";

const t = tracker();
const anon = anonClient();
let A: string, B: string;
let origA: Record<string, unknown> = {};
const post = (doctorId: string, o: Record<string, unknown> = {}) =>
  admin.from("blog_posts").insert({
    doctor_id: doctorId, title: `${MARK} ${uniq("hub")}`, excerpt: "e", content: "<p>one two three</p>",
    category: "ZZT Heart", is_published: true, published_at: new Date().toISOString(), ...o,
  }).select().single().then((r) => { if (r.error) throw new Error(r.error.message); return t.add("blog_posts", r.data); });
const hub = async (args: Record<string, unknown> = {}) =>
  (await anon.rpc("search_blog_posts", { p_query: null, p_category: null, p_limit: 48, p_offset: 0, ...args })).data ?? [];

beforeAll(async () => {
  ({ doctorA: A, doctorB: B } = await ids());
  origA = (await admin.from("profiles").select("directory_listed,plan_status").eq("id", A).single()).data!;
});
afterAll(async () => {
  await admin.from("profiles").update(origA).eq("id", A);
  await t.cleanup();
  purgeTestData();
});

describe("search_blog_posts eligibility", () => {
  it("lists a published post with card-safe columns and no content/private fields", async () => {
    const p = await post(B);
    const row = (await hub({ p_query: p.title })).find((r: any) => r.id === p.id);
    expect(row).toMatchObject({ doctor_slug: "dr-beta", title: p.title, reading_minutes: 1 });
    expect(Object.keys(row)).not.toEqual(expect.arrayContaining(["content"]));
    expect(Object.keys(row)).not.toEqual(expect.arrayContaining(["razorpay_account_id", "phone"]));
  });

  it("hides drafts, hub_hidden posts, unlisted doctors and cancelled doctors", async () => {
    const draft = await post(B, { is_published: false, published_at: null });
    const hidden = await post(B, { hub_hidden: true });
    const ok = await post(B);
    const other = await post(A);
    const ids1 = (await hub({ p_query: MARK })).map((r: any) => r.id);
    expect(ids1).toContain(ok.id);
    expect(ids1).not.toContain(draft.id);
    expect(ids1).not.toContain(hidden.id);

    await admin.from("profiles").update({ directory_listed: false }).eq("id", A);
    expect((await hub({ p_query: MARK })).map((r: any) => r.id)).not.toContain(other.id);
    await admin.from("profiles").update({ directory_listed: true, plan_status: "cancelled" }).eq("id", A);
    expect((await hub({ p_query: MARK })).map((r: any) => r.id)).not.toContain(other.id);
  });

  it("filters by category slug, paginates, and reports total_count", async () => {
    await admin.from("profiles").update(origA).eq("id", A);
    await post(B, { category: "ZZT Skin Care" });
    const byCat = await hub({ p_category: "zzt-skin-care" });
    expect(byCat.length).toBeGreaterThan(0);
    expect(byCat.every((r: any) => r.category === "ZZT Skin Care")).toBe(true);
    const page1 = await hub({ p_limit: 1, p_offset: 0 });
    const page2 = await hub({ p_limit: 1, p_offset: 1 });
    expect(page1).toHaveLength(1);
    expect(page2[0].id).not.toBe(page1[0].id);
    expect(Number(page1[0].total_count)).toBeGreaterThan(1);
  });

  it("treats LIKE wildcards in the query literally", async () => {
    await post(B, { title: `${MARK} 100% plain` });
    expect((await hub({ p_query: "%" })).every((r: any) => `${r.title}${r.excerpt}${r.category}${r.doctor_name}`.toLowerCase().includes("%"))).toBe(true);
  });
});

describe("blog_facets", () => {
  it("returns slug, label and counts for eligible categories only", async () => {
    await post(B, { category: "ZZT Facet" });
    await post(B, { category: "ZZT Facet", hub_hidden: true });
    const { data } = await anon.rpc("blog_facets");
    const f = (data as any[]).find((x) => x.slug === "zzt-facet");
    expect(f).toMatchObject({ label: "ZZT Facet" });
    expect(Number(f.post_count)).toBe(1);
  });
});

describe("hub_hidden guard", () => {
  it("a doctor cannot hide or un-hide a post, but the owner can", async () => {
    const p = await post(B);
    const doctor = await as("doctorB");
    const denied = await doctor.from("blog_posts").update({ hub_hidden: true }).eq("id", p.id).select();
    expect(errText(denied.error)).toMatch(/HUB_HIDDEN_LOCKED|42501/);

    const owner = await as("owner");
    const ok = await owner.from("blog_posts").update({ hub_hidden: true }).eq("id", p.id).select().single();
    expect(ok.data?.hub_hidden).toBe(true);

    const undo = await doctor.from("blog_posts").update({ hub_hidden: false }).eq("id", p.id).select();
    expect(errText(undo.error)).toMatch(/HUB_HIDDEN_LOCKED|42501/);
  });

  it("a doctor can still edit other columns of a hidden post", async () => {
    const p = await post(B, { hub_hidden: true });
    const doctor = await as("doctorB");
    const r = await doctor.from("blog_posts").update({ title: `${MARK} renamed` }).eq("id", p.id).select().single();
    expect(r.error).toBeNull();
    expect(r.data?.hub_hidden).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test before applying the migration**

Run: `npm run test:db -- tests/db/healthArticlesHub.test.ts`
Expected: FAIL (`search_blog_posts` does not exist / column `hub_hidden` missing).

- [ ] **Step 4: Apply the migration to the local test database and re-run**

Run: apply with the project's normal local flow (`npx supabase db reset` for the `doctylia-test` stack, or the repo's own migrate script), then `npm run test:db -- tests/db/healthArticlesHub.test.ts`
Expected: PASS. If `as("owner")` is not an `admin` role in the fixtures, check `Who` in `tests/db/helpers.ts` and use the fixture that has a `user_roles` admin row.

- [ ] **Step 5: Re-run the neighbouring suites for regressions**

Run: `npm run test:db -- tests/db/anonAccess.test.ts`
Expected: unchanged results (the existing documented `it.fails` bugs still fail as before).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261031100000_health_articles_hub.sql tests/db/healthArticlesHub.test.ts
git commit -m "feat(db): health articles hub RPCs, hub_hidden moderation flag and guard"
```

---

### Task 3: SEO builders for the hub (shared by Edge and client)

**Files:**
- Create: `src/lib/seo/healthArticlesSeo.ts`
- Test: `src/lib/seo/healthArticlesSeo.test.ts`

**Interfaces:**
- Consumes: `blogPostPath` is *not* used (hub rows already carry `doctor_slug`); `formatDoctorName(name: string): string` from `./doctorSeo`; `escapeHtml`, `INDEXABLE`, `NOINDEX`, `PageHead` from `./injectHead`; `DIRECTORY_MIN_INDEXABLE` from `../directory/slug`.
- Produces:
  - `ARTICLES_BASE = "/health-articles"`, `ARTICLES_PAGE_SIZE = 12`
  - `interface HubArticle`, `interface ArticleFacet`
  - `articlesPath(categorySlug?: string, page?: number): string`
  - `articlePath(a): string`
  - `totalPages(total: number): number`
  - `isArticlesIndexable(total: number, categorySlug?: string): boolean`
  - `articlesHeading(categoryLabel?: string): string`
  - `buildArticlesHead(ctx: ArticlesContext): PageHead`

- [ ] **Step 1: Write the failing tests** — `src/lib/seo/healthArticlesSeo.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  ARTICLES_PAGE_SIZE, articlePath, articlesPath, buildArticlesHead, isArticlesIndexable, totalPages,
  type HubArticle,
} from "./healthArticlesSeo";
import { INDEXABLE, NOINDEX } from "./injectHead";

const origin = "https://doctylia.com";
const art = (i: number, over: Partial<HubArticle> = {}): HubArticle => ({
  id: `id${i}`, slug: `post-${i}`, title: `Post ${i}`, excerpt: `Excerpt ${i}`, category: "Heart Health",
  featured_image_url: null, published_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-02T00:00:00Z", reading_minutes: 3,
  doctor_slug: "dr-a", doctor_name: "Anita Sharma", doctor_specialization: "Cardiologist", doctor_city: "Kota", doctor_photo_url: null,
  ...over,
});

describe("paths", () => {
  it("builds hub, category and paginated paths", () => {
    expect(articlesPath()).toBe("/health-articles");
    expect(articlesPath("heart-health")).toBe("/health-articles/heart-health");
    expect(articlesPath(undefined, 2)).toBe("/health-articles?page=2");
    expect(articlesPath("heart-health", 3)).toBe("/health-articles/heart-health?page=3");
    expect(articlesPath("heart-health", 1)).toBe("/health-articles/heart-health");
  });
  it("links an article to its canonical doctor-site URL", () => {
    expect(articlePath(art(1))).toBe("/dr/dr-a/blog/post-1");
  });
  it("counts pages", () => {
    expect(totalPages(0)).toBe(1);
    expect(totalPages(ARTICLES_PAGE_SIZE)).toBe(1);
    expect(totalPages(ARTICLES_PAGE_SIZE + 1)).toBe(2);
  });
});

describe("isArticlesIndexable", () => {
  it("indexes the root hub with any post and categories from 3 posts", () => {
    expect(isArticlesIndexable(0)).toBe(false);
    expect(isArticlesIndexable(1)).toBe(true);
    expect(isArticlesIndexable(2, "heart-health")).toBe(false);
    expect(isArticlesIndexable(3, "heart-health")).toBe(true);
  });
});

describe("buildArticlesHead", () => {
  const base = { origin, page: 1, facets: [{ slug: "heart-health", label: "Heart Health", post_count: 5 }] };

  it("root hub: indexable, self canonical, titled for the topic, crawlable list with author links", () => {
    const head = buildArticlesHead({ ...base, articles: [art(1), art(2)], total: 2 });
    expect(head.robots).toBe(INDEXABLE);
    expect(head.canonical).toBe(`${origin}/health-articles`);
    expect(head.title).toBe("Health Articles Written by Doctors in India | Doctylia");
    expect(head.title.length).toBeLessThanOrEqual(60);
    expect(head.description.length).toBeGreaterThanOrEqual(110);
    expect(head.description.length).toBeLessThanOrEqual(165);
    expect(head.bodyHtml).toContain('<h1>Health Articles by Doctors</h1>');
    expect(head.bodyHtml).toContain('href="/dr/dr-a/blog/post-1"');
    expect(head.bodyHtml).toContain('href="/dr/dr-a"');
    expect(head.bodyHtml).toContain('href="/health-articles/heart-health"');
  });

  it("emits CollectionPage + ItemList (with page-offset positions) + breadcrumbs", () => {
    const head = buildArticlesHead({ ...base, page: 2, articles: [art(13)], total: 13 });
    const graph = (head.jsonLd![0] as any)["@graph"];
    const page = graph.find((n: any) => n["@type"] === "CollectionPage");
    expect(page.mainEntity.itemListElement[0]).toMatchObject({ position: ARTICLES_PAGE_SIZE + 1, url: `${origin}/dr/dr-a/blog/post-13` });
    expect(graph.find((n: any) => n["@type"] === "BreadcrumbList").itemListElement.map((i: any) => i.name)).toEqual(["Doctylia", "Health Articles"]);
  });

  it("page 2+: self canonical, suffix in title, prev/next links", () => {
    const head = buildArticlesHead({ ...base, page: 2, articles: [art(13)], total: 30 });
    expect(head.canonical).toBe(`${origin}/health-articles?page=2`);
    expect(head.title).toContain("Page 2");
    expect(head.bodyHtml).toContain('rel="prev" href="/health-articles"');
    expect(head.bodyHtml).toContain('rel="next" href="/health-articles?page=3"');
  });

  it("category hub: label in title/h1, third breadcrumb, noindex below the thin-page threshold", () => {
    const thin = buildArticlesHead({ ...base, categorySlug: "heart-health", categoryLabel: "Heart Health", articles: [art(1)], total: 1 });
    expect(thin.robots).toBe(NOINDEX);
    const ok = buildArticlesHead({ ...base, categorySlug: "heart-health", categoryLabel: "Heart Health", articles: [art(1), art(2), art(3)], total: 3 });
    expect(ok.robots).toBe(INDEXABLE);
    expect(ok.title).toBe("Heart Health Articles by Doctors | Doctylia");
    expect(ok.canonical).toBe(`${origin}/health-articles/heart-health`);
    const crumbs = (ok.jsonLd![0] as any)["@graph"].find((n: any) => n["@type"] === "BreadcrumbList").itemListElement;
    expect(crumbs.map((i: any) => i.name)).toEqual(["Doctylia", "Health Articles", "Heart Health"]);
  });

  it("escapes hostile titles and excerpts in the body", () => {
    const head = buildArticlesHead({ ...base, articles: [art(1, { title: '<img src=x onerror=alert(1)>', excerpt: '"><script>x</script>' })], total: 1 });
    expect(head.bodyHtml).not.toContain("<img");
    expect(head.bodyHtml).not.toContain("<script>");
  });

  it("an empty hub is noindex and has no list", () => {
    const head = buildArticlesHead({ ...base, articles: [], total: 0 });
    expect(head.robots).toBe(NOINDEX);
    expect(head.bodyHtml).not.toContain("<ul>");
  });
});
```

- [ ] **Step 2: Run and confirm failure** — `npx vitest run src/lib/seo/healthArticlesSeo.test.ts` -> FAIL (module not found).

- [ ] **Step 3: Implement** — `src/lib/seo/healthArticlesSeo.ts`

```ts
// Head + crawlable body for the Health Articles hub (/health-articles[/:category]).
// Rows come from the search_blog_posts / blog_facets RPCs. Each article's canonical URL
// stays on the doctor's site, so the hub only ever links out - never republishes content.
//
// NOTE: relative imports only - Vercel's bundler does not resolve "@/".
import { DIRECTORY_MIN_INDEXABLE } from "../directory/slug";
import { formatDoctorName } from "./doctorSeo";
import { escapeHtml, INDEXABLE, NOINDEX, type PageHead } from "./injectHead";

export const ARTICLES_BASE = "/health-articles";
export const ARTICLES_PAGE_SIZE = 12;

export interface HubArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  category: string | null;
  featured_image_url: string | null;
  published_at: string | null;
  updated_at: string | null;
  reading_minutes: number;
  doctor_slug: string;
  doctor_name: string | null;
  doctor_specialization: string | null;
  doctor_city: string | null;
  doctor_photo_url: string | null;
}

export interface ArticleFacet {
  slug: string;
  label: string;
  post_count: number | string;
}

export interface ArticlesContext {
  origin: string;
  categorySlug?: string;
  categoryLabel?: string;
  page: number;
  articles: HubArticle[];
  total: number;
  facets: ArticleFacet[];
}

export function articlesPath(categorySlug?: string, page = 1): string {
  const base = categorySlug ? `${ARTICLES_BASE}/${categorySlug}` : ARTICLES_BASE;
  return page > 1 ? `${base}?page=${page}` : base;
}

/** Canonical article URL (on the doctor's site). */
export function articlePath(a: Pick<HubArticle, "doctor_slug" | "slug" | "id">): string {
  return `/dr/${a.doctor_slug}/blog/${a.slug || a.id}`;
}

export function totalPages(total: number): number {
  return Math.max(1, Math.ceil(total / ARTICLES_PAGE_SIZE));
}

export function isArticlesIndexable(total: number, categorySlug?: string): boolean {
  return categorySlug ? total >= DIRECTORY_MIN_INDEXABLE : total > 0;
}

export function articlesHeading(categoryLabel?: string): string {
  return categoryLabel ? `${categoryLabel} Articles by Doctors` : "Health Articles by Doctors";
}

const enc = encodeURIComponent;
const href = (a: HubArticle) => `/dr/${enc(a.doctor_slug)}/blog/${enc(a.slug || a.id)}`;

export function buildArticlesHead(ctx: ArticlesContext): PageHead {
  const { origin, categorySlug, categoryLabel, page, articles, total, facets } = ctx;
  const pages = totalPages(total);
  const canonical = `${origin}${articlesPath(categorySlug, page)}`;
  const h1 = articlesHeading(categoryLabel);
  const suffix = page > 1 ? ` - Page ${page}` : "";
  const noun = total === 1 ? "article" : "articles";

  const title = categoryLabel
    ? `${categoryLabel} Articles by Doctors${suffix} | Doctylia`
    : `Health Articles Written by Doctors in India${suffix} | Doctylia`;
  const description = categoryLabel
    ? `Read ${total} ${categoryLabel.toLowerCase()} ${noun} written by practising doctors in India. Clear, patient-friendly guidance, each linked to the author's clinic.`
    : `Read ${total} health ${noun} written by practising doctors across India. Browse by topic, from heart health to skin care, then book an appointment with the author.`;

  const itemList = articles.map((a, i) => ({
    "@type": "ListItem",
    position: (page - 1) * ARTICLES_PAGE_SIZE + i + 1,
    url: `${origin}${articlePath(a)}`,
    name: a.title,
  }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${canonical}#page`,
        name: h1,
        description,
        url: canonical,
        inLanguage: "en-IN",
        isPartOf: { "@type": "WebSite", name: "Doctylia", url: `${origin}/` },
        mainEntity: { "@type": "ItemList", numberOfItems: total, itemListElement: itemList },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Doctylia", item: `${origin}/` },
          { "@type": "ListItem", position: 2, name: "Health Articles", item: `${origin}${ARTICLES_BASE}` },
          ...(categoryLabel
            ? [{ "@type": "ListItem", position: 3, name: categoryLabel, item: `${origin}${articlesPath(categorySlug)}` }]
            : []),
        ],
      },
    ],
  };

  const list = articles
    .map((a) => {
      const who = [formatDoctorName(a.doctor_name ?? ""), a.doctor_specialization, a.doctor_city]
        .filter(Boolean)
        .map((s) => escapeHtml(String(s)))
        .join(", ");
      return (
        `<li><article><h2><a href="${href(a)}">${escapeHtml(a.title)}</a></h2>` +
        `${a.excerpt ? `<p>${escapeHtml(a.excerpt)}</p>` : ""}` +
        `<p>By <a href="/dr/${enc(a.doctor_slug)}">${who}</a></p></article></li>`
      );
    })
    .join("");

  const topics = facets
    .map((f) => `<li><a href="${ARTICLES_BASE}/${enc(f.slug)}">${escapeHtml(f.label)}</a> (${Number(f.post_count)})</li>`)
    .join("");

  const prev = page > 1 ? `<a rel="prev" href="${articlesPath(categorySlug, page - 1)}">Previous</a>` : "";
  const next = page < pages ? `<a rel="next" href="${articlesPath(categorySlug, page + 1)}">Next</a>` : "";

  return {
    title,
    description,
    canonical,
    robots: isArticlesIndexable(total, categorySlug) ? INDEXABLE : NOINDEX,
    jsonLd: [jsonLd],
    bodyHtml:
      `<main><h1>${escapeHtml(h1)}</h1>` +
      `<p>${escapeHtml(description)}</p>` +
      `${list ? `<ul>${list}</ul>` : ""}` +
      `${prev || next ? `<nav aria-label="Pagination">${prev}${next}</nav>` : ""}` +
      `${topics ? `<nav aria-label="Topics"><ul>${topics}</ul></nav>` : ""}</main>`,
  };
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/lib/seo/healthArticlesSeo.test.ts` -> PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo/healthArticlesSeo.ts src/lib/seo/healthArticlesSeo.test.ts
git commit -m "feat(seo): head, JSON-LD and crawlable body builders for the health articles hub"
```

---

### Task 4: Server-rendered hub via the Edge function + rewrites

**Files:**
- Modify: `src/lib/seo/handleSeoRequest.ts` (imports, new `articlesPage`, new `kind === "articles"` branch)
- Modify: `vercel.json`
- Test: `src/lib/seo/handleSeoRequest.test.ts` (append a `describe`)

**Interfaces:**
- Consumes: `buildArticlesHead`, `articlesPath`, `isArticlesIndexable`, `ARTICLES_BASE`, `ARTICLES_PAGE_SIZE` (Task 3); RPCs from Task 2.
- Produces: `GET /api/seo?kind=articles[&category=<slug>][&page=<n>]` -> HTML; 301 for non-canonical params; 404 for unknown category or out-of-range page.

- [ ] **Step 1: Append the failing tests** to `handleSeoRequest.test.ts`

```ts
describe("handleSeoRequest - health articles hub", () => {
  const row = (i: number, extra: Record<string, unknown> = {}) => ({
    id: `p${i}`, slug: `post-${i}`, title: `Post ${i}`, excerpt: "x", category: "Heart Health", featured_image_url: null,
    published_at: "2026-10-01T00:00:00Z", updated_at: null, reading_minutes: 2, doctor_slug: "dr-a", doctor_name: "Anita Sharma",
    doctor_specialization: "Cardiologist", doctor_city: "Kota", doctor_photo_url: null, total_count: 2, ...extra,
  });
  const facets = [{ slug: "heart-health", label: "Heart Health", post_count: 3 }];

  it("renders the root hub with title, JSON-LD, links and CDN caching", async () => {
    const handler = await fresh();
    const f = fakeFetch({ "/search_blog_posts": () => [row(1), row(2)], "/blog_facets": () => facets });
    const res = await handler(req("kind=articles"), env, f);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("<title>Health Articles Written by Doctors in India | Doctylia</title>");
    expect(html).toContain('href="https://doctylia.com/health-articles"');
    expect(html).toContain('"@type":"CollectionPage"');
    expect(html).toContain('href="/dr/dr-a/blog/post-1"');
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=300");
  });

  it("passes category and page offsets to the RPC", async () => {
    const handler = await fresh();
    const seen: any[] = [];
    const f = fakeFetch({
      "/search_blog_posts": (_u, init) => { seen.push(JSON.parse(String(init!.body))); return [row(13, { total_count: 30 })]; },
      "/blog_facets": () => facets,
    });
    const res = await handler(req("kind=articles&category=heart-health&page=2"), env, f);
    expect(res.status).toBe(200);
    expect(seen[0]).toMatchObject({ p_category: "heart-health", p_limit: 12, p_offset: 12, p_query: null });
    expect(await res.text()).toContain("Heart Health Articles by Doctors - Page 2 | Doctylia");
  });

  it("301s non-canonical params: uppercase category, page=1, junk page", async () => {
    const handler = await fresh();
    const f = fakeFetch({});
    for (const [qs, to] of [
      ["kind=articles&category=Heart-Health", "https://doctylia.com/health-articles/heart-health"],
      ["kind=articles&page=1", "https://doctylia.com/health-articles"],
      ["kind=articles&page=abc", "https://doctylia.com/health-articles"],
      ["kind=articles&category=heart-health&page=02", "https://doctylia.com/health-articles/heart-health?page=2"],
    ] as const) {
      const res = await handler(req(qs), env, f);
      expect(res.status).toBe(301);
      expect(res.headers.get("Location")).toBe(to);
    }
  });

  it("404s an unknown category and an out-of-range page", async () => {
    const handler = await fresh();
    const empty = fakeFetch({ "/search_blog_posts": () => [], "/blog_facets": () => [] });
    expect((await handler(req("kind=articles&category=nope"), env, empty)).status).toBe(404);
    expect((await handler(req("kind=articles&page=9"), env, empty)).status).toBe(404);
  });

  it("an empty root hub is 200 but noindex; upstream failure falls back to the plain shell", async () => {
    const handler = await fresh();
    const empty = fakeFetch({ "/search_blog_posts": () => [], "/blog_facets": () => [] });
    const res = await handler(req("kind=articles"), env, empty);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("noindex, follow");

    const boom = fakeFetch({ "/search_blog_posts": () => new Response("x", { status: 500 }) });
    const fallback = await handler(req("kind=articles"), env, boom);
    expect(await fallback.text()).toBe(TEMPLATE);
  });
});
```

- [ ] **Step 2: Run and confirm failure** — `npx vitest run src/lib/seo/handleSeoRequest.test.ts` -> new tests FAIL (unknown kind returns the plain shell).

- [ ] **Step 3: Implement.** In `handleSeoRequest.ts` add the import next to the other seo imports:

```ts
import { ARTICLES_BASE, ARTICLES_PAGE_SIZE, articlesPath, buildArticlesHead, isArticlesIndexable, type ArticleFacet, type HubArticle } from "./healthArticlesSeo";
```

Add before `hubPage`:

```ts
async function articlesPage(up: Upstream, template: string, origin: string, categorySlug: string | undefined, page: number): Promise<Response> {
  const path = categorySlug ? `${ARTICLES_BASE}/${categorySlug}` : ARTICLES_BASE;
  const [rows, facets] = await Promise.all([
    up.rpc("search_blog_posts", {
      p_query: null,
      p_category: categorySlug ?? null,
      p_limit: ARTICLES_PAGE_SIZE,
      p_offset: (page - 1) * ARTICLES_PAGE_SIZE,
    }) as Promise<Array<HubArticle & { total_count: number | string }>>,
    up.rpc("blog_facets", {}) as Promise<ArticleFacet[]>,
  ]);

  const total = Number(rows?.[0]?.total_count ?? 0);
  // Unknown topic, or a page past the end, is a real 404 rather than a thin indexable page.
  if ((categorySlug || page > 1) && total === 0) return notFound(template, origin, path);

  const categoryLabel = categorySlug
    ? facets?.find((f) => f.slug === categorySlug)?.label ?? rows[0]?.category?.trim() ?? undefined
    : undefined;
  const head = buildArticlesHead({ origin, categorySlug, categoryLabel, page, articles: rows ?? [], total, facets: facets ?? [] });
  return htmlResponse(
    renderPage(template, head),
    200,
    isArticlesIndexable(total, categorySlug) ? SITE_CACHE : "public, max-age=0, s-maxage=300",
  );
}
```

Add inside the `try` in `handleSeoRequest`, before `return shell(template, kind);`:

```ts
    if (kind === "articles") {
      const rawCategory = url.searchParams.get("category") ?? undefined;
      const category = rawCategory ? directorySlug(rawCategory) : undefined;
      const rawPage = url.searchParams.get("page");
      const parsed = rawPage === null ? 1 : Number(rawPage);
      const page = Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
      // Only the canonical spelling is served as 200; everything else 301s to it.
      if ((rawCategory && category !== rawCategory) || (rawPage !== null && String(page) !== rawPage) || rawPage === "1") {
        return new Response(null, {
          status: 301,
          headers: { Location: `${origin}${articlesPath(category, page)}`, "Cache-Control": "public, max-age=0, s-maxage=3600" },
        });
      }
      return await articlesPage(up, template, origin, category, page);
    }
```

- [ ] **Step 4: Add the rewrites** in `vercel.json`, directly above the `/doctors` rewrite (order matters; the catch-all stays last):

```json
    { "source": "/health-articles", "destination": "/api/seo?kind=articles" },
    { "source": "/health-articles/:category", "destination": "/api/seo?kind=articles&category=:category" },
```

- [ ] **Step 5: Run tests** — `npx vitest run src/lib/seo` -> all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/seo/handleSeoRequest.ts src/lib/seo/handleSeoRequest.test.ts vercel.json
git commit -m "feat(seo): server-render the health articles hub and topic pages"
```

---

### Task 5: Sitemap

**Files:**
- Modify: `supabase/functions/sitemap/index.ts`
- Test: `supabase/functions/sitemap/index.test.ts` (append; reuse its `doc`, `post`, `run`, `locs` helpers)

**Interfaces:**
- Consumes: `directorySlug`, `DIRECTORY_MIN_INDEXABLE` (already imported).
- Produces: `/health-articles` (when >= 1 eligible post) and `/health-articles/:category` (>= 3 eligible posts) in the sitemap. Pagination URLs are *not* listed (every article is already listed).

- [ ] **Step 1: Write the failing tests**

```ts
  it("health articles hub: listed with any eligible post; topic pages only at >= 3; hidden/unlisted posts don't count", async () => {
    const heart = (o: any = {}) => post({ category: "Heart Health", hub_hidden: false, ...o });
    const { xml } = await run({
      profiles: [doc(), doc({ id: "d2", slug: "dr-unlisted", directory_listed: false })],
      blog_posts: [
        heart({ id: "a", slug: "a" }), heart({ id: "b", slug: "b" }), heart({ id: "c", slug: "c" }),
        heart({ id: "h", slug: "h", hub_hidden: true }),
        heart({ id: "u", slug: "u", doctor_id: "d2" }),
        post({ id: "s", slug: "s", category: "Skin Care", hub_hidden: false }),
      ],
    });
    const l = locs(xml);
    expect(l).toContain("/health-articles");
    expect(l).toContain("/health-articles/heart-health");
    expect(l).not.toContain("/health-articles/skin-care");
  });

  it("omits the hub entirely when no post is eligible", async () => {
    const { xml } = await run({ profiles: [doc()], blog_posts: [] });
    expect(locs(xml).some((p) => p.startsWith("/health-articles"))).toBe(false);
  });
```

- [ ] **Step 2: Run and confirm failure** — `npm run test:edge -- supabase/functions/sitemap/index.test.ts` -> FAIL.

- [ ] **Step 3: Implement.** Extend `PostRow` and `fetchPosts`:

```ts
type PostRow = {
  id: string; slug?: string | null; doctor_id: string; updated_at: string | null; published_at: string | null;
  category?: string | null; hub_hidden?: boolean | null;
};
```
In `fetchPosts`, set the first column list to `"id, slug, doctor_id, updated_at, published_at, category, hub_hidden"` and widen the existing fallback condition so a missing column falls back to the old list: keep `if (error && columns.includes("slug"))` and make the fallback `"id, doctor_id, updated_at, published_at"` (unchanged) - it already covers the case where `hub_hidden` is not migrated yet, because the retry drops every optional column.

After the directory-hub block in the handler, add:

```ts
    // Health Articles hub: only posts the RPC would list (listed doctor, not hidden by moderation).
    const hubPosts = posts.filter((p) => !p.hub_hidden && doctorById.get(p.doctor_id)?.directory_listed);
    if (hubPosts.length > 0) {
      // Google only trusts lastmod if it is verifiably accurate: use the newest publish date,
      // which moderation toggles and slug backfills (they move updated_at) do not change.
      const newest = hubPosts.reduce((m, p) => { const d = p.published_at ?? p.updated_at ?? ""; return d > m ? d : m; }, "");
      urls.push(urlEntry("/health-articles", "daily", "0.7", lastMod(newest)));
      const perCategory = new Map<string, number>();
      for (const p of hubPosts) {
        const c = directorySlug(p.category);
        if (c) perCategory.set(c, (perCategory.get(c) ?? 0) + 1);
      }
      for (const [c, n] of perCategory) if (n >= DIRECTORY_MIN_INDEXABLE) urls.push(urlEntry(`/health-articles/${c}`, "weekly", "0.6"));
    }
```
Also update the header comment of the file: one line stating the hub rule.

- [ ] **Step 4: Run** `npm run test:edge -- supabase/functions/sitemap/index.test.ts` -> PASS (existing sitemap tests still pass: an existing assertion that lists the exact marketing URLs uses empty `blog_posts`, so no hub URL appears).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/sitemap/index.ts supabase/functions/sitemap/index.test.ts
git commit -m "feat(sitemap): list the health articles hub and topic pages"
```

---

### Task 6: The page (client) + route

**Files:**
- Create: `src/components/blog/HubArticleCard.tsx`
- Create: `src/pages/HealthArticlesHub.tsx`
- Test: `src/pages/HealthArticlesHub.test.tsx`
- Modify: `src/App.tsx` (lazy import near line 23; routes near line 118)

**Interfaces:**
- Consumes: Task 3 exports; RPCs from Task 2; `useDocumentHead` (`@/hooks/useDocumentHead`); `LandingNavbar`, `LandingFooter`; `BlogImagePlaceholder` (`@/components/doctor/BlogImagePlaceholder`).
- Produces: `<HubArticleCard article={HubArticle} priority?={boolean} />`; default export `HealthArticlesHub`.

- [ ] **Step 1: Write the failing test** — `src/pages/HealthArticlesHub.test.tsx`

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("@/components/landing/LandingNavbar", () => ({ default: () => <nav data-testid="nav" /> }));
vi.mock("@/components/landing/LandingFooter", () => ({ default: () => <footer /> }));

import HealthArticlesHub from "./HealthArticlesHub";

const art = (i: number, extra = {}) => ({
  id: `id${i}`, slug: `post-${i}`, title: `Post ${i}`, excerpt: `Excerpt ${i}`, category: "Heart Health",
  featured_image_url: null, published_at: "2026-10-01T00:00:00Z", updated_at: null, reading_minutes: 4,
  doctor_slug: "dr-a", doctor_name: "Anita Sharma", doctor_specialization: "Cardiologist", doctor_city: "Kota",
  doctor_photo_url: null, total_count: 30, ...extra,
});
const facets = [{ slug: "heart-health", label: "Heart Health", post_count: 30 }];

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/health-articles" element={<HealthArticlesHub />} />
        <Route path="/health-articles/:category" element={<HealthArticlesHub />} />
      </Routes>
    </MemoryRouter>,
  );
const robots = () => document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content;

beforeEach(() => {
  rpc.mockReset();
  document.head.innerHTML = "";
  rpc.mockImplementation(async (fn: string) => ({ data: fn === "search_blog_posts" ? [art(1), art(2)] : facets, error: null }));
});

describe("HealthArticlesHub", () => {
  it("lists articles, linking to the doctor's canonical article and profile", async () => {
    renderAt("/health-articles");
    expect(await screen.findByRole("heading", { level: 1, name: "Health Articles by Doctors" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Post 1/ })).toHaveAttribute("href", "/dr/dr-a/blog/post-1");
    expect(screen.getAllByRole("link", { name: /Dr\. Anita Sharma/ })[0]).toHaveAttribute("href", "/dr/dr-a");
    expect(rpc).toHaveBeenCalledWith("search_blog_posts", { p_query: null, p_category: null, p_limit: 12, p_offset: 0 });
    await waitFor(() => expect(robots()).toContain("index, follow"));
    expect(document.title).toBe("Health Articles Written by Doctors in India | Doctylia");
  });

  it("uses the category and page from the URL", async () => {
    renderAt("/health-articles/heart-health?page=2");
    expect(await screen.findByRole("heading", { level: 1, name: "Heart Health Articles by Doctors" })).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("search_blog_posts", { p_query: null, p_category: "heart-health", p_limit: 12, p_offset: 12 });
    expect(screen.getByRole("link", { name: "Previous page" })).toHaveAttribute("href", "/health-articles/heart-health");
    expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute("href", "/health-articles/heart-health?page=3");
  });

  it("noindexes free-text searches", async () => {
    renderAt("/health-articles?q=diabetes");
    expect(await screen.findByText('Results for "diabetes"')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("search_blog_posts", expect.objectContaining({ p_query: "diabetes" }));
    await waitFor(() => expect(robots()).toBe("noindex, follow"));
  });

  it("shows an empty state and an error state", async () => {
    rpc.mockImplementation(async (fn: string) => ({ data: fn === "search_blog_posts" ? [] : [], error: null }));
    const first = renderAt("/health-articles");
    expect(await screen.findByText(/No articles yet/i)).toBeInTheDocument();
    first.unmount();

    rpc.mockImplementation(async (fn: string) => (fn === "search_blog_posts" ? { data: null, error: { message: "x" } } : { data: [], error: null }));
    renderAt("/health-articles");
    expect(await screen.findByText(/Couldn't load articles/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run and confirm failure** — `npx vitest run src/pages/HealthArticlesHub.test.tsx` -> FAIL (module not found).

- [ ] **Step 3: Implement the card** — `src/components/blog/HubArticleCard.tsx`

```tsx
import { Link } from "react-router-dom";
import { ArrowRight, Calendar, Clock3, Tag, User } from "lucide-react";
import { format } from "date-fns";
import BlogImagePlaceholder from "@/components/doctor/BlogImagePlaceholder";
import { articlePath, type HubArticle } from "@/lib/seo/healthArticlesSeo";
import { formatDoctorName } from "@/lib/seo/doctorSeo";

/** One article on the hub / homepage strip. The article itself lives on the doctor's site. */
const HubArticleCard = ({ article, priority = false }: { article: HubArticle; priority?: boolean }) => {
  const date = article.published_at ?? article.updated_at;
  const doctor = formatDoctorName(article.doctor_name ?? "");
  const where = [article.doctor_specialization, article.doctor_city].filter(Boolean).join(" · ");

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Link to={articlePath(article)} className="flex flex-1 flex-col">
        <div className="relative aspect-[16/10] overflow-hidden bg-secondary">
          {article.featured_image_url ? (
            <img
              src={article.featured_image_url}
              alt={article.title}
              width={640}
              height={400}
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : "auto"}
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <BlogImagePlaceholder className="h-full w-full" />
          )}
          {article.category && (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-primary shadow-sm">
              <Tag className="h-3 w-3" /> {article.category}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col p-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {date && <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{format(new Date(date), "MMM d, yyyy")}</span>}
            <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{article.reading_minutes} min read</span>
          </div>
          <h2 className="mt-3 line-clamp-2 font-heading text-lg font-bold leading-snug text-primary group-hover:text-royal">{article.title}</h2>
          {article.excerpt && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{article.excerpt}</p>}
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-royal">
            Read article <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </span>
        </div>
      </Link>
      <Link to={`/dr/${article.doctor_slug}`} className="flex items-center gap-3 border-t px-5 py-3 hover:bg-secondary/60">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary">
          {article.doctor_photo_url ? (
            <img src={article.doctor_photo_url} alt="" width={36} height={36} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <User className="h-4 w-4 text-muted-foreground" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-primary">{doctor}</span>
          {where && <span className="block truncate text-xs text-muted-foreground">{where}</span>}
        </span>
      </Link>
    </article>
  );
};

export default HubArticleCard;
```

> Nested interactive regions are avoided on purpose: the card body and the author footer are two sibling links, not a link inside a link.

- [ ] **Step 4: Implement the page** — `src/pages/HealthArticlesHub.tsx`

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BookOpen, Search } from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import HubArticleCard from "@/components/blog/HubArticleCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useDocumentHead } from "@/hooks/useDocumentHead";
import {
  ARTICLES_PAGE_SIZE, articlesHeading, articlesPath, buildArticlesHead, totalPages,
  type ArticleFacet, type HubArticle,
} from "@/lib/seo/healthArticlesSeo";
import { NOINDEX } from "@/lib/seo/injectHead";

type Row = HubArticle & { total_count: number | string };

const titleFromSlug = (slug?: string) =>
  slug ? slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : undefined;

const HealthArticlesHub = () => {
  const { category } = useParams<{ category?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const q = (searchParams.get("q") ?? "").trim();
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);

  const [input, setInput] = useState(q);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<ArticleFacet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => setInput(q), [q]);

  const rpc = useCallback(
    (fn: string, args: Record<string, unknown>) => (supabase.rpc as any)(fn, args) as Promise<{ data: any; error: any }>,
    [],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    Promise.all([
      rpc("search_blog_posts", { p_query: q || null, p_category: category ?? null, p_limit: ARTICLES_PAGE_SIZE, p_offset: (page - 1) * ARTICLES_PAGE_SIZE }),
      rpc("blog_facets", {}),
    ]).then(([res, fac]) => {
      if (cancelled) return;
      if (res.error) {
        setError(true);
        setRows([]);
        setTotal(0);
      } else {
        const data = (res.data ?? []) as Row[];
        setRows(data);
        setTotal(Number(data[0]?.total_count ?? 0));
      }
      setFacets(((fac.data ?? []) as ArticleFacet[]).filter(Boolean));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [q, category, page, rpc]);

  const categoryLabel = category
    ? facets.find((f) => f.slug === category)?.label ?? rows[0]?.category?.trim() ?? titleFromSlug(category)
    : undefined;
  const heading = q ? `Results for "${q}"` : articlesHeading(categoryLabel);

  const head = useMemo(
    () => buildArticlesHead({ origin: window.location.origin, categorySlug: category, categoryLabel, page, articles: rows, total, facets }),
    [category, categoryLabel, page, rows, total, facets],
  );
  // Don't advertise a title/count before data arrives, and never index free-text searches.
  useDocumentHead({
    title: head.title,
    description: head.description,
    canonical: head.canonical,
    robots: q || loading || error ? NOINDEX : head.robots,
  });

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const value = input.trim();
    navigate(`${articlesPath(category)}${value ? `?q=${encodeURIComponent(value)}` : ""}`);
  };

  const pages = totalPages(total);
  const pageHref = (p: number) => (q ? `${articlesPath(category)}?q=${encodeURIComponent(q)}${p > 1 ? `&page=${p}` : ""}` : articlesPath(category, p));

  return (
    <div className="landing-page min-h-screen overflow-x-hidden bg-background">
      <LandingNavbar />
      <main className="container mx-auto max-w-6xl px-4 pb-16 pt-28">
        <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap gap-1 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-royal">Doctylia</Link><span>/</span>
          <Link to={articlesPath()} className="hover:text-royal">Health Articles</Link>
          {category && <><span>/</span><span>{categoryLabel}</span></>}
        </nav>

        <h1 className="mb-2 font-heading text-2xl font-bold text-primary sm:text-3xl">{heading}</h1>
        <p className="mb-5 max-w-2xl text-sm text-muted-foreground">
          Practical, patient-friendly health guidance written by practising doctors across India. Every article is published by its author on their own clinic page, where you can also book an appointment.
        </p>

        <form onSubmit={onSearch} role="search" className="mb-6 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search articles, topics or doctors" aria-label="Search articles" className="h-11 pl-9" maxLength={80} />
          </div>
          <Button type="submit" className="h-11">Search</Button>
        </form>

        {facets.length > 0 && (
          <nav aria-label="Topics" className="mb-8 flex flex-wrap gap-2">
            <Link to={articlesPath()} className={`rounded-full border px-3 py-1.5 text-sm transition-colors hover:border-royal hover:text-royal ${!category ? "border-royal bg-royal text-white hover:text-white" : "bg-card"}`}>All topics</Link>
            {facets.slice(0, 30).map((f) => (
              <Link key={f.slug} to={articlesPath(f.slug)} className={`rounded-full border px-3 py-1.5 text-sm transition-colors hover:border-royal hover:text-royal ${f.slug === category ? "border-royal bg-royal text-white hover:text-white" : "bg-card"}`}>
                {f.label} <span className="opacity-70">({Number(f.post_count)})</span>
              </Link>
            ))}
          </nav>
        )}

        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-80 animate-pulse rounded-2xl bg-secondary" />)}
          </div>
        ) : error ? (
          <p role="alert" className="rounded-xl border bg-card p-8 text-center text-muted-foreground">Couldn't load articles right now. Please try again.</p>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card px-6 py-16 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 font-semibold text-primary">No articles yet</p>
            <p className="mt-1 text-sm text-muted-foreground">New articles from doctors will appear here as they are published.</p>
          </div>
        ) : (
          <>
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((a, i) => <li key={a.id}><HubArticleCard article={a} priority={page === 1 && i < 3} /></li>)}
            </ul>
            {pages > 1 && (
              <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-3 text-sm">
                {page > 1 && <Link rel="prev" aria-label="Previous page" to={pageHref(page - 1)} className="rounded-full border px-4 py-2 hover:border-royal hover:text-royal">Previous</Link>}
                <span className="text-muted-foreground">Page {page} of {pages}</span>
                {page < pages && <Link rel="next" aria-label="Next page" to={pageHref(page + 1)} className="rounded-full border px-4 py-2 hover:border-royal hover:text-royal">Next</Link>}
              </nav>
            )}
          </>
        )}
      </main>
      <LandingFooter />
    </div>
  );
};

export default HealthArticlesHub;
```

- [ ] **Step 5: Add the routes** in `src/App.tsx`. Next to the other lazy imports (line ~23):

```tsx
const HealthArticlesHub = lazy(() => import("./pages/HealthArticlesHub"));
```
and next to the `/doctors` routes (line ~118):
```tsx
              <Route path="/health-articles" element={<HealthArticlesHub />} />
              <Route path="/health-articles/:category" element={<HealthArticlesHub />} />
```

- [ ] **Step 6: Run** `npx vitest run src/pages/HealthArticlesHub.test.tsx` -> PASS, then `npx tsc --noEmit -p tsconfig.app.json` -> no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/blog src/pages/HealthArticlesHub.tsx src/pages/HealthArticlesHub.test.tsx src/App.tsx
git commit -m "feat: Health Articles hub page listing every listed doctor's published posts"
```

---

### Task 7: Article pages - crawler-visible body, authorship, honest AI disclosure (GEO / AEO / E-E-A-T)

Why this task matters most (see "Research findings"): GPTBot, ClaudeBot and PerplexityBot do not run JavaScript, and today the Edge function gives them an article body that is **one plain paragraph cut at 3,000 characters with every heading and list stripped** (`buildBlogPostHead`). Google's article guidance also says the author must be a `Person` whose `name` has no honorific, and that bylines should link to information about the author. Google also asks sites to disclose AI use where readers would wonder. This task fixes all three, and drops two items from the first draft of the plan that the research showed are worthless or misleading (FAQPage markup and `lastReviewed`).

**Files:**
- Create: `src/lib/seo/articleHtml.ts`
- Test: `src/lib/seo/articleHtml.test.ts`
- Modify: `src/lib/seo/blogSeo.ts` (`BlogPostLike`, `buildBlogPostJsonLd`, `buildBlogPostHead`)
- Test: `src/lib/seo/blogSeo.test.ts`
- Modify: `src/pages/BlogPostPage.tsx` (byline + AI disclosure) and `src/pages/BlogPostPage.test.tsx`
- Modify: `supabase/functions/ai-blog-writer/index.ts` (prompt) and `supabase/functions/ai-blog-writer/index.test.ts`
- Modify: `src/components/admin/BlogPage.tsx` (record `ai_assisted`)
- (The `blog_posts.ai_assisted` column is added in Task 2's migration.)

**Interfaces:**
- Produces: `renderArticleBody(content: string | null | undefined): string` - safe HTML subset (see below); `BlogPostLike.ai_assisted?: boolean | null`.
- Consumes: `escapeHtml` from `./injectHead`; `marked` (already a dependency) for legacy markdown posts.

#### 7A. A safe, structure-preserving article body for crawlers

The Edge runtime has no DOM (so no DOMPurify). `renderArticleBody` is an allowlist tokenizer: every kept tag is rebuilt with **no attributes** (except a vetted `href`), all text is escaped, unknown tags are dropped, and open tags are balanced.

- [ ] **Step 1: Write the failing tests** - `src/lib/seo/articleHtml.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { renderArticleBody } from "./articleHtml";

describe("renderArticleBody", () => {
  it("keeps the structure answer engines quote from: headings, lists, emphasis", () => {
    const html = "<h2>What is BP?</h2><p>It is <strong>pressure</strong>.</p><ul><li>a</li></ul>";
    expect(renderArticleBody(html)).toBe(html);
  });

  it("normalises heading levels and bold/italic tags", () => {
    expect(renderArticleBody("<h1>T</h1><h5>x</h5><b>b</b><i>i</i>")).toBe("<h2>T</h2><h4>x</h4><strong>b</strong><em>i</em>");
  });

  it("drops scripts, styles, iframes and comments together with their content", () => {
    expect(renderArticleBody('<p>a</p><script>alert(1)</script><style>p{}</style><iframe src="x"></iframe><!-- c --><p>b</p>')).toBe("<p>a</p><p>b</p>");
  });

  it("strips every attribute, including event handlers and inline styles", () => {
    expect(renderArticleBody('<p onclick="x()" style="color:red" class="c">hi</p>')).toBe("<p>hi</p>");
  });

  it("keeps only http(s) and site-relative links, marked nofollow ugc", () => {
    expect(renderArticleBody('<a href="https://who.int/x?a=1&amp;b=2">WHO</a>')).toBe('<a href="https://who.int/x?a=1&amp;b=2" rel="nofollow ugc noopener">WHO</a>');
    expect(renderArticleBody('<a href="/dr/dr-a">Dr A</a>')).toContain('href="/dr/dr-a"');
    expect(renderArticleBody('<a href="javascript:alert(1)">bad</a>')).toBe("bad");
    expect(renderArticleBody('<a href="//evil.example">x</a>')).toBe("x");
  });

  it("escapes stray angle brackets without double-escaping entities", () => {
    expect(renderArticleBody("<p>a < b &amp; c</p>")).toBe("<p>a &lt; b &amp; c</p>");
  });

  it("closes unclosed tags and ignores stray closing tags", () => {
    expect(renderArticleBody("<ul><li>a")).toBe("<ul><li>a</li></ul>");
    expect(renderArticleBody("</p>text")).toBe("text");
  });

  it("renders legacy markdown posts", () => {
    const out = renderArticleBody("## Hi\n\ntext");
    expect(out).toContain("<h2>Hi</h2>");
    expect(out).toContain("<p>text</p>");
  });

  it("returns '' for empty input and bounds huge input", () => {
    expect(renderArticleBody(null)).toBe("");
    expect(renderArticleBody("   ")).toBe("");
    expect(renderArticleBody(`<p>${"x".repeat(500_000)}</p>`).length).toBeLessThan(130_000);
  });
});
```

- [ ] **Step 2: Run and confirm failure** - `npx vitest run src/lib/seo/articleHtml.test.ts` -> FAIL (module not found).

- [ ] **Step 3: Implement** - `src/lib/seo/articleHtml.ts`

```ts
// Turns a stored article (editor HTML, or legacy markdown) into a small, safe HTML
// subset for the crawler-facing body. GPTBot, ClaudeBot and PerplexityBot do not execute
// JavaScript, so this is the only copy of the article they read: it must keep headings,
// lists and links. The Edge runtime has no DOM, so this is an allowlist tokenizer - every
// kept tag is rebuilt with NO attributes (except a vetted href) and all text is escaped.
//
// NOTE: relative imports only - Vercel's bundler does not resolve "@/".
import { marked } from "marked";

const ALLOWED = new Set(["h2", "h3", "h4", "p", "ul", "ol", "li", "strong", "em", "blockquote", "br", "table", "thead", "tbody", "tr", "th", "td", "a"]);
const RENAME: Record<string, string> = { h1: "h2", h5: "h4", h6: "h4", b: "strong", i: "em" };
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi;
const MAX_SOURCE_CHARS = 120_000;

/** Escapes text but leaves existing entities (&amp; &nbsp; &#39;) alone so they are not double-escaped. */
const escapeText = (t: string) =>
  t.replace(/&(?!(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function safeHref(attrs: string): string | null {
  const m = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
  const raw = (m?.[1] ?? m?.[2] ?? "").trim();
  const ok = /^https?:\/\/[^\s"'<>]+$/i.test(raw) || /^\/(?!\/)[^\s"'<>]*$/.test(raw);
  return ok ? raw : null;
}

export function renderArticleBody(content: string | null | undefined): string {
  let src = (content ?? "").slice(0, MAX_SOURCE_CHARS);
  if (!src.trim()) return "";
  if (!/<\/?[a-z][\s\S]*>/i.test(src)) src = marked.parse(src, { async: false }) as string;
  src = src.replace(/<!--[\s\S]*?-->/g, "").replace(DROP_WITH_CONTENT, "");

  const out: string[] = [];
  const open: string[] = [];
  // tag | text | a lone "<"
  const token = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)|</g;
  for (const m of src.matchAll(token)) {
    if (m[4] !== undefined) { out.push(escapeText(m[4])); continue; }
    if (m[2] === undefined) { out.push("&lt;"); continue; }

    const raw = m[2].toLowerCase();
    const tag = RENAME[raw] ?? raw;
    if (!ALLOWED.has(tag)) continue;

    if (m[1]) {
      const at = open.lastIndexOf(tag);
      if (at === -1) continue;
      while (open.length > at) out.push(`</${open.pop()}>`);
    } else if (tag === "br") {
      out.push("<br>");
    } else if (tag === "a") {
      const href = safeHref(m[3]);
      // An unsafe link keeps its text but loses the anchor; its closing tag then finds no match and is ignored.
      if (href) { open.push("a"); out.push(`<a href="${href.replace(/"/g, "&quot;")}" rel="nofollow ugc noopener">`); }
    } else {
      open.push(tag);
      out.push(`<${tag}>`);
    }
  }
  while (open.length) out.push(`</${open.pop()}>`);
  return out.join("").replace(/<p>\s*<\/p>/g, "");
}
```

- [ ] **Step 4: Run** `npx vitest run src/lib/seo/articleHtml.test.ts` -> PASS.

#### 7B. Per-article structured data that matches Google's guidance

Changes to `buildBlogPostJsonLd` in `blogSeo.ts` (and `BlogPostLike` gains `ai_assisted?: boolean | null`):
- `author` becomes a **`Person`** (Google: "Use Person for people"): `name` is the bare name **without "Dr."**, `honorificPrefix: "Dr."`, `jobTitle` = specialization, `url` = the doctor's page, `image`, and `worksFor` (clinic + city) when known.
- `reviewedBy` is emitted **only** when `ai_assisted` is true (the doctor reviewed an AI draft); for a post the doctor wrote it duplicated the author and claimed nothing new.
- Add `inLanguage: "en-IN"` and `isPartOf: { "@type": "Blog", "@id": ".../blog#blog", url }`.
- Deliberately **not** added: `FAQPage` (Google removed FAQ rich results on May 7 2026) and `lastReviewed` (`updated_at` also moves on admin moderation toggles, so it would claim a medical review that never happened).

- [ ] **Step 5: Write the failing tests** (append to `blogSeo.test.ts`; its `doctor`, `post`, `origin` helpers already exist)

```ts
describe("buildBlogPostJsonLd - author entity", () => {
  const rich = { ...doctor, qualifications: "MBBS, MD Cardiology", clinic_name: "Heart Care Clinic", city: "Kota" };
  const article = (d: any, p = post()) => (buildBlogPostJsonLd({ origin, doctor: d, post: p }) as any)["@graph"].find((n: any) => n["@type"] === "BlogPosting");

  it("uses a Person author with a bare name, honorific, job title and profile url", () => {
    const a = article(rich).author;
    expect(a).toMatchObject({ "@type": "Person", name: "Anita Sharma", honorificPrefix: "Dr.", jobTitle: "Dentist", url: `${origin}/dr/dr-a` });
    expect(a.name).not.toMatch(/^dr\.?\s/i);
    expect(a.worksFor).toMatchObject({ "@type": "MedicalBusiness", name: "Heart Care Clinic", address: { addressLocality: "Kota" } });
  });

  it("does not double the honorific when the stored name already starts with Dr.", () => {
    expect(article({ ...rich, full_name: "Dr. Anita Sharma" }).author.name).toBe("Anita Sharma");
  });

  it("adds language and hub membership, and never FAQPage or lastReviewed", () => {
    const g = (buildBlogPostJsonLd({ origin, doctor: rich, post: post({ content: "<h2>A?</h2><p>a</p><h2>B?</h2><p>b</p>" }) }) as any)["@graph"];
    const a = g.find((n: any) => n["@type"] === "BlogPosting");
    expect(a.inLanguage).toBe("en-IN");
    expect(a.isPartOf).toMatchObject({ "@type": "Blog", url: `${origin}/dr/dr-a/blog` });
    expect(g.some((n: any) => n["@type"] === "FAQPage")).toBe(false);
    expect(a.lastReviewed).toBeUndefined();
  });

  it("claims a review only for AI-assisted posts", () => {
    expect(article(rich).reviewedBy).toBeUndefined();
    expect(article(rich, post({ ai_assisted: true })).reviewedBy).toMatchObject({ "@type": "Person", name: "Anita Sharma" });
  });
});
```
(Update any existing assertion in this file that expected `author["@type"] === "Physician"` or an unconditional `reviewedBy`; do not weaken the new ones.)

- [ ] **Step 6: Run and confirm failure** - `npx vitest run src/lib/seo/blogSeo.test.ts`.

- [ ] **Step 7: Implement** in `blogSeo.ts`. Add `ai_assisted?: boolean | null;` to `BlogPostLike`. In `buildBlogPostJsonLd` replace the `author`/`reviewedBy` lines and add the new fields:

```ts
  const bareName = name.replace(/^dr\.?\s+/i, "").trim();
  const person = {
    "@type": "Person",
    name: bareName,
    honorificPrefix: "Dr.",
    url: doctorUrl,
    ...(doctor.specialization ? { jobTitle: doctor.specialization } : {}),
  };
  const worksFor = doctor.clinic_name
    ? {
        worksFor: {
          "@type": "MedicalBusiness",
          name: doctor.clinic_name,
          ...(doctor.city ? { address: { "@type": "PostalAddress", addressLocality: doctor.city, addressCountry: "IN" } } : {}),
        },
      }
    : {};
```
and inside the `BlogPosting` node:

```ts
        inLanguage: "en-IN",
        isPartOf: { "@type": "Blog", "@id": `${doctorUrl}/blog#blog`, url: `${doctorUrl}/blog` },
        author: { ...person, ...(doctor.profile_photo_url ? { image: doctor.profile_photo_url } : {}), ...worksFor },
        ...(post.ai_assisted ? { reviewedBy: person } : {}),
```
(remove the old `specialty`-based `author`/`reviewedBy` entries; keep `publisher`.)

- [ ] **Step 8: Run** `npx vitest run src/lib/seo` -> PASS.

#### 7C. Give non-JS crawlers the whole article

- [ ] **Step 9: Write the failing test** (append to `blogSeo.test.ts`)

```ts
describe("buildBlogPostHead - crawler-visible body", () => {
  const content = "<h2>What is a stent?</h2><p>A small mesh tube.</p><h2>When to see a doctor</h2><ul><li>Chest pain</li></ul><script>alert(1)</script>";
  const head = buildBlogPostHead({ origin, doctor: { ...doctor, qualifications: "MBBS" }, post: post({ content, excerpt: "Short answer.", published_at: "2026-10-01T05:00:00Z" }) });

  it("includes the full article with its headings and lists, not a truncated blob", () => {
    expect(head.bodyHtml).toContain("<h2>What is a stent?</h2>");
    expect(head.bodyHtml).toContain("<li>Chest pain</li>");
    expect(head.bodyHtml).not.toContain("<script");
  });
  it("shows a byline that links to the doctor and a machine-readable date", () => {
    expect(head.bodyHtml).toContain('<a href="/dr/dr-a">');
    expect(head.bodyHtml).toContain('<time datetime="2026-10-01T05:00:00Z">2026-10-01</time>');
  });
  it("leads with the excerpt as the summary before the body", () => {
    expect(head.bodyHtml!.indexOf("Short answer.")).toBeLessThan(head.bodyHtml!.indexOf("What is a stent?"));
  });
});
```

- [ ] **Step 10: Implement.** In `blogSeo.ts` add `import { renderArticleBody } from "./articleHtml";` and replace the `bodyHtml` of `buildBlogPostHead` (drop the `text`/`stripMarkup(...).slice(0, 3000)` variable there; `stripMarkup` is still used for the meta description):

```ts
  const when = post.published_at || post.created_at || "";
  const summary = post.excerpt?.trim();
  const slug = encodeURIComponent(doctor.slug);
  ...
    bodyHtml:
      `<main><nav aria-label="Breadcrumb"><a href="/dr/${slug}">${escapeHtml(name)}</a> / ` +
      `<a href="/dr/${slug}/blog">Health Articles</a></nav>` +
      `<article><h1>${escapeHtml(post.title)}</h1>` +
      `<p>By <a href="/dr/${slug}">${escapeHtml(name)}</a>${doctor.specialization ? `, ${escapeHtml(doctor.specialization)}` : ""}` +
      `${when ? ` &middot; <time datetime="${escapeHtml(when)}">${escapeHtml(when.slice(0, 10))}</time>` : ""}</p>` +
      `${summary ? `<p>${escapeHtml(summary)}</p>` : ""}` +
      `${renderArticleBody(post.content)}</article></main>`,
```

- [ ] **Step 11: Run** `npx vitest run src/lib/seo` and `npx vitest run src/lib/seo/handleSeoRequest.test.ts` -> PASS. Add one assertion to the handler test for `kind=post` that the returned HTML contains an `<h2>` from the stored content (this is the regression test for the non-JS-crawler gap).

#### 7D. Visible authorship and honest AI disclosure on the article page

Google: bylines should link to author information; disclose automation/AI use where readers would reasonably wonder; for health content trust is the most important signal. `BlogPostPage` currently says "Reviewed by Dr X" and does not link to the doctor.

- [ ] **Step 12: Write the failing tests** (append to `BlogPostPage.test.tsx`, reusing its existing supabase mock and render helper)
  - the author card reads "Written by Dr. <name>" and is a link to `/dr/<slug>`
  - with `ai_assisted: true` on the mocked post the page shows "Drafted with AI assistance, reviewed and published by Dr. <name>"; without the flag that text is absent
  - the footer note "This article is for general education and is not a substitute for personal medical advice." is present

- [ ] **Step 13: Implement** in `BlogPostPage.tsx`: replace the author card's `Reviewed by {doctorName}` paragraph with a `Link to={`/dr/${slug}`}` containing `Written by {doctorName}`; show `[doctor.specialization, doctor.qualifications].filter(Boolean).join(" · ")` on the next line; add, under it when `(post as { ai_assisted?: boolean | null }).ai_assisted` is true, `<p className="text-xs text-slate-500">Drafted with AI assistance, reviewed and published by {doctorName}.</p>`; and add the general-education note under the article content section.

- [ ] **Step 14: Run** `npx vitest run src/pages/BlogPostPage.test.tsx` -> PASS.

#### 7E. Better AI drafts (the content AI engines and Google will judge)

The AI Blog Writer prompt asks for 300-500 words with no guidance on structure, sourcing or honesty. GEO research (Princeton, KDD 2024) found cited sources, quotations and statistics lifted visibility while keyword stuffing did nothing; Google says health content must be accurate and consistent with expert consensus. A medical model that invents a statistic is a liability, so the prompt must forbid it.

- [ ] **Step 15: Write the failing test** in `supabase/functions/ai-blog-writer/index.test.ts`, using that file's existing mock of the upstream Gemini `fetch`: assert that the prompt text sent upstream contains `"Never invent statistics"`, `"40-60 word"`, `"When to see a doctor"` and `"500-800 words"`.

- [ ] **Step 16: Implement.** Replace the `Rules:` block of `systemPrompt` in `ai-blog-writer/index.ts` with:

```
Rules:
- Write in clear, simple English that Indian patients can understand
- Open with a direct 40-60 word answer to the question the title asks, before any background
- Use question-style "##" headings that match what patients actually search (for example "What causes ...?")
- Include a "## When to see a doctor" section listing warning signs, and end with a short "## Key takeaways" list
- Be medically accurate and consistent with established guidance (WHO, ICMR, Indian clinical guidelines); name the source when you rely on one
- Never invent statistics, studies, quotations, or drug doses. If you are not certain of a number, leave it out
- Avoid overly technical jargon; explain medical terms in plain words
- Add a disclaimer: "This article is for educational purposes only. Always consult your doctor for personalized advice."
- Structure with proper headings using ## and ### markdown
- Aim for 500-800 words, warm and reassuring in tone
```

- [ ] **Step 17: Record `ai_assisted`.** In `BlogPage.tsx`: add `ai_assisted: false` to the `form` state, to `openNew()`, and `ai_assisted: Boolean((post as { ai_assisted?: boolean }).ai_assisted)` to `openEdit()`; in `generateWithAI()` success path `setForm({ ...form, ..., ai_assisted: true })`; include `ai_assisted: form.ai_assisted` in the save `payload` (cast the insert/update payload `as any` - generated types are stale). Test (append to `BlogPage.test.tsx`): after a successful mocked AI generation and Save, the insert payload has `ai_assisted: true`; a post written by hand saves `ai_assisted: false`.

- [ ] **Step 18: Run** `npx vitest run src/components/admin/BlogPage.test.tsx` and `npm run test:edge -- supabase/functions/ai-blog-writer` -> PASS.

- [ ] **Step 19: Commit**

```bash
git add src/lib/seo src/pages/BlogPostPage.tsx src/pages/BlogPostPage.test.tsx src/components/admin/BlogPage.tsx src/components/admin/BlogPage.test.tsx supabase/functions/ai-blog-writer
git commit -m "feat(seo): crawler-visible article body, Person author, AI disclosure and sturdier AI drafts"
```

---

### Task 8: Superadmin moderation - "Hide from Health Articles"

Permissions: reuses `moderation.view` (see the tab) and `moderation.manage` (see the DB guard from Task 2). **No new permission keys**, so the three-place sync rule for `superadminPermissions.ts` does not apply.

**Files:**
- Modify: `src/components/superadmin/SAModeration.tsx`
- Test: `src/components/superadmin/SAModeration.test.tsx`

**Interfaces:**
- Consumes: `blog_posts.hub_hidden` (Task 2), `logAdminAction(action, table, id)`.
- Produces: audit actions `hide_blog_from_hub` / `show_blog_on_hub`.

- [ ] **Step 1: Write the failing test.** The file's `chain` mock only supports `select().order()`. Extend `mockData` with an `update` that records calls, then add:

```tsx
const updateEq = vi.fn(async () => ({ error: null }));
// in mockData's chain: add  update: (patch: any) => ({ eq: (...a: any[]) => { updateEq(patch, ...a); return Promise.resolve({ error: null }); } })

it("hides a published post from the Health Articles hub and logs it", async () => {
  mockData();
  render(<SAModeration />);
  fireEvent.click(await screen.findByText("Dr. A"));
  const row = (await screen.findByText("Post A1")).closest("tr")!;
  fireEvent.click(within(row).getByRole("button", { name: "Hide from hub" }));
  await waitFor(() => expect(updateEq).toHaveBeenCalledWith({ hub_hidden: true }, "id", "p1"));
  expect(logAdminAction).toHaveBeenCalledWith("hide_blog_from_hub", "blog_posts", "p1");
});
```
(import `within`, `waitFor`, and `logAdminAction` from `@/lib/adminAudit`'s mock). Put `hub_hidden: false` on `p1` in the `posts` fixture and `hub_hidden: true` on `p3` to also assert the button reads "Show on hub" there.

- [ ] **Step 2: Run and confirm failure** — `npx vitest run src/components/superadmin/SAModeration.test.tsx`.

- [ ] **Step 3: Implement.** Add next to `setPublished`:

```tsx
  const setHubHidden = async (id: string, hidden: boolean) => {
    const { error } = await supabase.from("blog_posts").update({ hub_hidden: hidden } as any).eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    await logAdminAction(hidden ? "hide_blog_from_hub" : "show_blog_on_hub", "blog_posts", id);
    toast({ title: hidden ? "Hidden from Health Articles" : "Visible on Health Articles" });
    if (openPost?.id === id) setOpenPost({ ...openPost, hub_hidden: hidden });
    load();
  };
```
In the table row's action cell (inside the `stopPropagation` td) add, only for published posts:

```tsx
                        {p.is_published && (
                          <Button size="sm" variant="outline" className="ml-2" onClick={() => setHubHidden(p.id, !p.hub_hidden)}>
                            {p.hub_hidden ? "Show on hub" : "Hide from hub"}
                          </Button>
                        )}
```
In the dialog `DialogFooter` add the same button (published posts only), and in the dialog badge row add `{openPost.hub_hidden && <Badge variant="outline" className="pointer-events-none">Hidden from hub</Badge>}`. Keep the doctor's own site untouched: this flag affects only the hub. Also change the helper text in the Unpublish button's `title` (or a one-line caption under the tab) to say: "Unpublish removes the post everywhere; Hide from hub keeps it on the doctor's site."

- [ ] **Step 4: Run** the SAModeration tests -> PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/superadmin/SAModeration.tsx src/components/superadmin/SAModeration.test.tsx
git commit -m "feat(superadmin): hide a post from the health articles hub"
```

---

### Task 9: Doctor-facing consent and clarity

**Files:**
- Modify: `src/components/admin/ProfilePage.tsx` (switch at line ~358)
- Modify: `src/components/admin/BlogPage.tsx` (header area)
- Test: `src/components/admin/BlogPage.test.tsx` (append one assertion)

- [ ] **Step 1: Failing test** (append to `BlogPage.test.tsx`, using that file's existing render helper):

```tsx
it("tells the doctor that published posts also appear on Doctylia's Health Articles page", async () => {
  // render BlogPage exactly as the other tests in this file do
  expect(await screen.findByText(/also appear on Doctylia's Health Articles/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Implement.** In `BlogPage.tsx`, under the `<p>` that shows the published/draft counts add:

```tsx
          <p className="text-xs text-muted-foreground mt-1">
            Published posts also appear on Doctylia's Health Articles page unless you hide your profile from the directory in Profile settings.
          </p>
```
In `ProfilePage.tsx`, find the label/description next to `<Switch id="directory-listed" …>` and extend its helper text to: "Show my profile in the Doctylia doctor directory and my published articles on the Health Articles page." Do not change the field, the default or the save path.

- [ ] **Step 3: Run** `npx vitest run src/components/admin/BlogPage.test.tsx src/components/admin` -> PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/BlogPage.tsx src/components/admin/BlogPage.test.tsx src/components/admin/ProfilePage.tsx
git commit -m "feat(admin): explain that published posts appear on the health articles hub"
```

---

### Task 10: Homepage discovery and internal links

Internal links from the highest-authority page are what get the hub crawled and ranked (Google: "make content findable through internal links").

**Files:**
- Modify: `src/components/landing/LandingNavbar.tsx` (desktop block ~line 73-78 and mobile block ~line 134-140)
- Modify: `src/components/landing/LandingFooter.tsx` (Company list, line ~84)
- Create: `src/components/landing/LatestArticles.tsx` + `.test.tsx`
- Modify: `src/pages/LandingPage.tsx` (after `Specialties`)

- [ ] **Step 1: Navbar + footer links.** After each existing "Find a Doctor" `<Link>` add an identical one:

Desktop (same classes as its siblings):
```tsx
          <Link
            to="/health-articles"
            className="text-sm font-medium text-muted-foreground hover:text-royal transition-colors relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-0.5 after:bg-royal after:transition-all hover:after:w-full"
          >
            Health Articles
          </Link>
```
Mobile:
```tsx
        <Link
          to="/health-articles"
          onClick={() => setMobileOpen(false)}
          className="block text-sm font-medium text-muted-foreground py-1"
        >
          Health Articles
        </Link>
```
Footer, in the Company list:
```tsx
              <li><Link to="/health-articles" className="hover:text-white transition-colors">Health Articles</Link></li>
```

- [ ] **Step 2: Failing test** — `src/components/landing/LatestArticles.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
import LatestArticles from "./LatestArticles";

const art = (i: number) => ({
  id: `i${i}`, slug: `p${i}`, title: `Post ${i}`, excerpt: "x", category: "Heart Health", featured_image_url: null,
  published_at: "2026-10-01T00:00:00Z", updated_at: null, reading_minutes: 2, doctor_slug: "dr-a", doctor_name: "Anita Sharma",
  doctor_specialization: null, doctor_city: null, doctor_photo_url: null, total_count: 6,
});
const mount = () => render(<MemoryRouter><LatestArticles /></MemoryRouter>);
beforeEach(() => rpc.mockReset());

describe("LatestArticles", () => {
  it("shows the newest articles with a link to the full hub", async () => {
    rpc.mockResolvedValue({ data: [art(1), art(2), art(3)], error: null });
    mount();
    expect(await screen.findByRole("heading", { name: /latest health articles/i })).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("search_blog_posts", { p_query: null, p_category: null, p_limit: 6, p_offset: 0 });
    expect(screen.getByRole("link", { name: /view all articles/i })).toHaveAttribute("href", "/health-articles");
  });
  it("renders nothing when there are fewer than 3 articles or the call fails", async () => {
    rpc.mockResolvedValue({ data: [art(1)], error: null });
    const a = mount();
    await Promise.resolve();
    expect(a.container).toBeEmptyDOMElement();
    a.unmount();
    rpc.mockResolvedValue({ data: null, error: { message: "x" } });
    const b = mount();
    await Promise.resolve();
    expect(b.container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 3: Run and confirm failure**, then implement `LatestArticles.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import HubArticleCard from "@/components/blog/HubArticleCard";
import { supabase } from "@/integrations/supabase/client";
import { ARTICLES_BASE, type HubArticle } from "@/lib/seo/healthArticlesSeo";

const MIN_TO_SHOW = 3;

/** Homepage strip: internal links from the highest-authority page to the hub and to fresh articles. */
const LatestArticles = () => {
  const [articles, setArticles] = useState<HubArticle[]>([]);

  useEffect(() => {
    let cancelled = false;
    ((supabase.rpc as any)("search_blog_posts", { p_query: null, p_category: null, p_limit: 6, p_offset: 0 }) as Promise<{ data: HubArticle[] | null; error: unknown }>)
      .then(({ data, error }) => { if (!cancelled && !error) setArticles(data ?? []); });
    return () => { cancelled = true; };
  }, []);

  if (articles.length < MIN_TO_SHOW) return null;

  return (
    <section id="health-articles" className="py-12 md:py-20">
      <div className="container mx-auto px-4">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-teal">Written by doctors</p>
            <h2 className="mt-1 font-heading text-2xl font-bold text-primary md:text-4xl">Latest Health Articles</h2>
          </div>
          <Link to={ARTICLES_BASE} className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-royal hover:underline">
            View all articles <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((a) => <li key={a.id}><HubArticleCard article={a} /></li>)}
        </ul>
      </div>
    </section>
  );
};

export default LatestArticles;
```
Wire it into `LandingPage.tsx`: `import LatestArticles from "@/components/landing/LatestArticles";` and after the `Specialties` block:
```tsx
        <AnimatedSection>
          <LatestArticles />
        </AnimatedSection>
```

- [ ] **Step 4: Run** `npx vitest run src/components/landing src/pages` -> PASS (update any navbar test that asserted the exact link list).

- [ ] **Step 5: Commit**

```bash
git add src/components/landing src/pages/LandingPage.tsx
git commit -m "feat: link the health articles hub from the homepage, nav and footer"
```

---

### Task 11: Docs and final verification

**Files:**
- Modify: `CLAUDE.md` (add a short "Health Articles hub" subsection under "Doctor discovery & SEO")

- [ ] **Step 1: Document the rules** in `CLAUDE.md`:

```md
- **Health Articles hub** (`/health-articles[/:category]`): an index over doctors' published `blog_posts`, never a copy - each article's canonical URL stays `/dr/:slug/blog/:post`. Reads go through `search_blog_posts` / `blog_facets` (SECURITY DEFINER; they apply the doctor-level filters RLS does not: onboarded, slug, not `cancelled`, `directory_listed`). Rendered for crawlers by `api/seo.ts` (`kind=articles`, logic in `src/lib/seo/healthArticlesSeo.ts`, relative imports only). `blog_posts.hub_hidden` is a superadmin-only moderation flag (guard trigger `guard_blog_hub_hidden`; owner or `moderation.manage`), separate from `is_published`. `published_at` is the original publish date: edits must keep it (`src/lib/blogPublish.ts`). Topic hubs with < `DIRECTORY_MIN_INDEXABLE` posts are `noindex` and not in the sitemap. AI crawlers (GPTBot, ClaudeBot, PerplexityBot) do not run JavaScript, so the Edge HTML for an article carries the whole article via `renderArticleBody` (`src/lib/seo/articleHtml.ts`, an allowlist tokenizer, no DOM); never reduce it to a text blob. Article JSON-LD authors are `Person` with a bare name + `honorificPrefix` (Google rejects honorifics in `author.name`). No `FAQPage` (Google removed FAQ rich results May 2026) and no `lastReviewed` (`updated_at` moves on moderation toggles). `blog_posts.ai_assisted` drives the on-page AI disclosure.
```

- [ ] **Step 2: Full automated verification**

```bash
npm run test
npm run test:edge
npm run test:db
npx tsc --noEmit -p tsconfig.app.json
npm run lint
npm run build
```
Expected: all green; `tsc` shows only the two pre-existing errors; build succeeds.

- [ ] **Step 3: Manual SEO/AEO/GEO checks on a deployed preview** (after the migration is applied to Supabase and Vercel has deployed)

```bash
curl -s -A Googlebot https://<preview>/health-articles | grep -E "<title>|rel=\"canonical\"|robots|application/ld\+json|<h1>"
curl -s -A Googlebot "https://<preview>/health-articles?page=2" | grep canonical
curl -sI https://<preview>/health-articles/Heart-Health   # expect 301 -> /health-articles/heart-health
curl -sI https://<preview>/health-articles/not-a-topic     # expect 404
curl -s https://<preview>/sitemap.xml | grep health-articles
```
Then: Google Rich Results Test on the hub URL and one article (BlogPosting, Breadcrumb, FAQ if present); schema.org validator; WhatsApp/LinkedIn preview; Lighthouse mobile (LCP < 2.5s, INP < 200ms, CLS < 0.1); submit `/health-articles` in Search Console and request indexing; add the hub URL to IndexNow if used.

- [ ] **Step 4: Prove non-JS crawlers see the content, and set a baseline**

Run against the deployed preview (AI crawlers send these user agents and do not run JS, so `curl` is the same view they get):

```bash
for ua in GPTBot ClaudeBot PerplexityBot OAI-SearchBot; do
  echo "== $ua"; curl -s -A "$ua" https://<preview>/dr/<doctor-slug>/blog/<post-slug> | grep -cE "<h2>|<li>|<time datetime"
done
# each must print a count > 0 (headings, list items and the date are in the server HTML)
curl -s -A GPTBot https://<preview>/health-articles | grep -c "<article>"   # hub cards are in the server HTML
```

Baseline BEFORE launch (write the numbers in the PR description): Search Console Performance -> pages containing `/health-articles` and `/blog/` (impressions, clicks, average position); indexed-page counts for `/dr/*/blog/*`; Bing Webmaster Tools AI Performance (citations) once the site is verified there; Vercel logs: requests per day from GPTBot / ClaudeBot / PerplexityBot / OAI-SearchBot to `/health-articles*` and `/dr/*/blog/*`.

Success checks at 4 and 8 weeks: hub and topic pages indexed (Search Console "Pages" report, not "Discovered - currently not indexed"); article impressions up versus baseline; AI-crawler requests to hub URLs present in logs; Rich Results Test shows `BlogPosting` valid with a `Person` author and no author warnings. Google states AI Overviews/AI Mode traffic is counted inside the normal Search Console "Web" performance report - there is no separate switch to flip.

- [ ] **Step 5: Rollout order** (as in `docs/doctor-discovery-plan.md`): (1) apply `20261031100000_health_articles_hub.sql` to Supabase; (2) deploy to Vercel; (3) run the manual checks above; (4) submit the sitemap in Search Console, and verify the site in Bing Webmaster Tools (manual; Bing and Copilot share one index, and it unlocks the AI Performance report). Deploying the frontend first would show an error state on the hub and the Edge function would serve the plain shell (safe, but empty).

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document the health articles hub rules"
```

---

## Self-Review

**Spec coverage**
- *Separate blogs page with every doctor's published posts in one place* -> Tasks 2, 3, 6.
- *Understand the blogs module, admin and superadmin permissions first* -> "What the audit found" table; permission handling in Tasks 2, 8, 9 and the Decisions table (staff `blog.*` unchanged, superadmin `moderation.*` reused, no new keys).
- *SEO* -> Tasks 3-5 (server HTML, canonical, pagination, thin-page `noindex`, sitemap, 301/404 hygiene, breadcrumbs, CWV: lazy images with dimensions, eager first row, small RPC payload).
- *AEO* -> Task 3 (intro paragraph and excerpts in crawlable HTML, `CollectionPage`/`ItemList`), Task 7 (summary-first server body, direct-answer + question-heading AI drafts, no FAQPage because Google removed the feature).
- *GEO* -> Task 7 (the whole article in server HTML for crawlers that do not run JS, `Person` author with clinic and city, `inLanguage`, hub membership, linked byline, AI disclosure, sourced/no-invented-numbers drafts), Task 10 (internal links from the homepage), Task 11 (curl-as-GPTBot proof and a measurable baseline). robots.txt already allows the AI crawlers (verified, no change needed).
- *Homepage* -> Task 10 (nav, footer, "Latest Health Articles" strip).
- *Use skills* -> writing-plans (structure) and ecc:seo (checklist: crawlability, canonical, one intent per URL, titles 50-60 chars, descriptions 120-160, one H1, structured data that matches content, internal linking).

**Placeholder scan:** The only deliberately deferred detail is Task 8/9's reuse of each existing test file's own render/mocking helpers (named precisely: the `mockData` chain in `SAModeration.test.tsx`, the render helper in `BlogPage.test.tsx`).

**Type consistency:** `HubArticle`/`ArticleFacet` (Task 3) are the exact shapes returned by `search_blog_posts` / `blog_facets` (Task 2) and consumed by Tasks 4, 6, 10. `articlesPath(categorySlug?, page?)` has the same signature everywhere it is called. `ARTICLES_PAGE_SIZE = 12` matches the RPC `p_limit` asserted in the Edge, page and homepage tests (the homepage strip asks for 6 on purpose).

## Out of scope (deliberate, with reasons)

- **City/specialty article hubs** (`/health-articles/in/kota`): needs the topic hub to prove traction first; cross-link from `/doctors/:city` later.
- **Per-doctor diversity cap / relevance ranking** on the hub: newest-first is fine until a few prolific doctors dominate page 1.
- **Trigram search index on titles**: `?q=` pages are `noindex` and low-volume; add `pg_trgm` only if search gets slow.
- **Realtime updates** on the hub (the per-doctor list subscribes to every `blog_posts` change): not wanted on a CDN-cached public page.
- **IndexNow ping on publish** (Bing/Yandex/Seznam/Naver; Google ignores it): worthwhile follow-up once the hub is live; small edge function plus a key file.
- **Showing the doctor's medical registration number** on articles (a strong YMYL trust signal): needs the doctor's consent and a decision on where that number is public (anon can currently read the whole `profiles` row, see the BUG notes in `tests/db/anonAccess.test.ts`).
- **Multiple image aspect ratios** per article (Google recommends 16:9, 4:3, 1:1 images of at least 50K pixels): needs an image-resizing pipeline.
- **A "verified doctor" claim**: needs a real verification process first.
- **Editorial review queue before a post appears** (approve-then-publish): today posts go live instantly on the doctor's site; the hub only adds the `hub_hidden` take-down lever. A queue is a product decision.
