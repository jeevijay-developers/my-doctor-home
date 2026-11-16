import { describe, expect, it } from "vitest";
import { STATIC_PAGES, buildStaticPageHead, isStaticPagePath } from "./staticPages";

const origin = "https://doctylia.com";

describe("staticPages", () => {
  it("gives every page a unique title and description that fit a search snippet", () => {
    const titles = Object.values(STATIC_PAGES).map((p) => p.title);
    const descriptions = Object.values(STATIC_PAGES).map((p) => p.description);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    for (const p of Object.values(STATIC_PAGES)) {
      expect(p.title.length).toBeLessThanOrEqual(60);
      expect(p.description.length).toBeLessThanOrEqual(160);
    }
  });

  it("canonicalises each page to itself, never to the homepage", () => {
    for (const path of Object.keys(STATIC_PAGES)) {
      expect(buildStaticPageHead(origin, path)!.canonical).toBe(`${origin}${path}`);
    }
  });

  it("indexes the content pages and noindexes login", () => {
    expect(buildStaticPageHead(origin, "/terms")!.robots).toContain("index, follow");
    expect(buildStaticPageHead(origin, "/auth")!.robots).toBe("noindex, follow");
  });

  it("rejects unknown paths, including prototype keys", () => {
    expect(buildStaticPageHead(origin, "/nope")).toBeNull();
    expect(isStaticPagePath("constructor")).toBe(false);
    expect(isStaticPagePath("__proto__")).toBe(false);
    expect(isStaticPagePath(null)).toBe(false);
  });
});
