import { describe, expect, it, vi } from "vitest";
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
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=300");
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
