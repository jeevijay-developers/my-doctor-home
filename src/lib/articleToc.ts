// Table of contents for the single-article page. The article body is already-sanitised HTML
// (doctor-written, from the editor or Markdown), so the headings are found in the markup itself.

export interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

const slugifyHeading = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/**
 * Gives every h2/h3 a stable, unique id (keeping any id the author already set) and returns the
 * resulting list, so the page can link to each section. Pass HTML that is already sanitised.
 */
export function addHeadingIds(html: string): { html: string; headings: TocItem[] } {
  if (!html || typeof DOMParser === "undefined") return { html, headings: [] };

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const used = new Set<string>();
  const headings: TocItem[] = [];

  doc.body.querySelectorAll("h2, h3").forEach((el) => {
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) return;

    let id = el.id || slugifyHeading(text) || "section";
    const base = id;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    el.id = id;

    headings.push({ id, text, level: el.tagName === "H2" ? 2 : 3 });
  });

  return { html: doc.body.innerHTML, headings };
}
