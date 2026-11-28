// Server-side HTML for crawler-facing routes. api/seo.ts (Vercel Edge) delegates
// here; vercel.json rewrites /dr/:slug and /doctors[/...] to it. Everything is
// best-effort: any upstream failure falls back to the plain SPA shell, so users
// are never worse off than before this existed.
//
// NOTE: keep relative imports only - Vercel's bundler does not resolve "@/".
import { PUBLIC_PROFILE_COLUMNS } from "../publicProfileColumns";
import { directorySlug } from "../directory/slug";
import { buildClinicBody, buildPractitionerBody, buildSingleDoctorBody } from "./clinicBody";
import { activeTeam, isMultiDoctorClinic, isPractitionerIndexable } from "./clinicTeam";
import { redirectForOldSlug, resolveOldSlug } from "./slugRedirect";
import { buildHubHead, isHubIndexable, type DirectoryDoctor, type DirectoryFacet } from "./directorySeo";
import {
  buildDoctorJsonLd,
  buildDoctorMeta,
  buildPractitionerJsonLd,
  buildPractitionerMeta,
  type PractitionerSeo,
} from "./doctorSeo";
import { buildBlogListHead, buildBlogPostHead, blogPostPath, doctorPath, encodePathSegment, UUID_RE } from "./blogSeo";
import { ARTICLES_BASE, ARTICLES_PAGE_SIZE, articlesPath, buildArticlesHead, isArticlesIndexable, type ArticleFacet, type HubArticle } from "./healthArticlesSeo";
import { escapeHtml, INDEXABLE, NOINDEX, renderPage } from "./injectHead";
import { HERO_IMAGE_WIDTH, optimizedImageUrl } from "./imageUrl";
import { buildStaticPageHead } from "./staticPages";

export interface SeoEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

const PAGE_SIZE = 24;
/** Pages past this are a 404 before any redirect or upstream call (keeps the RPC offset within int4). */
const MAX_ARTICLES_PAGE = 1000;
const UPSTREAM_TIMEOUT_MS = 5000;
// Crawlers visit a page every few days at best, so a short CDN lifetime meant they almost always hit a
// cold render (0.7-1.9s, dominated by round trips to the database). One hour fresh plus a week of
// stale-while-revalidate keeps them on the cached copy; the browser app still shows live data.
const SITE_CACHE = "public, max-age=0, s-maxage=3600, stale-while-revalidate=604800";

/** fetch with a hard timeout and one retry on network errors (not on HTTP error statuses). */
async function timedFetch(f: typeof fetch, url: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      return await f(url, { ...init, signal: ctrl.signal });
    } catch (err) {
      if (attempt >= 1) throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

let templateCache: { origin: string; html: string; at: number } | null = null;

async function loadTemplate(origin: string, f: typeof fetch): Promise<string | null> {
  if (templateCache && templateCache.origin === origin && Date.now() - templateCache.at < 5 * 60_000) {
    return templateCache.html;
  }
  try {
    const res = await timedFetch(f, `${origin}/index.html`);
    if (!res.ok) return null;
    const html = await res.text();
    if (!html.includes('<div id="root">')) return null;
    templateCache = { origin, html, at: Date.now() };
    return html;
  } catch {
    return null;
  }
}

function htmlResponse(html: string, status: number, cache: string): Response {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": cache },
  });
}

/** Plain SPA shell: the pre-existing behaviour, used whenever we cannot do better. */
function shell(template: string, kind: string | null): Response {
  const res = htmlResponse(template, 200, "no-store");
  // The shell's canonical points at "/", so never let a degraded hub page be indexed.
  if (kind === "hub" || kind === "articles") res.headers.set("X-Robots-Tag", "noindex");
  return res;
}

