import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Check, ArrowRight, TrendingUp, IndianRupee } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";

const withoutItems = [
  "Missed calls = lost patients",
  "Paper records pile up & get lost",
  "No online presence on Google",
  "Manual billing with GST headaches",
  "Patients forget appointments",
  "No way to collect reviews",
];

const withItems = [
  "24/7 online booking — never miss a patient",
  "Digital patient records, searchable & secure",
  "Branded website ranking on Google",
  "Auto-generated GST invoices & payment tracking",
  "WhatsApp reminders reduce no-shows by 70%",
  "Collect & showcase 5-star reviews automatically",
];

const stats = [
  {
    icon: TrendingUp,
    value: "14 hrs/week",
    label: "Time saved per doctor",
    accent: "bg-royal/10 text-royal",
  },
  {
    icon: IndianRupee,
    value: "₹2.4 Cr+",
    label: "Revenue generated",
    accent: "bg-success/10 text-success",
  },
  {
    icon: Check,
    value: "98%",
    label: "Satisfaction rate",
    accent: "bg-teal/10 text-teal",
  },
];

const StatCard = ({ stat }: { stat: (typeof stats)[number] }) => (
  <div className="bg-white rounded-xl p-3 md:p-4 flex items-center gap-2 md:gap-3 border border-border shadow-sm min-h-[96px]">
    <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg ${stat.accent} flex items-center justify-center shrink-0`}>
      <stat.icon className="h-4 w-4 md:h-5 md:w-5" />
    </div>
    <div>
      <div className="font-heading font-extrabold text-sm md:text-lg text-primary">{stat.value}</div>
      <div className="text-xs text-muted-foreground">{stat.label}</div>
    </div>
  </div>
);

const BeforeAfter = () => {
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
    <section className="py-14 md:py-20 bg-secondary">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
          <span className="text-xs md:text-sm font-semibold text-accent uppercase tracking-wider">The Difference</span>
          <h2 className="font-heading font-bold text-2xl sm:text-3xl md:text-4xl text-primary mt-2">
            See the Transformation
          </h2>
          <p className="text-muted-foreground mt-3">
            Thousands of doctors have switched from chaos to clarity. Here's what changes.
          </p>
        </div>

        <div className="hidden md:block">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="max-w-2xl mx-auto mb-8 md:mb-10 grid grid-cols-3 gap-2 md:gap-3"
          >
            {stats.map((stat) => (
              <StatCard key={stat.label} stat={stat} />
            ))}
          </motion.div>
        </div>

        <div className="md:hidden max-w-2xl mx-auto mb-8">
          <Carousel setApi={setApi} opts={{ align: "start", loop: false }} className="px-1">
            <CarouselContent className="-ml-3">
              {stats.map((stat) => (
                <CarouselItem key={stat.label} className="pl-3 basis-full">
                  <StatCard stat={stat} />
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>

          <div className="mt-4 flex justify-center gap-2">
            {stats.map((_, index) => (
              <button
                key={`stat-dot-${index}`}
                aria-label={`Go to stat ${index + 1}`}
                onClick={() => api?.scrollTo(index)}
                className={`h-2 rounded-full transition-all ${index === selected ? "w-6 bg-royal" : "w-2 bg-royal/25"}`}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-5 md:gap-6 max-w-4xl mx-auto">
        {/* Without */}
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="rounded-lg sm:rounded-2xl border sm:border-2 border-destructive/20 bg-white p-2 sm:p-6 md:p-8 hover:shadow-lg transition-shadow min-w-0"
        >
          <div className="rounded sm:rounded-xl overflow-hidden mb-2 sm:mb-5 h-14 sm:h-32">
            <img
              src="https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=500&h=200&fit=crop&q=80"
              alt="Cluttered desk with papers"
              className="w-full h-full object-cover opacity-80"
              loading="lazy"
            />
          </div>
          <div className="flex items-center gap-1 sm:gap-2 mb-2 sm:mb-5">
            <div className="w-4 h-4 sm:w-8 sm:h-8 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
              <X className="h-2.5 w-2.5 sm:h-4 sm:w-4 text-destructive" />
            </div>
            <h3 className="font-heading font-bold text-[10px] sm:text-lg text-destructive leading-tight">Without Doctylia</h3>
          </div>
          <ul className="space-y-1.5 sm:space-y-3.5">
            {withoutItems.map((item, i) => (
              <motion.li
                key={item}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="flex items-start gap-1 sm:gap-3 text-[9px] sm:text-sm text-muted-foreground leading-snug"
              >
                <X className="h-2 w-2 sm:h-4 sm:w-4 text-destructive/60 mt-0.5 shrink-0" />
                {item}
              </motion.li>
            ))}
          </ul>
        </motion.div>

        {/* With */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="rounded-lg sm:rounded-2xl border sm:border-2 border-success/20 bg-white p-2 sm:p-6 md:p-8 hover:shadow-lg transition-shadow min-w-0"
        >
          <div className="rounded sm:rounded-xl overflow-hidden mb-2 sm:mb-5 h-14 sm:h-32">
            <img
              src="https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=500&h=200&fit=crop&q=80"
              alt="Clean digital dashboard"
              className="w-full h-full object-cover opacity-80"
              loading="lazy"
            />
          </div>
          <div className="flex items-center gap-1 sm:gap-2 mb-2 sm:mb-5">
            <div className="w-4 h-4 sm:w-8 sm:h-8 rounded-full bg-success/10 flex items-center justify-center shrink-0">
              <Check className="h-2.5 w-2.5 sm:h-4 sm:w-4 text-success" />
            </div>
            <h3 className="font-heading font-bold text-[10px] sm:text-lg text-success leading-tight">With Doctylia</h3>
          </div>
          <ul className="space-y-1.5 sm:space-y-3.5">
            {withItems.map((item, i) => (
              <motion.li
                key={item}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="flex items-start gap-1 sm:gap-3 text-[9px] sm:text-sm text-foreground font-medium leading-snug"
              >
                <Check className="h-2 w-2 sm:h-4 sm:w-4 text-success mt-0.5 shrink-0" />
                {item}
              </motion.li>
            ))}
          </ul>
        </motion.div>
      </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mt-8"
        >
          <Link to="/auth?mode=signup">
            <Button className="bg-royal hover:bg-royal/90 text-white gap-2 shadow-md shadow-royal/20">
              Make the Switch Today <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
};

export default BeforeAfter;
