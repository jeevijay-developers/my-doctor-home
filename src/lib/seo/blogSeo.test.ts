import { describe, expect, it } from "vitest";
import {
  UUID_RE,
  blogPostPath,
  buildBlogListHead,
  buildBlogPostHead,
  buildBlogPostJsonLd,
  buildBlogPostMeta,
  stripMarkup,
  type BlogPostLike,
} from "./blogSeo";
import { INDEXABLE } from "./injectHead";

const origin = "https://doctylia.com";
const doctor = { slug: "dr-a", full_name: "Anita Sharma", specialization: "Dentist", profile_photo_url: "https://img/doc.png" };
const post = (over: Partial<BlogPostLike> = {}): BlogPostLike => ({ id: "11111111-1111-1111-1111-111111111111", title: "Healthy Teeth", ...over });

describe("UUID_RE", () => {
  it("matches UUIDs case-insensitively and rejects others", () => {
    expect(UUID_RE.test("11111111-1111-1111-1111-111111111111")).toBe(true);
    expect(UUID_RE.test("ABCDEF12-1234-1234-1234-1234567890AB")).toBe(true);
    expect(UUID_RE.test("my-post-slug")).toBe(false);
    expect(UUID_RE.test("11111111-1111-1111-1111-11111111111")).toBe(false);
    expect(UUID_RE.test("11111111-1111-1111-1111-111111111111x")).toBe(false);
  });
});

describe("blogPostPath", () => {
  it("prefers the slug, falls back to id", () => {
    expect(blogPostPath("dr-a", { id: "i", slug: "s" })).toBe("/dr/dr-a/blog/s");
    expect(blogPostPath("dr-a", { id: "i", slug: null })).toBe("/dr/dr-a/blog/i");
    expect(blogPostPath("dr-a", { id: "i", slug: "" })).toBe("/dr/dr-a/blog/i");
  });
});

describe("stripMarkup", () => {
  it("returns '' for nullish/empty", () => {
    expect(stripMarkup(null)).toBe("");
    expect(stripMarkup(undefined)).toBe("");
    expect(stripMarkup("")).toBe("");
  });
  it("removes tags and markdown markers and collapses whitespace", () => {
    expect(stripMarkup("<p>Hello <b>world</b></p>\n\n## Title\n* item `code`")).toBe("Hello world Title item code");
  });
  it("treats tags as word separators", () => {
    expect(stripMarkup("a<br>b")).toBe("a b");
  });
  // BUG: blogSeo.ts:32 strips every "-" (meant for markdown bullets), so hyphenated words, ranges and
  // dates in the meta description are mangled: "Low-sodium diet" -> "Low sodium diet".
  it.fails("keeps in-word hyphens", () => {
    expect(stripMarkup("Low-sodium diet")).toBe("Low-sodium diet");
  });
});

describe("buildBlogPostMeta", () => {
  it("title/canonical/image defaults", () => {
    const m = buildBlogPostMeta({ origin, doctor, post: post({ slug: "healthy-teeth" }) });
    expect(m.title).toBe("Healthy Teeth · Dr. Anita Sharma | Doctylia");
    expect(m.canonical).toBe("https://doctylia.com/dr/dr-a/blog/healthy-teeth");
    expect(m.image).toBe("https://img/doc.png");
  });
  it("featured image wins; legacy URL uses the id", () => {
    const m = buildBlogPostMeta({ origin, doctor, post: post({ featured_image_url: "https://img/f.png" }) });
    expect(m.image).toBe("https://img/f.png");
    expect(m.canonical.endsWith("/blog/11111111-1111-1111-1111-111111111111")).toBe(true);
  });
  it("title omits the post part when it has no title", () => {
    expect(buildBlogPostMeta({ origin, doctor, post: post({ title: "" }) }).title).toBe("Dr. Anita Sharma | Doctylia");
  });
  it("description: excerpt -> content (160 chars) -> generated", () => {
    expect(buildBlogPostMeta({ origin, doctor, post: post({ excerpt: "  Short  " }) }).description).toBe("Short");
    expect(buildBlogPostMeta({ origin, doctor, post: post({ content: "<p>" + "x".repeat(300) + "</p>" }) }).description).toHaveLength(160);
    expect(buildBlogPostMeta({ origin, doctor, post: post() }).description).toBe(
      'Read "Healthy Teeth" by Dr. Anita Sharma (Dentist) on Doctylia.',
    );
    expect(buildBlogPostMeta({ origin, doctor: { slug: "x", full_name: "Ravi" }, post: post({ title: "" }) }).description).toBe(
      'Read "Health Article" by Dr. Ravi on Doctylia.',
    );
  });
  it("image may be empty", () => {
    expect(buildBlogPostMeta({ origin, doctor: { slug: "x", full_name: "R" }, post: post() }).image).toBe("");
  });
});

