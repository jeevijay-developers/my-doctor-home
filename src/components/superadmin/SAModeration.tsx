import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { logAdminAction } from "@/lib/adminAudit";

const SAModeration = () => {
  const [posts, setPosts] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);

  const load = async () => {
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("blog_posts").select("*, profiles:doctor_id(full_name)").order("created_at", { ascending: false }),
      supabase.from("reviews").select("*, profiles:doctor_id(full_name)").order("created_at", { ascending: false }),
    ]);
    setPosts(p ?? []);
    setReviews(r ?? []);
  };
  useEffect(() => { load(); }, []);

  const unpublish = async (id: string) => {
    const { error } = await supabase.from("blog_posts").update({ is_published: false }).eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    await logAdminAction("unpublish_blog_post", "blog_posts", id);
    toast({ title: "Post unpublished" });
    load();
  };

  const toggleReview = async (id: string, next: boolean) => {
    const { error } = await supabase.from("reviews").update({ is_visible: next }).eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    await logAdminAction(next ? "show_review" : "hide_review", "reviews", id);
    toast({ title: next ? "Review restored" : "Review hidden" });
    load();
  };

  return (
    <Tabs defaultValue="blogs">
      <TabsList>
        <TabsTrigger value="blogs">Blog Posts</TabsTrigger>
        <TabsTrigger value="reviews">Reviews</TabsTrigger>
      </TabsList>

      <TabsContent value="blogs">
        <Card><CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase text-muted-foreground">
              <tr><th className="text-left p-3">Title</th><th className="text-left p-3">Doctor</th><th className="text-left p-3">Status</th><th className="text-left p-3">Date</th><th className="p-3"></th></tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3 font-medium">{p.title}</td>
                  <td className="p-3 text-xs">{p.profiles?.full_name || "—"}</td>
                  <td className="p-3"><Badge variant={p.is_published ? "default" : "outline"}>{p.is_published ? "Published" : "Draft"}</Badge></td>
                  <td className="p-3 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</td>
                  <td className="p-3">{p.is_published && <Button size="sm" variant="destructive" onClick={() => unpublish(p.id)}>Unpublish</Button>}</td>
                </tr>
              ))}
              {posts.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No posts.</td></tr>}
            </tbody>
          </table>
        </CardContent></Card>
      </TabsContent>

      <TabsContent value="reviews">
        <Card><CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase text-muted-foreground">
              <tr><th className="text-left p-3">Patient</th><th className="text-left p-3">Doctor</th><th className="text-left p-3">Rating</th><th className="text-left p-3">Text</th><th className="text-left p-3">Visible</th><th className="p-3"></th></tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="p-3">{r.patient_name}</td>
                  <td className="p-3 text-xs">{r.profiles?.full_name}</td>
                  <td className="p-3">{r.rating}★</td>
                  <td className="p-3 text-xs max-w-xs">{r.review_text}</td>
                  <td className="p-3"><Badge variant={r.is_visible ? "default" : "outline"}>{r.is_visible ? "Yes" : "Hidden"}</Badge></td>
                  <td className="p-3">
                    <Button size="sm" variant={r.is_visible ? "destructive" : "default"} onClick={() => toggleReview(r.id, !r.is_visible)}>
                      {r.is_visible ? "Hide" : "Show"}
                    </Button>
                  </td>
                </tr>
              ))}
              {reviews.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No reviews.</td></tr>}
            </tbody>
          </table>
        </CardContent></Card>
      </TabsContent>
    </Tabs>
  );
};

export default SAModeration;
