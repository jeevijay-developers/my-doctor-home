import { describe, expect, it } from "vitest";
import {
  ARTICLES_PAGE_SIZE, articlePath, articlesPath, buildArticlesHead, isArticlesIndexable, totalPages,
  type HubArticle,
} from "./healthArticlesSeo";
import { INDEXABLE, NOINDEX } from "./injectHead";

const origin = "https://doctylia.com";
const art = (i: number, over: Partial<HubArticle> = {}): HubArticle => ({
  id: `id${i}`, slug: `post-${i}`, title: `Post ${i}`, excerpt: `Excerpt ${i}`, category: "Heart Health",
  featured_image_url: null, published_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-02T00:00:00Z", reading_minutes: 3,
  doctor_slug: "dr-a", doctor_name: "Anita Sharma", doctor_specialization: "Cardiologist", doctor_city: "Kota", doctor_photo_url: null,
  ...over,
});

describe("paths", () => {
  it("builds hub, category and paginated paths", () => {
    expect(articlesPath()).toBe("/health-articles");
    expect(articlesPath("heart-health")).toBe("/health-articles/heart-health");
    expect(articlesPath(undefined, 2)).toBe("/health-articles?page=2");
    expect(articlesPath("heart-health", 3)).toBe("/health-articles/heart-health?page=3");
    expect(articlesPath("heart-health", 1)).toBe("/health-articles/heart-health");
  });
  it("links an article to its canonical doctor-site URL", () => {
    expect(articlePath(art(1))).toBe("/dr/dr-a/blog/post-1");
  });
  it("counts pages", () => {
    expect(totalPages(0)).toBe(1);
    expect(totalPages(ARTICLES_PAGE_SIZE)).toBe(1);
    expect(totalPages(ARTICLES_PAGE_SIZE + 1)).toBe(2);
  });
});

describe("isArticlesIndexable", () => {
  it("indexes the root hub with any post and categories from 3 posts", () => {
    expect(isArticlesIndexable(0)).toBe(false);
    expect(isArticlesIndexable(1)).toBe(true);
    expect(isArticlesIndexable(2, "heart-health")).toBe(false);
    expect(isArticlesIndexable(3, "heart-health")).toBe(true);
  });
});

describe("buildArticlesHead", () => {
  const base = { origin, page: 1, facets: [{ slug: "heart-health", label: "Heart Health", post_count: 5 }] };

  it("root hub: indexable, self canonical, titled for the topic, crawlable list with author links", () => {
    const head = buildArticlesHead({ ...base, articles: [art(1), art(2)], total: 2 });
    expect(head.robots).toBe(INDEXABLE);
    expect(head.canonical).toBe(`${origin}/health-articles`);
    expect(head.title).toBe("Health Articles Written by Doctors in India | Doctylia");
    expect(head.title.length).toBeLessThanOrEqual(60);
    expect(head.description.length).toBeGreaterThanOrEqual(110);
    expect(head.description.length).toBeLessThanOrEqual(165);
    expect(head.bodyHtml).toContain('<h1>Health Articles by Doctors</h1>');
    expect(head.bodyHtml).toContain('href="/dr/dr-a/blog/post-1"');
    expect(head.bodyHtml).toContain('href="/dr/dr-a"');
    expect(head.bodyHtml).toContain('href="/health-articles/heart-health"');
  });

  it("emits CollectionPage + ItemList (with page-offset positions) + breadcrumbs", () => {
    const head = buildArticlesHead({ ...base, page: 2, articles: [art(13)], total: 13 });
    const graph = (head.jsonLd![0] as any)["@graph"];
    const page = graph.find((n: any) => n["@type"] === "CollectionPage");
    expect(page.mainEntity.itemListElement[0]).toMatchObject({ position: ARTICLES_PAGE_SIZE + 1, url: `${origin}/dr/dr-a/blog/post-13` });
    expect(graph.find((n: any) => n["@type"] === "BreadcrumbList").itemListElement.map((i: any) => i.name)).toEqual(["Doctylia", "Health Articles"]);
  });

  it("page 2+: self canonical, suffix in title, prev/next links", () => {
    const head = buildArticlesHead({ ...base, page: 2, articles: [art(13)], total: 30 });
    expect(head.canonical).toBe(`${origin}/health-articles?page=2`);
    expect(head.title).toContain("Page 2");
    expect(head.bodyHtml).toContain('rel="prev" href="/health-articles"');
    expect(head.bodyHtml).toContain('rel="next" href="/health-articles?page=3"');
  });

  it("category hub: label in title/h1, third breadcrumb, noindex below the thin-page threshold", () => {
    const thin = buildArticlesHead({ ...base, categorySlug: "heart-health", categoryLabel: "Heart Health", articles: [art(1)], total: 1 });
    expect(thin.robots).toBe(NOINDEX);
    const ok = buildArticlesHead({ ...base, categorySlug: "heart-health", categoryLabel: "Heart Health", articles: [art(1), art(2), art(3)], total: 3 });
    expect(ok.robots).toBe(INDEXABLE);
    expect(ok.title).toBe("Heart Health Articles by Doctors | Doctylia");
    expect(ok.canonical).toBe(`${origin}/health-articles/heart-health`);
    const crumbs = (ok.jsonLd![0] as any)["@graph"].find((n: any) => n["@type"] === "BreadcrumbList").itemListElement;
    expect(crumbs.map((i: any) => i.name)).toEqual(["Doctylia", "Health Articles", "Heart Health"]);
  });

  it("escapes hostile titles and excerpts in the body", () => {
    const head = buildArticlesHead({ ...base, articles: [art(1, { title: '<img src=x onerror=alert(1)>', excerpt: '"><script>x</script>' })], total: 1 });
    expect(head.bodyHtml).not.toContain("<img");
    expect(head.bodyHtml).not.toContain("<script>");
  });

  it("an empty hub is noindex and has no list", () => {
    const head = buildArticlesHead({ ...base, articles: [], total: 0 });
    expect(head.robots).toBe(NOINDEX);
    expect(head.bodyHtml).not.toContain("<ul>");
  });
});
