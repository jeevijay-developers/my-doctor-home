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

// Switch from a static row to a carousel once there are enough articles to page through.
const CAROUSEL_THRESHOLD = 3;
// Homepage teaser — bounded so we don't pull the doctor's entire archive here (see BlogListPage for the full list).
const PREVIEW_LIMIT = 12;

const BlogCard = ({ post, slug }: { post: any; slug?: string }) => {
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
      <div className="p-5 space-y-3 flex flex-col flex-1">
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

  useEffect(() => {
    if (!profile) return;
    supabase.from("blog_posts").select("*").eq("doctor_id", profile.id).eq("is_published", true)
      .order("published_at", { ascending: false }).limit(PREVIEW_LIMIT)
      .then(({ data }) => setPosts(data || []));
  }, [profile]);

  const useCarouselLayout = posts.length > CAROUSEL_THRESHOLD;

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setSelected(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => { api.off("select", onSelect); };
  }, [api]);

  if (!settings?.show_blog || posts.length === 0) return null;

  return (
    <section id="blog" className={`py-16 md:py-24 ${cardColorClass(cardColor)}`}>
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-center gap-6 mb-10">
          <h2 className="font-heading font-bold text-3xl md:text-4xl text-foreground">Health Articles</h2>
          <Link to={`/dr/${slug}/blog`} className="text-sm text-royal font-semibold flex items-center gap-1 hover:underline">
            View All <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {posts.length === 0 ? null : !useCarouselLayout ? (
          <>
            {/* Mobile View: Always swipeable carousel without chevrons */}
            <div className="block md:hidden max-w-5xl mx-auto">
              <Carousel setApi={setApi} opts={{ align: "start", loop: posts.length > 1 }} className="px-2">
                <CarouselContent className="-ml-4">
                  {posts.map((post) => (
                    <CarouselItem key={post.id} className="pl-4 basis-[88%]">
                      <BlogCard post={post} slug={slug} />
                    </CarouselItem>
                  ))}
                </CarouselContent>
              </Carousel>
              {posts.length > 1 && (
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
              )}
            </div>

            {/* Desktop View (<= 3 items): Static grid/flex layout without carousel and without arrows */}
            <div className="hidden md:flex flex-wrap justify-center gap-6">
              {posts.map((post, i) => (
                <AnimatedItem key={post.id} index={i} className="w-full sm:w-[340px]">
                  <BlogCard post={post} slug={slug} />
                </AnimatedItem>
              ))}
            </div>
          </>
        ) : (
          /* Desktop (> 3 items) & Mobile (> 3 items): Carousel */
          <div className="max-w-5xl mx-auto">
            <Carousel setApi={setApi} opts={{ align: "start", loop: true }} className="px-2">
              <CarouselContent className="-ml-4 sm:-ml-6">
                {posts.map((post) => (
                  <CarouselItem key={post.id} className="pl-4 sm:pl-6 basis-[88%] sm:basis-1/2 lg:basis-1/3">
                    <BlogCard post={post} slug={slug} />
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="hidden md:inline-flex left-1 md:left-2 lg:-left-12 border-border bg-card" />
              <CarouselNext className="hidden md:inline-flex right-1 md:right-2 lg:-right-12 border-border bg-card" />
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
  );
};

export default BlogPreview;