describe("buildBlogPostJsonLd", () => {
  it("contains BlogPosting + breadcrumbs with correct dates", () => {
    const ld: any = buildBlogPostJsonLd({
      origin,
      doctor,
      post: post({ slug: "s", published_at: "2026-01-02", updated_at: "2026-02-03", category: "Dental", featured_image_url: "https://img/f.png" }),
    });
    const [article, crumbs] = ld["@graph"];
    expect(article).toMatchObject({
      "@type": "BlogPosting",
      headline: "Healthy Teeth",
      datePublished: "2026-01-02",
      dateModified: "2026-02-03",
      articleSection: "Dental",
      image: ["https://img/f.png"],
      author: { "@type": "Person", name: "Anita Sharma", honorificPrefix: "Dr.", url: "https://doctylia.com/dr/dr-a", jobTitle: "Dentist" },
    });
    expect(crumbs.itemListElement.map((c: any) => c.position)).toEqual([1, 2, 3]);
    expect(crumbs.itemListElement[2].item).toBe("https://doctylia.com/dr/dr-a/blog/s");
  });
  it("dateModified falls back to datePublished, which falls back to created_at; omitted when none", () => {
    const a: any = buildBlogPostJsonLd({ origin, doctor, post: post({ created_at: "2026-05-05" }) })["@graph"][0];
    expect(a.datePublished).toBe("2026-05-05");
    expect(a.dateModified).toBe("2026-05-05");
    const b: any = buildBlogPostJsonLd({ origin, doctor, post: post() })["@graph"][0];
    expect("datePublished" in b).toBe(false);
    expect("dateModified" in b).toBe(false);
    expect("articleSection" in b).toBe(false);
  });
});

describe("buildBlogPostHead", () => {
  it("is indexable article and escapes title/doctor name in the body", () => {
    const head = buildBlogPostHead({
      origin,
      doctor: { ...doctor, full_name: "A<b>", slug: "dr a/b" },
      post: post({ title: "<script>alert(1)</script>", content: "<img src=x onerror=1> body & more" }),
    });
    expect(head.robots).toBe(INDEXABLE);
    expect(head.ogType).toBe("article");
    expect(head.bodyHtml).not.toContain("<script>");
    expect(head.bodyHtml).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(head.bodyHtml).toContain('href="/dr/dr%20a%2Fb"');
    expect(head.bodyHtml).toContain("body &amp; more");
    expect(head.bodyHtml).not.toContain("onerror");
  });
  it("emits only the byline paragraph when there is no content and no excerpt", () => {
    const body = buildBlogPostHead({ origin, doctor, post: post() }).bodyHtml!;
    expect(body.match(/<p>/g)).toHaveLength(1);
    expect(body).toContain("<p>By ");
  });
  it("is no longer capped at 3000 chars (full article is served to non-JS crawlers)", () => {
    const long = buildBlogPostHead({ origin, doctor, post: post({ content: `<p>${"x".repeat(5000)}</p>` }) }).bodyHtml!;
    expect(long.match(/x+/)![0]).toHaveLength(5000);
  });
});

describe("buildBlogListHead", () => {
  it("lists posts, is indexable when non-empty, with encoded hrefs and escaped titles", () => {
    const head = buildBlogListHead({
      origin,
      doctor: { ...doctor, slug: "dr a" },
      posts: [post({ slug: "one", title: "A & B" }), post({ id: "2", title: "Two" })],
    });
    expect(head.robots).toBe(INDEXABLE);
    expect(head.canonical).toBe("https://doctylia.com/dr/dr%20a/blog");
    expect(head.bodyHtml).toContain('<a href="/dr/dr%20a/blog/one">A &amp; B</a>');
    expect(head.bodyHtml).toContain('<a href="/dr/dr%20a/blog/2">Two</a>');
    const ld: any = head.jsonLd![0];
    expect(ld["@graph"][0].itemListElement.map((i: any) => i.position)).toEqual([1, 2]);
  });
  it("is noindex with no list when there are no posts", () => {
    const head = buildBlogListHead({ origin, doctor, posts: [] });
    expect(head.robots).toBe("noindex, follow");
    expect(head.bodyHtml).not.toContain("<ul>");
    expect(head.title).toBe("Health Articles · Dr. Anita Sharma | Doctylia");
  });
});

