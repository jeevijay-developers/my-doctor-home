import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { blogPostPath } from "@/lib/seo/blogSeo";
import type { Tables } from "@/integrations/supabase/types";
import SectionHeader from "../ui/SectionHeader";

type BlogPost = Tables<"blog_posts">;

const LIMIT = 4;

const readingTime = (content: string | null) =>
  Math.max(1, Math.ceil((content || "").replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length / 200));

/** This doctor's published articles. Best-effort: a failed or empty lookup yields nothing and the section hides. */
function usePractitionerArticles(clinicId: string | undefined, practitionerId: string, enabled: boolean): BlogPost[] {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  useEffect(() => {
    setPosts([]);
    if (!clinicId || !enabled) return;
    let active = true;
    (async () => {
      try {
        const { data } = await supabase
          .from("blog_posts")
          .select("*")
          .eq("doctor_id", clinicId)
          .eq("practitioner_id", practitionerId)
          .eq("is_published", true)
          .order("published_at", { ascending: false, nullsFirst: false })
          .limit(LIMIT);
        if (active && Array.isArray(data)) setPosts(data as BlogPost[]);
      } catch {
        /* optional section */
      }
    })();
    return () => { active = false; };
  }, [clinicId, practitionerId, enabled]);
  return posts;
}

type Props = { clinicId: string | undefined; clinicSlug: string; doctorId: string; doctorSlug: string; name: string; enabled: boolean };

/** "Articles by Dr X": hidden when the doctor has written none (or the clinic hides its articles). */
const DoctorArticles = ({ clinicId, clinicSlug, doctorId, doctorSlug, name, enabled }: Props) => {
  const posts = usePractitionerArticles(clinicId, doctorId, enabled);
  if (posts.length === 0) return null;
  return (
    <section id="blog" aria-labelledby="doctor-articles-heading" className="py-[4.5rem] md:py-28">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
        <SectionHeader
          id="doctor-articles-heading"
          eyebrow="Health articles"
          title={`Articles by ${name}`}
          aside={
            <Link
              to={`/dr/${encodeURIComponent(clinicSlug)}/blog?author=${encodeURIComponent(doctorSlug)}`}
              className="inline-flex min-h-12 items-center gap-2 rounded-full border border-ds-line bg-ds-surface/70 px-6 text-ds-small font-semibold transition-colors hover:border-ds-ink/30"
            >
              All articles by {name} <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          }
        />
        <ul className="mt-8 divide-y divide-ds-line border-y border-ds-line md:mt-12">
          {posts.map((post) => (
            <li key={post.id}>
              <Link
                to={blogPostPath(clinicSlug, post as { id: string; slug?: string | null })}
                className="group grid grid-cols-[1fr_auto] items-center gap-4 py-5"
              >
                <span className="min-w-0">
                  <span className="block text-ds-label text-ds-ink-3">
                    {[post.category, format(new Date(post.published_at || post.created_at), "d MMM yyyy"), `${readingTime(post.content)} min read`].filter(Boolean).join(" · ")}
                  </span>
                  <span className="mt-1 block break-words font-ds-display text-ds-h3 font-medium leading-snug underline-offset-4 decoration-ds-line group-hover:underline">
                    {post.title}
                  </span>
                </span>
                <ArrowRight aria-hidden="true" className="h-5 w-5 shrink-0 text-ds-ink-3 transition-transform duration-ds-2 group-hover:translate-x-1" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default DoctorArticles;
