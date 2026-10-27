// Server-side HTML for crawler-facing routes. api/seo.ts (Vercel Edge) delegates
// here; vercel.json rewrites /dr/:slug and /doctors[/...] to it. Everything is
// best-effort: any upstream failure falls back to the plain SPA shell, so users
// are never worse off than before this existed.
//
// NOTE: keep relative imports only - Vercel's bundler does not resolve "@/".
import { directorySlug } from "../directory/slug";
import { buildDoctorBody, buildHubHead, isHubIndexable, type DirectoryDoctor, type DirectoryFacet } from "./directorySeo";
import { buildDoctorJsonLd, buildDoctorMeta, doctorDisplayName, doctorHubPaths } from "./doctorSeo";
import { INDEXABLE, NOINDEX, renderPage } from "./injectHead";

export interface SeoEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

const PAGE_SIZE = 24;
const UPSTREAM_TIMEOUT_MS = 5000;
const SITE_CACHE = "public, max-age=0, s-maxage=300, stale-while-revalidate=86400";

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
  if (kind === "hub") res.headers.set("X-Robots-Tag", "noindex");
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

async function doctorPage(up: Upstream, template: string, origin: string, slug: string): Promise<Response> {
  const path = `/dr/${slug}`;
  const profiles = await up.select("profiles", `select=*&slug=eq.${enc(slug)}&onboarding_completed=eq.true&limit=1`);
  const profile = profiles?.[0];

  if (!profile) {
    const hist = await up.select("slug_history", `select=doctor_id&old_slug=eq.${enc(slug)}&limit=1`);
    const doctorId = hist?.[0]?.doctor_id;
    if (doctorId) {
      const cur = await up.select("profiles", `select=slug&id=eq.${enc(doctorId)}&limit=1`);
      if (cur?.[0]?.slug) {
        return new Response(null, {
          status: 301,
          headers: { Location: `${origin}/dr/${cur[0].slug}`, "Cache-Control": "public, max-age=0, s-maxage=3600" },
        });
      }
    }
    return notFound(template, origin, path);
  }
  if (profile.plan_status === "cancelled") return notFound(template, origin, path);

  const id = enc(profile.id);
  const [services, reviews, settingsRows] = await Promise.all([
    up.select("services", `select=name,description,price&doctor_id=eq.${id}&active=eq.true&order=sort_order&limit=12`),
    up.select("reviews", `select=rating&doctor_id=eq.${id}&is_visible=eq.true`),
    up.select("website_settings", `select=*&doctor_id=eq.${id}&limit=1`),
  ]);
  const settings = settingsRows?.[0] ?? {};

  const input = { origin, profile, settings, services, reviews };
  const meta = buildDoctorMeta(input);
  const name = doctorDisplayName(profile);
  const jsonLd = buildDoctorJsonLd(input);

  return htmlResponse(
    renderPage(template, {
      title: meta.title,
      description: meta.description,
      canonical: meta.canonical,
      robots: INDEXABLE,
      ogType: "profile",
      image: meta.image,
      jsonLd: jsonLd ? [jsonLd] : [],
      bodyHtml: buildDoctorBody({
        name,
        description: meta.description,
        specialization: profile.specialization,
        city: profile.city,
        address: profile.address,
        services,
        hubs: doctorHubPaths(profile),
      }),
    }),
    200,
    SITE_CACHE,
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
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return shell(template, kind);

  const up = new Upstream(env.SUPABASE_URL.replace(/\/$/, ""), env.SUPABASE_ANON_KEY, f);
  try {
    if (kind === "doctor") {
      const slug = url.searchParams.get("slug")?.trim();
      if (!slug) return notFound(template, origin, "/");
      return await doctorPage(up, template, origin, slug);
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
    return shell(template, kind);
  } catch (err) {
    console.error("seo: upstream failure, serving plain shell", err instanceof Error ? err.message : err);
    return shell(template, kind);
  }
}

export { NOINDEX };
