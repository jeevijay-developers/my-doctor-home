import { useRef, useState } from "react";
import { useSpotlight } from "./effects/useSpotlight";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, PenLine, ShieldCheck, Star } from "lucide-react";
import { toast } from "sonner";
import { useDoctorData } from "@/contexts/DoctorContext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ratingSummary } from "@/lib/doctorSite/doctorFacts";
import { dsCn as cn } from "./ui/dsCn";
import { radioKeyDown } from "./ui/radioKeyDown";
import DsButton from "./ui/DsButton";
import SectionHeader from "./ui/SectionHeader";
import { DUR, EASE, staggerDelay } from "./motion/tokens";
import type { Tables } from "@/integrations/supabase/types";

type Review = Tables<"reviews">;

const formatReviewDate = (date: string) =>
  new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const Stars = ({ rating, size = 16 }: { rating: number; size?: number }) => (
  <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((star) => (
      <Star
        key={star}
        width={size}
        height={size}
        aria-hidden="true"
        className={star <= rating ? "fill-ds-star text-ds-star" : "fill-transparent text-ds-line"}
        strokeWidth={1.5}
      />
    ))}
  </span>
);

// A review longer than this many characters is cut after 5 lines with a "Read more" link, so the
// tallest card is bounded and every card in the row stretches to the same height. (About 30
// characters fit on a line of a card.)
const CLAMP_CHARS = 140;

const ReviewCard = ({ review, index, onRead }: { review: Review; index: number; onRead: (review: Review) => void }) => {
  const spotlight = useSpotlight<HTMLElement>();
  const text = (review.review_text ?? "").trim();
  const long = text.length > CLAMP_CHARS;
  return (
    <motion.article
      {...spotlight}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: DUR.medium, ease: EASE.out, delay: staggerDelay(index) }}
      className="ds-spotlight flex w-[85vw] max-w-[22rem] shrink-0 snap-start flex-col rounded-ds-md border border-ds-line bg-ds-surface p-6 shadow-ds-1 sm:w-[22rem]"
    >
      <Stars rating={review.rating} />
      <div className="mt-4 flex-1">
        <blockquote className={`font-ds-display text-[1.1875rem] leading-snug text-ds-ink ${long ? "line-clamp-5" : ""}`}>
          {text ? `“${text}”` : <span className="text-ds-ink-2">Rated {review.rating} out of 5.</span>}
        </blockquote>
        {long && (
          <button
            type="button"
            onClick={() => onRead(review)}
            aria-label={`Read the full review by ${review.patient_name}`}
            className="mt-2 inline-flex min-h-8 items-center text-ds-small font-medium text-ds-accent-ink underline-offset-4 hover:underline"
          >
            Read more
          </button>
        )}
      </div>
      <footer className="mt-4 flex items-center justify-between gap-3 border-t border-ds-line pt-4 text-ds-small">
        <span className="min-w-0">
          <span className="block truncate font-medium text-ds-ink">{review.patient_name}</span>
          <span className="block text-ds-ink-3">{formatReviewDate(review.created_at)}</span>
        </span>
        {review.is_verified && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ds-accent-soft px-2.5 py-1 text-ds-label font-medium text-ds-accent-ink">
            <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
            Verified
          </span>
        )}
      </footer>
    </motion.article>
  );
};

const Distribution = ({ rows, total }: { rows: { stars: number; count: number }[]; total: number }) => (
  <ul className="w-full max-w-[18rem] space-y-1.5" aria-label="Ratings breakdown">
    {rows.map((row) => (
      <li key={row.stars} className="flex items-center gap-3 text-ds-label text-ds-ink-2">
        <span className="w-9 shrink-0 ds-tabular">{row.stars} ★</span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ds-line" aria-hidden="true">
          <span className="block h-full rounded-full bg-ds-star" style={{ width: `${total ? (row.count / total) * 100 : 0}%` }} />
        </span>
        <span className="w-6 shrink-0 text-right ds-tabular">{row.count}</span>
      </li>
    ))}
  </ul>
);

