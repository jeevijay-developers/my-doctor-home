import { describe, expect, it, vi } from "vitest";
import { encodePathSegment } from "./blogSeo";
import { handleSeoRequest } from "./handleSeoRequest";

const TEMPLATE = `<html><head><title>Generic</title></head><body><div id="root"></div></body></html>`;
const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon" };

type Route = (url: URL, init?: RequestInit) => unknown;
function fakeFetch(routes: Record<string, Route>) {
  return vi.fn(async (input: any, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/index.html") return new Response(TEMPLATE);
    const key = Object.keys(routes).find((k) => url.pathname.endsWith(k));
    if (!key) return new Response("[]");
    const out = routes[key](url, init);
    if (out instanceof Response) return out;
    return new Response(JSON.stringify(out));
  }) as unknown as typeof fetch;
}

const req = (qs: string) => new Request(`https://doctylia.com/api/seo?${qs}`);

// loadTemplate caches per origin, so each test uses a fresh module instance.
async function fresh() {
  vi.resetModules();
  return (await import("./handleSeoRequest")).handleSeoRequest;
}

describe("handleSeoRequest - doctor", () => {
  const profile = { id: "d1", slug: "dr-a", full_name: "A Sharma", specialization: "ENT", city: "Kota", plan_status: "active" };

  it("injects doctor-specific head and body", async () => {
    const handler = await fresh();
    const f = fakeFetch({
      "/profiles": () => [profile],
      "/services": () => [{ name: "Ear wash" }],
      "/reviews": () => [{ rating: 5 }],
      "/website_settings": () => [{ seo_title: "Dr A Sharma ENT Kota" }],
    });
    const res = await handler(req("kind=doctor&slug=dr-a"), env, f);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("<title>Dr A Sharma ENT Kota</title>");
    expect(html).toContain('href="https://doctylia.com/dr/dr-a"');
    expect(html).toContain("Ear wash");
    expect(html).toContain('"@type":["Physician","MedicalBusiness"]');
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=3600");
    // the headline font is fetched early on doctor pages (and only there)
    expect(html).toContain('as="font" type="font/woff2" href="/fonts/newsreader-latin.woff2" crossorigin');
  });

  it("404s unknown slugs with noindex", async () => {
    const handler = await fresh();
    const res = await handler(req("kind=doctor&slug=nobody"), env, fakeFetch({}));
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("noindex, nofollow");
  });

  it("301s a renamed slug to the current one", async () => {
    const handler = await fresh();
    const f = fakeFetch({
      "/profiles": (u) => (u.searchParams.get("slug") ? [] : [{ slug: "dr-new" }]),
      "/slug_history": () => [{ doctor_id: "d1" }],
    });
    const res = await handler(req("kind=doctor&slug=dr-old"), env, f);
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("https://doctylia.com/dr/dr-new");
  });

  it("404s cancelled doctors", async () => {
    const handler = await fresh();
    const res = await handler(req("kind=doctor&slug=dr-a"), env, fakeFetch({ "/profiles": () => [{ ...profile, plan_status: "cancelled" }] }));
    expect(res.status).toBe(404);
  });

  it("falls back to the plain shell when Supabase fails", async () => {
    const handler = await fresh();
    const f = fakeFetch({ "/profiles": () => new Response("boom", { status: 500 }) });
    const res = await handler(req("kind=doctor&slug=dr-a"), env, f);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(TEMPLATE);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("serves the plain shell when env is missing", async () => {
    const handler = await fresh();
    const res = await handler(req("kind=doctor&slug=dr-a"), {}, fakeFetch({}));
    expect(await res.text()).toBe(TEMPLATE);
  });
});

describe("handleSeoRequest - hubs", () => {
  const doctors = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ slug: `d${i}`, full_name: `Doc ${i}`, specialization: "ENT", city: "Kota", total_count: n }));

  it("renders an indexable city+specialty hub", async () => {
    const handler = await fresh();
    const f = fakeFetch({ "/search_doctors": () => doctors(4), "/directory_facets": () => [] });
    const res = await handler(req("kind=hub&city=kota&specialty=ent"), env, f);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("ENT doctors in Kota");
    expect(html).toContain("index, follow");
    expect(html).toContain('href="/dr/d0"');
  });

  it("marks thin hubs noindex", async () => {
    const handler = await fresh();
    const f = fakeFetch({ "/search_doctors": () => doctors(1), "/directory_facets": () => [] });
    const html = await (await handler(req("kind=hub&city=kota"), env, f)).text();
    expect(html).toContain('content="noindex, follow"');
  });

  it("404s a city with no doctors", async () => {
    const handler = await fresh();
    const f = fakeFetch({ "/search_doctors": () => [], "/directory_facets": () => [] });
    expect((await handler(req("kind=hub&city=atlantis"), env, f)).status).toBe(404);
  });

  it("301s non-canonical slugs", async () => {
    const handler = await fresh();
    const res = await handler(req("kind=hub&city=Kota"), env, fakeFetch({}));
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("https://doctylia.com/doctors/kota");
  });

  it("serves the shell if the directory migration is not applied (RPC 404)", async () => {
    const handler = await fresh();
    const f = fakeFetch({ "/search_doctors": () => new Response("{}", { status: 404 }), "/directory_facets": () => new Response("{}", { status: 404 }) });
    const res = await handler(req("kind=hub"), env, f);
    expect(await res.text()).toBe(TEMPLATE);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
  });
});

