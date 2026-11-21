import { motion } from "framer-motion";
import { Star } from "lucide-react";
import MobileCarousel from "./MobileCarousel";
import testimonial1 from "@/assets/testimonial-doctor-1.webp";
import testimonial2 from "@/assets/testimonial-doctor-2.webp";
import testimonial3 from "@/assets/testimonial-doctor-3.webp";

const reviews = [
  { name: "Dr. Priya Mehta", spec: "Dermatologist", city: "Pune", text: "Doctylia replaced scattered WhatsApp messages with a branded site and online booking, so patients pick a slot themselves.", img: testimonial1 },
  { name: "Dr. Vikram Singh", spec: "General Physician", city: "Delhi", text: "My website was live within 10 minutes. Patients find me on Google and book directly, and the AI blog writer drafts articles I can edit and publish.", img: testimonial2 },
  { name: "Dr. Ananya Rao", spec: "Pediatrician", city: "Bangalore", text: "GST invoices, payment tracking, and online payments are in one place, which is what I needed for day-to-day billing.", img: testimonial3 },
];

const Stars = ({ className = "h-4 w-4" }: { className?: string }) => (
  <div className="flex gap-0.5" role="img" aria-label="5 out of 5 stars">
    {Array.from({ length: 5 }).map((_, i) => (
      <Star key={i} className={`${className} fill-warning text-warning`} aria-hidden="true" />
    ))}
  </div>
);

const Testimonials = () => (
  <section className="bg-secondary/40 py-14 md:py-20" aria-labelledby="testimonials-heading">
    <div className="container mx-auto px-4">
      <div className="mx-auto mb-10 max-w-3xl text-center md:mb-14">
        <span className="inline-block rounded-full bg-secondary px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-primary md:text-sm">
          Practitioner Endorsements
        </span>
        <h2 id="testimonials-heading" className="mt-3 font-heading text-2xl font-bold text-navy sm:text-3xl md:text-4xl">
          Loved by 2,500+ Indian Doctors Across Every Specialty
        </h2>
        <div className="mt-3 flex items-center justify-center gap-2">
          <Stars className="h-5 w-5" />
          <span className="font-bold text-navy">4.9 / 5</span>
          <span className="text-sm text-muted-foreground">average rating</span>
        </div>
      </div>

      <div className="mx-auto max-w-6xl">
      <MobileCarousel label="Doctor reviews" desktopClassName="md:grid md:grid-cols-3 md:gap-6">
        {reviews.map((r, i) => (
          <motion.figure
            key={r.name}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.4, delay: i * 0.1 }}
            className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm"
          >
            <div className="space-y-4">
              <Stars />
              <blockquote className="italic leading-relaxed text-foreground">"{r.text}"</blockquote>
            </div>
            <figcaption className="mt-6 flex items-center gap-3 border-t border-border pt-6">
              <img src={r.img} alt={r.name} loading="lazy" decoding="async" className="h-11 w-11 rounded-full object-cover" />
              <div>
                <div className="font-heading font-semibold text-navy">{r.name}</div>
                <div className="text-sm text-muted-foreground">{r.spec} • {r.city}</div>
              </div>
            </figcaption>
          </motion.figure>
        ))}
      </MobileCarousel>
      </div>
    </div>
  </section>
);

export default Testimonials;
