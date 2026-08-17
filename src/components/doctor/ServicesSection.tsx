import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDoctorData } from "@/contexts/DoctorContext";
import AnimatedItem from "@/components/landing/AnimatedItem";
import {
  Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext, type CarouselApi,
} from "@/components/ui/carousel";

// Switch from a static row to a carousel once there are enough services to page through.
const CAROUSEL_THRESHOLD = 3;

const typeColor: Record<string, string> = {
  clinic: "bg-royal/10 text-royal",
  online: "bg-teal/10 text-teal",
  both: "bg-primary/10 text-primary",
};

// Rough threshold for when a description is likely to overflow 3 clamped lines.
const DESCRIPTION_TRUNCATE_LENGTH = 140;

const ServiceCard = ({ s, onBook }: { s: any; onBook: () => void }) => {
  const [expanded, setExpanded] = useState(false);
  const isLong = (s.description?.length || 0) > DESCRIPTION_TRUNCATE_LENGTH;

  return (
    <div className="hover-lift w-full bg-card border border-border shadow-sm rounded-2xl p-6 flex flex-col">
      <div className="w-14 h-14 rounded-2xl bg-royal/10 flex items-center justify-center mb-4">
        <Heart size={24} className="text-royal" />
      </div>
      <h3 className="font-heading font-semibold text-foreground text-lg">{s.name?.trim() || "Consultation"}</h3>
      {s.description && (
        <>
          <p className={`text-sm text-text-gray mt-1 ${expanded ? "" : "line-clamp-3"}`}>{s.description}</p>
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs font-medium text-royal hover:underline mt-1 self-start"
            >
              {expanded ? "See less" : "See more"}
            </button>
          )}
        </>
      )}
      <div className="flex items-center gap-2 mt-3 mb-3">
        <span className={`text-xs px-2 py-0.5 rounded-pill font-medium ${typeColor[s.type] || ""}`}>{s.type}</span>
        <span className="text-xs text-text-gray">{s.duration} mins</span>
      </div>
      <p className="font-heading font-extrabold text-2xl text-royal mb-4">₹{s.price.toLocaleString()}</p>
      <Button variant="cta" className="w-full font-heading font-semibold mt-auto" onClick={onBook}>
        Book Now
      </Button>
    </div>
  );
};

const ServicesSection = () => {
  const { services } = useDoctorData();
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  const [api, setApi] = useState<CarouselApi>();
  const [selected, setSelected] = useState(0);

  const useCarouselLayout = services.length > CAROUSEL_THRESHOLD;

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setSelected(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => { api.off("select", onSelect); };
  }, [api]);

  return (
    <section id="services" className="relative py-16 md:py-24 bg-card overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.16] dark:opacity-[0.12] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(hsl(var(--pattern-line)) 1px, transparent 1px)`,
          backgroundSize: "20px 20px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 40%, transparent 80%)",
        }}
      />
      <div className="container mx-auto px-4 relative z-10">
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-foreground text-center mb-4">Medical Services</h2>
        <p className="text-text-gray text-center mb-12 max-w-lg mx-auto">Transparent pricing. Book instantly. No hidden charges.</p>

        {services.length === 0 ? null : !useCarouselLayout ? (
          <>
            {/* Mobile View: Always swipeable carousel without chevrons */}
            <div className="block md:hidden max-w-5xl mx-auto">
              <Carousel setApi={setApi} opts={{ align: "start", loop: services.length > 1 }} className="px-2">
                <CarouselContent className="-ml-4 items-start">
                  {services.map((s) => (
                    <CarouselItem key={s.id} className="pl-4 basis-[88%] self-start">
                      <ServiceCard s={s} onBook={() => scrollTo("booking")} />
                    </CarouselItem>
                  ))}
                </CarouselContent>
              </Carousel>
              {services.length > 1 && (
                <div className="flex justify-center gap-2 mt-6">
                  {services.map((s, i) => (
                    <button
                      key={s.id}
                      aria-label={`Go to service ${i + 1}`}
                      onClick={() => api?.scrollTo(i)}
                      className={`h-2 rounded-pill transition-all ${i === selected ? "w-6 bg-royal" : "w-2 bg-royal/25"}`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Desktop View (<= 3 cards): Static grid/flex layout without carousel and without arrows */}
            <div
              className={
                services.length === 1
                  ? "hidden md:flex justify-center items-start"
                  : "hidden md:grid grid-cols-2 lg:grid-cols-3 items-start gap-6 max-w-5xl mx-auto"
              }
            >
              {services.map((s, i) => (
                <AnimatedItem key={s.id} index={i} className={`self-start ${services.length === 1 ? "w-full max-w-[340px]" : ""}`}>
                  <ServiceCard s={s} onBook={() => scrollTo("booking")} />
                </AnimatedItem>
              ))}
            </div>
          </>
        ) : (
          /* Desktop (> 3 cards) & Mobile (> 3 cards): Carousel */
          <div className="max-w-5xl mx-auto">
            <Carousel setApi={setApi} opts={{ align: "start", loop: true }} className="px-2">
              <CarouselContent className="-ml-4 sm:-ml-6 items-start">
                {services.map((s) => (
                  <CarouselItem key={s.id} className="pl-4 sm:pl-6 basis-[88%] sm:basis-1/2 lg:basis-1/3 self-start">
                    <ServiceCard s={s} onBook={() => scrollTo("booking")} />
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="hidden md:inline-flex left-1 md:left-2 lg:-left-12 border-border bg-card" />
              <CarouselNext className="hidden md:inline-flex right-1 md:right-2 lg:-right-12 border-border bg-card" />
            </Carousel>
            <div className="flex justify-center gap-2 mt-6">
              {services.map((s, i) => (
                <button
                  key={s.id}
                  aria-label={`Go to service ${i + 1}`}
                  onClick={() => api?.scrollTo(i)}
                  className={`h-2 rounded-pill transition-all ${i === selected ? "w-6 bg-royal" : "w-2 bg-royal/25"}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default ServicesSection;
