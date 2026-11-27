// SEO for a doctor's blog: /dr/:slug/blog and /dr/:slug/blog/:postSlugOrId.
// Shared by the Vercel Edge function (server HTML) and the client pages.
//
// NOTE: relative imports only - Vercel's bundler does not resolve "@/".
import { renderArticleBody } from "./articleHtml";
import { doctorDisplayName, formatDoctorName } from "./doctorSeo";
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
  ai_assisted?: boolean | null;
}

/** encodeURIComponent, plus the RFC 3986 sub-delims it leaves alone (' ( ) * ! are not URL-safe in HTML attributes). */
export function encodePathSegment(raw: string): string {
  return encodeURIComponent(raw).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Percent-encoded `/dr/:slug` path. The one place a doctor slug is encoded for URLs. */
export function doctorPath(doctorSlug: string): string {
  return `/dr/${encodePathSegment(doctorSlug)}`;
}

/**
 * Path for a post: the readable slug when it has one, else the legacy UUID form.
 * Takes RAW slugs and percent-encodes both parts exactly once (slugs are user-controlled).
 */
export function blogPostPath(doctorSlug: string, post: Pick<BlogPostLike, "id" | "slug">): string {
  return `${doctorPath(doctorSlug)}/blog/${encodePathSegment(post.slug || post.id)}`;
}

/** Percent-encoded `/dr/:clinicSlug/doctor/:doctorSlug` path. */
export function practitionerPagePath(clinicSlug: string, doctorSlug: string): string {
  return `${doctorPath(clinicSlug)}/doctor/${encodePathSegment(doctorSlug)}`;
}

export function stripMarkup(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_`>~]/g, " ")
    .replace(/(^|\s)-+(?=\s)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The doctor who wrote a post (public columns of get_public_practitioners). */
export interface BlogPractitioner {
  display_name: string;
  slug: string;
  specialization?: string | null;
  photo_url?: string | null;
}

interface PostInput {
  origin: string;
  doctor: any;
  post: BlogPostLike;
  /** Author of the post when it was written by one doctor of a multi-doctor clinic. */
  practitioner?: BlogPractitioner | null;
  /** Active doctors in the clinic; the doctor is credited as author only when this is 2 or more. */
  clinicTeamSize?: number;
}

/** The doctor to credit, or null (single-doctor clinics and clinic-authored posts stay as they are). */
function authorPractitioner({ practitioner, clinicTeamSize }: PostInput): BlogPractitioner | null {
  return practitioner?.slug && practitioner.display_name && (clinicTeamSize ?? 0) >= 2 ? practitioner : null;
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
  const doctorUrl = `${origin}${doctorPath(doctor.slug)}`;
  const datePublished = post.published_at || post.created_at || undefined;
  const dateModified = post.updated_at || datePublished;
  const bareName = name.replace(/^dr\.?\s+/i, "").trim();
  const author = authorPractitioner(input);
  const person = author
    ? {
        "@type": "Person",
        name: formatDoctorName(author.display_name).replace(/^dr\.?\s+/i, "").trim(),
        honorificPrefix: "Dr.",
        url: `${origin}${practitionerPagePath(doctor.slug, author.slug)}`,
        ...(author.specialization ? { jobTitle: author.specialization } : {}),
      }
    : {
        "@type": "Person",
        name: bareName,
        honorificPrefix: "Dr.",
        url: doctorUrl,
        ...(doctor.specialization ? { jobTitle: doctor.specialization } : {}),
      };
  const authorImage = author ? author.photo_url : doctor.profile_photo_url;
  const worksFor = doctor.clinic_name
    ? {
        worksFor: {
          "@type": "MedicalBusiness",
          name: doctor.clinic_name,
          ...(doctor.city ? { address: { "@type": "PostalAddress", addressLocality: doctor.city, addressCountry: "IN" } } : {}),
        },
      }
    : {};

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
        inLanguage: "en-IN",
        isPartOf: { "@type": "Blog", "@id": `${doctorUrl}/blog#blog`, url: `${doctorUrl}/blog` },
        author: { ...person, ...(authorImage ? { image: authorImage } : {}), ...worksFor },
        ...(post.ai_assisted ? { reviewedBy: person } : {}),
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
  const name = doctorDisplayName(doctor);
  const when = post.published_at || post.created_at || "";
  const summary = post.excerpt?.trim();
  const base = doctorPath(doctor.slug);
  const author = authorPractitioner(input);
  const byline = author
    ? `<a href="${practitionerPagePath(doctor.slug, author.slug)}">${escapeHtml(formatDoctorName(author.display_name))}</a>${author.specialization ? `, ${escapeHtml(author.specialization)}` : ""}`
    : `<a href="${base}">${escapeHtml(name)}</a>${doctor.specialization ? `, ${escapeHtml(doctor.specialization)}` : ""}`;
  return {
    title: meta.title,
    description: meta.description,
    canonical: meta.canonical,
    robots: INDEXABLE,
    ogType: "article",
    image: meta.image,
    jsonLd: [buildBlogPostJsonLd(input)],
    bodyHtml:
      `<main><nav aria-label="Breadcrumb"><a href="${base}">${escapeHtml(name)}</a> / ` +
      `<a href="${base}/blog">Health Articles</a></nav>` +
      `<article><h1>${escapeHtml(post.title)}</h1>` +
      `<p>By ${byline}` +
      `${when ? ` &middot; <time datetime="${escapeHtml(when)}">${escapeHtml(when.slice(0, 10))}</time>` : ""}</p>` +
      `${summary ? `<p>${escapeHtml(summary)}</p>` : ""}` +
      `${renderArticleBody(post.content)}</article></main>`,
  };
}

export function buildBlogListHead(args: { origin: string; doctor: any; posts: BlogPostLike[] }): PageHead {
  const { origin, doctor, posts } = args;
  const name = doctorDisplayName(doctor);
  const canonical = `${origin}${doctorPath(doctor.slug)}/blog`;
  const description = `Clear, practical health articles and medical guidance written by ${name}${doctor.specialization ? ` (${doctor.specialization})` : ""} on Doctylia.`;
  const items = posts
    .map((p) => `<li><a href="${blogPostPath(doctor.slug, p)}">${escapeHtml(p.title)}</a></li>`)
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
              { "@type": "ListItem", position: 1, name, item: `${origin}${doctorPath(doctor.slug)}` },
              { "@type": "ListItem", position: 2, name: "Health Articles", item: canonical },
            ],
          },
        ],
      },
    ],
    bodyHtml: `<main><h1>Health Articles by ${escapeHtml(name)}</h1>${items ? `<ul>${items}</ul>` : ""}</main>`,
  };
}
