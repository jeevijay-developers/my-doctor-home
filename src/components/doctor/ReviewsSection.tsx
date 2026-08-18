import { useEffect, useState } from "react";
import { Star, ShieldCheck, Send, Quote } from "lucide-react";
import { useDoctorData } from "@/contexts/DoctorContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext, type CarouselApi,
} from "@/components/ui/carousel";
import { cardColorClass, type CardColor } from "@/lib/cardColor";

// NOTE: the individual patient review testimonial card below (ReviewCard,
// line ~137) is "the Patient Review card" referenced as Color B elsewhere
// on this page — it always stays bg-card, unaffected by this section's own
// alternating background (cardColor prop), which is a different element.
const ReviewsSection = ({ cardColor = "card" }: { cardColor?: CardColor }) => {
  const { reviews, profile } = useDoctorData();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [api, setApi] = useState<CarouselApi>();
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setSelected(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => { api.off("select", onSelect); };
  }, [api]);

  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : "0";

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
      <section id="reviews" className={`relative py-16 md:py-24 overflow-hidden ${cardColorClass(cardColor)}`}>
        <Quote
          size={220}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-royal/[0.05] dark:text-royal/[0.15] pointer-events-none"
          fill="currentColor"
        />
        <div className="container mx-auto px-[5px] md:px-4 text-center relative z-10">
          <h2 className="font-heading font-bold text-3xl text-foreground mb-4">Patient Reviews</h2>
          <p className="text-text-gray mb-6">No reviews yet. Be the first to share your experience!</p>
          <Button onClick={() => setShowForm(true)} variant="cta-outline">
            <Send className="h-4 w-4 mr-1" /> Write a Review
          </Button>
          {showForm && <ReviewForm name={name} setName={setName} rating={rating} setRating={setRating} text={text} setText={setText} submitting={submitting} onSubmit={submitReview} onCancel={() => setShowForm(false)} />}
        </div>
      </section>
    );
  }

  const shownReviews = reviews.slice(0, 5);

  return (
    <section id="reviews" className={`py-16 md:py-24 ${cardColorClass(cardColor)}`}>
      <div className="container mx-auto px-[5px] md:px-4 text-center">
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-foreground mb-2">Patient Reviews</h2>
        <p className="text-text-gray mb-2">What our patients say about Dr. {profile?.full_name || "Doctor"}</p>
        <div className="inline-flex items-center gap-1.5 mb-10 text-sm">
          <div className="flex text-warning">
            {[...Array(5)].map((_, i) => <Star key={i} size={14} fill="currentColor" />)}
          </div>
          <span className="font-heading font-bold text-foreground">{avgRating}</span>
          <span className="text-text-gray">· {reviews.length} review{reviews.length !== 1 ? "s" : ""}</span>
        </div>

        <div className="max-w-xl mx-auto text-left">
          {shownReviews.length === 1 ? (
            <ReviewCard r={shownReviews[0]} />
          ) : (
            <>
              <Carousel setApi={setApi} opts={{ align: "center", loop: true }} className="px-1">
                <CarouselContent>
                  {shownReviews.map((r) => (
                    <CarouselItem key={r.id}>
                      <ReviewCard r={r} />
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious className="-left-3 sm:-left-12 border-border bg-card" />
                <CarouselNext className="-right-3 sm:-right-12 border-border bg-card" />
              </Carousel>
              <div className="flex justify-center gap-2 mt-5">
                {shownReviews.map((r, i) => (
                  <button
                    key={r.id}
                    aria-label={`Go to review ${i + 1}`}
                    onClick={() => api?.scrollTo(i)}
                    className={`h-2 rounded-pill transition-all ${i === selected ? "w-6 bg-royal" : "w-2 bg-royal/25"}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="mt-8">
          <Button onClick={() => setShowForm(!showForm)} variant="cta-outline">
            <Send className="h-4 w-4 mr-1" /> Write a Review
          </Button>
        </div>
        {showForm && (
          <div className="max-w-xl mx-auto">
            <ReviewForm name={name} setName={setName} rating={rating} setRating={setRating} text={text} setText={setText} submitting={submitting} onSubmit={submitReview} onCancel={() => setShowForm(false)} />
          </div>
        )}
      </div>
    </section>
  );
};

const ReviewCard = ({ r }: { r: any }) => (
  <div className="hover-lift relative bg-card border border-border shadow-sm rounded-2xl py-6 px-[5px] md:px-6 overflow-hidden h-full">
    <div className="flex items-center justify-between flex-wrap md:flex-nowrap gap-x-3 gap-y-1 md:gap-0 mb-3 relative z-10">
      <div className="min-w-0 md:min-w-fit">
        <p className="font-heading font-semibold text-foreground break-words md:break-normal">{r.patient_name}</p>
        <p className="text-xs text-text-gray">{new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0 md:shrink">
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
);

const ReviewForm = ({ name, setName, rating, setRating, text, setText, submitting, onSubmit, onCancel }: {
  name: string; setName: (v: string) => void; rating: number; setRating: (v: number) => void;
  text: string; setText: (v: string) => void; submitting: boolean; onSubmit: () => void; onCancel: () => void;
}) => (
  <div className="bg-secondary rounded-xl py-5 px-[5px] md:px-5 mt-4 text-left space-y-3">
    <h4 className="font-heading font-semibold text-primary text-sm">Share Your Experience</h4>
    <Input placeholder="Your Name *" value={name} onChange={(e) => setName(e.target.value)} />
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <button key={s} onClick={() => setRating(s)}>
          <Star size={24} className={s <= rating ? "text-warning" : "text-black dark:text-white"} fill={s <= rating ? "currentColor" : "none"} />
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