describe("handleSeoRequest - blog", () => {
  const doctor = { id: "d1", slug: "dr-a", full_name: "A Sharma", specialization: "ENT", plan_status: "active" };
  const uuid = "11111111-1111-1111-1111-111111111111";
  const post = { id: uuid, slug: "healthy-heart", title: "Healthy Heart", content: "Eat well.", is_published: true };

  it("renders a post by slug, filtering on slug and doctor", async () => {
    const handler = await fresh();
    const seen: string[] = [];
    const f = fakeFetch({
      "/profiles": () => [doctor],
      "/blog_posts": (u) => { seen.push(u.search); return [post]; },
    });
    const res = await handler(req("kind=post&slug=dr-a&post=healthy-heart"), env, f);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(seen[0]).toContain("slug=eq.healthy-heart");
    expect(seen[0]).toContain("is_published=eq.true");
    expect(html).toContain("<title>Healthy Heart · Dr. A Sharma | Doctylia</title>");
    expect(html).toContain('"@type":"BlogPosting"');
  });

  it("serves the stored article's headings to crawlers that do not run JS", async () => {
    const handler = await fresh();
    const f = fakeFetch({ "/profiles": () => [doctor], "/blog_posts": () => [{ ...post, content: "<h2>What is a stent?</h2><p>Mesh.</p>" }] });
    const html = await (await handler(req("kind=post&slug=dr-a&post=healthy-heart"), env, f)).text();
    expect(html).toContain("<h2>What is a stent?</h2>");
  });

  it("301s a legacy uuid url to the slug url", async () => {
    const handler = await fresh();
    const f = fakeFetch({ "/profiles": () => [doctor], "/blog_posts": (u) => (u.search.includes(`id=eq.${uuid}`) ? [post] : []) });
    const res = await handler(req(`kind=post&slug=dr-a&post=${uuid}`), env, f);
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("https://doctylia.com/dr/dr-a/blog/healthy-heart");
  });

  it("serves a uuid url directly when the post has no slug yet", async () => {
    const handler = await fresh();
    const f = fakeFetch({ "/profiles": () => [doctor], "/blog_posts": () => [{ ...post, slug: null }] });
    expect((await handler(req(`kind=post&slug=dr-a&post=${uuid}`), env, f)).status).toBe(200);
  });

  it("404s unknown posts and cancelled doctors", async () => {
    const handler = await fresh();
    expect((await handler(req("kind=post&slug=dr-a&post=nope"), env, fakeFetch({ "/profiles": () => [doctor], "/blog_posts": () => [] }))).status).toBe(404);
    expect((await handler(req("kind=blog&slug=dr-a"), env, fakeFetch({ "/profiles": () => [{ ...doctor, plan_status: "cancelled" }] }))).status).toBe(404);
  });

  it("lists published posts on the blog index", async () => {
    const handler = await fresh();
    const f = fakeFetch({ "/profiles": () => [doctor], "/blog_posts": () => [post] });
    const html = await (await handler(req("kind=blog&slug=dr-a"), env, f)).text();
    expect(html).toContain("<title>Health Articles · Dr. A Sharma | Doctylia</title>");
    expect(html).toContain('href="/dr/dr-a/blog/healthy-heart"');
  });
});

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
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=3600");
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

  it("404s a page over the limit before any redirect or upstream RPC", async () => {
    const handler = await fresh();
    const f = fakeFetch({ "/search_blog_posts": () => [row(1)], "/blog_facets": () => facets });
    for (const p of ["1001", "99999999999999999999", "Infinity", "1e9"]) {
      const res = await handler(req(`kind=articles&page=${p}`), env, f);
      expect(res.status).toBe(404);
      expect(res.headers.get("Location")).toBeNull();
    }
    const rpcCalls = (f as any).mock.calls.filter((c: any[]) => String(c[0]).includes("/rpc/"));
    expect(rpcCalls).toHaveLength(0);
    const edge = await handler(req("kind=articles&page=1000"), env, fakeFetch({ "/search_blog_posts": () => [], "/blog_facets": () => [] }));
    expect(edge.status).toBe(404); // within limit: reaches upstream, empty page is a normal 404
  });

  it("the plain-shell fallback for the articles hub is noindex", async () => {
    const handler = await fresh();
    const res = await handler(req("kind=articles"), env, fakeFetch({ "/search_blog_posts": () => new Response("x", { status: 500 }) }));
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    const noEnv = await handler(req("kind=articles"), {}, fakeFetch({}));
    expect(noEnv.headers.get("X-Robots-Tag")).toBe("noindex");
  });

  it("?q= serves the hub noindexed with the base canonical (no q, no page)", async () => {
    const handler = await fresh();
    const f = fakeFetch({ "/search_blog_posts": () => [row(13, { total_count: 30 })], "/blog_facets": () => facets });
    const res = await handler(req("kind=articles&category=heart-health&page=2&q=stent"), env, f);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<meta name="robots" content="noindex, follow"');
    expect(html).toContain('<link rel="canonical" href="https://doctylia.com/health-articles/heart-health"');
    expect(html).not.toContain("q=stent");
    const root = await (await handler(req("kind=articles&q=x"), env, f)).text();
    expect(root).toContain('rel="canonical" href="https://doctylia.com/health-articles"');
    // blank q behaves like no q
    const blank = await (await handler(req("kind=articles&q=%20"), env, f)).text();
    expect(blank).not.toContain("noindex");
  });

  it("encodes hostile doctor/post slugs in the hub HTML and JSON-LD", async () => {
    const handler = await fresh();
    const evil = 'x"><script>alert(1)</script>';
    const f = fakeFetch({ "/search_blog_posts": () => [row(1, { slug: evil, doctor_slug: evil })], "/blog_facets": () => facets });
    const html = await (await handler(req("kind=articles"), env, f)).text();
    expect(html).not.toContain("<script>alert(1)");
    expect(html).not.toContain('x"><');
    expect(html).toContain("/dr/x%22%3E%3Cscript%3Ealert%281%29%3C%2Fscript%3E/blog/x%22%3E%3Cscript%3Ealert%281%29%3C%2Fscript%3E");
  });
});

