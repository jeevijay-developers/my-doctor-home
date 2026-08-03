import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useDoctorData } from "@/contexts/DoctorContext";
import { Calendar, ArrowRight, Tag } from "lucide-react";
import { format } from "date-fns";
import AnimatedItem from "@/components/landing/AnimatedItem";

const categoryBorderColors = [
  "border-t-royal/60",
  "border-t-teal/60",
  "border-t-pink/60",
  "border-t-spark/60",
  "border-t-ai-purple/60",
  "border-t-orange/60",
];

const categoryColor = (category: string | null | undefined) => {
  if (!category) return categoryBorderColors[0];
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  return categoryBorderColors[hash % categoryBorderColors.length];
};

const BlogPreview = () => {
  const { profile, settings } = useDoctorData();
  const { slug } = useParams<{ slug: string }>();
  const [posts, setPosts] = useState<any[]>([]);

  useEffect(() => {
    if (!profile) return;
    supabase.from("blog_posts").select("*").eq("doctor_id", profile.id).eq("is_published", true)
      .order("published_at", { ascending: false }).limit(3)
      .then(({ data }) => setPosts(data || []));
  }, [profile]);

  if (!settings?.show_blog || posts.length === 0) return null;

  return (
    <section id="blog" className="py-16 md:py-24 bg-secondary">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between mb-10">
          <h2 className="font-heading font-bold text-3xl md:text-4xl text-primary">Health Articles</h2>
          <Link to={`/dr/${slug}/blog`} className="text-sm text-royal font-medium flex items-center gap-1 hover:underline">
            View All <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="flex flex-wrap justify-center gap-6">
          {posts.map((post, i) => {
            const dateVal = post.published_at || post.created_at;
            return (
              <AnimatedItem key={post.id} index={i} className="w-full sm:w-[340px]">
                <Link to={`/dr/${slug}/blog/${post.id}`}
                  className={`hover-lift group bg-card rounded-xl border border-border border-t-4 ${categoryColor(post.category)} overflow-hidden w-full flex flex-col`}>
                  {post.featured_image_url && (
                    <img src={post.featured_image_url} alt={post.title} className="w-full h-44 object-cover" />
                  )}
                  <div className="p-5 space-y-3">
                    {post.category && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-pill bg-ai-purple/10 text-ai-purple font-medium">
                        <Tag className="h-3 w-3" /> {post.category}
                      </span>
                    )}
                    <h3 className="font-heading font-semibold text-primary group-hover:text-royal transition-colors line-clamp-2">{post.title}</h3>
                    {post.excerpt && <p className="text-sm text-muted-foreground line-clamp-2">{post.excerpt}</p>}
                    {dateVal && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(dateVal), "MMM d, yyyy")}
                      </div>
                    )}
                  </div>
                </Link>
              </AnimatedItem>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default BlogPreview;
