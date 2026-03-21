import { Star, Quote } from "lucide-react";
import testimonial1 from "@/assets/testimonial-doctor-1.png";
import testimonial2 from "@/assets/testimonial-doctor-2.png";
import testimonial3 from "@/assets/testimonial-doctor-3.png";

const reviews = [
  { name: "Dr. Priya Mehta", spec: "Dermatologist", city: "Pune", text: "Doctylia transformed my practice. I went from juggling WhatsApp messages to having a fully automated booking system. My patient no-shows dropped by 70%!", rating: 5, img: testimonial1 },
  { name: "Dr. Vikram Singh", spec: "General Physician", city: "Delhi", text: "Setting up my website took 5 minutes. Now my patients find me on Google and book directly. The AI blog writer is an amazing bonus — saves me hours every week.", rating: 5, img: testimonial2 },
  { name: "Dr. Ananya Rao", spec: "Pediatrician", city: "Bangalore", text: "The billing feature alone is worth the subscription. GST invoices, payment tracking, online payments — everything I needed. Plus my patients love the online consultation option.", rating: 5, img: testimonial3 },
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
          <div key={r.name} className="bg-white rounded-2xl p-6 shadow-sm border border-border hover:shadow-md transition-shadow relative">
            <Quote className="absolute top-4 right-4 h-8 w-8 text-royal/10" />
            <div className="flex gap-0.5 mb-4">
              {Array.from({ length: r.rating }).map((_, i) => (
                <Star key={i} className="h-5 w-5 fill-warning text-warning" />
              ))}
            </div>
            <p className="text-sm text-foreground leading-relaxed mb-6">"{r.text}"</p>
            <div className="flex items-center gap-3 pt-4 border-t border-border">
              <img src={r.img} alt={r.name} className="w-12 h-12 rounded-full object-cover border-2 border-secondary" />
              <div>
                <div className="font-heading font-semibold text-primary text-sm">{r.name}</div>
                <div className="text-xs text-muted-foreground">{r.spec} · {r.city}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default Testimonials;
