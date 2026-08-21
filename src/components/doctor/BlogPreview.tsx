import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Calendar, Clock3, Tag } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useDoctorData } from "@/contexts/DoctorContext";
import BlogImagePlaceholder from "./BlogImagePlaceholder";
import {
  Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi,
} from "@/components/ui/carousel";
import { cardColorClass, type CardColor } from "@/lib/cardColor";
import type { Tables } from "@/integrations/supabase/types";

const PRIMARY = "#3C83FC";
const PREVIEW_LIMIT = 12;
type BlogPost = Tables<"blog_posts">;

const readingTime = (content: string | null) => Math.max(1, Math.ceil((content || "").replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length / 200));

const ArticleCard = ({ post, slug }: { post: BlogPost; slug: string }) => {
  const date = post.published_at || post.created_at;

  return (
    <Link
      to={`/dr/${slug}/blog/${post.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_10px_30px_rgba(15,43,80,0.07)] transition-all duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_18px_38px_rgba(60,131,252,0.15)] dark:border-blue-900/60 dark:bg-gray-900 dark:hover:border-blue-700"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-blue-50 dark:bg-gray-800">
        {post.featured_image_url ? (
          <img src={post.featured_image_url} alt={post.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" decoding="async" />
        ) : (
          <BlogImagePlaceholder className="h-full w-full" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#092b50]/35 via-transparent to-transparent" />
        {post.category && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/90 px-2.5 py-1 text-[11px] font-bold text-blue-700 shadow-sm backdrop-blur dark:border-white/10 dark:bg-gray-900/90 dark:text-blue-300">
            <Tag className="h-3 w-3" /> {post.category}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-slate-400">
          <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{format(new Date(date), "MMM d, yyyy")}</span>
          <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{readingTime(post.content)} min read</span>
        </div>
        <h3 className="mt-3 line-clamp-2 font-heading text-lg font-extrabold leading-snug text-[#092b50] transition-colors group-hover:text-primary-500 dark:text-white sm:text-xl">
          {post.title}
        </h3>
        {post.excerpt && <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500 dark:text-slate-400">{post.excerpt}</p>}
        <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-primary-500">
          Read Article <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
};

const BlogPreview = ({ cardColor = "secondary" }: { cardColor?: CardColor }) => {
  const { profile, settings } = useDoctorData();
  const { slug } = useParams<{ slug: string }>();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [selectedArticle, setSelectedArticle] = useState(0);
  const [snapCount, setSnapCount] = useState(0);

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    supabase.from("blog_posts").select("*").eq("doctor_id", profile.id).eq("is_published", true)
      .order("published_at", { ascending: false }).limit(PREVIEW_LIMIT)
      .then(({ data }) => {
        setPosts((data || []) as BlogPost[]);
        setLoading(false);
      });
  }, [profile]);

  useEffect(() => {
    if (!carouselApi) return;
    const updateCarousel = () => {
      setSelectedArticle(carouselApi.selectedScrollSnap());
      setSnapCount(carouselApi.scrollSnapList().length);
    };
    updateCarousel();
    carouselApi.on("select", updateCarousel);
    carouselApi.on("reInit", updateCarousel);
    return () => {
      carouselApi.off("select", updateCarousel);
      carouselApi.off("reInit", updateCarousel);
    };
  }, [carouselApi]);

  if (settings?.show_blog === false || loading || posts.length === 0 || !slug) return null;

  return (
    <section id="blog" className={`relative overflow-hidden ${cardColorClass(cardColor)}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 " />
      <div className="relative mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16 lg:px-12 lg:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-heading text-xs font-extrabold uppercase tracking-[0.18em]" style={{ color: PRIMARY }}>Doctor-Written Insights</p>
          <h2 className="mt-3 font-heading text-3xl font-extrabold tracking-[-0.035em] text-[#092b50] dark:text-white sm:text-4xl lg:text-5xl">
            Health <span style={{ color: PRIMARY }}>Articles</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400 sm:text-base">
            Practical, trusted guidance to help you understand your health and make informed decisions.
          </p>
        </div>

        <Carousel setApi={setCarouselApi} opts={{ align: "start", loop: posts.length > 3 }} className="mx-auto mt-9 max-w-6xl sm:mt-12">
          <CarouselContent className="-ml-4 pb-2">
            {posts.map((post) => (
              <CarouselItem key={post.id} className="basis-[90%] pl-4 sm:basis-1/2 lg:basis-1/3">
                <ArticleCard post={post} slug={slug} />
              </CarouselItem>
            ))}
          </CarouselContent>

          <div className="mt-7 flex items-center justify-center gap-4">
            <CarouselPrevious className="static h-10 w-10 translate-y-0 border-blue-200 bg-white text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-gray-900 dark:text-blue-300" />
            <div className="flex items-center gap-1.5">
              {Array.from({ length: snapCount }, (_, index) => (
                <button key={index} type="button" aria-label={`Go to article ${index + 1}`} onClick={() => carouselApi?.scrollTo(index)}
                  className={`h-2 rounded-full transition-all duration-300 ${selectedArticle === index ? "w-6" : "w-2 bg-blue-200 dark:bg-blue-900"}`}
                  style={selectedArticle === index ? { backgroundColor: PRIMARY } : undefined}
                />
              ))}
            </div>
            <CarouselNext className="static h-10 w-10 translate-y-0 border-blue-200 bg-white text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-gray-900 dark:text-blue-300" />
          </div>
        </Carousel>

        <div className="mt-8 text-center">
          <Link to={`/dr/${slug}/blog`} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-primary-500 bg-white px-6 text-sm font-bold text-primary-500 transition-all hover:-translate-y-0.5 hover:bg-blue-50 hover:shadow-md dark:bg-gray-900 dark:hover:bg-blue-950/30">
            View All Articles <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
};

export default BlogPreview;
