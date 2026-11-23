import { describe, expect, it } from "vitest";
import { HERO_IMAGE_WIDTH, optimizedImageUrl } from "./imageUrl";
import { renderPage } from "./injectHead";

const OBJECT = "https://abc.supabase.co/storage/v1/object/public/doctor-uploads/doc/hero-photo.png?v=123";

describe("optimizedImageUrl", () => {
  it("rewrites a Supabase public object URL to the resize endpoint and keeps existing params", () => {
    const url = new URL(optimizedImageUrl(OBJECT, 800));
    expect(url.pathname).toBe("/storage/v1/render/image/public/doctor-uploads/doc/hero-photo.png");
    expect(url.searchParams.get("width")).toBe("800");
    expect(url.searchParams.get("quality")).toBe("75");
    expect(url.searchParams.get("v")).toBe("123");
  });

  it("leaves non-Supabase, data and empty URLs alone", () => {
    expect(optimizedImageUrl("https://example.com/a.png", 400)).toBe("https://example.com/a.png");
    expect(optimizedImageUrl("data:image/png;base64,AAAA", 400)).toBe("data:image/png;base64,AAAA");
    expect(optimizedImageUrl(null, 400)).toBe("");
    expect(optimizedImageUrl(undefined, 400)).toBe("");
  });

  it("is idempotent for an already-rendered URL", () => {
    const once = optimizedImageUrl(OBJECT, 800);
    expect(optimizedImageUrl(once, 800)).toBe(once);
  });
});

describe("renderPage resource hints", () => {
  const template = '<html><head><title>x</title></head><body><div id="root"></div></body></html>';
  const base = { title: "T", description: "D", canonical: "https://doctylia.com/dr/x", robots: "index" };

  it("injects a preconnect and a high-priority image preload that matches the <img> URL", () => {
    const hero = optimizedImageUrl(OBJECT, HERO_IMAGE_WIDTH);
    const html = renderPage(template, {
      ...base,
      preconnect: ["https://abc.supabase.co"],
      preloadImage: hero,
    });
    expect(html).toContain('<link rel="preconnect" href="https://abc.supabase.co" crossorigin />');
    expect(html).toContain('as="image"');
    expect(html).toContain('fetchpriority="high"');
    expect(html).toContain(hero.replace(/&/g, "&amp;"));
  });

  it("adds no hints when none are given", () => {
    const html = renderPage(template, base);
    expect(html).not.toContain("preconnect");
    expect(html).not.toContain('rel="preload"');
  });
});
