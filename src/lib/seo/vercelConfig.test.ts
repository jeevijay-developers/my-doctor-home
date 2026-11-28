import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// vercel.json is configuration, so the one thing worth pinning is which URLs get X-Robots-Tag: noindex.
const root = resolve(__dirname, "../../..");
const config = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8"));

/** Minimal path-to-regexp for the patterns used in vercel.json `headers.source`. */
function matcher(source: string): RegExp {
  const re = source.replace(/:\w+\*/g, ".*").replace(/:\w+/g, "[^/]+");
  return new RegExp(`^${re}$`);
}
function robotsHeader(path: string): string[] {
  return config.headers
    .filter((h: any) => matcher(h.source).test(path))
    .flatMap((h: any) => h.headers.filter((x: any) => x.key === "X-Robots-Tag").map((x: any) => x.value));
}

describe("X-Robots-Tag in vercel.json", () => {
  it("noindex on the live queue screen, the manage-appointment page and shared prescriptions", () => {
    expect(robotsHeader("/dr/sharma-clinic/queue")).toEqual(["noindex"]);
    expect(robotsHeader("/dr/sharma-clinic/manage")).toEqual(["noindex"]);
    expect(robotsHeader("/rx/abc123token")).toEqual(["noindex"]);
  });
  it("never on the clinic page, doctor pages, blog, marketing pages or the sitemap", () => {
    for (const path of [
      "/", "/dr/sharma-clinic", "/dr/sharma-clinic/doctor/ravi", "/dr/sharma-clinic/blog", "/dr/sharma-clinic/blog/some-post",
      "/health-articles", "/pricing", "/sitemap.xml", "/dr/queue", "/dr/manage", "/rx",
    ]) expect(robotsHeader(path), path).toEqual([]);
  });
  it("robots.txt does not Disallow those paths (a blocked page's noindex header would never be seen)", () => {
    const robots = readFileSync(resolve(root, "public/robots.txt"), "utf8");
    expect(robots).not.toMatch(/Disallow:\s*\/(dr|rx)/);
  });
  it("the security headers rule and the rewrites for the SEO pages are still in place", () => {
    expect(config.headers.some((h: any) => h.source === "/(.*)")).toBe(true);
    const sources = config.rewrites.map((r: any) => r.source);
    expect(sources).toEqual(expect.arrayContaining(["/dr/:slug", "/dr/:slug/doctor/:doctorSlug", "/dr/:slug/blog", "/dr/:slug/blog/:post"]));
    // queue/manage/rx are plain SPA routes: not rewritten to the SEO function
    expect(sources).not.toContain("/dr/:slug/queue");
    expect(sources).not.toContain("/dr/:slug/manage");
  });
});

describe("regions", () => {
  it("api/seo.ts and api/sitemap.ts stay pinned next to Supabase (syd1)", () => {
    for (const file of ["api/seo.ts", "api/sitemap.ts"]) {
      expect(readFileSync(resolve(root, file), "utf8")).toContain('regions: ["syd1"]');
    }
  });
});
