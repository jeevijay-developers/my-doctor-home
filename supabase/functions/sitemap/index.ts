// Dynamic sitemap for https://doctylia.com.
//
// Doctors: profiles.slug is set, onboarding_completed is true, and
// plan_status is not 'cancelled'. Superadmin suspend writes plan_status =
// 'cancelled'. There is no is_suspended column. razorpay_account_status
// 'suspended' is a payout-account state, not an account ban, so it is ignored.
//
// Blog posts: publication is is_published (not a status enum). The public route
// is /dr/:slug/blog/:slugOrId; blog_posts.slug (trigger-generated) is preferred
// and the post UUID is the legacy fallback. Doctors with at least one published
// post also get their /dr/:slug/blog index page listed.
//
// Health Articles hub: /health-articles is listed when at least one published post
// is eligible (listed doctor, not hub_hidden); /health-articles/:category needs
// >= DIRECTORY_MIN_INDEXABLE eligible posts. Pagination URLs are not listed.
//
// Doctor sub-pages: /dr/:slug/doctor/:doctorSlug only for clinics with >= 2 active practitioners.
//
// Marketing URLs have no content timestamp, so they omit <lastmod>.
// Doctor and post URLs include <lastmod> from updated_at.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders, handleCors, type CorsOptions } from "../_shared/cors.ts";
import { DIRECTORY_MIN_INDEXABLE, directorySlug } from "../_shared/directorySlug.ts";
import { practitionerSitemapEntries, type SitemapPractitioner } from "../_shared/practitionerSitemap.ts";

const SITE = "https://doctylia.com";
const PAGE_SIZE = 1000;
// Sitemaps hold at most 50,000 URLs; split well before that and serve an index.
const MAX_URLS_PER_SITEMAP = 45000;

const SITEMAP_CORS: CorsOptions = {
  allowHeaders: "authorization, x-client-info, apikey, content-type",
  allowMethods: "GET, OPTIONS",
};

