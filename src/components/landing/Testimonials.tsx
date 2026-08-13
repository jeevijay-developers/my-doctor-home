import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Star, Quote } from "lucide-react";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import testimonial1 from "@/assets/testimonial-doctor-1.png";
import testimonial2 from "@/assets/testimonial-doctor-2.png";
import testimonial3 from "@/assets/testimonial-doctor-3.png";

const reviews = [
  { name: "Dr. Priya Mehta", spec: "Dermatologist", city: "Pune", text: "Doctylia transformed my practice. I went from juggling WhatsApp messages to having a fully automated booking system. My patient no-shows dropped by 70%!", rating: 5, img: testimonial1 },
  { name: "Dr. Vikram Singh", spec: "General Physician", city: "Delhi", text: "Setting up my website took 5 minutes. Now patients find me on Google and book directly. The AI blog writer saves me hours every week — absolute game changer.", rating: 5, img: testimonial2 },
  { name: "Dr. Ananya Rao", spec: "Pediatrician", city: "Bangalore", text: "The billing feature alone is worth the subscription. GST invoices, payment tracking, online payments — everything I needed. My revenue went up 40% in 3 months.", rating: 5, img: testimonial3 },
  { name: "Dr. Rajesh Gupta", spec: "Cardiologist", city: "Mumbai", text: "I was skeptical about online platforms, but Doctylia proved me wrong. My appointments doubled in 2 months and the patient management system is incredibly intuitive.", rating: 5, img: testimonial2 },
  { name: "Dr. Sneha Patel", spec: "Gynecologist", city: "Ahmedabad", text: "The online consultation feature is a lifesaver. I can now serve patients across Gujarat without them traveling hours. Revenue grew 60% since joining Doctylia.", rating: 5, img: testimonial3 },
  { name: "Dr. Arjun Nair", spec: "Orthopedic Surgeon", city: "Kochi", text: "Finally, a platform that understands Indian doctors! The WhatsApp integration, UPI payments, and Hindi blog support — everything is tailored for our market.", rating: 5, img: testimonial1 },
];

const container = { hidden: {}, show: { transition: { staggerChildren: 0.1 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const Testimonials = () => {
  const [api, setApi] = useState<CarouselApi>();
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setSelected(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  return (
    <section className="py-14 md:py-20 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
          <span className="text-xs md:text-sm font-semibold text-accent uppercase tracking-wider">Testimonials</span>
          <h2 className="font-heading font-bold text-2xl sm:text-3xl md:text-4xl text-primary mt-2">
            Loved by 10,000+ Doctors Across India
          </h2>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="flex items-center justify-center gap-2 mt-4"
          >
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-5 w-5 fill-warning text-warning" />
              ))}
            </div>
            <span className="text-sm font-semibold text-primary">4.9/5</span>
            <span className="text-xs text-muted-foreground">average rating · 200+ cities</span>
          </motion.div>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          className="relative md:hidden"
        >
          <Carousel setApi={setApi} opts={{ align: "start" }} className="px-1">
            <CarouselContent className="-ml-3">
              {reviews.map((r) => (
                <CarouselItem key={r.name} className="pl-3 basis-[90%]">
                  <motion.div
                    variants={item}
                    className="bg-secondary rounded-2xl p-5 shadow-sm border border-border relative h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal/40"
                    tabIndex={0}
                  >
                    <Quote className="absolute top-4 right-4 h-7 w-7 text-royal/10" />
                    <div className="flex gap-0.5 mb-3">
                      {Array.from({ length: r.rating }).map((_, i) => (
                        <Star key={i} className="h-4 w-4 fill-warning text-warning" />
                      ))}
                    </div>
                    <p className="text-xs text-foreground leading-relaxed mb-5">"{r.text}"</p>
                    <div className="flex items-center gap-3 pt-3 border-t border-border">
                      <img src={r.img} alt={r.name} className="w-10 h-10 rounded-full object-cover border-2 border-white" />
                      <div>
                        <div className="font-heading font-semibold text-primary text-xs">{r.name}</div>
                        <div className="text-[10px] text-muted-foreground">{r.spec} · {r.city}</div>
                      </div>
                    </div>
                  </motion.div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white to-transparent" />
          <div className="flex justify-center gap-2 mt-4">
            {reviews.map((r, i) => (
              <button
                key={r.name}
                aria-label={`Go to testimonial ${i + 1}`}
                onClick={() => api?.scrollTo(i)}
                className={`h-2 rounded-pill transition-all ${i === selected ? "w-6 bg-royal" : "w-2 bg-royal/25"}`}
              />
            ))}
          </div>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          className="hidden md:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 max-w-6xl mx-auto"
        >
          {reviews.map((r) => (
            <motion.div
              key={r.name}
              variants={item}
              whileHover={{ y: -4 }}
              className="bg-secondary rounded-2xl p-5 md:p-6 shadow-sm border border-border hover:shadow-lg transition-all duration-300 relative"
            >
              <Quote className="absolute top-4 right-4 h-7 w-7 md:h-8 md:w-8 text-royal/10" />
              <div className="flex gap-0.5 mb-3 md:mb-4">
                {Array.from({ length: r.rating }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 md:h-5 md:w-5 fill-warning text-warning" />
                ))}
              </div>
              <p className="text-xs md:text-sm text-foreground leading-relaxed mb-5 md:mb-6">"{r.text}"</p>
              <div className="flex items-center gap-3 pt-3 md:pt-4 border-t border-border">
                <img src={r.img} alt={r.name} className="w-10 h-10 md:w-12 md:h-12 rounded-full object-cover border-2 border-white" />
                <div>
                  <div className="font-heading font-semibold text-primary text-xs md:text-sm">{r.name}</div>
                  <div className="text-[10px] md:text-xs text-muted-foreground">{r.spec} · {r.city}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default Testimonials;
