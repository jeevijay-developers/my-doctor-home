import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { Star, Pin, Eye, EyeOff, Trash2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Review = {
  id: string; patient_name: string; rating: number; review_text: string | null;
  is_visible: boolean; is_pinned: boolean; is_verified: boolean; created_at: string;
};

const ReviewsManagePage = () => {
  const { profile } = useProfile();
  const [reviews, setReviews] = useState<Review[]>([]);

  const load = async () => {
    if (!profile) return;
    const { data } = await supabase.from("reviews").select("*").eq("doctor_id", profile.id).order("created_at", { ascending: false });
    setReviews((data || []) as Review[]);
  };

  useEffect(() => { load(); }, [profile]);

  const toggle = async (id: string, field: "is_visible" | "is_pinned", current: boolean) => {
    await supabase.from("reviews").update({ [field]: !current } as any).eq("id", id);
    load();
    toast.success(field === "is_visible" ? (!current ? "Review shown" : "Review hidden") : (!current ? "Review pinned" : "Review unpinned"));
  };

  const deleteReview = async (id: string) => {
    await supabase.from("reviews").delete().eq("id", id);
    load();
    toast.success("Review deleted");
  };

  const avgRating = reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : "0";
  const visibleCount = reviews.filter(r => r.is_visible).length;
  const pinnedCount = reviews.filter(r => r.is_pinned).length;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-warning" /> Reviews
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage patient feedback on your website</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: String(reviews.length), color: "text-foreground", bg: "bg-secondary" },
          { label: "Avg Rating", value: avgRating, color: "text-warning", bg: "bg-warning/10" },
          { label: "Visible", value: String(visibleCount), color: "text-success", bg: "bg-success/10" },
          { label: "Pinned", value: String(pinnedCount), color: "text-royal", bg: "bg-royal/10" },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
            <div className={`font-heading font-bold text-xl ${s.color}`}>{s.value}</div>
            <div className="text-[11px] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {reviews.length === 0 ? (
        <Card className="border-border/60 shadow-none">
          <CardContent className="py-16 text-center">
            <MessageSquare className="h-12 w-12 text-warning/20 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No reviews yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Reviews from patients will appear here</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {reviews.map((r) => (
            <Card key={r.id} className={`border-border/60 shadow-none hover:shadow-md transition-shadow ${!r.is_visible ? "opacity-60" : ""} ${r.is_pinned ? "border-l-4 border-l-warning" : ""}`}>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center text-sm font-bold text-warning flex-shrink-0">
                      {r.patient_name?.charAt(0)?.toUpperCase() || "P"}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground">{r.patient_name}</h3>
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className={`h-3.5 w-3.5 ${i < r.rating ? "text-warning fill-warning" : "text-muted-foreground/20"}`} />
                          ))}
                        </div>
                        {r.is_verified && <Badge variant="secondary" className="text-[10px] bg-success/10 text-success">Verified</Badge>}
                        {r.is_pinned && <Badge variant="secondary" className="text-[10px] bg-warning/10 text-warning">Pinned</Badge>}
                        {!r.is_visible && <Badge variant="secondary" className="text-[10px] bg-destructive/10 text-destructive">Hidden</Badge>}
                      </div>
                      {r.review_text && <p className="text-sm text-muted-foreground mt-1">{r.review_text}</p>}
                      <p className="text-[11px] text-muted-foreground/60 mt-1">{new Date(r.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => toggle(r.id, "is_pinned", r.is_pinned)} title={r.is_pinned ? "Unpin" : "Pin"}>
                      <Pin className={`h-4 w-4 ${r.is_pinned ? "text-warning" : "text-muted-foreground/40"}`} />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => toggle(r.id, "is_visible", r.is_visible)} title={r.is_visible ? "Hide" : "Show"}>
                      {r.is_visible ? <Eye className="h-4 w-4 text-success" /> : <EyeOff className="h-4 w-4 text-muted-foreground/40" />}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive/60 hover:text-destructive" onClick={() => deleteReview(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReviewsManagePage;
