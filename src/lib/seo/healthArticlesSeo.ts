// Head + crawlable body for the Health Articles hub (/health-articles[/:category]).
// Rows come from the search_blog_posts / blog_facets RPCs. Each article's canonical URL
// stays on the doctor's site, so the hub only ever links out - never republishes content.
//
// NOTE: relative imports only - Vercel's bundler does not resolve "@/".
import { DIRECTORY_MIN_INDEXABLE } from "../directory/slug";
import { formatDoctorName } from "./doctorSeo";
import { escapeHtml, INDEXABLE, NOINDEX, type PageHead } from "./injectHead";

export const ARTICLES_BASE = "/health-articles";
export const ARTICLES_PAGE_SIZE = 12;

export interface HubArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  category: string | null;
  featured_image_url: string | null;
  published_at: string | null;
  updated_at: string | null;
  reading_minutes: number;
  doctor_slug: string;
  doctor_name: string | null;
  doctor_specialization: string | null;
  doctor_city: string | null;
  doctor_photo_url: string | null;
}

export interface ArticleFacet {
  slug: string;
  label: string;
  post_count: number | string;
}

export interface ArticlesContext {
  origin: string;
  categorySlug?: string;
  categoryLabel?: string;
  page: number;
  articles: HubArticle[];
  total: number;
  facets: ArticleFacet[];
}

export function articlesPath(categorySlug?: string, page = 1): string {
  const base = categorySlug ? `${ARTICLES_BASE}/${categorySlug}` : ARTICLES_BASE;
  return page > 1 ? `${base}?page=${page}` : base;
}

/** Canonical article URL (on the doctor's site). */
export function articlePath(a: Pick<HubArticle, "doctor_slug" | "slug" | "id">): string {
  return `/dr/${a.doctor_slug}/blog/${a.slug || a.id}`;
}

export function totalPages(total: number): number {
  return Math.max(1, Math.ceil(total / ARTICLES_PAGE_SIZE));
}

export function isArticlesIndexable(total: number, categorySlug?: string): boolean {
  return categorySlug ? total >= DIRECTORY_MIN_INDEXABLE : total > 0;
}

export function articlesHeading(categoryLabel?: string): string {
  return categoryLabel ? `${categoryLabel} Articles by Doctors` : "Health Articles by Doctors";
}

const enc = encodeURIComponent;
const href = (a: HubArticle) => `/dr/${enc(a.doctor_slug)}/blog/${enc(a.slug || a.id)}`;

export function buildArticlesHead(ctx: ArticlesContext): PageHead {
  const { origin, categorySlug, categoryLabel, page, articles, total, facets } = ctx;
  const pages = totalPages(total);
  const canonical = `${origin}${articlesPath(categorySlug, page)}`;
  const h1 = articlesHeading(categoryLabel);
  const suffix = page > 1 ? ` - Page ${page}` : "";
  const noun = total === 1 ? "article" : "articles";

  const title = categoryLabel
    ? `${categoryLabel} Articles by Doctors${suffix} | Doctylia`
    : `Health Articles Written by Doctors in India${suffix} | Doctylia`;
  const description = categoryLabel
    ? `Read ${total} ${categoryLabel.toLowerCase()} ${noun} written by practising doctors in India. Clear, patient-friendly guidance, each linked to the author's clinic.`
    : `Read ${total} health ${noun} written by practising doctors across India. Browse by topic, from heart health to skin care, then book an appointment with the author.`;

  const itemList = articles.map((a, i) => ({
    "@type": "ListItem",
    position: (page - 1) * ARTICLES_PAGE_SIZE + i + 1,
    url: `${origin}${articlePath(a)}`,
    name: a.title,
  }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${canonical}#page`,
        name: h1,
        description,
        url: canonical,
        inLanguage: "en-IN",
        isPartOf: { "@type": "WebSite", name: "Doctylia", url: `${origin}/` },
        mainEntity: { "@type": "ItemList", numberOfItems: total, itemListElement: itemList },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Doctylia", item: `${origin}/` },
          { "@type": "ListItem", position: 2, name: "Health Articles", item: `${origin}${ARTICLES_BASE}` },
          ...(categoryLabel
            ? [{ "@type": "ListItem", position: 3, name: categoryLabel, item: `${origin}${articlesPath(categorySlug)}` }]
            : []),
        ],
      },
    ],
  };

  const list = articles
    .map((a) => {
      const who = [formatDoctorName(a.doctor_name ?? ""), a.doctor_specialization, a.doctor_city]
        .filter(Boolean)
        .map((s) => escapeHtml(String(s)))
        .join(", ");
      return (
        `<li><article><h2><a href="${href(a)}">${escapeHtml(a.title)}</a></h2>` +
        `${a.excerpt ? `<p>${escapeHtml(a.excerpt)}</p>` : ""}` +
        `<p>By <a href="/dr/${enc(a.doctor_slug)}">${who}</a></p></article></li>`
      );
    })
    .join("");

  const topics = facets
    .map((f) => `<a href="${ARTICLES_BASE}/${enc(f.slug)}">${escapeHtml(f.label)}</a> (${Number(f.post_count)})`)
    .join(" ");

  const prev = page > 1 ? `<a rel="prev" href="${articlesPath(categorySlug, page - 1)}">Previous</a>` : "";
  const next = page < pages ? `<a rel="next" href="${articlesPath(categorySlug, page + 1)}">Next</a>` : "";

  return {
    title,
    description,
    canonical,
    robots: isArticlesIndexable(total, categorySlug) ? INDEXABLE : NOINDEX,
    jsonLd: [jsonLd],
    bodyHtml:
      `<main><h1>${escapeHtml(h1)}</h1>` +
      `<p>${escapeHtml(description)}</p>` +
      `${list ? `<ul>${list}</ul>` : ""}` +
      `${prev || next ? `<nav aria-label="Pagination">${prev}${next}</nav>` : ""}` +
      `${topics ? `<nav aria-label="Topics">${topics}</nav>` : ""}</main>`,
  };
}
