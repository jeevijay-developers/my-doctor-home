// SEO for a doctor's blog: /dr/:slug/blog and /dr/:slug/blog/:postSlugOrId.
// Shared by the Vercel Edge function (server HTML) and the client pages.
//
// NOTE: relative imports only - Vercel's bundler does not resolve "@/".
import { doctorDisplayName } from "./doctorSeo";
import { escapeHtml, INDEXABLE, type PageHead } from "./injectHead";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface BlogPostLike {
  id: string;
  slug?: string | null;
  title: string;
  excerpt?: string | null;
  content?: string | null;
  category?: string | null;
  featured_image_url?: string | null;
  published_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/** Path for a post: the readable slug when it has one, else the legacy UUID form. */
export function blogPostPath(doctorSlug: string, post: Pick<BlogPostLike, "id" | "slug">): string {
  return `/dr/${doctorSlug}/blog/${post.slug || post.id}`;
}

export function stripMarkup(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_`>~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface PostInput {
  origin: string;
  doctor: any;
  post: BlogPostLike;
}

export function buildBlogPostMeta({ origin, doctor, post }: PostInput) {
  const name = doctorDisplayName(doctor);
  const description =
    post.excerpt?.trim() ||
    stripMarkup(post.content).slice(0, 160) ||
    `Read "${post.title || "Health Article"}" by ${name}${doctor.specialization ? ` (${doctor.specialization})` : ""} on Doctylia.`;
  return {
    title: `${post.title ? `${post.title} · ` : ""}${name} | Doctylia`,
    description,
    canonical: `${origin}${blogPostPath(doctor.slug, post)}`,
    image: (post.featured_image_url || doctor.profile_photo_url || "") as string,
  };
}

export function buildBlogPostJsonLd(input: PostInput) {
  const { origin, doctor, post } = input;
  const meta = buildBlogPostMeta(input);
  const name = doctorDisplayName(doctor);
  const doctorUrl = `${origin}/dr/${doctor.slug}`;
  const datePublished = post.published_at || post.created_at || undefined;
  const dateModified = post.updated_at || datePublished;
  const specialty = doctor.specialization ? { medicalSpecialty: doctor.specialization } : {};

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        "@id": `${meta.canonical}#article`,
        headline: post.title,
        description: meta.description,
        url: meta.canonical,
        mainEntityOfPage: { "@type": "WebPage", "@id": meta.canonical },
        ...(datePublished ? { datePublished } : {}),
        ...(dateModified ? { dateModified } : {}),
        ...(post.category ? { articleSection: post.category } : {}),
        ...(meta.image ? { image: [meta.image] } : {}),
        author: {
          "@type": "Physician",
          name,
          url: doctorUrl,
          ...specialty,
          ...(doctor.profile_photo_url ? { image: doctor.profile_photo_url } : {}),
        },
        reviewedBy: { "@type": "Physician", name, url: doctorUrl, ...specialty },
        publisher: { "@type": "Organization", name: "Doctylia", url: "https://doctylia.com/" },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name, item: doctorUrl },
          { "@type": "ListItem", position: 2, name: "Health Articles", item: `${doctorUrl}/blog` },
          { "@type": "ListItem", position: 3, name: post.title, item: meta.canonical },
        ],
      },
    ],
  };
}

export function buildBlogPostHead(input: PostInput): PageHead {
  const { doctor, post } = input;
  const meta = buildBlogPostMeta(input);
  const text = stripMarkup(post.content).slice(0, 3000);
  const name = doctorDisplayName(doctor);
  return {
    title: meta.title,
    description: meta.description,
    canonical: meta.canonical,
    robots: INDEXABLE,
    ogType: "article",
    image: meta.image,
    jsonLd: [buildBlogPostJsonLd(input)],
    bodyHtml:
      `<main><nav aria-label="Breadcrumb"><a href="/dr/${encodeURIComponent(doctor.slug)}">${escapeHtml(name)}</a> / ` +
      `<a href="/dr/${encodeURIComponent(doctor.slug)}/blog">Health Articles</a></nav>` +
      `<article><h1>${escapeHtml(post.title)}</h1>${text ? `<p>${escapeHtml(text)}</p>` : ""}</article></main>`,
  };
}

export function buildBlogListHead(args: { origin: string; doctor: any; posts: BlogPostLike[] }): PageHead {
  const { origin, doctor, posts } = args;
  const name = doctorDisplayName(doctor);
  const canonical = `${origin}/dr/${doctor.slug}/blog`;
  const description = `Clear, practical health articles and medical guidance written by ${name}${doctor.specialization ? ` (${doctor.specialization})` : ""} on Doctylia.`;
  const items = posts
    .map((p) => `<li><a href="${blogPostPath(encodeURIComponent(doctor.slug), p)}">${escapeHtml(p.title)}</a></li>`)
    .join("");
  return {
    title: `Health Articles · ${name} | Doctylia`,
    description,
    canonical,
    // An empty blog is a thin page; keep it out of the index until there is something to read.
    robots: posts.length > 0 ? INDEXABLE : "noindex, follow",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "ItemList",
            name: `Health Articles by ${name}`,
            itemListElement: posts.map((p, i) => ({
              "@type": "ListItem",
              position: i + 1,
              url: `${origin}${blogPostPath(doctor.slug, p)}`,
              name: p.title,
            })),
          },
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name, item: `${origin}/dr/${doctor.slug}` },
              { "@type": "ListItem", position: 2, name: "Health Articles", item: canonical },
            ],
          },
        ],
      },
    ],
    bodyHtml: `<main><h1>Health Articles by ${escapeHtml(name)}</h1>${items ? `<ul>${items}</ul>` : ""}</main>`,
  };
}
