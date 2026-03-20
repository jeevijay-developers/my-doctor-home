import { Star, ShieldCheck } from "lucide-react";

const reviews = [
  { name: "Priya S.", city: "Mumbai", rating: 5, date: "15 Feb 2025", text: "Dr. Sharma is incredibly thorough. He explained my condition in simple terms and made me feel at ease. Highly recommend for any heart-related concerns!" },
  { name: "Amit K.", city: "Pune", rating: 5, date: "28 Jan 2025", text: "Excellent doctor. Very patient and knowledgeable. The clinic is clean and well-equipped. My ECG and Echo were done in the same visit." },
  { name: "Sunita M.", city: "Thane", rating: 4, date: "10 Jan 2025", text: "Very good consultation. Dr. Sharma took time to listen to all my concerns. The online consultation was seamless via WhatsApp video call." },
];

const ratingDist = [{ stars: 5, pct: 78 }, { stars: 4, pct: 15 }, { stars: 3, pct: 5 }, { stars: 2, pct: 1 }, { stars: 1, pct: 1 }];

const ReviewsSection = () => (
  <section id="reviews" className="py-16 md:py-24 bg-card">
    <div className="container mx-auto px-4">
      <h2 className="font-heading font-bold text-3xl md:text-4xl text-primary text-center mb-12">Patient Reviews</h2>
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Rating summary */}
        <div className="lg:col-span-1 bg-secondary rounded-2xl p-6 text-center self-start">
          <p className="font-heading font-extrabold text-6xl text-primary">4.9</p>
          <div className="flex justify-center text-warning my-2">
            {[...Array(5)].map((_, i) => <Star key={i} size={20} fill="currentColor" />)}
          </div>
          <p className="text-sm text-text-gray mb-6">Based on 187 reviews</p>
          <div className="space-y-2">
            {ratingDist.map(r => (
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

        {/* Review cards */}
        <div className="lg:col-span-2 space-y-4">
          {reviews.map((r, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-heading font-semibold text-foreground">{r.name} <span className="text-text-gray text-sm font-normal">· {r.city}</span></p>
                  <p className="text-xs text-text-gray">{r.date}</p>
                </div>
                <div className="flex items-center gap-1">
                  {[...Array(r.rating)].map((_, j) => <Star key={j} size={14} className="text-warning" fill="currentColor" />)}
                </div>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{r.text}</p>
              <span className="inline-flex items-center gap-1 mt-3 px-2 py-0.5 rounded-pill bg-teal/10 text-teal text-xs font-medium">
                <ShieldCheck size={12} /> Verified Patient
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);

export default ReviewsSection;