const ReviewsSection = () => {
  const { reviews, profile } = useDoctorData();
  const list = (reviews ?? []) as Review[];
  const summary = ratingSummary(list);
  const railRef = useRef<HTMLDivElement>(null);

  const [showForm, setShowForm] = useState(false);
  const [reading, setReading] = useState<Review | null>(null);
  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const scrollRail = (direction: 1 | -1) =>
    railRef.current?.scrollBy({ left: direction * 360, behavior: "smooth" });

  // Unchanged behaviour: a public insert, moderated by the doctor from the dashboard.
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

  return (
    <section id="reviews" aria-labelledby="reviews-heading" className="bg-ds-paper-2 py-[4.5rem] md:py-32">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
        <SectionHeader
          id="reviews-heading"
          eyebrow="Patient reviews"
          title={summary ? "What patients say" : "Be the first to share your experience"}
          intro={summary ? undefined : "Your feedback helps other patients make a confident choice."}
          aside={
            summary ? (
              <div className="flex flex-col gap-4 md:items-end">
                <div className="flex items-end gap-4">
                  <p className="font-ds-display text-[3.5rem] font-medium leading-none ds-tabular">{summary.average.toFixed(1)}</p>
                  <div className="pb-1">
                    <Stars rating={Math.round(summary.average)} size={18} />
                    <p className="mt-1 text-ds-small text-ds-ink-2">
                      {summary.count} review{summary.count === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                {summary.count >= 3 && <Distribution rows={summary.distribution} total={summary.count} />}
              </div>
            ) : undefined
          }
        />

        {list.length > 0 && (
          <div className="relative mt-10 md:mt-14">
            <div
              ref={railRef}
              // Only sideways gestures belong to the rail. Opting the whole wheel out of Lenis (with the
              // overscroll containment its CSS adds) made the page stop scrolling over the cards.
              data-lenis-prevent-horizontal
              tabIndex={0}
              role="region"
              aria-label="Patient reviews, scroll sideways for more"
              className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain px-5 pb-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
            >
              {list.map((review, index) => (
                <ReviewCard key={review.id} review={review} index={index} onRead={setReading} />
              ))}
            </div>
            {list.length > 3 && (
              <div className="mt-4 hidden justify-end gap-2 lg:flex">
                <button type="button" onClick={() => scrollRail(-1)} aria-label="Previous reviews" className="flex h-12 w-12 items-center justify-center rounded-full border border-ds-line bg-ds-surface transition-colors hover:border-ds-ink/30">
                  <ChevronLeft aria-hidden="true" className="h-5 w-5" />
                </button>
                <button type="button" onClick={() => scrollRail(1)} aria-label="More reviews" className="flex h-12 w-12 items-center justify-center rounded-full border border-ds-line bg-ds-surface transition-colors hover:border-ds-ink/30">
                  <ChevronRight aria-hidden="true" className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        )}

        <div className={cn("flex", list.length > 0 ? "mt-8 justify-start" : "mt-8")}>
          <DsButton variant="secondary" onClick={() => setShowForm(true)}>
            <PenLine aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} />
            Write a review
          </DsButton>
        </div>
      </div>

      {/* Portalled outside .doctor-site, so the dialog carries the scope itself. */}
      <Dialog open={reading !== null} onOpenChange={(open) => { if (!open) setReading(null); }}>
        <DialogContent className="doctor-site max-w-lg gap-0 rounded-ds-lg border-ds-line bg-ds-paper p-6 text-ds-ink shadow-ds-3 sm:p-8">
          {reading && (
            <>
              <DialogHeader className="space-y-2 text-left">
                <DialogTitle className="font-ds-display text-ds-h3 font-medium">{reading.patient_name}</DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ds-small text-ds-ink-2">
                  <Stars rating={reading.rating} />
                  <span>{formatReviewDate(reading.created_at)}</span>
                  {reading.is_verified && <span className="text-ds-accent-ink">Verified</span>}
                </DialogDescription>
              </DialogHeader>
              <blockquote className="mt-5 max-h-[55vh] overflow-y-auto whitespace-pre-line font-ds-display text-[1.1875rem] leading-snug text-ds-ink" data-lenis-prevent>
                {`“${(reading.review_text ?? "").trim()}”`}
              </blockquote>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="doctor-site max-w-lg gap-0 overflow-hidden rounded-ds-lg border-ds-line bg-ds-paper p-0 text-ds-ink shadow-ds-3">
          <DialogHeader className="space-y-1 p-6 pb-2 text-left sm:p-8 sm:pb-2">
            <DialogTitle className="font-ds-display text-ds-h3 font-medium">Share your experience</DialogTitle>
            <DialogDescription className="text-ds-small text-ds-ink-2">Your review helps future patients. It may appear after the clinic has seen it.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-5 p-6 pt-4 sm:p-8 sm:pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submitReview();
            }}
          >
            <div>
              <label htmlFor="review-name" className="mb-1.5 block text-ds-small font-medium">Your name</label>
              <input
                id="review-name"
                autoFocus
                autoComplete="name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-12 w-full rounded-ds-sm border border-ds-line bg-ds-surface px-4 text-ds-body outline-none transition-colors focus:border-ds-accent"
              />
            </div>

            <fieldset>
              <legend className="mb-1.5 text-ds-small font-medium">Your rating</legend>
              <div className="flex gap-1" role="radiogroup" aria-label="Rating" onKeyDown={radioKeyDown}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    role="radio"
                    tabIndex={rating === star ? 0 : -1}
                    aria-checked={rating === star}
                    aria-label={`${star} star${star === 1 ? "" : "s"}`}
                    onClick={() => setRating(star)}
                    className="flex h-12 w-12 items-center justify-center rounded-full transition-transform hover:scale-110 active:scale-95"
                  >
                    <Star aria-hidden="true" className={cn("h-8 w-8", star <= rating ? "fill-ds-star text-ds-star" : "text-ds-ink-3")} strokeWidth={1.5} />
                  </button>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="review-text" className="mb-1.5 block text-ds-small font-medium">
                Tell others about your visit <span className="font-normal text-ds-ink-3">(optional)</span>
              </label>
              <textarea
                id="review-text"
                rows={4}
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="w-full resize-none rounded-ds-sm border border-ds-line bg-ds-surface px-4 py-3 text-ds-body outline-none transition-colors focus:border-ds-accent"
              />
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <DsButton variant="quiet" onClick={() => setShowForm(false)}>Cancel</DsButton>
              <DsButton type="submit" disabled={!name.trim() || submitting}>
                {submitting ? "Submitting…" : "Submit review"}
              </DsButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default ReviewsSection;