describe("handleSeoRequest - hostile blog slugs", () => {
  const uuid = "123e4567-e89b-12d3-a456-426614174000";
  it("301 Location, list HTML and post HTML carry only encoded slugs", async () => {
    const handler = await fresh();
    const evil = 'x"><script>alert(1)</script>\r\nSet-Cookie: a=b';
    const doctor = { id: "d1", slug: "dr-a", full_name: "A", plan_status: "active" };
    const post = { id: uuid, slug: evil, title: "T", content: "<p>x</p>", is_published: true };
    const f = fakeFetch({ "/profiles": () => [doctor], "/blog_posts": () => [post] });
    const redirect = await handler(req(`kind=post&slug=dr-a&post=${uuid}`), env, f);
    expect(redirect.status).toBe(301);
    const loc = redirect.headers.get("Location")!;
    expect(loc).toBe(`https://doctylia.com/dr/dr-a/blog/${encodePathSegment(evil)}`);
    expect(loc).not.toMatch(/[\s"<>]/);

    const list = await (await handler(req("kind=blog&slug=dr-a"), env, f)).text();
    expect(list).not.toContain("<script>alert(1)");
    expect(list).toContain(`href="/dr/dr-a/blog/${encodePathSegment(evil)}"`);
  });
});

describe("handleSeoRequest - static pages", () => {
  it("serves each marketing page with its own title and canonical, without touching Supabase", async () => {
    const handler = await fresh();
    const f = fakeFetch({ "/profiles": () => new Response("boom", { status: 500 }) });
    const res = await handler(req("kind=page&path=/about"), {}, f);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("<title>About Us | Doctylia</title>");
    expect(html).toContain('<link rel="canonical" href="https://doctylia.com/about" />');
    expect(html).toContain("index, follow");
    expect(html).toContain("<h1>About Doctylia</h1>");
  });

  it("keeps the login page out of the index", async () => {
    const handler = await fresh();
    const html = await (await handler(req("kind=page&path=/auth"), env, fakeFetch({}))).text();
    expect(html).toContain('<link rel="canonical" href="https://doctylia.com/auth" />');
    expect(html).toContain('content="noindex, follow"');
  });

  it("falls back to the plain shell for an unknown path", async () => {
    const handler = await fresh();
    const res = await handler(req("kind=page&path=/nope"), env, fakeFetch({}));
    expect(await res.text()).toBe(TEMPLATE);
  });
});

describe("handleSeoRequest - practitioner", () => {
  const profile = { id: "d1", slug: "dr-a", full_name: "A Sharma", specialization: "ENT", city: "Kota", plan_status: "active" };
  const practitioners = [
    { id: "p1", slug: "a-sharma", display_name: "A Sharma", specialization: "ENT", is_primary: true },
    { id: "p2", slug: "ravi-kumar", display_name: "Ravi Kumar", specialization: "Orthodontist", qualifications: "BDS", bio: "Ravi treats braces.", is_primary: false },
  ];

  it("renders head, JSON-LD and body for a doctor", async () => {
    const handler = await fresh();
    const f = fakeFetch({ "/profiles": () => [profile], "/get_public_practitioners": () => practitioners });
    const res = await handler(req("kind=practitioner&slug=dr-a&doctor=ravi-kumar"), env, f);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('href="https://doctylia.com/dr/dr-a/doctor/ravi-kumar"');
    expect(html).toContain("Dr. Ravi Kumar");
    expect(html).toContain('"worksFor":{"@id":"https://doctylia.com/dr/dr-a#clinic"}');
    expect(html).toContain("Ravi treats braces.");
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=3600");
  });

  it("301s an unknown doctor to the clinic page", async () => {
    const handler = await fresh();
    const f = fakeFetch({ "/profiles": () => [profile], "/get_public_practitioners": () => practitioners });
    const res = await handler(req("kind=practitioner&slug=dr-a&doctor=nobody"), env, f);
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("https://doctylia.com/dr/dr-a");
  });

  it("301s to the clinic page for a single-doctor clinic", async () => {
    const handler = await fresh();
    const f = fakeFetch({ "/profiles": () => [profile], "/get_public_practitioners": () => [practitioners[0]] });
    const res = await handler(req("kind=practitioner&slug=dr-a&doctor=a-sharma"), env, f);
    expect(res.status).toBe(301);
  });

  it("404s an unknown clinic", async () => {
    const handler = await fresh();
    const res = await handler(req("kind=practitioner&slug=nobody&doctor=x"), env, fakeFetch({}));
    expect(res.status).toBe(404);
  });

  it("clinic page lists employees when there are 2+ doctors, and is unchanged when the fetch fails", async () => {
    const handler = await fresh();
    const multi = await (await handler(req("kind=doctor&slug=dr-a"), env, fakeFetch({ "/profiles": () => [profile], "/get_public_practitioners": () => practitioners }))).text();
    expect(multi).toContain('"MedicalClinic"');
    expect(multi).toContain("/dr/dr-a/doctor/ravi-kumar#physician");
    const handler2 = await fresh();
    const failed = await (await handler2(req("kind=doctor&slug=dr-a"), env, fakeFetch({ "/profiles": () => [profile], "/get_public_practitioners": () => new Response("x", { status: 500 }) }))).text();
    expect(failed).toContain('"@type":["Physician","MedicalBusiness"]');
    expect(failed).not.toContain("MedicalClinic");
  });
});

describe("handleSeoRequest - P3 doctor-aware content", () => {
  const profile = { id: "d1", slug: "dr-a", full_name: "A Sharma", specialization: "ENT", city: "Kota", clinic_name: "Sharma Clinic", plan_status: "active" };
  const team = [
    { id: "p1", slug: "a-sharma", display_name: "A Sharma", specialization: "ENT", is_primary: true, is_active: true, directory_listed: true, review_count: 0, avg_rating: null },
    { id: "p2", slug: "ravi-kumar", display_name: "Ravi Kumar", specialization: "Orthodontist", is_primary: false, is_active: true, directory_listed: true, review_count: 3, avg_rating: 4.66 },
  ];
  const post = { id: "11111111-1111-1111-1111-111111111111", slug: "braces", title: "Braces", content: "Wear them.", is_published: true, practitioner_id: "p2" };
  const run = async (qs: string, routes: Record<string, Route>) => (await fresh())(req(qs), env, fakeFetch(routes));

  it("practitioner page carries that doctor's aggregateRating", async () => {
    const html = await (await run("kind=practitioner&slug=dr-a&doctor=ravi-kumar", { "/profiles": () => [profile], "/get_public_practitioners": () => team })).text();
    expect(html).toContain('"ratingValue":"4.7"');
    expect(html).toContain('"reviewCount":"3"');
  });

  it("practitioner page is noindex (still 200) when not directory_listed, indexable otherwise", async () => {
    const hidden = team.map((p) => (p.id === "p2" ? { ...p, directory_listed: false } : p));
    const res = await run("kind=practitioner&slug=dr-a&doctor=ravi-kumar", { "/profiles": () => [profile], "/get_public_practitioners": () => hidden });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<meta name="robots" content="noindex, follow"');
    const ok = await (await run("kind=practitioner&slug=dr-a&doctor=ravi-kumar", { "/profiles": () => [profile], "/get_public_practitioners": () => team })).text();
    expect(ok).toContain('<meta name="robots" content="index, follow');
  });

  it("blog post by a practitioner in a 2+ doctor clinic is authored by that doctor", async () => {
    const html = await (await run("kind=post&slug=dr-a&post=braces", { "/profiles": () => [profile], "/blog_posts": () => [post], "/get_public_practitioners": () => team })).text();
    expect(html).toContain('"author":{"@type":"Person","name":"Ravi Kumar","honorificPrefix":"Dr."');
    expect(html).toContain("/dr/dr-a/doctor/ravi-kumar");
  });

  it("serves a short cache when the practitioner lookup fails, the long cache otherwise", async () => {
    const handler = await fresh();
    const mk = (pract: () => unknown) => fakeFetch({ "/profiles": () => [profile], "/blog_posts": () => [post], "/get_public_practitioners": pract });
    const failed = await handler(req("kind=post&slug=dr-a&post=braces"), env, mk(() => new Response("x", { status: 500 })));
    expect(failed.status).toBe(200);
    expect(failed.headers.get("Cache-Control")).toBe("public, max-age=0, s-maxage=60, stale-while-revalidate=300");
    const ok = await handler(req("kind=post&slug=dr-a&post=braces"), env, mk(() => team));
    expect(ok.headers.get("Cache-Control")).toContain("s-maxage=3600");
    const noDoctor = await handler(req("kind=post&slug=dr-a&post=braces"), env, fakeFetch({ "/profiles": () => [profile], "/blog_posts": () => [{ ...post, practitioner_id: null }] }));
    expect(noDoctor.headers.get("Cache-Control")).toContain("s-maxage=3600");
  });

  it("falls back to the clinic author when the fetch fails, the post has no doctor, or the clinic is single-doctor", async () => {
    const clinicAuthor = '"author":{"@type":"Person","name":"A Sharma"';
    const failed = await (await run("kind=post&slug=dr-a&post=braces", { "/profiles": () => [profile], "/blog_posts": () => [post], "/get_public_practitioners": () => new Response("x", { status: 500 }) })).text();
    expect(failed).toContain(clinicAuthor);
    const calls: string[] = [];
    const none = await (await run("kind=post&slug=dr-a&post=braces", { "/profiles": () => [profile], "/blog_posts": () => [{ ...post, practitioner_id: null }], "/get_public_practitioners": (u) => { calls.push(u.pathname); return team; } })).text();
    expect(none).toContain(clinicAuthor);
    expect(calls).toEqual([]);
    const solo = await (await run("kind=post&slug=dr-a&post=braces", { "/profiles": () => [profile], "/blog_posts": () => [post], "/get_public_practitioners": () => [team[1]] })).text();
    expect(solo).toContain(clinicAuthor);
  });
});
