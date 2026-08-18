import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useDoctorData } from "@/contexts/DoctorContext";
import { Calendar, ArrowRight, Tag } from "lucide-react";
import { format } from "date-fns";
import AnimatedItem from "@/components/landing/AnimatedItem";
import BlogImagePlaceholder from "./BlogImagePlaceholder";
import {
  Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext, type CarouselApi,
} from "@/components/ui/carousel";
import { cardColorClass, type CardColor } from "@/lib/cardColor";

const CAROUSEL_THRESHOLD = 3;
const PREVIEW_LIMIT = 12;

const DEFAULT_ARTICLES = [
  {
    id: "a1",
    title: "rrrr",
    published_at: "2026-08-06T00:00:00.000Z",
    featured_image_url: "https://lh3.googleusercontent.com/aida-public/AB6AXuCjMRZcQpuNZ8w9n1YPe7xXevqC-cA1-WmeEcw7iKf-IV17P1jv7DBtLv62EdhqrEb2THd0xjMOmyjJ_kcXkcncDTYb3v3cpzR3WYE1BmBl8JL3oIEz-b6yX3bPE0mUOOW3fdshJL6-YPn8Oo7TT93BOwkFCyWQ640xDlcZ7UbwaDqnNBx7ZEybrvzVlMf7xGx48_dVAtc1xCok0zGyOhU6LSBgk1XYI3Jg5smuY_Kk9IiJmeDSpFvC",
  },
  {
    id: "a2",
    title: "eee",
    published_at: "2026-08-06T00:00:00.000Z",
    featured_image_url: "https://lh3.googleusercontent.com/aida-public/AB6AXuB-rFVm38AEyN421lOnRAmYEwjX1I0Qqa53LIT9mnOj9tnXDjkLXayS89ueGVX6NN6_mng0jPdwWcxz4fEjjZEl6dExKpa0JbCPCBbJbuseBU5iGqCiJBOyT0m9D1Cwr_1eqW2cNQKKSVQJP3oihZOrAoR20qwLKP21vK8WIZuyqcHAQK1QBv5s-39qk_o8ltDvbsdKHKwcDqHavFWbc02i6nQ4MnqUliMP7XzIjmZwaZ9MMBFRE6z2",
  },
];

const DesktopBlogCard = ({ post, slug }: { post: any; slug?: string }) => {
  const dateVal = post.published_at || post.created_at;
  return (
    <Link to={`/dr/${slug}/blog/${post.id}`}
      className="hover-lift group bg-card rounded-2xl border border-border shadow-sm overflow-hidden w-full h-full flex flex-col">
      <div className="relative">
        {post.featured_image_url ? (
          <img src={post.featured_image_url} alt={post.title} className="w-full h-44 object-cover" decoding="async" />
        ) : (
          <BlogImagePlaceholder className="h-44" />
        )}
        {post.category && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-pill bg-card/90 backdrop-blur-sm text-royal font-semibold shadow-sm">
            <Tag className="h-3 w-3" /> {post.category}
          </span>
        )}
      </div>
      <div className="py-5 px-[5px] md:px-5 space-y-3 flex flex-col flex-1">
        <h3 className="font-heading font-semibold text-foreground group-hover:text-royal transition-colors line-clamp-2">{post.title}</h3>
        {post.excerpt && <p className="text-sm text-muted-foreground line-clamp-2">{post.excerpt}</p>}
        {dateVal && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {format(new Date(dateVal), "MMM d, yyyy")}
          </div>
        )}
        <span className="inline-flex items-center gap-1 text-sm text-royal font-semibold mt-auto pt-1 group-hover:underline">
          Read More <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
};

