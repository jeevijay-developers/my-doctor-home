import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { FileText, Plus, Search, Pencil, Trash2, Eye, EyeOff, Sparkles, Loader2, Image as ImageIcon, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import RichTextEditor from "./RichTextEditor";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { FEATURE_KEYS } from "@/lib/features";
import LockedFeatureCard from "./LockedFeatureCard";

type BlogPost = {
  id: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  category: string | null;
  featured_image_url: string | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

const categories = [
  "General Health", "Heart Health", "Diabetes", "Skin Care", "Mental Health",
  "Nutrition", "Fitness", "Women's Health", "Children's Health", "Prevention",
];

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_IMAGE_MB = 5;

const BlogPage = () => {
  const { profile, can } = useProfile();
  const { hasFeature } = useFeatureAccess();
  const isPremium = hasFeature(FEATURE_KEYS.AI_BLOG_WRITER);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [form, setForm] = useState({
    title: "", excerpt: "", content: "", category: "", is_published: false,
    featured_image_url: "" as string | null,
  });

  const load = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("blog_posts")
      .select("*")
      .eq("doctor_id", profile.id)
      .order("created_at", { ascending: false });
    setPosts((data || []) as BlogPost[]);
  };

  useEffect(() => { load(); }, [profile]);

  const openNew = () => {
    setEditing(null);
    setForm({ title: "", excerpt: "", content: "", category: "", is_published: false, featured_image_url: "" });
    setShowEditor(true);
  };

  const openEdit = (post: BlogPost) => {
    setEditing(post);
    setForm({
      title: post.title,
      excerpt: post.excerpt || "",
      content: post.content || "",
      category: post.category || "",
      is_published: post.is_published,
      featured_image_url: post.featured_image_url || "",
    });
    setShowEditor(true);
  };

  const uploadFeaturedImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file || !profile) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast({ title: "Unsupported file type", description: "Please upload a JPG, PNG, or WebP image.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      toast({ title: "Image too large", description: `Please upload an image under ${MAX_IMAGE_MB}MB.`, variant: "destructive" });
      return;
    }

    setImageUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${profile.id}/blog/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("doctor-uploads").upload(path, file);
    setImageUploading(false);
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from("doctor-uploads").getPublicUrl(path);
    setForm((f) => ({ ...f, featured_image_url: publicUrl }));
    toast({ title: "Image uploaded" });
  };

  const removeFeaturedImage = () => setForm((f) => ({ ...f, featured_image_url: "" }));

  // Auto-enable show_blog once, the very first time a post gets published for this doctor.
  const maybeAutoEnableBlogVisibility = async () => {
    if (!profile) return;
    const { data: ws } = await supabase
      .from("website_settings")
      .select("show_blog, blog_auto_enabled")
      .eq("doctor_id", profile.id)
      .single();
    // Only auto-enable once: if we haven't auto-enabled before AND it's currently off.
    if (ws && !(ws as any).blog_auto_enabled && !ws.show_blog) {
      await supabase
        .from("website_settings")
        .update({ show_blog: true, blog_auto_enabled: true } as any)
        .eq("doctor_id", profile.id);
      toast({ title: "Blog is now live on your website" });
    } else if (ws && !(ws as any).blog_auto_enabled) {
      await supabase
        .from("website_settings")
        .update({ blog_auto_enabled: true } as any)
        .eq("doctor_id", profile.id);
    }
  };

  const save = async () => {
    if (!profile || !form.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }

    const payload = {
      title: form.title,
      excerpt: form.excerpt || null,
      content: form.content || null,
      category: form.category || null,
      featured_image_url: form.featured_image_url || null,
      is_published: form.is_published,
      published_at: form.is_published ? new Date().toISOString() : null,
    };

    if (editing) {
      await supabase.from("blog_posts").update(payload).eq("id", editing.id);
      toast({ title: "Post updated" });
    } else {
      await supabase.from("blog_posts").insert({ ...payload, doctor_id: profile.id });
      toast({ title: "Post created" });
    }
    if (form.is_published) await maybeAutoEnableBlogVisibility();
    setShowEditor(false);
    load();
  };

  const deletePost = async (id: string) => {
    await supabase.from("blog_posts").delete().eq("id", id);
    toast({ title: "Post deleted" });
    load();
  };

  const togglePublish = async (post: BlogPost) => {
    const newStatus = !post.is_published;
    await supabase.from("blog_posts").update({
      is_published: newStatus,
      published_at: newStatus ? new Date().toISOString() : null,
    }).eq("id", post.id);
    if (newStatus) await maybeAutoEnableBlogVisibility();
    toast({ title: newStatus ? "Published" : "Unpublished" });
    load();
  };

  const generateWithAI = async () => {
    if (!aiTopic.trim()) return;
    setAiLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45_000);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-blog-writer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session?.access_token}`,
        },
        body: JSON.stringify({ topic: aiTopic, doctorName: profile?.full_name, specialization: profile?.specialization }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const message = errData.error || errData.message || errData.details || "Try again later.";
        if (res.status === 429) {
          toast({ title: "Rate limit exceeded", description: message, variant: "destructive" });
        } else if (res.status === 402) {
          toast({ title: "AI credits exhausted", description: message, variant: "destructive" });
        } else if (res.status === 403) {
          toast({ title: "Premium feature", description: message, variant: "destructive" });
        } else if (res.status === 502 || res.status === 504) {
          toast({ title: "AI generation unavailable", description: message, variant: "destructive" });
        } else {
          toast({ title: "AI generation failed", description: message, variant: "destructive" });
        }
        return;
      }

      const data = await res.json();
      if (!data.content) {
        toast({ title: "AI generation failed", description: "No content was returned. Please try again.", variant: "destructive" });
        return;
      }
      setForm({
        ...form,
        title: data.title || aiTopic,
        excerpt: data.excerpt || "",
        content: data.content || "",
        category: data.category || form.category,
      });
      setAiTopic("");
      toast({ title: "AI draft generated! Review and publish." });
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      toast({
        title: "AI generation failed",
        description: isTimeout ? "The request timed out. Please try again." : "Please check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      clearTimeout(timeoutId);
      setAiLoading(false);
    }
  };

  const filtered = posts.filter((p) =>
    p.title.toLowerCase().includes(search.toLowerCase()) ||
    (p.category || "").toLowerCase().includes(search.toLowerCase())
  );

  const publishedCount = posts.filter((p) => p.is_published).length;
  const draftCount = posts.filter((p) => !p.is_published).length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
            <FileText className="h-6 w-6 text-ai-purple" /> Blog Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {publishedCount} published · {draftCount} drafts
          </p>
        </div>
        {can("blog.create") && (
        <Button onClick={openNew} className="bg-royal hover:bg-royal/90">
          <Plus className="h-4 w-4 mr-1" /> New Post
        </Button>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search posts..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Posts Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-full text-center py-16">
            <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">No blog posts yet. Write your first article!</p>
            {can("blog.create") && (
            <Button onClick={openNew} variant="outline" className="mt-4">
              <Plus className="h-4 w-4 mr-1" /> Create Post
            </Button>
            )}
          </div>
        ) : filtered.map((post) => (
          <div key={post.id} className="bg-card rounded-xl border border-border overflow-hidden hover:shadow-md transition-shadow">
            {post.featured_image_url ? (
              <img src={post.featured_image_url} alt={post.title} className="w-full h-32 object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-32 bg-secondary flex items-center justify-center">
                <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
              </div>
            )}
            <div className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <span className={`text-xs px-2 py-0.5 rounded-pill font-medium ${
                  post.is_published ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                }`}>
                  {post.is_published ? "Published" : "Draft"}
                </span>
                {post.category && (
                  <span className="text-xs px-2 py-0.5 rounded-pill bg-ai-purple/10 text-ai-purple font-medium">
                    {post.category}
                  </span>
                )}
              </div>
              <h3 className="font-heading font-semibold text-primary line-clamp-2">{post.title}</h3>
              {post.excerpt && (
                <p className="text-sm text-muted-foreground line-clamp-2">{post.excerpt}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {format(new Date(post.created_at), "MMM d, yyyy")}
              </p>
              <div className="flex gap-1 pt-2 border-t border-border">
                {can("blog.edit") && (
                  <Button size="sm" variant="ghost" className="text-xs h-8" onClick={() => openEdit(post)}>
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                )}
                {can("blog.edit") && (
                  <Button size="sm" variant="ghost" className="text-xs h-8" onClick={() => togglePublish(post)}>
                    {post.is_published ? <><EyeOff className="h-3 w-3 mr-1" /> Unpublish</> : <><Eye className="h-3 w-3 mr-1" /> Publish</>}
                  </Button>
                )}
                {can("blog.delete") && (
                  <Button size="sm" variant="ghost" className="text-xs h-8 text-destructive" onClick={() => deletePost(post.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Editor Dialog */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Post" : "New Blog Post"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* AI Writer */}
            {isPremium ? (
              <div className="p-4 rounded-xl bg-ai-purple/5 border border-ai-purple/20 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-ai-purple">
                  <Sparkles className="h-4 w-4" /> AI Blog Writer
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter topic e.g. 'Top 10 tips for heart health'"
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    onClick={generateWithAI}
                    disabled={aiLoading || !aiTopic.trim()}
                    className="bg-ai-purple hover:bg-ai-purple/90 text-white"
                  >
                    {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                    {aiLoading ? "Writing..." : "Generate"}
                  </Button>
                </div>
              </div>
            ) : (
              <LockedFeatureCard
                featureName="AI Blog Writer"
                description="Generate patient-friendly health articles with AI in seconds. Available on Pro and Premium."
              />
            )}

            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Your article title" className="h-10" />
            </div>

            <div className="space-y-1.5">
              <Label>Featured Image</Label>
              {form.featured_image_url ? (
                <div className="relative w-full max-w-xs rounded-xl overflow-hidden border border-border group">
                  <img src={form.featured_image_url} alt="Featured" className="w-full aspect-video object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <label className="cursor-pointer">
                      <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={uploadFeaturedImage} disabled={imageUploading} />
                      <span className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-pill bg-white text-foreground font-medium hover:bg-white/90">
                        <Upload className="h-3 w-3" /> Replace
                      </span>
                    </label>
                    <button type="button" onClick={removeFeaturedImage} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-pill bg-destructive text-destructive-foreground font-medium hover:bg-destructive/90">
                      <X className="h-3 w-3" /> Remove
                    </button>
                  </div>
                </div>
              ) : (
                <label className={`flex flex-col items-center justify-center gap-2 w-full max-w-xs aspect-video rounded-xl border-2 border-dashed border-border text-muted-foreground hover:border-royal/50 hover:text-royal transition-colors ${imageUploading ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
                  <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={uploadFeaturedImage} disabled={imageUploading} />
                  {imageUploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImageIcon className="h-6 w-6" />}
                  <span className="text-xs font-medium">{imageUploading ? "Uploading..." : "Click to upload cover image"}</span>
                </label>
              )}
              <p className="text-[11px] text-muted-foreground">JPG, PNG or WebP · up to {MAX_IMAGE_MB}MB · shown on your Health Articles section</p>
            </div>

            <div className="space-y-1.5">
              <Label>Excerpt</Label>
              <Input value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} placeholder="Brief summary (1-2 sentences)" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Content</Label>
              <RichTextEditor
                value={form.content}
                onChange={(html) => setForm({ ...form, content: html })}
                placeholder="Write your article content here..."
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch checked={form.is_published} onCheckedChange={(v) => setForm({ ...form, is_published: v })} />
                <Label className="text-sm">{form.is_published ? "Publish immediately" : "Save as draft"}</Label>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowEditor(false)}>Cancel</Button>
                <Button onClick={save} className="bg-royal hover:bg-royal/90">
                  {editing ? "Update" : "Create"} Post
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BlogPage;
