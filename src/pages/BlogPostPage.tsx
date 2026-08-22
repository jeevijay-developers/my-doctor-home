import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, Calendar, Clock3, Tag, User } from "lucide-react";
import { format } from "date-fns";
import DOMPurify from "dompurify";
import { supabase } from "@/integrations/supabase/client";
import BlogImagePlaceholder from "@/components/doctor/BlogImagePlaceholder";
import Footer from "@/components/doctor/Footer";
import { markdownToHtml } from "@/lib/markdown";
import type { Tables } from "@/integrations/supabase/types";

type BlogPost = Tables<"blog_posts">;
type Doctor = Tables<"profiles">;

const readingTime = (content: string | null) =>
  Math.max(1, Math.ceil((content || "").replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length / 200));

const displayDoctorName = (doctor: Doctor) => {
  const name = (doctor.display_name || doctor.full_name || "Doctor").trim();
  return /^dr\.?\s/i.test(name) ? name : `Dr. ${name}`;
};

const BlogPostPage = () => {
  const { slug, postId } = useParams<{ slug: string; postId: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug || !postId) {
      setLoading(false);
      return;
    }

    let active = true;
    const load = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("slug", slug)
        .eq("onboarding_completed", true)
        .single();

      if (!active || !profile) {
        if (active) setLoading(false);
        return;
      }

      setDoctor(profile);
      const { data } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("id", postId)
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
    const previousTitle = document.title;
    document.title = `${post?.title ? `${post.title} · ` : ""}${displayDoctorName(doctor)} | Doctylia`;
    return () => { document.title = previousTitle; };
  }, [doctor, post?.title]);

  const sanitizedContent = useMemo(() => {
    const content = post?.content || "";
    const source = /<\/?[a-z][\s\S]*>/i.test(content) ? content : markdownToHtml(content);
    return DOMPurify.sanitize(source, {
      ADD_TAGS: ["iframe"],
      ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "scrolling", "target"],
    });
  }, [post?.content]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-4 text-sm font-semibold text-slate-500">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-[#3C83FC]" />
          Opening article…
        </div>
      </div>
    );
  }

  if (!post || !doctor) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-5 dark:bg-gray-950">
        <div className="max-w-md rounded-3xl border border-blue-100 bg-white p-10 text-center shadow-xl dark:border-blue-900/60 dark:bg-gray-900">
          <BookOpen className="mx-auto h-11 w-11 text-[#3C83FC]" />
          <h1 className="mt-4 font-heading text-2xl font-extrabold text-[#092b50] dark:text-white">Article not found</h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400">This article may have been removed or is no longer published.</p>
          <Link to={`/dr/${slug}`} className="mt-6 inline-flex items-center gap-2 font-bold text-[#3C83FC] hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to doctor's website
          </Link>
        </div>
      </div>
    );
  }

  const doctorName = displayDoctorName(doctor);
  const publishedDate = post.published_at || post.created_at;

  return (
    <>
      <main className="min-h-screen bg-slate-50 dark:bg-gray-950">
      <header className="relative overflow-hidden border-b border-blue-100 bg-white dark:border-blue-950 dark:bg-gray-950">
        <div className="absolute left-1/2 top-0 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-blue-100/60 blur-3xl dark:bg-blue-950/30" />
        <div className="relative mx-auto max-w-5xl px-5 pb-10 pt-7 sm:px-8 sm:pb-14 lg:px-10">
          <Link
            to={`/dr/${slug}/blog`}
            className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-4 py-2 text-sm font-bold text-[#0b3765] shadow-sm transition hover:border-blue-300 hover:text-[#3C83FC] dark:border-gray-700 dark:bg-gray-900 dark:text-blue-100"
          >
            <ArrowLeft className="h-4 w-4" /> All health articles
          </Link>

          <div className="mx-auto mt-10 max-w-4xl text-center sm:mt-14">
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-semibold text-slate-500 dark:text-slate-400 sm:text-sm">
              {post.category && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 font-bold text-[#3C83FC] dark:bg-blue-950/50 dark:text-blue-300">
                  <Tag className="h-3.5 w-3.5" /> {post.category}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5"><Calendar className="h-4 w-4" />{format(new Date(publishedDate), "MMMM d, yyyy")}</span>
              <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4" />{readingTime(post.content)} min read</span>
            </div>

            <h1 className="mt-6 font-heading text-3xl font-black leading-tight tracking-tight text-[#092b50] dark:text-white sm:text-5xl lg:text-6xl">
              {post.title}
            </h1>
            {post.excerpt && <p className="mx-auto mt-6 max-w-3xl text-base leading-7 text-slate-600 dark:text-slate-300 sm:text-xl sm:leading-8">{post.excerpt}</p>}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12 lg:px-10">
        <div className="overflow-hidden rounded-3xl border border-blue-100 bg-blue-50 shadow-[0_18px_55px_rgba(15,43,80,0.12)] dark:border-blue-900/60 dark:bg-gray-900">
          {post.featured_image_url ? (
            <img src={post.featured_image_url} alt={post.title} className="aspect-[16/9] max-h-[560px] w-full object-cover" decoding="async" />
          ) : (
            <BlogImagePlaceholder className="aspect-[16/9] max-h-[560px] w-full" />
          )}
        </div>

        <div className="mx-auto max-w-3xl">
          <div className="relative z-10 -mt-5 mb-10 flex items-center gap-3 rounded-2xl border border-blue-100 bg-white p-4 shadow-lg dark:border-blue-900/60 dark:bg-gray-900 sm:-mt-7 sm:p-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-50 ring-2 ring-blue-100 dark:bg-blue-950 dark:ring-blue-900">
              {doctor.profile_photo_url ? (
                <img src={doctor.profile_photo_url} alt={doctorName} className="h-full w-full object-cover" />
              ) : (
                <User className="h-5 w-5 text-[#3C83FC]" />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-[#092b50] dark:text-white">Reviewed by {doctorName}</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{doctor.specialization || "Medical professional"}</p>
            </div>
          </div>

          <section className="overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-[0_12px_40px_rgba(15,43,80,0.07)] dark:border-blue-900/60 dark:bg-gray-900" aria-labelledby="article-content-heading">
            <div className="border-b border-blue-50 px-6 py-4 dark:border-blue-950 sm:px-10">
              <p id="article-content-heading" className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[#3C83FC]">
                <BookOpen className="h-4 w-4" /> Article content
              </p>
            </div>
            {sanitizedContent ? (
              <article
                className="prose prose-lg prose-slate max-w-none break-words px-6 py-8 leading-8 prose-headings:scroll-mt-24 prose-headings:font-heading prose-headings:font-extrabold prose-headings:leading-tight prose-headings:!text-[#092b50] prose-h1:text-4xl prose-h2:mt-12 prose-h2:text-3xl prose-h3:mt-9 prose-h3:text-2xl prose-p:my-5 prose-p:!text-slate-700 prose-a:font-semibold prose-a:!text-[#3C83FC] prose-a:no-underline hover:prose-a:underline prose-strong:!text-[#092b50] prose-blockquote:rounded-r-2xl prose-blockquote:border-[#3C83FC] prose-blockquote:bg-blue-50 prose-blockquote:px-6 prose-blockquote:py-3 prose-blockquote:not-italic prose-li:!text-slate-700 prose-img:h-auto prose-img:max-w-full prose-img:rounded-2xl [&_iframe]:aspect-video [&_iframe]:h-auto [&_iframe]:w-full [&_iframe]:rounded-2xl [&_table]:w-full [&_table]:border-collapse [&_table]:overflow-hidden [&_td]:border [&_td]:border-slate-200 [&_td]:p-3 [&_th]:border [&_th]:border-slate-200 [&_th]:bg-blue-50 [&_th]:p-3 [&_th]:text-left [&_ul[data-type='taskList']]:list-none [&_ul[data-type='taskList']]:pl-0 dark:prose-invert dark:prose-headings:!text-white dark:prose-p:!text-slate-200 dark:prose-strong:!text-white dark:prose-blockquote:bg-blue-950/40 dark:prose-li:!text-slate-200 dark:[&_td]:border-gray-700 dark:[&_th]:border-gray-700 dark:[&_th]:bg-blue-950/40 sm:px-10 sm:py-10"
                dangerouslySetInnerHTML={{ __html: sanitizedContent }}
              />
            ) : (
              <div className="px-6 py-12 text-center text-slate-500 dark:text-slate-400 sm:px-10">
                Article content is being prepared.
              </div>
            )}
          </section>
          <footer className="mt-14 rounded-3xl bg-gradient-to-br from-[#092b50] to-[#155ba5] p-6 text-white shadow-xl sm:p-8">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-blue-200">Keep learning</p>
            <h2 className="mt-2 font-heading text-2xl font-black">Explore more health guidance</h2>
            <p className="mt-2 text-sm leading-6 text-blue-100">Read more practical articles from {doctorName}.</p>
            <Link to={`/dr/${slug}/blog`} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#3C83FC] px-5 py-3 text-sm font-extrabold text-white transition hover:bg-blue-500">
              View all articles <ArrowRight className="h-4 w-4" />
            </Link>
          </footer>
        </div>
        </div>
      </main>
      <Footer profileOverride={doctor} />
    </>
  );
};

export default BlogPostPage;
