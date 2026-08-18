import { useEffect, useState } from "react";
import { Star, ShieldCheck, Send, Quote, PenSquare } from "lucide-react";
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

const DEFAULT_REVIEWS = [
  {
    id: "r1",
    patient_name: "Sakshi",
    rating: 5,
    review_text: "nice",
    created_at: "2026-08-06T10:00:00.000Z",
  },
];

const DesktopReviewCard = ({ r }: { r: any }) => (
  <div className="hover-lift relative bg-card border border-border shadow-sm rounded-2xl py-6 px-[5px] md:px-6 overflow-hidden h-full">
    <div className="flex items-center justify-between flex-wrap md:flex-nowrap gap-x-3 gap-y-1 md:gap-0 mb-3 relative z-10">
      <div className="min-w-0 md:min-w-fit">
        <p className="font-heading font-semibold text-foreground break-words md:break-normal">{r.patient_name}</p>
        <p className="text-xs text-text-gray">
          {r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "6 Aug 2026"}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0 md:shrink">
        {[...Array(r.rating || 5)].map((_, j) => <Star key={j} size={14} className="text-warning" fill="currentColor" />)}
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

const ReviewsSection = ({ cardColor = "card" }: { cardColor?: CardColor }) => {
  const { reviews, profile } = useDoctorData();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [api, setApi] = useState<CarouselApi>();
  const [selected, setSelected] = useState(0);
  const [activeMobileDot, setActiveMobileDot] = useState(0);

  const displayReviews = reviews && reviews.length > 0 ? reviews : DEFAULT_REVIEWS;

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setSelected(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => { api.off("select", onSelect); };
  }, [api]);

  const avgRating = displayReviews.length > 0
    ? (displayReviews.reduce((s, r) => s + r.rating, 0) / displayReviews.length).toFixed(1)
    : "5.0";

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

  const docName = profile?.full_name || "Rajkumar Prajapati";
  const shownReviews = displayReviews.slice(0, 5);

  return (
    <>
      {/* MOBILE VIEW (md:hidden) */}
      <div className="md:hidden">
        <section id="reviews" className="py-10 bg-surface-light dark:bg-gray-900/80 rounded-3xl my-4">
          <div className="text-center px-4 mb-6">
            <h2 className="text-2xl font-bold text-text-dark dark:text-foreground mb-2">Patient Reviews</h2>
            <p className="text-xs text-text-muted dark:text-muted-foreground mb-3">
              What our patients say about Dr. {docName}
            </p>
            <div className="flex items-center justify-center gap-1 text-sm">
              <div className="flex text-yellow-400 text-xs">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={14} className="fill-current" />
                ))}
              </div>
              <span className="font-bold text-text-dark dark:text-foreground ml-1">{avgRating}</span>
              <span className="text-text-muted dark:text-muted-foreground text-xs ml-1">
                · {displayReviews.length} review{displayReviews.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <div className="px-4 mb-6 max-w-lg mx-auto">
            <div
              className="flex overflow-x-auto hide-scrollbar gap-4 snap-x pb-2"
              onScroll={(e) => {
                const target = e.currentTarget;
                const scrollPos = target.scrollLeft;
                const cardWidth = target.clientWidth;
                const index = Math.round(scrollPos / cardWidth);
                setActiveMobileDot(Math.min(index, displayReviews.length - 1));
              }}
            >
              {displayReviews.map((r: any, idx: number) => {
                const dateStr = r.created_at
                  ? new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                  : "6 Aug 2026";
                return (
                  <div
                    key={r.id || idx}
                    className="w-full shrink-0 snap-center bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-bold text-text-dark dark:text-foreground text-sm">{r.patient_name}</h4>
                        <p className="text-[10px] text-text-muted dark:text-muted-foreground">{dateStr}</p>
                      </div>
                      <div className="flex text-yellow-400 text-[10px]">
                        {[...Array(r.rating || 5)].map((_, j) => (
                          <Star key={j} size={12} className="fill-current" />
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-text-dark dark:text-gray-200">{r.review_text || "nice"}</p>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-center gap-1.5 mt-4">
              {displayReviews.map((_, i) => (
                <div
                  key={i}
                  className={`transition-all duration-300 ${
                    i === activeMobileDot ? "w-4 h-1.5 rounded-full bg-primary-500" : "w-1.5 h-1.5 rounded-full bg-primary-200 dark:bg-gray-700"
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="text-center px-4">
            <button
              onClick={() => setShowForm(!showForm)}
              className="bg-primary-50 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800 text-sm font-semibold py-2 px-6 rounded-full inline-flex items-center gap-2 hover:bg-primary-100 transition-colors"
            >
              <PenSquare size={14} /> Write a Review
            </button>
          </div>

          {showForm && (
            <div className="max-w-xl mx-auto px-4 mt-6">
              <ReviewForm
                name={name} setName={setName} rating={rating} setRating={setRating} text={text} setText={setText}
                submitting={submitting} onSubmit={submitReview} onCancel={() => setShowForm(false)}
              />
            </div>
          )}
        </section>
      </div>

      {/* DESKTOP VIEW (hidden md:block) */}
      <div className="hidden md:block">
        <section id="reviews-desktop" className={`py-16 md:py-24 relative overflow-hidden ${cardColorClass(cardColor)}`}>
          <div className="container mx-auto px-[5px] md:px-4 text-center relative z-10">
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
                <DesktopReviewCard r={shownReviews[0]} />
              ) : (
                <>
                  <Carousel setApi={setApi} opts={{ align: "center", loop: true }} className="px-1">
                    <CarouselContent>
                      {shownReviews.map((r) => (
                        <CarouselItem key={r.id}>
                          <DesktopReviewCard r={r} />
                        </CarouselItem>
                      ))}
                    </CarouselContent>
                    <CarouselPrevious className="-left-12 border-border bg-card" />
                    <CarouselNext className="-right-12 border-border bg-card" />
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
                <ReviewForm
                  name={name} setName={setName} rating={rating} setRating={setRating} text={text} setText={setText}
                  submitting={submitting} onSubmit={submitReview} onCancel={() => setShowForm(false)}
                />
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
};

const ReviewForm = ({
  name, setName, rating, setRating, text, setText, submitting, onSubmit, onCancel
}: {
  name: string; setName: (v: string) => void; rating: number; setRating: (v: number) => void;
  text: string; setText: (v: string) => void; submitting: boolean; onSubmit: () => void; onCancel: () => void;
}) => (
  <div className="bg-secondary rounded-xl py-5 px-[5px] md:px-5 mt-4 text-left space-y-3">
    <h4 className="font-heading font-semibold text-primary text-sm">Share Your Experience</h4>
    <Input placeholder="Your Name *" value={name} onChange={(e) => setName(e.target.value)} />
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <button key={s} onClick={() => setRating(s)} type="button">
          <Star size={20} className={s <= rating ? "text-warning fill-current" : "text-gray-300"} />
        </button>
      ))}
    </div>
    <Textarea placeholder="Your review (optional)" value={text} onChange={(e) => setText(e.target.value)} rows={3} />
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={onCancel} type="button">Cancel</Button>
      <Button size="sm" onClick={onSubmit} disabled={!name.trim() || submitting} className="bg-royal hover:bg-royal/90 text-white">
        {submitting ? "Submitting..." : "Submit Review"}
      </Button>
    </div>
  </div>
);

export default ReviewsSection;