describe("buildBlogPostJsonLd - author entity", () => {
  const rich = { ...doctor, qualifications: "MBBS, MD Cardiology", clinic_name: "Heart Care Clinic", city: "Kota" };
  const article = (d: any, p = post()) => (buildBlogPostJsonLd({ origin, doctor: d, post: p }) as any)["@graph"].find((n: any) => n["@type"] === "BlogPosting");

  it("uses a Person author with a bare name, honorific, job title and profile url", () => {
    const a = article(rich).author;
    expect(a).toMatchObject({ "@type": "Person", name: "Anita Sharma", honorificPrefix: "Dr.", jobTitle: "Dentist", url: `${origin}/dr/dr-a` });
    expect(a.name).not.toMatch(/^dr\.?\s/i);
    expect(a.worksFor).toMatchObject({ "@type": "MedicalBusiness", name: "Heart Care Clinic", address: { addressLocality: "Kota" } });
  });

  it("does not double the honorific when the stored name already starts with Dr.", () => {
    expect(article({ ...rich, full_name: "Dr. Anita Sharma" }).author.name).toBe("Anita Sharma");
  });

  it("adds language and hub membership, and never FAQPage or lastReviewed", () => {
    const g = (buildBlogPostJsonLd({ origin, doctor: rich, post: post({ content: "<h2>A?</h2><p>a</p><h2>B?</h2><p>b</p>" }) }) as any)["@graph"];
    const a = g.find((n: any) => n["@type"] === "BlogPosting");
    expect(a.inLanguage).toBe("en-IN");
    expect(a.isPartOf).toMatchObject({ "@type": "Blog", url: `${origin}/dr/dr-a/blog` });
    expect(g.some((n: any) => n["@type"] === "FAQPage")).toBe(false);
    expect(a.lastReviewed).toBeUndefined();
  });

  it("claims a review only for AI-assisted posts", () => {
    expect(article(rich).reviewedBy).toBeUndefined();
    expect(article(rich, post({ ai_assisted: true })).reviewedBy).toMatchObject({ "@type": "Person", name: "Anita Sharma" });
  });
});

describe("buildBlogPostHead - crawler-visible body", () => {
  const content = "<h2>What is a stent?</h2><p>A small mesh tube.</p><h2>When to see a doctor</h2><ul><li>Chest pain</li></ul><script>alert(1)</script>";
  const head = buildBlogPostHead({ origin, doctor: { ...doctor, qualifications: "MBBS" }, post: post({ content, excerpt: "Short answer.", published_at: "2026-10-01T05:00:00Z" }) });

  it("includes the full article with its headings and lists, not a truncated blob", () => {
    expect(head.bodyHtml).toContain("<h2>What is a stent?</h2>");
    expect(head.bodyHtml).toContain("<li>Chest pain</li>");
    expect(head.bodyHtml).not.toContain("<script");
  });
  it("shows a byline that links to the doctor and a machine-readable date", () => {
    expect(head.bodyHtml).toContain('<a href="/dr/dr-a">');
    expect(head.bodyHtml).toContain('<time datetime="2026-10-01T05:00:00Z">2026-10-01</time>');
  });
  it("leads with the excerpt as the summary before the body", () => {
    expect(head.bodyHtml!.indexOf("Short answer.")).toBeLessThan(head.bodyHtml!.indexOf("What is a stent?"));
  });
});

describe("hostile slugs", () => {
  const EVIL = [
    'x"><script>alert(1)</script>',
    "</script><img src=x onerror=alert(1)>",
    "a'b\"c<d>e",
    "line\r\nbreak",
    "sp ace",
    "café-‮",
  ];
  it("blogPostPath encodes both parts exactly once and normal slugs are unchanged", () => {
    expect(blogPostPath("dr-a", { id: "i", slug: "healthy-heart-2" })).toBe("/dr/dr-a/blog/healthy-heart-2");
    expect(blogPostPath("dr a", { id: "i", slug: 'x"<' })).toBe("/dr/dr%20a/blog/x%22%3C");
    expect(blogPostPath("d%41", { id: "i", slug: null })).toBe("/dr/d%2541/blog/i");
  });
  it.each(EVIL)("never emits %j raw in list or post HTML / JSON-LD", (evil) => {
    const hostile = { ...doctor, slug: evil };
    const p = post({ slug: evil, title: "T" });
    const heads = [
      buildBlogListHead({ origin, doctor: hostile, posts: [p] }),
      buildBlogPostHead({ origin, doctor: hostile, post: p }),
    ];
    for (const h of heads) {
      const body = h.bodyHtml ?? "";
      for (const bad of ["<script", "</script", "\r", "\n", " onerror"]) {
        expect(body).not.toContain(bad);
      }
      for (const href of body.match(/href="[^"]*"/g) ?? []) {
        expect(href).toMatch(/^href="[A-Za-z0-9\-._~%/]*"$/);
      }
      const ld = JSON.stringify(h.jsonLd);
      expect(ld).not.toContain(evil);
      for (const url of ld.match(/https:\/\/doctylia\.com\/dr\/[^"]*/g) ?? []) {
        expect(url.slice("https://doctylia.com".length)).toMatch(/^[A-Za-z0-9\-._~%/#]*$/);
      }
    }
  });
});
