import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Calendar, Tag } from "lucide-react";
import { format } from "date-fns";
import AnimatedSection from "@/components/landing/AnimatedSection";

const BlogListPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [posts, setPosts] = useState<any[]>([]);
  const [doctor, setDoctor] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");

  useEffect(() => {
    if (!slug) return;
    const load = async () => {
      const { data: profile } = await supabase
        .from("profiles").select("*").eq("slug", slug).eq("onboarding_completed", true).single();
      if (!profile) { setLoading(false); return; }
      setDoctor(profile);
      const { data } = await supabase
        .from("blog_posts").select("*").eq("doctor_id", profile.id).eq("is_published", true)
        .order("published_at", { ascending: false });
      setPosts(data || []);
      setLoading(false);
    };
    load();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-royal border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="font-heading font-bold text-2xl text-primary mb-2">Not Found</h1>
          <p className="text-muted-foreground">This page doesn't exist.</p>
        </div>
      </div>
    );
  }

  const categories = ["all", ...Array.from(new Set(posts.map((p) => p.category).filter(Boolean)))];
  const filtered = category === "all" ? posts : posts.filter((p) => p.category === category);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-12">
        <div className="container mx-auto px-4">
          <Link to={`/dr/${slug}`} className="inline-flex items-center gap-1 text-primary-foreground/70 hover:text-primary-foreground text-sm mb-4">
            <ArrowLeft className="h-4 w-4" /> Back to Dr. {doctor.full_name}
          </Link>
          <h1 className="font-heading font-bold text-3xl md:text-4xl">Health Articles</h1>
          <p className="text-primary-foreground/70 mt-2">by Dr. {doctor.full_name}, {doctor.specialization}</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        {/* Category Filter */}
        {categories.length > 2 && (
          <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
            {categories.map((c) => (
              <button key={c} onClick={() => setCategory(c)}
                className={`px-4 py-2 rounded-pill text-sm font-medium whitespace-nowrap transition-all ${
                  category === c ? "bg-royal text-white" : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                }`}>
                {c === "all" ? "All Articles" : c}
              </button>
            ))}
          </div>
        )}

        {/* Posts Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((post, i) => (
            <AnimatedSection key={post.id} delay={i * 0.1}>
              <Link to={`/dr/${slug}/blog/${post.id}`} className="group block bg-card rounded-xl border border-border overflow-hidden hover:shadow-lg transition-shadow">
                {post.featured_image_url && (
                  <img src={post.featured_image_url} alt={post.title} className="w-full h-48 object-cover" />
                )}
                <div className="p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    {post.category && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-pill bg-ai-purple/10 text-ai-purple font-medium">
                        <Tag className="h-3 w-3" /> {post.category}
                      </span>
                    )}
                  </div>
                  <h3 className="font-heading font-semibold text-primary group-hover:text-royal transition-colors line-clamp-2">{post.title}</h3>
                  {post.excerpt && <p className="text-sm text-muted-foreground line-clamp-2">{post.excerpt}</p>}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {post.published_at ? format(new Date(post.published_at), "MMM d, yyyy") : ""}
                  </div>
                </div>
              </Link>
            </AnimatedSection>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">No articles published yet.</div>
        )}
      </div>
    </div>
  );
};

export default BlogListPage;
