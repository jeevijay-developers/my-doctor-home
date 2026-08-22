import { useEffect, useState } from "react";
import { MessageSquareHeart, PenLine, Quote, ShieldCheck, Star } from "lucide-react";
import { useDoctorData } from "@/contexts/DoctorContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi,
} from "@/components/ui/carousel";
import { cardColorClass, type CardColor } from "@/lib/cardColor";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import type { Tables } from "@/integrations/supabase/types";

const PRIMARY = "#3C83FC";
const CAROUSEL_THRESHOLD = 2;
type Review = Tables<"reviews">;

const formatReviewDate = (date: string) => new Date(date).toLocaleDateString("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const ReviewStars = ({ rating, size = 15 }: { rating: number; size?: number }) => (
  <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((star) => (
      <Star
        key={star}
        size={size}
        className={star <= rating ? "fill-amber-400 text-amber-400" : "fill-slate-100 text-slate-200 dark:fill-gray-800 dark:text-gray-700"}
      />
    ))}
  </span>
);

const ReviewCard = ({ review }: { review: Review }) => {
  const initials = review.patient_name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "P";

  return (
    <article className="group relative flex h-full min-h-[230px] flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white p-5 shadow-[0_10px_30px_rgba(15,43,80,0.07)] transition-all duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_18px_38px_rgba(60,131,252,0.14)] dark:border-blue-900/60 dark:bg-gray-900 dark:hover:border-blue-700 sm:p-6">
      <Quote className="pointer-events-none absolute -right-2 -top-3 h-24 w-24 rotate-6 text-blue-50 transition-transform duration-500 group-hover:scale-110 dark:text-blue-950/35" fill="currentColor" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-500 text-sm font-extrabold text-white shadow-[0_6px_16px_rgba(60,131,252,0.24)]">
            {initials}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-heading text-sm font-extrabold text-[#092b50] dark:text-white sm:text-base">
              {review.patient_name}
            </span>
            <span className="mt-0.5 block text-[11px] font-medium text-slate-400">
              {formatReviewDate(review.created_at)}
            </span>
          </span>
        </div>
        <ReviewStars rating={review.rating} size={14} />
      </div>

      <p className="relative mt-5 flex-1 text-sm leading-7 text-slate-600 dark:text-slate-300">
        “{review.review_text || "A wonderful consultation experience."}”
      </p>

      {review.is_verified && (
        <span className="relative mt-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
          <ShieldCheck className="h-3.5 w-3.5" />
          Verified Patient
        </span>
      )}
    </article>
  );
};

const ReviewsSection = ({ cardColor = "card" }: { cardColor?: CardColor }) => {
  const { reviews, profile } = useDoctorData();
  const patientReviews = reviews as Review[];
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [selectedReview, setSelectedReview] = useState(0);
  const [snapCount, setSnapCount] = useState(0);
  const isDesktop = useIsDesktop();
  const showCarousel = patientReviews.length === 0 || !isDesktop || patientReviews.length > CAROUSEL_THRESHOLD;

  useEffect(() => {
    if (!carouselApi) return;
    const updateCarousel = () => {
      setSelectedReview(carouselApi.selectedScrollSnap());
      setSnapCount(carouselApi.scrollSnapList().length);
    };
    updateCarousel();
    carouselApi.on("select", updateCarousel);
    carouselApi.on("reInit", updateCarousel);
    return () => {
      carouselApi.off("select", updateCarousel);
      carouselApi.off("reInit", updateCarousel);
    };
  }, [carouselApi]);

  const averageRating = patientReviews.length > 0
    ? (patientReviews.reduce((sum, review) => sum + review.rating, 0) / patientReviews.length).toFixed(1)
    : null;

  const submitReview = async () => {
    if (!name.trim() || !profile) return;
    setSubmitting(true);
    const { error } = await supabase.from("reviews").insert({
      doctor_id: profile.id,
      patient_name: name.trim(),
      rating,
      review_text: text.trim() || null,
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

  const doctorName = profile?.full_name || "Doctor";

  return (
    <section id="reviews" className={`relative overflow-hidden ${cardColorClass(cardColor)}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_50%_0%,rgba(60,131,252,0.12),transparent_72%)]" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-64 w-64 rounded-full bg-blue-100/40 blur-3xl dark:bg-blue-900/15" />

      <div className="relative mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16 lg:px-12 lg:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-heading text-xs font-extrabold uppercase tracking-[0.18em]" style={{ color: PRIMARY }}>
            Trusted Patient Stories
          </p>
          <h2 className="mt-3 font-heading text-3xl font-extrabold tracking-[-0.035em] text-[#092b50] dark:text-white sm:text-4xl lg:text-5xl">
            Patient <span style={{ color: PRIMARY }}>Reviews</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400 sm:text-base">
            See what patients say about their experience with Dr. {doctorName}.
          </p>

          {averageRating && (
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-4 py-2 shadow-sm dark:border-blue-900 dark:bg-gray-900">
              <ReviewStars rating={Math.round(Number(averageRating))} />
              <span className="font-heading text-sm font-extrabold text-[#092b50] dark:text-white">{averageRating}</span>
              <span className="h-4 w-px bg-slate-200 dark:bg-gray-700" />
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {patientReviews.length} review{patientReviews.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>

        {patientReviews.length > 0 ? (
          showCarousel ? (
            <Carousel
              setApi={setCarouselApi}
              opts={{ align: "start", loop: patientReviews.length > 2 }}
              className="mx-auto mt-9 max-w-5xl sm:mt-12"
            >
              <CarouselContent className="-ml-4 pb-2">
                {patientReviews.map((review) => (
                  <CarouselItem key={review.id} className="basis-[94%] pl-4 md:basis-1/2">
                    <ReviewCard review={review} />
                  </CarouselItem>
                ))}
              </CarouselContent>

              <div className="mt-7 flex items-center justify-center gap-4">
                <CarouselPrevious className="static h-10 w-10 translate-y-0 border-blue-200 bg-white text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-gray-900 dark:text-blue-300" />
                <div className="flex items-center gap-1.5">
                  {Array.from({ length: snapCount }, (_, index) => (
                    <button
                      key={index}
                      type="button"
                      aria-label={`Go to review ${index + 1}`}
                      onClick={() => carouselApi?.scrollTo(index)}
                      className={`h-2 rounded-full transition-all duration-300 ${selectedReview === index ? "w-6" : "w-2 bg-blue-200 dark:bg-blue-900"}`}
                      style={selectedReview === index ? { backgroundColor: PRIMARY } : undefined}
                    />
                  ))}
                </div>
                <CarouselNext className="static h-10 w-10 translate-y-0 border-blue-200 bg-white text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-gray-900 dark:text-blue-300" />
              </div>
            </Carousel>
          ) : (
            <div className="mx-auto mt-9 grid max-w-5xl gap-6 sm:mt-12 md:grid-cols-2">
              {patientReviews.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}
            </div>
          )
        ) : (
          <div className="mx-auto mt-9 max-w-xl rounded-2xl border border-dashed border-blue-200 bg-white/70 px-6 py-10 text-center dark:border-blue-800 dark:bg-gray-900/70">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-primary-500 dark:bg-blue-950/40">
              <MessageSquareHeart className="h-7 w-7" />
            </span>
            <h3 className="mt-4 font-heading text-lg font-extrabold text-[#092b50] dark:text-white">Be the first to share your experience</h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Your feedback helps other patients make confident healthcare decisions.</p>
          </div>
        )}

        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-primary-500 bg-white px-6 text-sm font-bold text-primary-500 transition-all hover:-translate-y-0.5 hover:bg-blue-50 hover:shadow-md dark:bg-gray-900 dark:hover:bg-blue-950/30"
          >
            <PenLine className="h-4 w-4" />
            Write a Review
          </button>
        </div>

        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="max-w-xl overflow-hidden rounded-[1.75rem] border border-blue-100 bg-white p-0 shadow-[0_28px_70px_rgba(15,43,80,0.25)] duration-300 dark:border-blue-900/70 dark:bg-gray-900">
            <DialogHeader className="sr-only">
              <DialogTitle>Write a Patient Review</DialogTitle>
              <DialogDescription>Share your experience and rating for this doctor.</DialogDescription>
            </DialogHeader>
            <ReviewForm
              name={name}
              setName={setName}
              rating={rating}
              setRating={setRating}
              text={text}
              setText={setText}
              submitting={submitting}
              onSubmit={submitReview}
              onCancel={() => setShowForm(false)}
            />
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
};

const ReviewForm = ({
  name, setName, rating, setRating, text, setText, submitting, onSubmit, onCancel,
}: {
  name: string;
  setName: (value: string) => void;
  rating: number;
  setRating: (value: number) => void;
  text: string;
  setText: (value: string) => void;
  submitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) => (
  <div className="bg-white p-6 pt-8 text-left dark:bg-gray-900 sm:p-8">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h3 className="font-heading text-lg font-extrabold text-[#092b50] dark:text-white">Share Your Experience</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Your review will help future patients.</p>
      </div>
      <MessageSquareHeart className="h-6 w-6 shrink-0 text-primary-500" />
    </div>

    <div className="mt-5 space-y-4">
      <Input
        placeholder="Your name *"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="h-12 rounded-xl border-slate-200 focus-visible:ring-primary-500 dark:border-gray-700"
      />

      <div>
        <p className="mb-2 text-xs font-bold text-slate-500 dark:text-slate-400">Your rating</p>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              aria-label={`Rate ${star} star${star === 1 ? "" : "s"}`}
              onClick={() => setRating(star)}
              className="rounded-lg p-1 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
              <Star size={26} className={star <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-gray-700"} />
            </button>
          ))}
        </div>
      </div>

      <Textarea
        placeholder="Tell others about your experience (optional)"
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={4}
        className="resize-none rounded-xl border-slate-200 focus-visible:ring-primary-500 dark:border-gray-700"
      />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onCancel} type="button" className="h-11 rounded-xl px-5">Cancel</Button>
        <Button
          onClick={onSubmit}
          disabled={!name.trim() || submitting}
          className="h-11 rounded-xl bg-primary-500 px-6 font-bold text-white shadow-[0_8px_20px_rgba(60,131,252,0.22)] hover:bg-primary-600"
        >
          {submitting ? "Submitting..." : "Submit Review"}
        </Button>
      </div>
    </div>
  </div>
);

export default ReviewsSection;