function notFound(template: string, origin: string, path: string): Response {
  return htmlResponse(
    renderPage(template, {
      title: "Page not found | Doctylia",
      description: "This page doesn't exist or is no longer available.",
      canonical: `${origin}${path}`,
      robots: "noindex, nofollow",
    }),
    404,
    "public, max-age=0, s-maxage=60",
  );
}

class Upstream {
  constructor(private base: string, private key: string, private f: typeof fetch) {}

  /** What the shared old-slug resolver (slugRedirect.ts) needs to call the database. */
  get slugUpstream() {
    return { url: this.base, key: this.key };
  }

  /** The fetch this request uses (tests inject one). */
  get fetcher(): typeof fetch {
    return this.f;
  }

  /** Scheme + host of the Supabase project (API and public storage share it). */
  get origin(): string {
    try {
      return new URL(this.base).origin;
    } catch {
      return "";
    }
  }

  private async req(path: string, init?: RequestInit): Promise<any> {
    const res = await timedFetch(this.f, `${this.base}${path}`, {
      ...init,
      headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    return res.json();
  }

  select(table: string, query: string) {
    return this.req(`/rest/v1/${table}?${query}`);
  }

  rpc(fn: string, args: Record<string, unknown>) {
    return this.req(`/rest/v1/rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
  }
}

const enc = encodeURIComponent;

/** Query params the rewrite adds for us; everything else was typed by the visitor and is kept on a redirect. */
const HOURS_COLUMNS = "practitioner_id,day_of_week,is_open,start_time,end_time,start_time_2,end_time_2";

function firstHttpsPhoto(rows: unknown): string | null {
  const photo = Array.isArray(rows) ? rows[0]?.photo_url : null;
  return typeof photo === "string" && /^https:\/\//.test(photo) ? photo : null;
}

const REWRITE_PARAMS = ["kind", "slug", "doctor", "post", "category"];

/**
 * A clinic's old slug (renamed, or moved to the clinic name) answers 301 to the current one, keeping
 * the rest of the path and the visitor's query. Null when the slug is not a known old slug.
 */
async function oldSlugRedirect(up: Upstream, origin: string, reqUrl: URL, slug: string, suffix: string): Promise<Response | null> {
  const current = await resolveOldSlug(up.slugUpstream, slug, up.fetcher);
  if (!current || current.toLowerCase() === slug.toLowerCase()) return null;
  // Rebuild the public URL: behind the Vercel rewrite the request URL may be /api/seo?kind=..., so the
  // path and the visitor's own query are put back from what we know rather than read from it.
  const original = new URL(`${origin}/dr/${encodePathSegment(slug)}${suffix}`);
  reqUrl.searchParams.forEach((value, key) => {
    if (!REWRITE_PARAMS.includes(key)) original.searchParams.append(key, value);
  });
  return redirectForOldSlug(original, encodePathSegment(current));
}

async function doctorPage(up: Upstream, template: string, origin: string, slug: string, reqUrl: URL): Promise<Response> {
  const path = `/dr/${slug}`;
  const profiles = await up.select("profiles", `select=${PUBLIC_PROFILE_COLUMNS}&slug=eq.${enc(slug)}&onboarding_completed=eq.true&limit=1`);
  const profile = profiles?.[0];

  if (!profile) return (await oldSlugRedirect(up, origin, reqUrl, slug, "")) ?? notFound(template, origin, path);
  if (profile.plan_status === "cancelled") return notFound(template, origin, path);

  const id = enc(profile.id);
  const [services, reviews, settingsRows, practitioners] = await Promise.all([
    up.select("services", `select=name,description,price,duration&doctor_id=eq.${id}&active=eq.true&order=sort_order&limit=12`),
    up.select("reviews", `select=rating&doctor_id=eq.${id}&is_visible=eq.true`),
    up.select("website_settings", `select=*&doctor_id=eq.${id}&limit=1`),
    // Best-effort: if this fails the page renders exactly as it does for a single-doctor clinic.
    up.rpc("get_public_practitioners", { _doctor_id: profile.id }).catch(() => null) as Promise<PractitionerSeo[] | null>,
  ]);
  const settings = settingsRows?.[0] ?? {};
  const team = Array.isArray(practitioners) ? practitioners : undefined;
  const multi = isMultiDoctorClinic(team);

  // Opening hours for the body (and the team JSON-LD) on every page; a clinic photo for og:image only
  // for team clinics (a single doctor has the portrait). Both are best-effort.
  let workingHours: any[] = [];
  let clinicImage: string | null = null;
  const [hours, gallery] = await Promise.all([
    up.select("working_hours", `select=${HOURS_COLUMNS}&doctor_id=eq.${id}&limit=500`).catch(() => []),
    multi ? up.select("gallery_photos", `select=photo_url&doctor_id=eq.${id}&order=sort_order&limit=1`).catch(() => []) : Promise.resolve([]),
  ]);
  const activeIds = new Set(activeTeam(team).map((p) => p.id));
  // Rows of a deactivated doctor are not the clinic's hours any more.
  workingHours = (Array.isArray(hours) ? hours : []).filter((r: any) => !r.practitioner_id || activeIds.has(r.practitioner_id));
  if (multi) clinicImage = firstHttpsPhoto(gallery);

  const input = { origin, profile, settings, services, reviews, workingHours, clinicImage, ...(team ? { practitioners: team } : {}) };
  const meta = buildDoctorMeta(input);
  const jsonLd = buildDoctorJsonLd(input);

  // The hero portrait is the page's largest paint. Without a hint the browser only discovers it
  // after the app JS loads and the profile/settings queries return (~4 s on a slow phone), so
  // name it in the HTML. It must be the exact URL HeroBanner renders, hence the shared helper.
  const heroSrc: string | null = typeof settings.hero_photo_url === "string" && /^https:\/\//.test(settings.hero_photo_url)
    ? settings.hero_photo_url
    : null;
  const supabaseOrigin = up.origin;

  return htmlResponse(
    renderPage(template, {
      title: meta.title,
      description: meta.description,
      canonical: meta.canonical,
      robots: INDEXABLE,
      // A clinic is an organisation, not a person's profile.
      ogType: multi ? "website" : "profile",
      image: meta.image,
      preconnect: supabaseOrigin ? [supabaseOrigin] : [],
      preloadImage: heroSrc ? optimizedImageUrl(heroSrc, HERO_IMAGE_WIDTH) : undefined,
      // Newsreader styles the hero headline (the LCP element on photo-less profiles); without
      // this it is only discovered after the stylesheet, then swapped in.
      preloadFonts: ["/fonts/newsreader-latin.woff2"],
      jsonLd: jsonLd ? [jsonLd] : [],
      bodyHtml: multi
        ? buildClinicBody({ origin, profile, description: meta.description, practitioners: team!, services, workingHours, reviews })
        : buildSingleDoctorBody({ origin, profile, description: meta.description, services, workingHours, reviews }),
    }),
    200,
    SITE_CACHE,
  );
}

async function practitionerPage(up: Upstream, template: string, origin: string, slug: string, doctorSlug: string, reqUrl: URL): Promise<Response> {
  const path = `${doctorPath(slug)}/doctor/${encodePathSegment(doctorSlug)}`;
  const profiles = await up.select("profiles", `select=${PUBLIC_PROFILE_COLUMNS}&slug=eq.${enc(slug)}&onboarding_completed=eq.true&limit=1`);
  const profile = profiles?.[0];
  if (!profile) return (await oldSlugRedirect(up, origin, reqUrl, slug, `/doctor/${encodePathSegment(doctorSlug)}`)) ?? notFound(template, origin, path);
  if (profile.plan_status === "cancelled") return notFound(template, origin, path);

  const team = activeTeam<PractitionerSeo>(await up.rpc("get_public_practitioners", { _doctor_id: profile.id }));
  const practitioner = team.find((p) => p.slug === doctorSlug);
  // Unknown or inactive doctor, or a clinic with one doctor (its page is the clinic page): back to the clinic.
  if (!practitioner || !isMultiDoctorClinic(team)) {
    return new Response(null, {
      status: 301,
      headers: { Location: `${origin}${doctorPath(profile.slug)}`, "Cache-Control": "public, max-age=0, s-maxage=3600" },
    });
  }

  // Best-effort extras (any failure just leaves that section out): the clinic's hours, this doctor's
  // services, and a clinic picture for doctors without a photo.
  const id = enc(profile.id);
  const [hours, services, offered, settingsRows, gallery] = await Promise.all([
    up.select("working_hours", `select=${HOURS_COLUMNS}&doctor_id=eq.${id}&limit=500`).catch(() => []),
    up.select("services", `select=id,name,description,price,duration&doctor_id=eq.${id}&active=eq.true&order=sort_order&limit=12`).catch(() => []),
    up.rpc("get_public_service_practitioners", { _doctor_id: profile.id }).catch(() => []),
    up.select("website_settings", `select=hero_photo_url&doctor_id=eq.${id}&limit=1`).catch(() => []),
    up.select("gallery_photos", `select=photo_url&doctor_id=eq.${id}&order=sort_order&limit=1`).catch(() => []),
  ]);
  const workingHours = Array.isArray(hours) ? hours : [];
  // service_practitioners: a service with no rows is offered by every doctor; with rows, only by those.
  const restricted = new Map<string, Set<string>>();
  for (const r of Array.isArray(offered) ? offered : []) {
    if (!restricted.has(r.service_id)) restricted.set(r.service_id, new Set());
    restricted.get(r.service_id)!.add(r.practitioner_id);
  }
  const ownServices = (Array.isArray(services) ? services : []).filter((s: any) => {
    const only = restricted.get(s.id);
    return !only || only.has(practitioner.id);
  });

  const input = { origin, profile, practitioner, services: ownServices, settings: settingsRows?.[0] ?? {}, workingHours, clinicImage: firstHttpsPhoto(gallery) };
  const meta = buildPractitionerMeta(input);
  const jsonLd = buildPractitionerJsonLd(input);

  return htmlResponse(
    renderPage(template, {
      title: meta.title,
      description: meta.description,
      canonical: meta.canonical,
      // Not indexed until the doctor has a real bio (thin content), nor when they opted out of the directory.
      robots: isPractitionerIndexable(practitioner) ? INDEXABLE : NOINDEX,
      ogType: "profile",
      image: meta.image,
      preconnect: up.origin ? [up.origin] : [],
      jsonLd: jsonLd ? [jsonLd] : [],
      bodyHtml: buildPractitionerBody({ origin, profile, practitioner, description: meta.description, services: ownServices, workingHours }),
    }),
    200,
    SITE_CACHE,
  );
}

async function blogPage(up: Upstream, template: string, origin: string, slug: string, reqUrl: URL, postKey?: string): Promise<Response> {
  const path = postKey ? `${doctorPath(slug)}/blog/${encodePathSegment(postKey)}` : `${doctorPath(slug)}/blog`;
  const profiles = await up.select("profiles", `select=${PUBLIC_PROFILE_COLUMNS}&slug=eq.${enc(slug)}&onboarding_completed=eq.true&limit=1`);
  const doctor = profiles?.[0];
  if (!doctor) {
    const moved = await oldSlugRedirect(up, origin, reqUrl, slug, postKey ? `/blog/${encodePathSegment(postKey)}` : "/blog");
    return moved ?? notFound(template, origin, path);
  }
  if (doctor.plan_status === "cancelled") return notFound(template, origin, path);
  const doctorId = enc(doctor.id);

  if (!postKey) {
    const posts = await up.select("blog_posts", `select=id,slug,title&doctor_id=eq.${doctorId}&is_published=eq.true&order=published_at.desc&limit=50`);
    return htmlResponse(renderPage(template, buildBlogListHead({ origin, doctor, posts: posts ?? [] })), 200, SITE_CACHE);
  }

  const match = UUID_RE.test(postKey) ? `id=eq.${enc(postKey)}` : `slug=eq.${enc(postKey)}`;
  const rows = await up.select("blog_posts", `select=*&doctor_id=eq.${doctorId}&is_published=eq.true&${match}&limit=1`);
  const post = rows?.[0];
  if (!post) return notFound(template, origin, path);

  // Legacy UUID links permanently redirect to the readable slug URL.
  if (UUID_RE.test(postKey) && post.slug) {
    return new Response(null, {
      status: 301,
      headers: { Location: `${origin}${blogPostPath(doctor.slug, post)}`, "Cache-Control": "public, max-age=0, s-maxage=3600" },
    });
  }

  // Doctor-aware byline: only for a post that names a doctor, best-effort (failure = clinic author as before).
  let byline: { practitioner: PractitionerSeo; clinicTeamSize: number } | null = null;
  let lookupFailed = false;
  if (post.practitioner_id) {
    try {
      const team = activeTeam<PractitionerSeo>(await up.rpc("get_public_practitioners", { _doctor_id: doctor.id }));
      const author = team.find((p) => p.id === post.practitioner_id);
      if (author && author.directory_listed !== false) byline = { practitioner: author, clinicTeamSize: team.length };
    } catch {
      byline = null;
      lookupFailed = true;
    }
  }
  return htmlResponse(
    renderPage(template, buildBlogPostHead({ origin, doctor, post, ...(byline ?? {}) })),
    200,
    // A failed lookup means the clinic is shown as author by mistake: do not let that sit in the CDN for hours.
    lookupFailed ? "public, max-age=0, s-maxage=60, stale-while-revalidate=300" : SITE_CACHE,
  );
}

async function articlesPage(up: Upstream, template: string, origin: string, categorySlug: string | undefined, page: number, searching = false): Promise<Response> {
  const path = articlesPath(categorySlug);
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
  if (searching) {
    // Search URLs are never indexed, and consolidate to the base hub/category path.
    head.robots = NOINDEX;
    head.canonical = `${origin}${articlesPath(categorySlug)}`;
  }
  return htmlResponse(
    renderPage(template, head),
    200,
    !searching && isArticlesIndexable(total, categorySlug) ? SITE_CACHE : "public, max-age=0, s-maxage=300",
  );
}

async function hubPage(up: Upstream, template: string, origin: string, citySlug?: string, specialtySlug?: string): Promise<Response> {
  const path = !citySlug ? "/doctors" : specialtySlug ? `/doctors/${citySlug}/${specialtySlug}` : `/doctors/${citySlug}`;

  const [rows, facets] = await Promise.all([
    up.rpc("search_doctors", {
      p_query: null,
      p_city: citySlug ?? null,
      p_specialty: specialtySlug ?? null,
      p_limit: PAGE_SIZE,
      p_offset: 0,
    }) as Promise<Array<DirectoryDoctor & { total_count: number | string }>>,
    up.rpc("directory_facets", { p_city: citySlug ?? null }) as Promise<DirectoryFacet[]>,
  ]);

  const total = Number(rows?.[0]?.total_count ?? 0);
  if (citySlug && total === 0) return notFound(template, origin, path);

  const cityLabel = citySlug ? rows[0]?.city?.trim() || undefined : undefined;
  const specialtyLabel = specialtySlug ? rows[0]?.specialization?.trim() || undefined : undefined;
  const head = buildHubHead({ origin, citySlug, specialtySlug, cityLabel, specialtyLabel, doctors: rows ?? [], total, facets: facets ?? [] });
  return htmlResponse(renderPage(template, head), 200, isHubIndexable(total, citySlug) ? SITE_CACHE : "public, max-age=0, s-maxage=300");
}

export async function handleSeoRequest(
  req: Request,
  env: SeoEnv,
  f: typeof fetch = fetch,
): Promise<Response> {
  const url = new URL(req.url);
  const origin = url.origin;
  const kind = url.searchParams.get("kind");

  const template = await loadTemplate(origin, f);
  if (!template) return new Response("Service temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });

  // Static marketing pages need no upstream data, so they are served even when Supabase is unreachable.
  if (kind === "page") {
    const head = buildStaticPageHead(origin, url.searchParams.get("path") ?? "");
    return head ? htmlResponse(renderPage(template, head), 200, SITE_CACHE) : shell(template, kind);
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return shell(template, kind);

  const up = new Upstream(env.SUPABASE_URL.replace(/\/$/, ""), env.SUPABASE_ANON_KEY, f);
  try {
    if (kind === "doctor") {
      const slug = url.searchParams.get("slug")?.trim();
      if (!slug) return notFound(template, origin, "/");
      return await doctorPage(up, template, origin, slug, url);
    }
    if (kind === "practitioner") {
      const slug = url.searchParams.get("slug")?.trim();
      const doctorSlug = url.searchParams.get("doctor")?.trim();
      if (!slug) return notFound(template, origin, "/");
      if (!doctorSlug) return notFound(template, origin, doctorPath(slug));
      return await practitionerPage(up, template, origin, slug, doctorSlug, url);
    }
    if (kind === "blog" || kind === "post") {
      const slug = url.searchParams.get("slug")?.trim();
      if (!slug) return notFound(template, origin, "/");
      const postKey = kind === "post" ? url.searchParams.get("post")?.trim() : undefined;
      if (kind === "post" && !postKey) return notFound(template, origin, `/dr/${slug}/blog`);
      return await blogPage(up, template, origin, slug, url, postKey);
    }
    if (kind === "hub") {
      // Params arrive as typed in the URL; only canonical slugs are served as 200.
      const rawCity = url.searchParams.get("city") ?? undefined;
      const rawSpec = url.searchParams.get("specialty") ?? undefined;
      const city = rawCity ? directorySlug(rawCity) : undefined;
      const specialty = rawSpec ? directorySlug(rawSpec) : undefined;
      if ((rawCity && city !== rawCity) || (rawSpec && specialty !== rawSpec)) {
        const target = !city ? "/doctors" : specialty ? `/doctors/${city}/${specialty}` : `/doctors/${city}`;
        return new Response(null, { status: 301, headers: { Location: `${origin}${target}`, "Cache-Control": "public, max-age=0, s-maxage=3600" } });
      }
      return await hubPage(up, template, origin, city, specialty);
    }
    if (kind === "articles") {
      const rawCategory = url.searchParams.get("category") ?? undefined;
      const category = rawCategory ? directorySlug(rawCategory) : undefined;
      const rawPage = url.searchParams.get("page");
      const parsed = rawPage === null ? 1 : Number(rawPage);
      if (parsed > MAX_ARTICLES_PAGE) return notFound(template, origin, articlesPath(category));
      const page = Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
      // Only the canonical spelling is served as 200; everything else 301s to it.
      if ((rawCategory && category !== rawCategory) || (rawPage !== null && String(page) !== rawPage) || rawPage === "1") {
        return new Response(null, {
          status: 301,
          headers: { Location: `${origin}${articlesPath(category, page)}`, "Cache-Control": "public, max-age=0, s-maxage=3600" },
        });
      }
      const searching = !!url.searchParams.get("q")?.trim();
      return await articlesPage(up, template, origin, category, page, searching);
    }
    return shell(template, kind);
  } catch (err) {
    console.error("seo: upstream failure, serving plain shell", err instanceof Error ? err.message : err);
    return shell(template, kind);
  }
}

export { NOINDEX };
