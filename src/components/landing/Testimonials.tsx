import { Star } from "lucide-react";

const reviews = [
  { name: "Dr. Priya Mehta", spec: "Dermatologist, Pune", text: "Doctylia transformed my practice. I went from juggling WhatsApp messages to having a fully automated booking system. My patient no-shows dropped by 70%!", rating: 5 },
  { name: "Dr. Vikram Singh", spec: "General Physician, Delhi", text: "Setting up my website took 5 minutes. Now my patients find me on Google and book directly. The AI blog writer is an amazing bonus — saves me hours every week.", rating: 5 },
  { name: "Dr. Ananya Rao", spec: "Pediatrician, Bangalore", text: "The billing feature alone is worth the subscription. GST invoices, payment tracking, online payments — everything I needed. Plus my patients love the online consultation option.", rating: 5 },
];

const Testimonials = () => (
  <section className="py-20 bg-secondary">
    <div className="container mx-auto px-4">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <span className="text-sm font-semibold text-accent uppercase tracking-wider">Testimonials</span>
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-primary mt-2">
          Loved by Doctors Across India
        </h2>
      </div>
      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {reviews.map((r) => (
          <div key={r.name} className="bg-white rounded-xl p-6 shadow-sm border border-border">
            <div className="flex gap-0.5 mb-3">
              {Array.from({ length: r.rating }).map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-warning text-warning" />
              ))}
            </div>
            <p className="text-sm text-foreground leading-relaxed">"{r.text}"</p>
            <div className="mt-4 pt-4 border-t border-border">
              <div className="font-heading font-semibold text-primary text-sm">{r.name}</div>
              <div className="text-xs text-muted-foreground">{r.spec}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default Testimonials;
