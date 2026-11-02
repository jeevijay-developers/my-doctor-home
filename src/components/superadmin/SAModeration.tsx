import { useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { supabase } from "@/integrations/supabase/client";
import { markdownToHtml } from "@/lib/markdown";
import { Card, CardContent } from "@/components/ui/card";
import DoctorGroupCard from "@/components/shared/DoctorGroupCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { logAdminAction } from "@/lib/adminAudit";
import { groupByDoctor } from "@/lib/groupByDoctor";

const SAModeration = () => {
  const [posts, setPosts] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [openPost, setOpenPost] = useState<any | null>(null);

  const load = async () => {
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("blog_posts").select("*, profiles:doctor_id(full_name, clinic_name)").order("created_at", { ascending: false }),
      supabase.from("reviews").select("*, profiles:doctor_id(full_name, clinic_name)").order("created_at", { ascending: false }),
    ]);
    setPosts(p ?? []);
    setReviews(r ?? []);
  };
  useEffect(() => { load(); }, []);

  // RLS filters a forbidden UPDATE to zero rows without an error, so success needs a returned row.
  const notSaved = () =>
    toast({ title: "Not saved", description: "No rows were changed. You may not have permission to moderate this item.", variant: "destructive" });

  const setPublished = async (id: string, next: boolean) => {
    const { data, error } = await supabase.from("blog_posts").update({ is_published: next }).eq("id", id).select("id");
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    if (!data?.length) return notSaved();
    await logAdminAction(next ? "publish_blog_post" : "unpublish_blog_post", "blog_posts", id);
    toast({ title: next ? "Post published" : "Post unpublished" });
    if (openPost?.id === id) setOpenPost({ ...openPost, is_published: next });
    load();
  };

  // hub_hidden is not in the generated types yet, so the payload is cast.
  const setHubHidden = async (id: string, hidden: boolean) => {
    const { data, error } = await supabase.from("blog_posts").update({ hub_hidden: hidden } as any).eq("id", id).select("id");
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    if (!data?.length) return notSaved();
    await logAdminAction(hidden ? "hide_blog_from_hub" : "show_blog_on_hub", "blog_posts", id);
    toast({ title: hidden ? "Hidden from Health Articles" : "Visible on Health Articles" });
    if (openPost?.id === id) setOpenPost({ ...openPost, hub_hidden: hidden });
    load();
  };

  const toggleReview = async (id: string, next: boolean) => {
    const { data, error } = await supabase.from("reviews").update({ is_visible: next }).eq("id", id).select("id");
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    if (!data?.length) return notSaved();
    await logAdminAction(next ? "show_review" : "hide_review", "reviews", id);
    toast({ title: next ? "Review restored" : "Review hidden" });
    load();
  };

  const postGroups = groupByDoctor(posts);
  const reviewGroups = groupByDoctor(reviews);

  const sanitizedPostHtml = useMemo(() => {
    const content = openPost?.content || "";
    if (!content) {
      return DOMPurify.sanitize("<p class='text-muted-foreground'>No content.</p>");
    }
    const source = /<\/?[a-z][\s\S]*>/i.test(content) ? content : markdownToHtml(content);
    return DOMPurify.sanitize(source, {
      ADD_TAGS: ["iframe"],
      ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "scrolling", "target"],
    });
  }, [openPost?.content]);

  return (
    <Tabs defaultValue="blogs">
      <TabsList>
        <TabsTrigger value="blogs">Blog Posts</TabsTrigger>
        <TabsTrigger value="reviews">Reviews</TabsTrigger>
      </TabsList>

      <TabsContent value="blogs" className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Unpublish removes a post everywhere, including the doctor's own site. Hide from hub only removes it from the Health Articles page and keeps it on the doctor's site.
        </p>
        {postGroups.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-muted-foreground">No posts.</CardContent></Card>
        ) : (
          postGroups.map((group) => (
            <DoctorGroupCard key={group.doctorId} doctorName={group.doctorName} clinicName={group.clinicName} count={group.items.length} itemLabel="post">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-xs uppercase text-muted-foreground">
                  <tr><th className="text-left p-3">Title</th><th className="text-left p-3">Status</th><th className="text-left p-3">Date</th><th className="p-3"></th></tr>
                </thead>
                <tbody>
                  {group.items.map((p) => (
                    <tr key={p.id} className="border-t cursor-pointer hover:bg-secondary/40" onClick={() => setOpenPost(p)}>
                      <td className="p-3 font-medium">{p.title}</td>
                      <td className="p-3">
                        <Badge variant={p.is_published ? "default" : "outline"} className="pointer-events-none">
                          {p.is_published ? "Published" : "Draft"}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</td>
                      <td className="p-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {p.is_published
                          ? <Button size="sm" variant="destructive" onClick={() => setPublished(p.id, false)}>Unpublish</Button>
                          : <Button size="sm" onClick={() => setPublished(p.id, true)}>Publish</Button>}
                        {p.is_published && (
                          <Button size="sm" variant="outline" className="ml-2" onClick={() => setHubHidden(p.id, !p.hub_hidden)}>
                            {p.hub_hidden ? "Show on hub" : "Hide from hub"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DoctorGroupCard>
          ))
        )}
      </TabsContent>

      <TabsContent value="reviews" className="space-y-3">
        {reviewGroups.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-muted-foreground">No reviews.</CardContent></Card>
        ) : (
          reviewGroups.map((group) => (
            <DoctorGroupCard key={group.doctorId} doctorName={group.doctorName} clinicName={group.clinicName} count={group.items.length} itemLabel="review">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-xs uppercase text-muted-foreground">
                  <tr><th className="text-left p-3">Patient</th><th className="text-left p-3">Rating</th><th className="text-left p-3">Text</th><th className="text-left p-3">Visible</th><th className="p-3"></th></tr>
                </thead>
                <tbody>
                  {group.items.map((r) => (
                    <tr key={r.id} className="border-t align-top">
                      <td className="p-3">{r.patient_name}</td>
                      <td className="p-3">{r.rating}★</td>
                      <td className="p-3 text-xs max-w-xs">{r.review_text}</td>
                      <td className="p-3"><Badge variant={r.is_visible ? "default" : "outline"} className="pointer-events-none">{r.is_visible ? "Yes" : "Hidden"}</Badge></td>
                      <td className="p-3">
                        <Button size="sm" variant={r.is_visible ? "destructive" : "default"} onClick={() => toggleReview(r.id, !r.is_visible)}>
                          {r.is_visible ? "Hide" : "Show"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DoctorGroupCard>
          ))
        )}
      </TabsContent>

      <Dialog open={!!openPost} onOpenChange={(v) => !v && setOpenPost(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {openPost && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">{openPost.title}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={openPost.is_published ? "default" : "outline"} className="pointer-events-none">
                  {openPost.is_published ? "Published" : "Draft"}
                </Badge>
                {openPost.hub_hidden && <Badge variant="outline" className="pointer-events-none">Hidden from hub</Badge>}
                {openPost.category && <Badge variant="outline" className="pointer-events-none">{openPost.category}</Badge>}
                <span>By {openPost.profiles?.full_name || "—"}</span>
                <span>·</span>
                <span>{new Date(openPost.published_at || openPost.created_at).toLocaleDateString()}</span>
              </div>
              {openPost.featured_image_url && (
                <img src={openPost.featured_image_url} alt={openPost.title} loading="lazy" decoding="async" className="w-full rounded-lg max-h-64 object-cover" />
              )}
              {openPost.excerpt && (
                <p className="text-sm font-medium text-muted-foreground italic">{openPost.excerpt}</p>
              )}
              <div
                className="prose prose-sm max-w-none text-foreground"
                dangerouslySetInnerHTML={{ __html: sanitizedPostHtml }}
              />
              <DialogFooter>
                {openPost.is_published && (
                  <Button variant="outline" onClick={() => setHubHidden(openPost.id, !openPost.hub_hidden)}>
                    {openPost.hub_hidden ? "Show on hub" : "Hide from hub"}
                  </Button>
                )}
                {openPost.is_published
                  ? <Button variant="destructive" onClick={() => setPublished(openPost.id, false)}>Unpublish</Button>
                  : <Button onClick={() => setPublished(openPost.id, true)}>Publish</Button>}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Tabs>
  );
};

export default SAModeration;
