import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { blogPostPath } from "@/lib/seo/blogSeo";
import { supabase } from "@/integrations/supabase/client";
import { useDoctorData } from "@/contexts/DoctorContext";
import OptimizedImage from "@/components/shared/OptimizedImage";
import type { Tables } from "@/integrations/supabase/types";
import { authorDisplayName, resolveBlogAuthor } from "@/lib/blogAuthor";
import SectionHeader from "./ui/SectionHeader";
import { DUR, EASE, staggerDelay } from "./motion/tokens";

type BlogPost = Tables<"blog_posts">;

const PREVIEW_LIMIT = 4;

const readingTime = (content: string | null) =>
  Math.max(1, Math.ceil((content || "").replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length / 200));

const Cover = ({ post, className }: { post: BlogPost; className: string }) =>
  post.featured_image_url ? (
    <OptimizedImage
      src={post.featured_image_url}
      alt=""
      width={720}
      height={450}
      loading="lazy"
      decoding="async"
      className={`${className} object-cover transition-transform duration-ds-4 ease-ds-out group-hover:scale-[1.03]`}
    />
  ) : (
    <div aria-hidden="true" className={`${className} flex items-center justify-center bg-ds-paper-2 font-ds-display text-[4rem] italic text-ds-ink/20`}>
      {post.title.charAt(0)}
    </div>
  );

const meta = (post: BlogPost, author?: string | null) => {
  const date = post.published_at || post.created_at;
  return [author, post.category, format(new Date(date), "d MMM yyyy"), `${readingTime(post.content)} min read`].filter(Boolean).join(" · ");
};

/** Doctor-written articles (spec §5.9): one feature plus a short list. Hidden until there is something to read. */
const BlogPreview = () => {
  const { profile, settings, isTeamClinic, practitioners } = useDoctorData();
  const team = isTeamClinic === true;
  const { slug } = useParams<{ slug: string }>();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    supabase
      .from("blog_posts")
      .select("*")
      .eq("doctor_id", profile.id)
      .eq("is_published", true)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(PREVIEW_LIMIT)
      .then(({ data }) => {
        if (cancelled) return;
        setPosts((data || []) as BlogPost[]);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [profile]);

  if (settings?.show_blog === false || !loaded || !slug) return null;

  if (posts.length === 0) {
    return (
      <section id="blog" aria-labelledby="blog-heading" className="bg-ds-paper-2 py-[4.5rem] md:py-32">
        <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
          <SectionHeader id="blog-heading" eyebrow={team ? "From our doctors" : "Health articles"} title={team ? "Health articles" : "Written by the doctor"} />
          <p className="mt-10 rounded-ds-lg border border-dashed border-ds-line px-6 py-14 text-center text-ds-body text-ds-ink-2 md:mt-14">
            No articles yet. New ones will appear here.
          </p>
        </div>
      </section>
    );
  }

  // Team clinics name the doctor who wrote a post (clinic byline when unknown, see resolveBlogAuthor).
  const authorOf = (post: BlogPost) => {
    if (!team) return null;
    const hit = resolveBlogAuthor(post as { practitioner_id?: string | null }, practitioners ?? null);
    return hit ? authorDisplayName(hit.practitioner.display_name) : null;
  };
  const [feature, ...rest] = posts;
  const href = (post: BlogPost) => blogPostPath(slug, post as { id: string; slug?: string | null });

  return (
    <section id="blog" aria-labelledby="blog-heading" className="bg-ds-paper-2 py-[4.5rem] md:py-32">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
        <SectionHeader
          id="blog-heading"
          eyebrow={team ? "From our doctors" : "Health articles"}
          title={team ? "Health articles" : "Written by the doctor"}
          aside={
            <Link to={`/dr/${slug}/blog`} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-ds-line bg-ds-surface/70 px-6 text-ds-small font-semibold transition-colors hover:border-ds-ink/30">
              All articles <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          }
        />

        <div className="mt-10 grid gap-8 md:mt-14 lg:grid-cols-12 lg:gap-12">
          <motion.article
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: DUR.medium, ease: EASE.out }}
            className="group lg:col-span-7"
          >
            <Link to={href(feature)} className="block">
              <div className="overflow-hidden rounded-ds-lg ring-1 ring-ds-line">
                <Cover post={feature} className="aspect-[16/10] w-full" />
              </div>
              <p className="mt-5 text-ds-label text-ds-ink-3">{meta(feature, authorOf(feature))}</p>
              <h3 className="mt-2 font-ds-display text-ds-h2 font-medium leading-tight underline-offset-[6px] decoration-ds-line group-hover:underline">{feature.title}</h3>
              {feature.excerpt && <p className="mt-3 line-clamp-3 max-w-[56ch] text-ds-lead text-ds-ink-2">{feature.excerpt}</p>}
              <span className="mt-4 inline-flex items-center gap-2 text-ds-small font-semibold text-ds-accent-ink">
                Read article <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform duration-ds-2 group-hover:translate-x-1" />
              </span>
            </Link>
          </motion.article>

          {rest.length > 0 && (
            <ul className="divide-y divide-ds-line border-y border-ds-line self-start lg:col-span-5">
              {rest.map((post, index) => (
                <motion.li
                  key={post.id}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: DUR.medium, ease: EASE.out, delay: staggerDelay(index + 1) }}
                >
                  <Link to={href(post)} className="group grid grid-cols-[1fr_auto] items-center gap-4 py-5">
                    <span className="min-w-0">
                      <span className="block text-ds-label text-ds-ink-3">{meta(post, authorOf(post))}</span>
                      <span className="mt-1 block font-ds-display text-ds-h3 font-medium leading-snug underline-offset-4 decoration-ds-line group-hover:underline">{post.title}</span>
                    </span>
                    <ArrowRight aria-hidden="true" className="h-5 w-5 shrink-0 text-ds-ink-3 transition-transform duration-ds-2 group-hover:translate-x-1" />
                  </Link>
                </motion.li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};

export default BlogPreview;
