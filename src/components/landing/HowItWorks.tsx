import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { UserPlus, Settings, Rocket } from "lucide-react";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";

const steps = [
  {
    icon: UserPlus, num: "01", title: "Sign Up Free",
    desc: "Create your account in 30 seconds. No credit card. 7-day free trial starts instantly.",
    color: "from-royal to-teal",
    img: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=400&h=260&fit=crop&q=80",
    imgAlt: "Doctor signing up on laptop"
  },
  {
    icon: Settings, num: "02", title: "Set Up Your Clinic",
    desc: "Add your profile, services, pricing & photos. Our wizard guides you step by step.",
    color: "from-teal to-accent",
    img: "https://images.unsplash.com/photo-1551076805-e1869033e561?w=400&h=260&fit=crop&q=80",
    imgAlt: "Doctor customizing clinic dashboard"
  },
  {
    icon: Rocket, num: "03", title: "Go Live & Grow",
    desc: "Your branded website is live! Patients book, pay & consult you 24/7 on autopilot.",
    color: "from-accent to-spark",
    img: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=400&h=260&fit=crop&q=80",
    imgAlt: "Happy doctor with patients"
  },
];

const container = { hidden: {}, show: { transition: { staggerChildren: 0.2 } } };
const item = { hidden: { opacity: 0, y: 30 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } };

const HowItWorks = () => {
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
    <section id="how-it-works" className="py-14 md:py-20 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
          <span className="text-xs md:text-sm font-semibold text-accent uppercase tracking-wider">How It Works</span>
          <h2 className="font-heading font-bold text-2xl sm:text-3xl md:text-4xl text-primary mt-2">
            Live in 3 Simple Steps
          </h2>
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
              {steps.map((s) => (
                <CarouselItem key={s.num} className="pl-3 basis-[88%]">
                  <motion.div
                    variants={item}
                    className="relative text-center group bg-secondary rounded-2xl p-5 border border-border h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal/40"
                    tabIndex={0}
                  >
                    <motion.div
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      className={`w-16 h-16 rounded-full bg-gradient-to-br ${s.color} mx-auto flex items-center justify-center mb-4 shadow-lg shadow-royal/20 relative z-10 transition-transform`}
                    >
                      <s.icon className="h-6 w-6 text-white" />
                    </motion.div>
                    <span className="font-heading font-extrabold text-4xl text-royal/[0.07] absolute top-4 left-1/2 -translate-x-1/2 select-none">{s.num}</span>
                    <h3 className="font-heading font-bold text-lg text-primary">{s.title}</h3>
                    <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto leading-relaxed">{s.desc}</p>
                    <div className="mt-3 rounded-xl overflow-hidden mx-auto max-w-[180px] shadow-md border border-border">
                      <img src={s.img} alt={s.imgAlt} className="w-full h-24 object-cover" loading="lazy" />
                    </div>
                  </motion.div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white to-transparent" />
          <div className="flex justify-center gap-2 mt-4">
            {steps.map((s, i) => (
              <button
                key={s.num}
                aria-label={`Go to step ${i + 1}`}
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
          className="hidden md:grid md:grid-cols-3 gap-8 md:gap-8 relative max-w-4xl mx-auto"
        >
          {/* Animated connection line */}
          <motion.div
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: 0.5 }}
            className="hidden md:block absolute top-10 left-[20%] right-[20%] h-0.5 border-t-2 border-dashed border-royal/20 origin-left"
          />

          {steps.map((s) => (
            <motion.div key={s.num} variants={item} className="relative text-center group">
              <motion.div
                whileHover={{ scale: 1.1, rotate: 5 }}
                className={`w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br ${s.color} mx-auto flex items-center justify-center mb-4 md:mb-5 shadow-lg shadow-royal/20 relative z-10 transition-transform`}
              >
                <s.icon className="h-6 w-6 md:h-8 md:w-8 text-white" />
              </motion.div>
              <span className="font-heading font-extrabold text-4xl md:text-6xl text-royal/[0.07] absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 md:-translate-y-3 select-none">{s.num}</span>
              <h3 className="font-heading font-bold text-lg md:text-xl text-primary">{s.title}</h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto leading-relaxed">{s.desc}</p>
              <div className="mt-3 md:mt-4 rounded-xl overflow-hidden mx-auto max-w-[160px] md:max-w-[200px] shadow-md border border-border">
                <img src={s.img} alt={s.imgAlt} className="w-full h-20 md:h-28 object-cover" loading="lazy" />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default HowItWorks;