type DoctorRow = {
  id: string;
  slug: string;
  updated_at: string;
  city: string | null;
  specialization: string | null;
  directory_listed: boolean;
};
type PostRow = {
  id: string; slug?: string | null; title?: string | null; doctor_id: string; updated_at: string | null; published_at: string | null;
  category?: string | null; hub_hidden?: boolean | null;
};

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function lastMod(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function urlEntry(path: string, changefreq: string, priority: string, lastmod?: string | null): string {
  const loc = xmlEscape(`${SITE}${path}`);
  const modified = lastmod ? `<lastmod>${xmlEscape(lastmod)}</lastmod>` : "";
  return `<url><loc>${loc}</loc>${modified}<changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}

function xmlResponse(status: number, body: string, req: Request, cacheControl: string): Response {
  return new Response(body, {
    status,
    headers: {
      ...buildCorsHeaders(req, SITEMAP_CORS),
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": cacheControl,
    },
  });
}

Deno.serve(async (req) => {
  const preflight = handleCors(req, SITEMAP_CORS);
  if (preflight) return preflight;
  if (req.method !== "GET") {
    return xmlResponse(
      405,
      `<?xml version="1.0" encoding="UTF-8"?><error>method_not_allowed</error>`,
      req,
      "no-store",
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("sitemap: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return xmlResponse(500, `<?xml version="1.0" encoding="UTF-8"?><error>sitemap_unavailable</error>`, req, "no-store");
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    const doctors = await fetchDoctors(admin);
    const doctorById = new Map(doctors.map((doctor) => [doctor.id, doctor]));
    const posts = await fetchPosts(admin);
    const practitioners = await fetchPractitioners(admin);

    const urls = [
      urlEntry("/", "weekly", "1.0"),
      urlEntry("/about", "monthly", "0.6"),
      urlEntry("/features", "monthly", "0.7"),
      urlEntry("/pricing", "monthly", "0.7"),
      urlEntry("/demo", "monthly", "0.6"),
      urlEntry("/terms", "yearly", "0.3"),
      urlEntry("/privacy", "yearly", "0.3"),
      urlEntry("/refund-policy", "yearly", "0.3"),
    ];

    for (const doctor of doctors) {
      urls.push(urlEntry(
        `/dr/${encodeURIComponent(doctor.slug)}`,
        "weekly",
        "0.8",
        lastMod(doctor.updated_at),
      ));
    }

    for (const entry of practitionerSitemapEntries(doctors, practitioners)) {
      urls.push(urlEntry(entry.path, "weekly", "0.7", lastMod(entry.updated_at)));
    }

    const doctorsWithPosts = new Set<string>();
    for (const post of posts) {
      const doctor = doctorById.get(post.doctor_id);
      if (!doctor) continue;
      if (!doctorsWithPosts.has(doctor.id)) {
        doctorsWithPosts.add(doctor.id);
        urls.push(urlEntry(`/dr/${encodeURIComponent(doctor.slug)}/blog`, "weekly", "0.5"));
      }
      urls.push(urlEntry(
        `/dr/${encodeURIComponent(doctor.slug)}/blog/${encodeURIComponent(post.slug || post.id)}`,
        "monthly",
        "0.6",
        lastMod(post.updated_at || post.published_at),
      ));
    }

    // Directory hubs: /doctors, /doctors/:city, /doctors/:city/:specialty. Thin hubs
    // (< DIRECTORY_MIN_INDEXABLE doctors) are served noindex, so they stay out of here too.
    const listed = doctors.filter((doctor) => doctor.directory_listed);
    if (listed.length > 0) urls.push(urlEntry("/doctors", "daily", "0.7"));
    for (const path of indexableHubPaths(listed)) urls.push(urlEntry(path, "daily", "0.7"));

    // Health Articles hub: only posts the RPC would list (listed doctor, not hidden by moderation).
    // hub_hidden is NOT NULL, so `=== false` also excludes the column-fallback rows (field absent).
    // The RPC also requires a non-empty post slug and title.
    const hubPosts = posts.filter((p) =>
      p.hub_hidden === false && !!p.slug?.trim() && !!p.title?.trim() && doctorById.get(p.doctor_id)?.directory_listed);
    if (hubPosts.length > 0) {
      // Google only trusts lastmod if it is verifiably accurate: use the newest publish date,
      // which moderation toggles and slug backfills (they move updated_at) do not change.
      const newest = hubPosts.reduce((m, p) => {
        const d = lastMod(p.published_at ?? p.updated_at) ?? "";
        return d > m ? d : m;
      }, "");
      urls.push(urlEntry("/health-articles", "daily", "0.7", newest || null));
      const perCategory = new Map<string, number>();
      for (const p of hubPosts) {
        const c = directorySlug(p.category);
        if (c) perCategory.set(c, (perCategory.get(c) ?? 0) + 1);
      }
      for (const [c, n] of perCategory) {
        if (n >= DIRECTORY_MIN_INDEXABLE) urls.push(urlEntry(`/health-articles/${c}`, "weekly", "0.6"));
      }
    }

    // Sitemaps hold at most 50,000 URLs: past MAX_URLS_PER_SITEMAP serve an index of ?part=N files.
    const partParam = new URL(req.url).searchParams.get("part");
    const partCount = Math.max(1, Math.ceil(urls.length / MAX_URLS_PER_SITEMAP));
    let xml: string;
    if (partCount > 1 && !partParam) {
      xml = [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
        ...Array.from({ length: partCount }, (_, i) =>
          `<sitemap><loc>${xmlEscape(`${SITE}/sitemap.xml?part=${i + 1}`)}</loc></sitemap>`),
        `</sitemapindex>`,
        ``,
      ].join("\n");
    } else {
      const part = Math.min(Math.max(1, Number.parseInt(partParam ?? "1", 10) || 1), partCount);
      const slice = urls.slice((part - 1) * MAX_URLS_PER_SITEMAP, part * MAX_URLS_PER_SITEMAP);
      xml = [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
        ...slice,
        `</urlset>`,
        ``,
      ].join("\n");
    }

    return xmlResponse(200, xml, req, "public, max-age=3600, s-maxage=21600");
  } catch (err) {
    console.error("sitemap failed", err instanceof Error ? err.message : err);
    return xmlResponse(500, `<?xml version="1.0" encoding="UTF-8"?><error>sitemap_unavailable</error>`, req, "no-store");
  }
});

function indexableHubPaths(doctors: DoctorRow[]): string[] {
  const cities = new Map<string, number>();
  const combos = new Map<string, number>();
  for (const doctor of doctors) {
    const city = directorySlug(doctor.city);
    if (!city) continue;
    cities.set(city, (cities.get(city) ?? 0) + 1);
    const specialty = directorySlug(doctor.specialization);
    if (specialty) combos.set(`${city}/${specialty}`, (combos.get(`${city}/${specialty}`) ?? 0) + 1);
  }
  const paths: string[] = [];
  for (const [city, n] of cities) if (n >= DIRECTORY_MIN_INDEXABLE) paths.push(`/doctors/${city}`);
  for (const [combo, n] of combos) if (n >= DIRECTORY_MIN_INDEXABLE) paths.push(`/doctors/${combo}`);
  return paths;
}

async function fetchDoctors(admin: SupabaseClient): Promise<DoctorRow[]> {
  type Raw = Omit<DoctorRow, "slug" | "directory_listed"> & { slug: string | null; directory_listed?: boolean | null };
  // directory_listed ships in a migration; until it is applied, fall back to the
  // original column set so the sitemap keeps working (every doctor counts as listed).
  let columns = "id, slug, updated_at, city, specialization, directory_listed";
  const rows: DoctorRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const run = (cols: string) =>
      admin
        .from("profiles")
        .select(cols)
        .not("slug", "is", null)
        .eq("onboarding_completed", true)
        .neq("plan_status", "cancelled")
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
    let { data, error } = await run(columns);
    if (error && columns.includes("directory_listed")) {
      columns = "id, slug, updated_at, city, specialization";
      ({ data, error } = await run(columns));
    }
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown as Raw[];
    for (const row of batch) {
      const slug = row.slug?.trim();
      if (slug) rows.push({ ...row, slug, directory_listed: row.directory_listed !== false });
    }
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchPosts(admin: SupabaseClient): Promise<PostRow[]> {
  // `slug`, `category` and `hub_hidden` ship in migrations; if any is missing the retry
  // drops every optional column (no hub URLs, posts listed by id).
  let columns = "id, slug, title, doctor_id, updated_at, published_at, category, hub_hidden";
  const rows: PostRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const run = (cols: string) =>
      admin
        .from("blog_posts")
        .select(cols)
        .eq("is_published", true)
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
    let { data, error } = await run(columns);
    if (error && columns.includes("slug")) {
      columns = "id, doctor_id, updated_at, published_at";
      ({ data, error } = await run(columns));
    }
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown as PostRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchPractitioners(admin: SupabaseClient): Promise<SitemapPractitioner[]> {
  const rows: SitemapPractitioner[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("practitioners")
      .select("doctor_id, slug, is_active, updated_at")
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    // Before the practitioners migration is applied the sitemap simply has no doctor sub-pages.
    if (error) return [];
    const batch = (data ?? []) as unknown as SitemapPractitioner[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}
