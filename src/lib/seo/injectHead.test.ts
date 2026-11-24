import { describe, expect, it } from "vitest";
import { INDEXABLE, NOINDEX, escapeHtml, jsonForScript, renderPage, type PageHead } from "./injectHead";

const TEMPLATE = `<!doctype html>
<html>
  <head>
    <title>Old</title>
    <meta name="description" content="old desc" />
    <meta name="robots" content="index" />
    <meta property="og:title" content="old" />
    <meta name="twitter:card" content="summary" />
    <meta name="viewport" content="width=device-width" />
    <link rel="canonical" href="https://old/" />
    <script type="application/ld+json">{"old":true}</script>
    <script type="module" src="/main.js"></script>
  </head>
  <body><div id="root"></div></body>
</html>`;

const page = (over: Partial<PageHead> = {}): PageHead => ({
  title: "T",
  description: "D",
  canonical: "https://doctylia.com/x",
  robots: INDEXABLE,
  ...over,
});

describe("escapeHtml", () => {
  it("escapes all five special characters", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  });
  it("escapes & first (no double-escaping of produced entities)", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
  it("coerces null/undefined to empty and numbers to strings", () => {
    expect(escapeHtml(null as unknown as string)).toBe("");
    expect(escapeHtml(undefined as unknown as string)).toBe("");
    expect(escapeHtml(5 as unknown as string)).toBe("5");
  });
});

describe("jsonForScript", () => {
  it("escapes < and the line/paragraph separators, and round-trips", () => {
    const data = { s: `</script>${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}<!--` };
    const out = jsonForScript(data);
    expect(out).not.toContain("<");
    expect(out).not.toContain(String.fromCharCode(0x2028));
    expect(out).not.toContain(String.fromCharCode(0x2029));
    expect(JSON.parse(out)).toEqual(data);
  });
});

describe("renderPage", () => {
  it("removes the old head tags and writes the new ones exactly once", () => {
    const html = renderPage(TEMPLATE, page());
    expect(html).not.toContain("Old</title>");
    expect(html).not.toContain("old desc");
    expect(html).not.toContain("https://old/");
    expect(html).not.toContain('"old":true');
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html.match(/name="description"/g)).toHaveLength(1);
    expect(html.match(/name="robots"/g)).toHaveLength(1);
    expect(html).toContain("<title>T</title>");
    expect(html).toContain('<link rel="canonical" href="https://doctylia.com/x" />');
  });

  it("keeps unrelated tags (viewport, module script)", () => {
    const html = renderPage(TEMPLATE, page());
    expect(html).toContain('<meta name="viewport"');
    expect(html).toContain('<script type="module" src="/main.js"></script>');
  });

  it("tags go inside <head>", () => {
    const html = renderPage(TEMPLATE, page());
    expect(html.indexOf("<title>T</title>")).toBeLessThan(html.indexOf("</head>"));
  });

  it("uses summary card without an image and summary_large_image with one", () => {
    expect(renderPage(TEMPLATE, page())).toContain('name="twitter:card" content="summary"');
    expect(renderPage(TEMPLATE, page())).not.toContain("og:image");
    const withImg = renderPage(TEMPLATE, page({ image: "https://img/x.png?a=1&b=2" }));
    expect(withImg).toContain('content="summary_large_image"');
    expect(withImg).toContain('og:image" content="https://img/x.png?a=1&amp;b=2"');
    expect(withImg).toContain('twitter:image" content="https://img/x.png?a=1&amp;b=2"');
  });

  it("defaults og:type to website and honors an override", () => {
    expect(renderPage(TEMPLATE, page())).toContain('og:type" content="website"');
    expect(renderPage(TEMPLATE, page({ ogType: "article" }))).toContain('og:type" content="article"');
  });

  it("escapes title, description, canonical and robots into attributes", () => {
    const html = renderPage(TEMPLATE, page({ title: `A "b" <c>`, description: `x" onload="y`, canonical: `https://x/?a=1&b=2` }));
    expect(html).toContain("<title>A &quot;b&quot; &lt;c&gt;</title>");
    expect(html).toContain('content="x&quot; onload=&quot;y"');
    expect(html).toContain('href="https://x/?a=1&amp;b=2"');
  });

  it("does not interpret $-patterns in injected content", () => {
    const html = renderPage(TEMPLATE, page({ title: "Save $& and $1 $$", bodyHtml: "<p>$& $` $'</p>" }));
    expect(html).toContain("<title>Save $&amp; and $1 $$</title>");
    expect(html).toContain("<p>$& $` $'</p>");
  });

  it("emits JSON-LD that cannot break out of its script tag", () => {
    const html = renderPage(TEMPLATE, page({ jsonLd: [{ name: "</script><script>alert(1)</script>" }, { a: 1 }] }));
    const blocks = html.match(/<script type="application\/ld\+json">/g) ?? [];
    expect(blocks).toHaveLength(2);
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("\\u003c/script>");
  });

  it("injects bodyHtml into #root only when provided", () => {
    expect(renderPage(TEMPLATE, page())).toContain('<div id="root"></div>');
    const out = renderPage(TEMPLATE, page({ bodyHtml: "<main>hi</main>" }));
    expect(out).toMatch(/<div id="root"><div style="[^"]*clip:rect\(0,0,0,0\)[^"]*"><main>hi<\/main><\/div><\/div>/);
    expect(out).not.toMatch(/display:\s*none/);
  });

  it("leaves the template alone for #root with attributes (documented exact-match)", () => {
    const t = TEMPLATE.replace('<div id="root"></div>', '<div id="root" class="x"></div>');
    expect(renderPage(t, page({ bodyHtml: "<main>hi</main>" }))).not.toContain("<main>hi</main>");
  });

  it("preloads above-the-fold fonts with crossorigin, in the head and before the title", () => {
    const html = renderPage(TEMPLATE, page({ preloadFonts: ["/fonts/newsreader-latin.woff2"] }));
    const tag = '<link rel="preload" as="font" type="font/woff2" href="/fonts/newsreader-latin.woff2" crossorigin />';
    expect(html).toContain(tag);
    expect(html.indexOf(tag)).toBeLessThan(html.indexOf("<title>"));
    expect(html.indexOf(tag)).toBeLessThan(html.indexOf("</head>"));
  });

  it("emits no font preload unless asked, and keeps the image preload high priority", () => {
    expect(renderPage(TEMPLATE, page())).not.toContain('as="font"');
    const html = renderPage(TEMPLATE, page({ preloadImage: "https://x/hero.jpg", preloadFonts: ["/fonts/a.woff2"] }));
    expect(html).toContain('<link rel="preload" as="image" href="https://x/hero.jpg" fetchpriority="high" />');
  });

  it("robots values flow through", () => {
    expect(renderPage(TEMPLATE, page({ robots: NOINDEX }))).toContain('name="robots" content="noindex, follow"');
  });

  it("is idempotent when applied to its own output", () => {
    const once = renderPage(TEMPLATE, page({ jsonLd: [{ a: 1 }] }));
    const twice = renderPage(once, page({ jsonLd: [{ a: 1 }] }));
    expect(twice.match(/<title>/g)).toHaveLength(1);
    expect(twice.match(/application\/ld\+json/g)).toHaveLength(1);
  });
});