const BlogPreview = ({ cardColor = "secondary" }: { cardColor?: CardColor }) => {
  const { profile, settings } = useDoctorData();
  const { slug } = useParams<{ slug: string }>();
  const [posts, setPosts] = useState<any[]>([]);
  const [api, setApi] = useState<CarouselApi>();
  const [selected, setSelected] = useState(0);
  const [activeMobileDot, setActiveMobileDot] = useState(0);

  useEffect(() => {
    if (!profile) return;
    supabase.from("blog_posts").select("*").eq("doctor_id", profile.id).eq("is_published", true)
      .order("published_at", { ascending: false }).limit(PREVIEW_LIMIT)
      .then(({ data }) => setPosts(data || []));
  }, [profile]);

  const displayPosts = posts.length > 0 ? posts : DEFAULT_ARTICLES;
  const useCarouselLayout = posts.length > CAROUSEL_THRESHOLD;

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setSelected(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => { api.off("select", onSelect); };
  }, [api]);

  return (
    <>
      {/* MOBILE VIEW (md:hidden) */}
      <div className="md:hidden">
        <section id="blog" className="py-10 px-4 max-w-5xl mx-auto my-4">
          <div className="flex justify-between items-end mb-6">
            <h2 className="text-2xl font-bold text-text-dark dark:text-foreground">Health Articles</h2>
            <Link
              to={slug ? `/dr/${slug}/blog` : "#"}
              className="text-xs text-primary-500 font-medium hover:underline flex items-center gap-1"
            >
              View All <ArrowRight size={12} />
            </Link>
          </div>

          <div
            className="flex overflow-x-auto hide-scrollbar gap-4 pb-6 snap-x justify-start"
            onScroll={(e) => {
              const target = e.currentTarget;
              const scrollPos = target.scrollLeft;
              const cardWidth = 280;
              const index = Math.round(scrollPos / cardWidth);
              setActiveMobileDot(Math.min(index, displayPosts.length - 1));
            }}
          >
            {displayPosts.map((post: any, idx: number) => {
              const dateVal = post.published_at || post.created_at;
              const formattedDate = dateVal ? format(new Date(dateVal), "MMM d, yyyy") : "Aug 6, 2026";
              const linkTarget = slug && post.id ? `/dr/${slug}/blog/${post.id}` : "#";

              return (
                <div
                  key={post.id || idx}
                  className="min-w-[260px] max-w-[280px] bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700 snap-center shrink-0 flex flex-col justify-between"
                >
                  <div>
                    <img
                      alt={post.title}
                      className="w-full h-32 object-cover bg-gray-200 dark:bg-gray-700"
                      src={post.featured_image_url || DEFAULT_ARTICLES[0].featured_image_url}
                      decoding="async"
                    />
                    <div className="p-4">
                      <h3 className="font-bold text-text-dark dark:text-foreground text-sm mb-2 line-clamp-2">
                        {post.title}
                      </h3>
                      <p className="text-[10px] text-text-muted dark:text-muted-foreground mb-3 flex items-center gap-1">
                        <Calendar size={12} /> {formattedDate}
                      </p>
                    </div>
                  </div>
                  <div className="px-4 pb-4">
                    <Link
                      to={linkTarget}
                      className="text-xs text-primary-500 font-medium inline-flex items-center gap-1 hover:underline"
                    >
                      Read More <ArrowRight size={12} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-center gap-1.5 mt-2">
            {displayPosts.map((_, i) => (
              <div
                key={i}
                className={`transition-all duration-300 ${
                  i === activeMobileDot ? "w-4 h-1.5 rounded-full bg-primary-500" : "w-1.5 h-1.5 rounded-full bg-primary-200 dark:bg-gray-700"
                }`}
              />
            ))}
          </div>
        </section>
      </div>

      {/* DESKTOP VIEW (hidden md:block) */}
      {settings?.show_blog !== false && (
        <div className="hidden md:block">
          <section id="blog-desktop" className={`py-16 md:py-24 ${cardColorClass(cardColor)}`}>
            <div className="container mx-auto px-[5px] md:px-4">
              <div className="flex items-center justify-center gap-6 mb-10">
                <h2 className="font-heading font-bold text-3xl md:text-4xl text-foreground">Health Articles</h2>
                <Link to={`/dr/${slug}/blog`} className="text-sm text-royal font-semibold flex items-center gap-1 hover:underline">
                  View All <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              {posts.length === 0 ? null : !useCarouselLayout ? (
                <div className="flex flex-wrap justify-center gap-6">
                  {posts.map((post, i) => (
                    <AnimatedItem key={post.id} index={i} className="w-full sm:w-[340px]">
                      <DesktopBlogCard post={post} slug={slug} />
                    </AnimatedItem>
                  ))}
                </div>
              ) : (
                <div className="max-w-5xl mx-auto">
                  <Carousel setApi={setApi} opts={{ align: "start", loop: true }} className="px-2">
                    <CarouselContent className="-ml-4 sm:-ml-6">
                      {posts.map((post) => (
                        <CarouselItem key={post.id} className="pl-4 sm:pl-6 basis-1/2 lg:basis-1/3">
                          <DesktopBlogCard post={post} slug={slug} />
                        </CarouselItem>
                      ))}
                    </CarouselContent>
                    <CarouselPrevious className="inline-flex left-1 md:left-2 lg:-left-12 border-border bg-card" />
                    <CarouselNext className="inline-flex right-1 md:right-2 lg:-right-12 border-border bg-card" />
                  </Carousel>
                  <div className="flex justify-center gap-2 mt-6">
                    {posts.map((post, i) => (
                      <button
                        key={post.id}
                        aria-label={`Go to article ${i + 1}`}
                        onClick={() => api?.scrollTo(i)}
                        className={`h-2 rounded-pill transition-all ${i === selected ? "w-6 bg-royal" : "w-2 bg-royal/25"}`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
};

export default BlogPreview;
