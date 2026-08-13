import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Heart, Baby, Bone, Eye, Brain, Stethoscope, Smile, Scissors, Pill, Activity } from "lucide-react";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";

const specialties = [
  { name: "General Physician", icon: Stethoscope, count: "3,200+", color: "bg-royal/8 text-royal" },
  { name: "Dentist", icon: Smile, count: "1,800+", color: "bg-teal/10 text-teal" },
  { name: "Pediatrician", icon: Baby, count: "1,400+", color: "bg-success/10 text-success" },
  { name: "Cardiologist", icon: Heart, count: "900+", color: "bg-destructive/10 text-destructive" },
  { name: "Orthopedic", icon: Bone, count: "750+", color: "bg-royal/8 text-royal" },
  { name: "Dermatologist", icon: Scissors, count: "680+", color: "bg-ai-purple/10 text-ai-purple" },
  { name: "Ophthalmologist", icon: Eye, count: "520+", color: "bg-teal/10 text-teal" },
  { name: "Neurologist", icon: Brain, count: "400+", color: "bg-warning/10 text-warning" },
  { name: "Gynecologist", icon: Activity, count: "1,100+", color: "bg-accent/10 text-accent" },
  { name: "Ayurvedic", icon: Pill, count: "350+", color: "bg-success/10 text-success" },
];

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, scale: 0.8 }, show: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: "easeOut" } } };

const Specialties = () => {
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
        {/* Hero banner image */}
        <div className="max-w-4xl mx-auto mb-10 md:mb-14 rounded-2xl overflow-hidden shadow-lg relative">
          <img
            src="https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=900&h=300&fit=crop&q=80"
            alt="Diverse group of doctors"
            className="w-full h-40 md:h-56 object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary/80 to-transparent flex items-end p-6 md:p-8">
            <div>
              <h2 className="font-heading font-bold text-xl sm:text-2xl md:text-3xl text-white">
                Built for Every Specialty
              </h2>
              <p className="text-sm text-white/80 mt-1">
                Whether you're a solo practitioner or run a multi-specialty clinic — Doctylia adapts.
              </p>
            </div>
          </div>
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
              {specialties.map((s) => (
                <CarouselItem key={s.name} className="pl-3 basis-[42%]">
                  <motion.div
                    variants={item}
                    whileHover={{ y: -4, scale: 1.03 }}
                    className="bg-secondary rounded-xl p-2.5 text-center border border-border hover:shadow-md transition-all duration-200 group cursor-default h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal/40"
                    tabIndex={0}
                  >
                    <div className={`w-9 h-9 rounded-lg ${s.color} flex items-center justify-center mx-auto mb-1.5 group-hover:scale-110 transition-transform`}>
                      <s.icon className="h-4 w-4" />
                    </div>
                    <div className="font-heading font-semibold text-[10px] text-primary leading-tight">{s.name}</div>
                    <div className="text-[9px] text-muted-foreground mt-0.5">{s.count}</div>
                  </motion.div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white to-transparent" />
          <div className="flex justify-center gap-1.5 mt-4">
            {specialties.map((s, i) => (
              <button
                key={s.name}
                aria-label={`Go to specialty ${i + 1}`}
                onClick={() => api?.scrollTo(i)}
                className={`h-1.5 rounded-pill transition-all ${i === selected ? "w-5 bg-royal" : "w-1.5 bg-royal/25"}`}
              />
            ))}
          </div>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          className="hidden md:grid md:grid-cols-5 gap-2 md:gap-4 max-w-4xl mx-auto"
        >
          {specialties.map((s) => (
            <motion.div
              key={s.name}
              variants={item}
              whileHover={{ y: -4, scale: 1.03 }}
              className="bg-secondary rounded-xl p-2.5 md:p-4 text-center border border-border hover:shadow-md transition-all duration-200 group cursor-default"
            >
              <div className={`w-9 h-9 md:w-12 md:h-12 rounded-lg md:rounded-xl ${s.color} flex items-center justify-center mx-auto mb-1.5 md:mb-3 group-hover:scale-110 transition-transform`}>
                <s.icon className="h-4 w-4 md:h-6 md:w-6" />
              </div>
              <div className="font-heading font-semibold text-[10px] sm:text-xs md:text-sm text-primary leading-tight">{s.name}</div>
              <div className="text-[9px] md:text-[11px] text-muted-foreground mt-0.5">{s.count}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default Specialties;
