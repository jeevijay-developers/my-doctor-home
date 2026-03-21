import { Star, Quote } from "lucide-react";
import testimonial1 from "@/assets/testimonial-doctor-1.png";
import testimonial2 from "@/assets/testimonial-doctor-2.png";
import testimonial3 from "@/assets/testimonial-doctor-3.png";

const reviews = [
  { name: "Dr. Priya Mehta", spec: "Dermatologist", city: "Pune", text: "Doctylia transformed my practice. I went from juggling WhatsApp messages to having a fully automated booking system. My patient no-shows dropped by 70%!", rating: 5, img: testimonial1 },
  { name: "Dr. Vikram Singh", spec: "General Physician", city: "Delhi", text: "Setting up my website took 5 minutes. Now patients find me on Google and book directly. The AI blog writer saves me hours every week — absolute game changer.", rating: 5, img: testimonial2 },
  { name: "Dr. Ananya Rao", spec: "Pediatrician", city: "Bangalore", text: "The billing feature alone is worth the subscription. GST invoices, payment tracking, online payments — everything I needed. My revenue went up 40% in 3 months.", rating: 5, img: testimonial3 },
];

const Testimonials = () => (
  <section className="py-14 md:py-20 bg-secondary">
    <div className="container mx-auto px-4">
      <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
        <span className="text-xs md:text-sm font-semibold text-accent uppercase tracking-wider">Testimonials</span>
        <h2 className="font-heading font-bold text-2xl sm:text-3xl md:text-4xl text-primary mt-2">
          Loved by 10,000+ Doctors Across India
        </h2>
        <div className="flex items-center justify-center gap-2 mt-4">
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-5 w-5 fill-warning text-warning" />
            ))}
          </div>
          <span className="text-sm font-semibold text-primary">4.9/5</span>
          <span className="text-xs text-muted-foreground">average rating · 200+ cities</span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6 max-w-5xl mx-auto">
        {reviews.map((r) => (
          <div key={r.name} className="bg-white rounded-2xl p-5 md:p-6 shadow-sm border border-border hover:shadow-md transition-shadow relative">
            <Quote className="absolute top-4 right-4 h-7 w-7 md:h-8 md:w-8 text-royal/10" />
            <div className="flex gap-0.5 mb-3 md:mb-4">
              {Array.from({ length: r.rating }).map((_, i) => (
                <Star key={i} className="h-4 w-4 md:h-5 md:w-5 fill-warning text-warning" />
              ))}
            </div>
            <p className="text-xs md:text-sm text-foreground leading-relaxed mb-5 md:mb-6">"{r.text}"</p>
            <div className="flex items-center gap-3 pt-3 md:pt-4 border-t border-border">
              <img src={r.img} alt={r.name} className="w-10 h-10 md:w-12 md:h-12 rounded-full object-cover border-2 border-secondary" />
              <div>
                <div className="font-heading font-semibold text-primary text-xs md:text-sm">{r.name}</div>
                <div className="text-[10px] md:text-xs text-muted-foreground">{r.spec} · {r.city}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default Testimonials;
