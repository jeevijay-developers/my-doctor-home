import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, BookOpen, CalendarCheck, ChevronRight, Clock3, Info, Sparkles, User,
} from "lucide-react";
import { PUBLIC_PROFILE_COLUMNS } from "@/lib/publicProfileColumns";
import { format } from "date-fns";
import DOMPurify from "dompurify";
import { supabase } from "@/integrations/supabase/client";
import Footer from "@/components/doctor/Footer";
import ArticleToc, { MIN_TOC_HEADINGS } from "@/components/blog/ArticleToc";
import { addHeadingIds } from "@/lib/articleToc";
import { jsonLdScript } from "@/lib/jsonLd";
import { UUID_RE, blogPostPath, buildBlogPostJsonLd, buildBlogPostMeta } from "@/lib/seo/blogSeo";
import { markdownToHtml } from "@/lib/markdown";
import { useClinicTeam } from "@/hooks/useClinicTeam";
import { authorDisplayName, authorHref, resolveBlogAuthor } from "@/lib/blogAuthor";
import type { Tables } from "@/integrations/supabase/types";

type BlogPost = Tables<"blog_posts">;
type Doctor = Tables<"profiles">;
type RelatedPost = Pick<BlogPost, "id" | "title" | "featured_image_url" | "category" | "published_at" | "created_at"> & {
  slug?: string | null;
};

const readingTime = (content: string | null) =>
  Math.max(1, Math.ceil((content || "").replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length / 200));

// `display_name` is an optional override that isn't a column in the generated
// profiles type; the name falls back to `full_name` when it's absent.
type DoctorWithDisplayName = Doctor & { display_name?: string | null };

const displayDoctorName = (doctor: DoctorWithDisplayName) => {
  const name = (doctor.display_name || doctor.full_name || "Doctor").trim();
  return /^dr\.?\s/i.test(name) ? name : `Dr. ${name}`;
};

function upsertMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  const prev = el.content;
  el.content = content;
  return () => {
    if (el) el.content = prev;
  };
}

function upsertCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  const prev = link.href;
  link.href = href;
  return () => {
    if (link) link.href = prev || `${window.location.origin}/`;
  };
}

const Avatar = ({ doctor, name, size }: { doctor: Doctor; name: string; size: number }) => (
  <span
    className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary ring-2 ring-border"
    style={{ width: size, height: size }}
  >
    {doctor.profile_photo_url ? (
      <img src={doctor.profile_photo_url} alt={name} width={size} height={size} decoding="async" className="h-full w-full object-cover" />
    ) : (
      <User className="h-1/2 w-1/2 text-primary" aria-hidden="true" />
    )}
  </span>
);

