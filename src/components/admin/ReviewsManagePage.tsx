import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { Star, Pin, MessageSquare, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

type Review = {
  id: string; patient_name: string; rating: number; review_text: string | null;
  is_pinned: boolean; is_verified: boolean; is_visible: boolean; created_at: string;
};

const ReviewsManagePage = () => {
  const { profile, can } = useProfile();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [selected, setSelected] = useState<Review | null>(null);

  const load = async () => {
    if (!profile) return;
    const { data } = await supabase.from("reviews").select("*").eq("doctor_id", profile.id).order("created_at", { ascending: false });
    setReviews((data || []) as Review[]);
  };

  useEffect(() => { load(); }, [profile]);

  const togglePin = async (id: string, current: boolean) => {
    await supabase.from("reviews").update({ is_pinned: !current }).eq("id", id);
    load();
    setSelected((prev) => (prev && prev.id === id ? { ...prev, is_pinned: !current } : prev));
    toast.success(!current ? "Review pinned" : "Review unpinned");
  };

  const toggleVisibility = async (id: string, current: boolean) => {
    const { error } = await supabase.from("reviews").update({ is_visible: !current }).eq("id", id);
    if (error) { toast.error("Couldn't update review visibility."); return; }
    setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, is_visible: !current } : r)));
    setSelected((prev) => (prev && prev.id === id ? { ...prev, is_visible: !current } : prev));
    toast.success(!current ? "Review is now visible on your website" : "Review hidden from your website");
  };

  const avgRating = reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : "0";
  const verifiedCount = reviews.filter(r => r.is_verified).length;
  const pinnedCount = reviews.filter(r => r.is_pinned).length;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-warning" /> Reviews
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Patient feedback on your website</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: String(reviews.length), color: "text-foreground", bg: "bg-secondary" },
          { label: "Avg Rating", value: avgRating, color: "text-warning", bg: "bg-warning/10" },
          { label: "Verified", value: String(verifiedCount), color: "text-success", bg: "bg-success/10" },
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
        <>
          {/* Table — tablet/desktop */}
          <Card className="hidden md:block border-border/60 shadow-none overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 border-b border-border">
                  <tr className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <th className="px-4 py-3">Patient</th>
                    <th className="px-4 py-3 whitespace-nowrap">Rating</th>
                    <th className="px-4 py-3 hidden lg:table-cell whitespace-nowrap">Date</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelected(r)}
                      className={`border-b border-border/60 last:border-0 transition-colors hover:bg-secondary/40 cursor-pointer ${
                        r.is_pinned ? "bg-warning/5" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-warning/10 flex items-center justify-center text-sm font-bold text-warning flex-shrink-0">
                            {r.patient_name?.charAt(0)?.toUpperCase() || "P"}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-foreground truncate">{r.patient_name}</div>
                            <div className="text-[11px] text-muted-foreground lg:hidden">
                              {new Date(r.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className={`h-3.5 w-3.5 ${i < r.rating ? "text-warning fill-warning" : "text-muted-foreground/20"}`} />
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {r.is_verified && <Badge variant="secondary" className="text-[10px] bg-success/10 text-success">Verified</Badge>}
                          {r.is_pinned && <Badge variant="secondary" className="text-[10px] bg-warning/10 text-warning">Pinned</Badge>}
                          {!r.is_visible && <Badge variant="secondary" className="text-[10px] bg-muted text-muted-foreground">Hidden</Badge>}
                          {r.is_visible && !r.is_pinned && !r.is_verified && (
                            <Badge variant="secondary" className="text-[10px] bg-secondary">Published</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {can("reviews.manage") && (
                            <>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); toggleVisibility(r.id, r.is_visible); }} title={r.is_visible ? "Hide from website" : "Show on website"}>
                                {r.is_visible ? <Eye className="h-4 w-4 text-success" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); togglePin(r.id, r.is_pinned); }} title={r.is_pinned ? "Unpin" : "Pin"}>
                                <Pin className={`h-4 w-4 ${r.is_pinned ? "text-warning" : "text-muted-foreground/40"}`} />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Cards — mobile */}
          <div className="md:hidden space-y-2">
            {reviews.map((r) => (
              <Card
                key={r.id}
                onClick={() => setSelected(r)}
                className={`border-border/60 shadow-none cursor-pointer transition-colors hover:bg-secondary/40 ${r.is_pinned ? "bg-warning/5" : ""}`}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-warning/10 flex items-center justify-center text-sm font-bold text-warning flex-shrink-0">
                        {r.patient_name?.charAt(0)?.toUpperCase() || "P"}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground truncate">{r.patient_name}</div>
                        <div className="text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                    {can("reviews.manage") && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); toggleVisibility(r.id, r.is_visible); }} title={r.is_visible ? "Hide from website" : "Show on website"}>
                          {r.is_visible ? <Eye className="h-4 w-4 text-success" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); togglePin(r.id, r.is_pinned); }} title={r.is_pinned ? "Unpin" : "Pin"}>
                          <Pin className={`h-4 w-4 ${r.is_pinned ? "text-warning" : "text-muted-foreground/40"}`} />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`h-3.5 w-3.5 ${i < r.rating ? "text-warning fill-warning" : "text-muted-foreground/20"}`} />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {r.is_verified && <Badge variant="secondary" className="text-[10px] bg-success/10 text-success">Verified</Badge>}
                    {r.is_pinned && <Badge variant="secondary" className="text-[10px] bg-warning/10 text-warning">Pinned</Badge>}
                    {!r.is_visible && <Badge variant="secondary" className="text-[10px] bg-muted text-muted-foreground">Hidden</Badge>}
                    {r.is_visible && !r.is_pinned && !r.is_verified && (
                      <Badge variant="secondary" className="text-[10px] bg-secondary">Published</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Review detail — full, untruncated text (the table/card list clips
          long reviews with line-clamp for scannability). */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          {selected && (
            <div className="space-y-4">
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-warning/10 flex items-center justify-center text-base font-bold text-warning flex-shrink-0">
                    {selected.patient_name?.charAt(0)?.toUpperCase() || "P"}
                  </div>
                  <div className="min-w-0">
                    <DialogTitle className="truncate">{selected.patient_name}</DialogTitle>
                    <p className="text-xs text-muted-foreground">{new Date(selected.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </DialogHeader>

              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`h-4 w-4 ${i < selected.rating ? "text-warning fill-warning" : "text-muted-foreground/20"}`} />
                ))}
              </div>

              <p className="text-sm text-foreground whitespace-pre-wrap">
                {selected.review_text || "No written review — rating only."}
              </p>

              <div className="flex items-center justify-between pt-3 border-t border-border">
                <div className="flex flex-wrap gap-1">
                  {selected.is_verified && <Badge variant="secondary" className="text-[10px] bg-success/10 text-success">Verified</Badge>}
                  {selected.is_pinned && <Badge variant="secondary" className="text-[10px] bg-warning/10 text-warning">Pinned</Badge>}
                  {!selected.is_visible && <Badge variant="secondary" className="text-[10px] bg-muted text-muted-foreground">Hidden</Badge>}
                  {selected.is_visible && !selected.is_pinned && !selected.is_verified && (
                    <Badge variant="secondary" className="text-[10px] bg-secondary">Published</Badge>
                  )}
                </div>
                {can("reviews.manage") && (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => toggleVisibility(selected.id, selected.is_visible)}>
                      {selected.is_visible ? <EyeOff className="h-3.5 w-3.5 mr-1.5" /> : <Eye className="h-3.5 w-3.5 mr-1.5" />}
                      {selected.is_visible ? "Hide" : "Show"}
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => togglePin(selected.id, selected.is_pinned)}>
                      <Pin className={`h-3.5 w-3.5 mr-1.5 ${selected.is_pinned ? "text-warning" : ""}`} />
                      {selected.is_pinned ? "Unpin" : "Pin"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReviewsManagePage;
