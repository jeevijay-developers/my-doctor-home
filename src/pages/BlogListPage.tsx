import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, Calendar, Clock3, Tag, User } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import BlogImagePlaceholder from "@/components/doctor/BlogImagePlaceholder";
import type { Tables } from "@/integrations/supabase/types";

type BlogPost = Tables<"blog_posts">;
type Doctor = Tables<"profiles">;

const readingTime = (content: string | null) =>
  Math.max(1, Math.ceil((content || "").replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length / 200));

const displayDoctorName = (doctor: Doctor) => {
  const name = (doctor.display_name || doctor.full_name || "Doctor").trim();
  return /^dr\.?\s/i.test(name) ? name : `Dr. ${name}`;
};

const BlogListPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      return;
    }

    let active = true;
    let doctorId: string | null = null;

    const loadPosts = async (id: string) => {
      const { data } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("doctor_id", id)
        .eq("is_published", true)
        .order("published_at", { ascending: false });
      if (active) setPosts((data || []) as BlogPost[]);
    };

    const load = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("slug", slug)
        .eq("onboarding_completed", true)
        .single();

      if (!active) return;
      if (!profile) {
        setLoading(false);
        return;
      }

      setDoctor(profile);
      doctorId = profile.id;
      await loadPosts(profile.id);
      if (active) setLoading(false);
    };

    void load();
    const channel = supabase
      .channel(`blog-${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "blog_posts" }, () => {
        if (doctorId) void loadPosts(doctorId);
      })
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [slug]);

  useEffect(() => {
    if (!doctor) return;
    const previousTitle = document.title;
    document.title = `Health Articles · ${displayDoctorName(doctor)} | Doctylia`;
    return () => { document.title = previousTitle; };
  }, [doctor]);

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(posts.map((post) => post.category).filter((value): value is string => Boolean(value))))],
    [posts],
  );
  const filteredPosts = category === "all" ? posts : posts.filter((post) => post.category === category);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-4 text-sm font-semibold text-slate-500">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-[#3C83FC]" />
          Loading health articles…
        </div>
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-5 dark:bg-gray-950">
        <div className="max-w-md rounded-3xl border border-blue-100 bg-white p-10 text-center shadow-xl dark:border-blue-900/60 dark:bg-gray-900">
          <BookOpen className="mx-auto h-11 w-11 text-[#3C83FC]" />
          <h1 className="mt-4 font-heading text-2xl font-extrabold text-[#092b50] dark:text-white">Page not found</h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400">This doctor's article page is not available.</p>
        </div>
      </div>
    );
  }

  const doctorName = displayDoctorName(doctor);

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-gray-950">
      <header className="relative isolate overflow-hidden bg-gradient-to-br from-[#071f3b] via-[#0b3f78] to-[#3C83FC] text-white">
        <div className="absolute -right-20 -top-28 h-80 w-80 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-32 left-1/4 h-72 w-72 rounded-full bg-cyan-300/15 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-5 pb-16 pt-7 sm:px-8 sm:pb-20 lg:px-10">
          <Link
            to={`/dr/${slug}`}
            className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
          >
            <ArrowLeft className="h-4 w-4" /> Doctor's website
          </Link>

          <div className="mt-12 max-w-3xl sm:mt-16">
            <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.2em] text-blue-100">
              <BookOpen className="h-4 w-4" /> Health library
            </span>
            <h1 className="mt-4 font-heading text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">Health Articles</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-blue-50 sm:text-lg">
              Clear, practical health guidance from {doctorName}{doctor.specialization ? `, ${doctor.specialization}` : ""}.
            </p>
          </div>

          <div className="mt-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border-2 border-white/50 bg-white/15">
              {doctor.profile_photo_url ? (
                <img src={doctor.profile_photo_url} alt={doctorName} className="h-full w-full object-cover" />
              ) : (
                <User className="h-5 w-5" />
              )}
            </div>
            <div>
              <p className="text-sm font-bold">Written by {doctorName}</p>
              <p className="text-xs text-blue-100">{posts.length} {posts.length === 1 ? "published article" : "published articles"}</p>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14 lg:px-10">
        {categories.length > 1 && (
          <div className="mb-9 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Filter articles by category">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition ${
                  category === item
                    ? "border-[#3C83FC] bg-[#3C83FC] text-white "
                    : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-[#3C83FC] dark:border-gray-700 dark:bg-gray-900 dark:text-slate-300"
                }`}
              >
                {item === "all" ? "All Articles" : item}
              </button>
            ))}
          </div>
        )}

        {filteredPosts.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPosts.map((post) => {
              const publishedDate = post.published_at || post.created_at;
              return (
                <Link
                  key={post.id}
                  to={`/dr/${slug}/blog/${post.id}`}
                  className="group flex min-w-0 flex-col overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-[0_10px_30px_rgba(15,43,80,0.07)] transition-all duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_18px_40px_rgba(60,131,252,0.16)] dark:border-blue-900/60 dark:bg-gray-900"
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-blue-50 dark:bg-gray-800">
                    {post.featured_image_url ? (
                      <img src={post.featured_image_url} alt={post.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" decoding="async" />
                    ) : (
                      <BlogImagePlaceholder className="h-full w-full" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#092b50]/40 via-transparent to-transparent" />
                    {post.category && (
                      <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full border border-white/60 bg-white/90 px-3 py-1 text-xs font-bold text-blue-700 shadow-sm backdrop-blur dark:border-white/10 dark:bg-gray-900/90 dark:text-blue-300">
                        <Tag className="h-3 w-3" /> {post.category}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-5 sm:p-6">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-400">
                      <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{format(new Date(publishedDate), "MMM d, yyyy")}</span>
                      <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{readingTime(post.content)} min read</span>
                    </div>
                    <h2 className="mt-3 line-clamp-2 font-heading text-xl font-extrabold leading-snug text-[#092b50] transition-colors group-hover:text-[#3C83FC] dark:text-white sm:text-2xl">
                      {post.title}
                    </h2>
                    {post.excerpt && <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-500 dark:text-slate-400">{post.excerpt}</p>}
                    <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-[#3C83FC]">
                      Read Article <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-blue-200 bg-white px-6 py-16 text-center dark:border-blue-900 dark:bg-gray-900">
            <BookOpen className="mx-auto h-12 w-12 text-blue-200 dark:text-blue-800" />
            <h2 className="mt-4 font-heading text-xl font-extrabold text-[#092b50] dark:text-white">No articles here yet</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">New health guidance will appear here when it is published.</p>
          </div>
        )}
      </section>
    </main>
  );
};

export default BlogListPage;
