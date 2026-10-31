import { describe, it, expect, vi } from "vitest";
import { BASE_ENV } from "../_test/harness";
import { boot, overrideResult } from "../_test/payHelpers";

const doc = (o: any = {}) => ({
  id: "d1", slug: "dr-asha", updated_at: "2026-01-02T03:04:05.678Z", city: "Pune", specialization: "Cardiology",
  directory_listed: true, onboarding_completed: true, plan_status: "active", ...o,
});
const post = (o: any = {}) => ({ id: "post-1", slug: "heart-tips", title: "Heart tips", doctor_id: "d1", updated_at: "2026-02-03T00:00:00.000Z", published_at: null, is_published: true, ...o });
const get = (url = "https://x.test/sitemap", method = "GET") => new Request(url, { method, headers: { Origin: "http://localhost:8080" } });
const run = async (tables: any, url?: string, env: any = BASE_ENV) => {
  const { handler, client } = await boot("sitemap", env, { tables });
  const res = await handler(get(url));
  return { res, xml: await res.text(), client };
};
const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace("https://doctylia.com", ""));

describe("sitemap", () => {
  it("serves the marketing pages without lastmod, as cacheable XML", async () => {
    const { res, xml } = await run({ profiles: [], blog_posts: [] });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/xml");
    expect(res.headers.get("Cache-Control")).toContain("max-age=3600");
    expect(locs(xml)).toEqual(["/", "/about", "/auth", "/terms", "/privacy", "/refund-policy"]);
    expect(xml).not.toContain("<lastmod>");
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  });

  it("405 on POST, 200 preflight on OPTIONS, 500 when env is missing", async () => {
    const { handler } = await boot("sitemap", BASE_ENV, { tables: {} });
    expect((await handler(get("https://x.test/sitemap", "POST"))).status).toBe(405);
    expect((await handler(get("https://x.test/sitemap", "OPTIONS"))).status).toBe(200);
    const missing = await boot("sitemap", { ...BASE_ENV, SUPABASE_SERVICE_ROLE_KEY: undefined }, { tables: {} });
    const res = await missing.handler(get());
    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("lists only onboarded, non-suspended doctors that have a slug, with an ISO lastmod without milliseconds", async () => {
    const { xml } = await run({
      profiles: [doc(), doc({ id: "d2", slug: "not-onboarded", onboarding_completed: false }), doc({ id: "d3", slug: "suspended", plan_status: "cancelled" }), doc({ id: "d4", slug: null }), doc({ id: "d5", slug: "   " })],
      blog_posts: [],
    });
    const l = locs(xml);
    expect(l).toContain("/dr/dr-asha");
    expect(l.filter((p) => p.startsWith("/dr/"))).toEqual(["/dr/dr-asha"]);
    expect(xml).toContain("<lastmod>2026-01-02T03:04:05Z</lastmod>");
  });

  it("includes only published posts of listed doctors; blog index once per doctor; slug preferred, id as fallback", async () => {
    const { xml } = await run({
      profiles: [doc()],
      blog_posts: [post(), post({ id: "post-2", slug: null }), post({ id: "post-3", slug: "draft", is_published: false }), post({ id: "post-4", slug: "orphan", doctor_id: "ghost" })],
    });
    const l = locs(xml);
    expect(l.filter((p) => p === "/dr/dr-asha/blog")).toHaveLength(1);
    expect(l).toContain("/dr/dr-asha/blog/heart-tips");
    expect(l).toContain("/dr/dr-asha/blog/post-2");
    expect(l.join()).not.toContain("draft");
    expect(l.join()).not.toContain("orphan");
  });

  it("URL-encodes and XML-escapes slugs so a hostile slug cannot break out of <loc>", async () => {
    const { xml } = await run({ profiles: [doc({ slug: "a&b</loc><x>'\"" })], blog_posts: [] });
    expect(xml).not.toContain("</loc><x>");
    expect(xml).not.toMatch(/<loc>[^<]*[<>"'][^<]*<\/loc>/);
    expect(locs(xml)).toContain("/dr/a%26b%3C%2Floc%3E%3Cx%3E'%22".replace("'", "&apos;"));
  });

  it("directory hubs: /doctors listed; city and city/specialty hubs only at >= 3 listed doctors; unlisted doctors don't count", async () => {
    const mk = (i: number, o: any = {}) => doc({ id: `d${i}`, slug: `dr-${i}`, ...o });
    const { xml } = await run({
      profiles: [mk(1), mk(2), mk(3), mk(4, { city: "Delhi", specialization: "Dental" }), mk(5, { city: "Delhi", specialization: "Dental" }), mk(6, { directory_listed: false })],
      blog_posts: [],
    });
    const l = locs(xml);
    expect(l).toContain("/doctors");
    expect(l).toContain("/doctors/pune");
    expect(l).toContain("/doctors/pune/cardiology");
    expect(l).not.toContain("/doctors/delhi");
    // the unlisted doctor still has a public profile page, just no hub contribution
    expect(l).toContain("/dr/dr-6");
  });

  it("no hub URLs when nobody is directory-listed", async () => {
    const { xml } = await run({ profiles: [doc({ directory_listed: false })], blog_posts: [] });
    expect(locs(xml)).not.toContain("/doctors");
  });

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

  it("health articles hub: posts without a slug or title (not in the RPC) don't count toward topic pages or lastmod", async () => {
    const heart = (o: any = {}) => post({ category: "Heart Health", hub_hidden: false, ...o });
    const { xml } = await run({
      profiles: [doc()],
      blog_posts: [
        heart({ id: "a", slug: "a" }), heart({ id: "b", slug: "b" }),
        heart({ id: "legacy", slug: null, published_at: "2026-12-01T00:00:00.000Z" }),
        heart({ id: "blank", slug: "blank", title: "   ", published_at: "2026-12-02T00:00:00.000Z" }),
      ],
    });
    const l = locs(xml);
    expect(l).toContain("/health-articles");
    expect(l).not.toContain("/health-articles/heart-health");
    expect(xml).not.toContain("2026-12-0");
  });

  it("omits the hub entirely when no post is eligible", async () => {
    const { xml } = await run({ profiles: [doc()], blog_posts: [] });
    expect(locs(xml).some((p) => p.startsWith("/health-articles"))).toBe(false);
  });

  it("hub lastmod is the newest publish date, not updated_at (moderation/backfills move updated_at)", async () => {
    const { xml } = await run({
      profiles: [doc()],
      blog_posts: [
        post({ id: "a", slug: "a", category: "X", hub_hidden: false, published_at: "2026-03-01T00:00:00.000Z", updated_at: "2026-09-09T00:00:00.000Z" }),
        post({ id: "b", slug: "b", category: "X", hub_hidden: false, published_at: null, updated_at: "2026-04-01T00:00:00.000Z" }),
      ],
    });
    expect(xml).toContain("<loc>https://doctylia.com/health-articles</loc><lastmod>2026-04-01T00:00:00Z</lastmod>");
  });

  it("falls back to the old column list when category/hub_hidden are not migrated: sitemap still works, no hub URLs", async () => {
    const { handler, client } = await boot("sitemap", BASE_ENV, {
      tables: { profiles: [doc()], blog_posts: [post({ category: "Heart Health", hub_hidden: false })] },
    });
    const orig = client.from;
    const cols: string[] = [];
    (client as any).from = (t: string) => {
      const real: any = orig(t);
      if (t !== "blog_posts") return real;
      let missing = false;
      const w: any = {};
      for (const m of ["select", "eq", "order", "range"]) {
        w[m] = (...a: any[]) => {
          real[m](...a);
          if (m === "select") { cols.push(a[0]); missing = String(a[0]).includes("hub_hidden"); }
          return w;
        };
      }
      w.then = (res: any, rej: any) =>
        Promise.resolve(real).then((r: any) => (missing
          ? { data: null, error: { message: "column blog_posts.hub_hidden does not exist" } }
          // the fake returns whole rows; a real select of the old column list would not carry the new fields
          : { ...r, data: (r.data ?? []).map(({ category, hub_hidden, ...rest }: any) => rest) })).then(res, rej);
      return w;
    };
    const res = await handler(get());
    const l = locs(await res.text());
    expect(res.status).toBe(200);
    expect(cols[0]).toContain("hub_hidden");
    expect(cols.some((c) => !c.includes("hub_hidden") && !c.includes("slug"))).toBe(true);
    expect(l).toContain("/dr/dr-asha/blog");
    expect(l.some((p) => p.startsWith("/health-articles"))).toBe(false);
  });

  it("?part beyond the range is clamped (never an empty/invalid sitemap)", async () => {
    const { res, xml } = await run({ profiles: [doc()], blog_posts: [] }, "https://x.test/sitemap?part=99");
    expect(res.status).toBe(200);
    expect(locs(xml)).toContain("/dr/dr-asha");
  });

  it("DB failure -> 500 sitemap_unavailable, not cached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { handler, client } = await boot("sitemap", BASE_ENV, { tables: { profiles: [doc()], blog_posts: [] } });
    overrideResult(client, "profiles", "select", { data: null, error: { message: "db down" } });
    const res = await handler(get());
    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toContain("sitemap_unavailable");
  });
});
