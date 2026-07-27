import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Calendar, Tag, User } from "lucide-react";
import { format } from "date-fns";
import DOMPurify from "dompurify";

const BlogPostPage = () => {
  const { slug, postId } = useParams<{ slug: string; postId: string }>();
  const [post, setPost] = useState<any>(null);
  const [doctor, setDoctor] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug || !postId) return;
    const load = async () => {
      const { data: profile } = await supabase
        .from("profiles").select("*").eq("slug", slug).eq("onboarding_completed", true).single();
      if (!profile) { setLoading(false); return; }
      setDoctor(profile);
      const { data } = await supabase
        .from("blog_posts").select("*").eq("id", postId).eq("is_published", true).single();
      setPost(data);
      setLoading(false);
    };
    load();
  }, [slug, postId]);

  useEffect(() => {
    if (!doctor?.display_name) return;
    const prev = document.title;
    const name = doctor.display_name.trim();
    const formatted = /^dr\.?\s/i.test(name) ? name : `Dr. ${name}`;
    const postTitle = post?.title ? `${post.title} · ` : "";
    document.title = `${postTitle}${formatted} | Doctylia`;
    return () => { document.title = prev; };
  }, [doctor?.display_name, post?.title]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-royal border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!post || !doctor) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="font-heading font-bold text-2xl text-primary mb-2">Article Not Found</h1>
          <p className="text-muted-foreground">This article doesn't exist or has been removed.</p>
          <Link to={`/dr/${slug}`} className="text-royal hover:underline mt-4 inline-block">← Back to doctor page</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-8">
        <div className="container mx-auto px-4 max-w-3xl">
          <Link to={`/dr/${slug}/blog`} className="inline-flex items-center gap-1 text-primary-foreground/70 hover:text-primary-foreground text-sm mb-4">
            <ArrowLeft className="h-4 w-4" /> All Articles
          </Link>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-3xl py-10">
        {/* Meta */}
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-4">
          {post.category && (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-pill bg-ai-purple/10 text-ai-purple font-medium">
              <Tag className="h-3 w-3" /> {post.category}
            </span>
          )}
          {post.published_at && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" /> {format(new Date(post.published_at), "MMMM d, yyyy")}
            </span>
          )}
        </div>

        <h1 className="font-heading font-bold text-3xl md:text-4xl text-primary mb-6 leading-tight">{post.title}</h1>

        {post.excerpt && (
          <p className="text-lg text-muted-foreground mb-8 leading-relaxed border-l-4 border-royal pl-4">{post.excerpt}</p>
        )}

        {post.featured_image_url && (
          <img src={post.featured_image_url} alt={post.title} className="w-full rounded-xl mb-8 object-cover max-h-96" />
        )}

        {/* Author Bar */}
        <div className="flex items-center gap-3 mb-8 p-4 rounded-xl bg-secondary">
          <div className="w-10 h-10 rounded-full bg-royal/10 flex items-center justify-center overflow-hidden">
            {doctor.profile_photo_url ? (
              <img src={doctor.profile_photo_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <User className="h-5 w-5 text-royal" />
            )}
          </div>
          <div>
            <p className="font-heading font-semibold text-primary text-sm">Dr. {doctor.full_name}</p>
            <p className="text-xs text-muted-foreground">{doctor.specialization}</p>
          </div>
        </div>

        {/* Content */}
        <article
          className="prose prose-slate max-w-none leading-relaxed prose-headings:font-heading prose-headings:text-primary prose-a:text-royal prose-img:rounded-xl"
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(
              /<\/?[a-z][\s\S]*>/i.test(post.content || "")
                ? (post.content || "")
                : (post.content || "").split("\n").map((p: string) => {
                    if (!p.trim()) return "";
                    if (p.startsWith("## ")) return `<h3>${p.slice(3)}</h3>`;
                    if (p.startsWith("# ")) return `<h2>${p.slice(2)}</h2>`;
                    if (p.startsWith("- ")) return `<li>${p.slice(2)}</li>`;
                    return `<p>${p}</p>`;
                  }).join(""),
              { ADD_TAGS: ["iframe"], ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "scrolling", "target"] }
            ),
          }}
        />


        {/* Back Link */}
        <div className="mt-12 pt-8 border-t border-border">
          <Link to={`/dr/${slug}/blog`} className="text-royal hover:underline font-medium">← More articles by Dr. {doctor.full_name}</Link>
        </div>
      </div>
    </div>
  );
};

export default BlogPostPage;
