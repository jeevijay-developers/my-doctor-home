import { useState } from "react";
import { Star, ShieldCheck, Send, Quote } from "lucide-react";
import { useDoctorData } from "@/contexts/DoctorContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const ReviewsSection = () => {
  const { reviews, profile } = useDoctorData();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : "0";

  const ratingDist = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    pct: reviews.length > 0 ? Math.round((reviews.filter((r) => r.rating === stars).length / reviews.length) * 100) : 0,
  }));

  const submitReview = async () => {
    if (!name.trim() || !profile) return;
    setSubmitting(true);
    const { error } = await supabase.from("reviews").insert({
      doctor_id: profile.id,
      patient_name: name,
      rating,
      review_text: text || null,
    });
    if (error) {
      toast.error("Failed to submit review");
    } else {
      toast.success("Thank you for your review!");
      setShowForm(false);
      setName("");
      setRating(5);
      setText("");
    }
    setSubmitting(false);
  };

  if (reviews.length === 0) {
    return (
      <section id="reviews" className="relative py-16 md:py-24 bg-card overflow-hidden">
        <Quote
          size={220}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-royal/[0.05] dark:text-royal/[0.15] pointer-events-none"
          fill="currentColor"
        />
        <div className="container mx-auto px-4 text-center relative z-10">
          <h2 className="font-heading font-bold text-3xl text-primary mb-4">Patient Reviews</h2>
          <p className="text-text-gray mb-6">No reviews yet. Be the first to share your experience!</p>
          <Button onClick={() => setShowForm(true)} variant="cta-outline">
            <Send className="h-4 w-4 mr-1" /> Write a Review
          </Button>
          {showForm && <ReviewForm name={name} setName={setName} rating={rating} setRating={setRating} text={text} setText={setText} submitting={submitting} onSubmit={submitReview} onCancel={() => setShowForm(false)} />}
        </div>
      </section>
    );
  }

  return (
    <section id="reviews" className="py-16 md:py-24 bg-card">
      <div className="container mx-auto px-4">
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-primary text-center mb-12">Patient Reviews</h2>
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 bg-secondary rounded-2xl p-6 text-center self-start">
            <p className="font-heading font-extrabold text-6xl text-primary">{avgRating}</p>
            <div className="flex justify-center text-warning my-2">
              {[...Array(5)].map((_, i) => <Star key={i} size={20} fill="currentColor" />)}
            </div>
            <p className="text-sm text-text-gray mb-6">Based on {reviews.length} reviews</p>
            <div className="space-y-2">
              {ratingDist.map((r) => (
                <div key={r.stars} className="flex items-center gap-2 text-sm">
                  <span className="w-4 text-text-gray">{r.stars}</span>
                  <div className="flex-1 h-2 rounded-pill bg-muted overflow-hidden">
                    <div className="h-full bg-warning rounded-pill" style={{ width: `${r.pct}%` }} />
                  </div>
                  <span className="w-8 text-text-gray text-right">{r.pct}%</span>
                </div>
              ))}
            </div>
            <Button onClick={() => setShowForm(!showForm)} variant="cta-outline" className="mt-6 w-full">
              <Send className="h-4 w-4 mr-1" /> Write a Review
            </Button>
          </div>
          <div className="lg:col-span-2 space-y-4">
            {showForm && <ReviewForm name={name} setName={setName} rating={rating} setRating={setRating} text={text} setText={setText} submitting={submitting} onSubmit={submitReview} onCancel={() => setShowForm(false)} />}
            {reviews.slice(0, 5).map((r) => (
              <div key={r.id} className="hover-lift relative bg-card border border-border rounded-xl p-5 overflow-hidden">
                <Quote size={56} className="absolute -top-2 -right-2 text-royal/[0.08] dark:text-royal/[0.2] pointer-events-none" fill="currentColor" />
                <div className="flex items-center justify-between mb-3 relative z-10">
                  <div>
                    <p className="font-heading font-semibold text-foreground">{r.patient_name}</p>
                    <p className="text-xs text-text-gray">{new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {[...Array(r.rating)].map((_, j) => <Star key={j} size={14} className="text-warning" fill="currentColor" />)}
                  </div>
                </div>
                {r.review_text && <p className="text-sm text-foreground leading-relaxed relative z-10">{r.review_text}</p>}
                {r.is_verified && (
                  <span className="inline-flex items-center gap-1 mt-3 px-2 py-0.5 rounded-pill bg-teal/10 text-teal text-xs font-medium">
                    <ShieldCheck size={12} /> Verified Patient
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

const ReviewForm = ({ name, setName, rating, setRating, text, setText, submitting, onSubmit, onCancel }: {
  name: string; setName: (v: string) => void; rating: number; setRating: (v: number) => void;
  text: string; setText: (v: string) => void; submitting: boolean; onSubmit: () => void; onCancel: () => void;
}) => (
  <div className="bg-secondary rounded-xl p-5 mt-4 text-left space-y-3">
    <h4 className="font-heading font-semibold text-primary text-sm">Share Your Experience</h4>
    <Input placeholder="Your Name *" value={name} onChange={(e) => setName(e.target.value)} />
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <button key={s} onClick={() => setRating(s)}>
          <Star size={24} className={s <= rating ? "text-warning" : "text-muted"} fill={s <= rating ? "currentColor" : "none"} />
        </button>
      ))}
    </div>
    <Textarea placeholder="Your review (optional)" value={text} onChange={(e) => setText(e.target.value)} rows={3} />
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      <Button size="sm" onClick={onSubmit} disabled={!name.trim() || submitting} className="bg-royal hover:bg-royal/90 text-white">
        {submitting ? "Submitting..." : "Submit Review"}
      </Button>
    </div>
  </div>
);

export default ReviewsSection;
