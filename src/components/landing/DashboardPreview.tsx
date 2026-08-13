import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Globe, TrendingUp, BarChart3, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import dashboardImg from "@/assets/command-center-dashboard.png";

const features = [
  { icon: TrendingUp, title: "Real-time Analytics", desc: "Track revenue, patients & growth instantly" },
  { icon: Globe, title: "One-Click Publishing", desc: "Update your website live in seconds" },
  { icon: BarChart3, title: "AI-Powered Insights", desc: "Smart suggestions to grow your practice" },
];

const DashboardPreview = () => {
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
    <section className="py-14 md:py-20 bg-white overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
          <span className="text-xs md:text-sm font-semibold text-accent uppercase tracking-wider">Your Command Center</span>
          <h2 className="font-heading font-bold text-2xl sm:text-3xl md:text-4xl text-primary mt-2">
            A Powerful Dashboard Built for Doctors
          </h2>
          <p className="text-sm md:text-base text-muted-foreground mt-3">
            Manage your entire practice from one beautiful, intuitive panel. No tech skills needed.
          </p>
        </div>

        {/* Dashboard Preview Image */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="max-w-5xl mx-auto"
        >
          <div className="rounded-xl md:rounded-2xl border border-border shadow-xl md:shadow-2xl overflow-hidden bg-white">
            <img
              src={dashboardImg}
              alt="Doctylia Command Center Dashboard"
              className="w-full h-auto object-contain block"
            />
          </div>
        </motion.div>

        {/* Feature highlights below */}
        <div className="relative mt-8 md:hidden">
          <Carousel setApi={setApi} opts={{ align: "start" }} className="px-1">
            <CarouselContent className="-ml-3">
              {features.map((f) => (
                <CarouselItem key={f.title} className="pl-3 basis-[84%]">
                  <div
                    className="text-center bg-secondary border border-border rounded-2xl py-5 px-4 h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal/40"
                    tabIndex={0}
                  >
                    <div className="w-10 h-10 rounded-xl gradient-hero mx-auto flex items-center justify-center mb-2">
                      <f.icon className="h-5 w-5 text-white" />
                    </div>
                    <h4 className="font-heading font-semibold text-sm text-primary">{f.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1">{f.desc}</p>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white to-transparent" />
          <div className="flex justify-center gap-2 mt-4">
            {features.map((f, i) => (
              <button
                key={f.title}
                aria-label={`Go to feature ${i + 1}`}
                onClick={() => api?.scrollTo(i)}
                className={`h-2 rounded-pill transition-all ${i === selected ? "w-6 bg-royal" : "w-2 bg-royal/25"}`}
              />
            ))}
          </div>
        </div>

        <div className="hidden md:grid md:grid-cols-3 gap-4 md:gap-6 max-w-3xl mx-auto mt-8 md:mt-12">
          {features.map((f) => (
            <div key={f.title} className="text-center">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl gradient-hero mx-auto flex items-center justify-center mb-2 md:mb-3">
                <f.icon className="h-5 w-5 md:h-6 md:w-6 text-white" />
              </div>
              <h4 className="font-heading font-semibold text-sm md:text-base text-primary">{f.title}</h4>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="text-center mt-8 md:mt-10">
          <Link to="/auth?mode=signup">
            <Button size="lg" className="bg-royal hover:bg-royal/90 text-white gap-2 shadow-lg shadow-royal/20">
              Try the Dashboard Free <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default DashboardPreview;