const BlogPostPage = () => {
  const { slug, postId } = useParams<{ slug: string; postId: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [loading, setLoading] = useState(true);
  const [related, setRelated] = useState<RelatedPost[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!slug || !postId) {
      setLoading(false);
      return;
    }

    let active = true;
    const load = async () => {
      const { data: rawProfile } = await supabase
        .from("profiles")
        .select(PUBLIC_PROFILE_COLUMNS)
        .eq("slug", slug)
        .eq("onboarding_completed", true)
        .single();
      // Explicit column list (anon cannot read the sensitive columns); typed as the full row.
      const profile = rawProfile as unknown as Tables<"profiles"> | null;

      if (!active || !profile) {
        if (active) setLoading(false);
        return;
      }

      setDoctor(profile);
      const { data } = await supabase
        .from("blog_posts")
        .select("*")
        // `slug` exists in the DB but not in the (stale) generated types, hence the cast.
        .eq((UUID_RE.test(postId) ? "id" : "slug") as "id", postId)
        .eq("doctor_id", profile.id)
        .eq("is_published", true)
        .single();

      if (!active) return;
      setPost(data);
      setLoading(false);
    };

    void load();
    return () => { active = false; };
  }, [slug, postId]);

  useEffect(() => {
    if (!doctor) return;
    const seoMeta = post
      ? buildBlogPostMeta({ origin: window.location.origin, doctor, post })
      : null;
    const title = seoMeta?.title ?? `${displayDoctorName(doctor)} | Doctylia`;
    const description =
      seoMeta?.description ?? `Read "Health Article" by ${displayDoctorName(doctor)} on Doctylia.`;
    const canonicalUrl = seoMeta?.canonical || window.location.href;
    const shareImage = seoMeta?.image ?? (doctor.profile_photo_url || "");

    const previousTitle = document.title;
    document.title = title;

    const restoreCanonical = upsertCanonical(canonicalUrl);
    const restoreDesc = upsertMeta('meta[name="description"]', "name", "description", description);
    const restoreOgTitle = upsertMeta('meta[property="og:title"]', "property", "og:title", title);
    const restoreOgDesc = upsertMeta('meta[property="og:description"]', "property", "og:description", description);
    const restoreOgUrl = upsertMeta('meta[property="og:url"]', "property", "og:url", canonicalUrl);
    const restoreOgType = upsertMeta('meta[property="og:type"]', "property", "og:type", "article");
    const restoreTwTitle = upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", title);
    const restoreTwDesc = upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", description);
    const restoreOgImage = shareImage
      ? upsertMeta('meta[property="og:image"]', "property", "og:image", shareImage)
      : () => {};
    const restoreTwImage = shareImage
      ? upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", shareImage)
      : () => {};

    return () => {
      document.title = previousTitle;
      restoreCanonical();
      restoreDesc();
      restoreOgTitle();
      restoreOgDesc();
      restoreOgUrl();
      restoreOgType();
      restoreTwTitle();
      restoreTwDesc();
      restoreOgImage();
      restoreTwImage();
    };
  }, [doctor, post]);

  const sanitizedContent = useMemo(() => {
    const content = post?.content || "";
    const source = /<\/?[a-z][\s\S]*>/i.test(content) ? content : markdownToHtml(content);
    return DOMPurify.sanitize(source, {
      ADD_TAGS: ["iframe"],
      ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "scrolling", "target"],
    });
  }, [post?.content]);

  // Headings get ids after sanitising so the contents list can link to every section.
  const { html: contentHtml, headings } = useMemo(() => addHeadingIds(sanitizedContent), [sanitizedContent]);

  // Per-doctor byline: only for a post that names a doctor, at a clinic with 2+ active doctors.
  // The team is fetched lazily and best-effort; any failure keeps the clinic byline.
  const postPractitionerId = (post as { practitioner_id?: string | null } | null)?.practitioner_id ?? null;
  const team = useClinicTeam(doctor?.id, !!postPractitionerId);
  const author = useMemo(() => (post ? resolveBlogAuthor({ practitioner_id: postPractitionerId }, team) : null), [post, postPractitionerId, team]);

  const structuredData = useMemo(() => {
    if (!post || !doctor) return null;
    return buildBlogPostJsonLd({
      origin: window.location.origin,
      doctor,
      post,
      ...(author
        ? {
            practitioner: {
              display_name: author.practitioner.display_name,
              slug: author.practitioner.slug,
              specialization: author.practitioner.specialization,
              photo_url: author.practitioner.photo_url,
            },
            clinicTeamSize: author.clinicTeamSize,
          }
        : {}),
    });
  }, [post, doctor, author]);

  // "More from this doctor" is a nicety: any failure just hides the row.
  useEffect(() => {
    if (!doctor || !post) return;
    let active = true;
    const loadRelated = async () => {
      try {
        const { data } = await supabase
          .from("blog_posts")
          .select("*")
          .eq("doctor_id", doctor.id)
          .eq("is_published", true)
          .neq("id", post.id)
          .order("published_at", { ascending: false })
          .limit(3);
        if (active && data) setRelated(data as unknown as RelatedPost[]);
      } catch {
        /* optional section */
      }
    };
    void loadRelated();
    return () => { active = false; };
  }, [doctor, post]);

  // Highlights the section being read in the contents list.
  useEffect(() => {
    if (headings.length < MIN_TOC_HEADINGS || typeof IntersectionObserver === "undefined") return;
    const els = headings.map((h) => document.getElementById(h.id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings, contentHtml]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-sm font-semibold text-muted-foreground">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-secondary border-t-primary" />
          Opening article…
        </div>
      </div>
    );
  }

  if (post && doctor && slug && postId && UUID_RE.test(postId) && (post as { slug?: string | null }).slug) {
    return <Navigate to={blogPostPath(slug, post as { id: string; slug?: string | null })} replace />;
  }

  if (!post || !doctor) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-5">
        <div className="max-w-md rounded-3xl border border-border bg-card p-10 text-center shadow-xl">
          <BookOpen className="mx-auto h-11 w-11 text-primary" />
          <h1 className="mt-4 font-heading text-2xl font-extrabold text-navy">Article not found</h1>
          <p className="mt-2 text-muted-foreground">This article may have been removed or is no longer published.</p>
          <Link to={`/dr/${slug}`} className="mt-6 inline-flex items-center gap-2 font-bold text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to doctor's website
          </Link>
        </div>
      </div>
    );
  }

  const doctorName = displayDoctorName(doctor);
  const credentials =
    [doctor.specialization, (doctor as { qualifications?: string | null }).qualifications].filter(Boolean).join(" · ") ||
    "Medical professional";
  const publishedDate = post.published_at || post.created_at;
  const authorName = author ? authorDisplayName(author.practitioner.display_name) : null;
  const authorLink = author ? authorHref(slug!, author.practitioner) : null;
  const bylineCredentials = author?.practitioner.specialization || credentials;
  const bookingHref = `/dr/${slug}#booking`;

  const bookingCard = (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <Avatar doctor={doctor} name={doctorName} size={48} />
        <div className="min-w-0">
          <p className="truncate font-heading text-base font-bold text-navy">{doctorName}</p>
          <p className="truncate text-xs text-muted-foreground">{doctor.specialization || "Medical professional"}</p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Questions about this article? Book an appointment to talk it through with your doctor.
      </p>
      <Link
        to={bookingHref}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <CalendarCheck className="h-4 w-4" aria-hidden="true" /> Book appointment
      </Link>
    </div>
  );

  return (
    <>
      {structuredData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }}
        />
      )}
      <main className="min-h-screen bg-background">
        {/* Slim doctor bar */}
        <div className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-5 sm:px-8">
            <Link to={`/dr/${slug}`} className="flex min-w-0 items-center gap-2.5">
              <Avatar doctor={doctor} name={doctorName} size={32} />
              <span className="truncate font-heading text-sm font-bold text-navy">{doctorName}</span>
            </Link>
            <Link
              to={bookingHref}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 sm:text-sm"
            >
              <CalendarCheck className="h-4 w-4" aria-hidden="true" /> Book appointment
            </Link>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          {/* Header */}
          <header className="max-w-3xl pb-8 pt-6 sm:pb-10 sm:pt-8">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground sm:text-sm">
              <Link to={`/dr/${slug}`} className="hover:text-primary">Home</Link>
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              <Link to={`/dr/${slug}/blog`} className="hover:text-primary">Health articles</Link>
              {post.category && (
                <>
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="font-medium text-primary">{post.category}</span>
                </>
              )}
            </nav>

            <h1 className="mt-5 font-heading text-3xl font-extrabold leading-tight tracking-tight text-navy sm:text-4xl lg:text-5xl">
              {post.title}
            </h1>
            {post.excerpt && (
              <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">{post.excerpt}</p>
            )}

            <div className="mt-6 flex min-w-0 items-center gap-3">
              <Avatar doctor={doctor} name={doctorName} size={44} />
              <div className="min-w-0">
                {authorName ? (
                  authorLink ? (
                    <Link to={authorLink} className="block hover:underline">
                      <p className="truncate text-sm font-bold text-navy">By {authorName}</p>
                    </Link>
                  ) : (
                    <p className="truncate text-sm font-bold text-navy">By {authorName}</p>
                  )
                ) : (
                  <Link to={`/dr/${slug}`} className="block hover:underline">
                    <p className="truncate text-sm font-bold text-navy">Written by {doctorName}</p>
                  </Link>
                )}
                <p className="truncate text-xs text-muted-foreground">{bylineCredentials}</p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{format(new Date(publishedDate), "d MMMM yyyy")}</span>
                  <span aria-hidden="true">•</span>
                  <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{readingTime(post.content)} min read</span>
                </p>
              </div>
            </div>
          </header>

          {/* The image is shown only when the doctor uploaded one: no empty placeholder block. */}
          {post.featured_image_url && (
            <img
              src={post.featured_image_url}
              alt={post.title}
              className="mb-10 aspect-[16/9] max-h-[420px] w-full rounded-2xl object-cover"
              decoding="async"
            />
          )}

          <div className="grid gap-10 pb-14 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-14">
            <div className="min-w-0 max-w-[720px]">
              <ArticleToc headings={headings} activeId={activeId} variant="inline" />

              {contentHtml ? (
                <article
                  ref={articleRef}
                  className="prose prose-lg max-w-none break-words prose-headings:scroll-mt-24 prose-headings:font-heading prose-headings:font-extrabold prose-headings:leading-tight prose-headings:text-navy prose-h2:mt-12 prose-h2:border-l-4 prose-h2:border-primary prose-h2:pl-4 prose-h2:text-2xl sm:prose-h2:text-3xl prose-h3:mt-8 prose-h3:text-xl prose-p:my-5 prose-p:leading-8 prose-p:text-foreground/85 prose-a:font-semibold prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-strong:text-navy prose-li:text-foreground/85 prose-li:marker:text-primary prose-blockquote:rounded-r-xl prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:bg-primary/5 prose-blockquote:px-5 prose-blockquote:py-1 prose-blockquote:not-italic prose-blockquote:text-navy prose-img:h-auto prose-img:max-w-full prose-img:rounded-2xl [&_iframe]:aspect-video [&_iframe]:h-auto [&_iframe]:w-full [&_iframe]:rounded-2xl [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:p-3 [&_th]:border [&_th]:border-border [&_th]:bg-secondary [&_th]:p-3 [&_th]:text-left [&_ul[data-type='taskList']]:list-none [&_ul[data-type='taskList']]:pl-0 dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: contentHtml }}
                />
              ) : (
                <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center text-muted-foreground">
                  Article content is being prepared.
                </div>
              )}

              {/* Notes sit directly under the text so they are read with it. */}
              <div className="mt-10 space-y-3">
                {(post as { ai_assisted?: boolean | null }).ai_assisted && (
                  <p className="flex items-start gap-2 rounded-xl bg-secondary px-4 py-3 text-xs leading-5 text-muted-foreground">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>Drafted with AI assistance, reviewed and published by {authorName ?? doctorName}.</span>
                  </p>
                )}
                <p className="flex items-start gap-2 rounded-xl border border-border px-4 py-3 text-xs leading-5 text-muted-foreground">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span>This article is for general education and is not a substitute for personal medical advice.</span>
                </p>
              </div>

              {/* On phones the booking card follows the article; on desktop it lives in the sidebar. */}
              <div className="mt-8 lg:hidden">{bookingCard}</div>

              <section aria-label="About the author" className="mt-8 flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center">
                <Avatar doctor={doctor} name={doctorName} size={56} />
                <div className="min-w-0 flex-1">
                  <Link to={`/dr/${slug}`} className="font-heading text-base font-bold text-navy hover:underline">
                    About {doctorName}
                  </Link>
                  <p className="mt-0.5 text-sm text-muted-foreground">Read more health guidance from this doctor.</p>
                </div>
                <Link
                  to={`/dr/${slug}/blog`}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-navy transition-colors hover:border-primary hover:text-primary"
                >
                  All articles <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </section>
            </div>

            <aside className="hidden lg:block">
              <div className="sticky top-20 space-y-5">
                <ArticleToc headings={headings} activeId={activeId} variant="sidebar" />
                {bookingCard}
              </div>
            </aside>
          </div>

          {related.length > 0 && (
            <section aria-labelledby="more-articles" className="border-t border-border pb-16 pt-10">
              <h2 id="more-articles" className="font-heading text-xl font-bold text-navy sm:text-2xl">
                More from {doctorName}
              </h2>
              <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((r) => (
                  <li key={r.id}>
                    <Link
                      to={blogPostPath(slug!, { id: r.id, slug: r.slug })}
                      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      {r.featured_image_url && (
                        <img src={r.featured_image_url} alt="" loading="lazy" decoding="async" className="aspect-[16/9] w-full object-cover" />
                      )}
                      <div className="flex flex-1 flex-col p-4">
                        {r.category && <span className="text-xs font-semibold uppercase tracking-wider text-primary">{r.category}</span>}
                        <h3 className="mt-1 line-clamp-3 font-heading text-base font-bold leading-snug text-navy group-hover:text-primary">{r.title}</h3>
                        <span className="mt-auto pt-3 text-xs text-muted-foreground">
                          {format(new Date(r.published_at || r.created_at), "d MMMM yyyy")}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>
      <Footer profileOverride={doctor} />
    </>
  );
};

export default BlogPostPage;
