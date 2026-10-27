// Dynamic sitemap for https://doctylia.com.
//
// Doctors: profiles.slug is set, onboarding_completed is true, and
// plan_status is not 'cancelled'. Superadmin suspend writes plan_status =
// 'cancelled'. There is no is_suspended column. razorpay_account_status
// 'suspended' is a payout-account state, not an account ban, so it is ignored.
//
// Blog posts have no slug column. Publication is is_published (not a status
// enum). The public route is /dr/:slug/blog/:postId (the post UUID).
//
// Marketing URLs have no content timestamp, so they omit <lastmod>.
// Doctor and post URLs include <lastmod> from updated_at.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders, handleCors, type CorsOptions } from "../_shared/cors.ts";
import { DIRECTORY_MIN_INDEXABLE, directorySlug } from "../_shared/directorySlug.ts";

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
type PostRow = { id: string; doctor_id: string; updated_at: string | null; published_at: string | null };

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

    const urls = [
      urlEntry("/", "weekly", "1.0"),
      urlEntry("/about", "monthly", "0.6"),
      urlEntry("/auth", "monthly", "0.4"),
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

    for (const post of posts) {
      const doctor = doctorById.get(post.doctor_id);
      if (!doctor) continue;
      urls.push(urlEntry(
        `/dr/${encodeURIComponent(doctor.slug)}/blog/${post.id}`,
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
  const rows: PostRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("blog_posts")
      .select("id, doctor_id, updated_at, published_at")
      .eq("is_published", true)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as PostRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}
