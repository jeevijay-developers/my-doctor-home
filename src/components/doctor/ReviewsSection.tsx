import { Star, ShieldCheck } from "lucide-react";
import { useDoctorData } from "@/contexts/DoctorContext";

const ReviewsSection = () => {
  const { reviews } = useDoctorData();

  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : "0";

  const ratingDist = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    pct: reviews.length > 0 ? Math.round((reviews.filter((r) => r.rating === stars).length / reviews.length) * 100) : 0,
  }));

  if (reviews.length === 0) {
    return (
      <section id="reviews" className="py-16 md:py-24 bg-card">
        <div className="container mx-auto px-4 text-center">
          <h2 className="font-heading font-bold text-3xl text-primary mb-4">Patient Reviews</h2>
          <p className="text-text-gray">No reviews yet. Be the first to share your experience!</p>
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
          </div>
          <div className="lg:col-span-2 space-y-4">
            {reviews.slice(0, 5).map((r) => (
              <div key={r.id} className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-heading font-semibold text-foreground">{r.patient_name}</p>
                    <p className="text-xs text-text-gray">{new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {[...Array(r.rating)].map((_, j) => <Star key={j} size={14} className="text-warning" fill="currentColor" />)}
                  </div>
                </div>
                {r.review_text && <p className="text-sm text-foreground leading-relaxed">{r.review_text}</p>}
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

export default ReviewsSection;
