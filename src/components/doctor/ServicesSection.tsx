import { useEffect, useState } from "react";
import { Heart, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDoctorData } from "@/contexts/DoctorContext";
import AnimatedItem from "@/components/landing/AnimatedItem";
import {
  Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext, type CarouselApi,
} from "@/components/ui/carousel";
import { cardColorClass, type CardColor } from "@/lib/cardColor";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const CAROUSEL_THRESHOLD = 3;
const DESCRIPTION_TRUNCATE_LENGTH = 140;

const typeColor: Record<string, string> = {
  clinic: "bg-royal/10 text-royal",
  online: "bg-teal/10 text-teal",
  both: "bg-primary/10 text-primary",
};

const DEFAULT_SERVICES = [
  {
    id: "s1",
    name: "abc",
    description: "bca",
    type: "clinic",
    duration: 30,
    price: 500,
  },
  {
    id: "s2",
    name: "xdv...",
    description: "General Consultation and Checkup",
    type: "clinic",
    duration: 30,
    price: 500,
  },
];

const DesktopServiceCard = ({ s, onBook, onSeeMore }: { s: any; onBook: () => void; onSeeMore: () => void }) => {
  const isLong = (s.description?.length || 0) > DESCRIPTION_TRUNCATE_LENGTH;

  return (
    <div className="hover-lift w-full h-full bg-card border border-border shadow-sm rounded-2xl py-6 px-[5px] md:px-6 flex flex-col justify-between">
      <div>
        <div className="w-14 h-14 rounded-2xl bg-royal/10 flex items-center justify-center mb-4">
          <Heart size={24} className="text-royal" />
        </div>
        <h3 className="font-heading font-semibold text-foreground text-lg break-words md:break-normal">{s.name?.trim() || "Consultation"}</h3>
        {s.description && (
          <div>
            <p className="text-sm text-text-gray mt-1 line-clamp-3">{s.description}</p>
            {isLong && (
              <button
                type="button"
                onClick={onSeeMore}
                className="text-xs font-medium text-royal hover:underline mt-1 inline-block"
              >
                See more
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="flex items-center flex-wrap md:flex-nowrap gap-2 mb-3">
          <span className={`text-xs px-2 py-0.5 rounded-pill font-medium ${typeColor[s.type] || "bg-royal/10 text-royal"}`}>{s.type}</span>
          <span className="text-xs text-text-gray">{s.duration} mins</span>
        </div>
        <p className="font-heading font-extrabold text-2xl text-royal mb-4">₹{s.price?.toLocaleString()}</p>
        <Button variant="cta" className="w-full font-heading font-semibold" onClick={onBook}>
          Book Now
        </Button>
      </div>
    </div>
  );
};

const ServicesSection = ({ cardColor = "card" }: { cardColor?: CardColor }) => {
  const { services } = useDoctorData();
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  const [api, setApi] = useState<CarouselApi>();
  const [selected, setSelected] = useState(0);
  const [activeService, setActiveService] = useState<any | null>(null);
  const [activeMobileDot, setActiveMobileDot] = useState(0);

  const displayServices = services && services.length > 0 ? services : DEFAULT_SERVICES;
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
    <>
      {/* MOBILE VIEW (md:hidden) */}
      <div className="md:hidden">
        <section id="services" className="py-10 bg-pattern rounded-3xl my-4">
          <div className="text-center px-4 mb-6">
            <h2 className="text-2xl font-bold text-text-dark dark:text-foreground mb-2">Medical Services</h2>
            <p className="text-xs text-text-muted dark:text-muted-foreground">
              Transparent pricing. Book instantly. No hidden charges.
            </p>
          </div>

          <div
            className="flex overflow-x-auto hide-scrollbar px-4 gap-4 pb-6 snap-x justify-start"
            onScroll={(e) => {
              const target = e.currentTarget;
              const scrollPos = target.scrollLeft;
              const cardWidth = 280;
              const index = Math.round(scrollPos / cardWidth);
              setActiveMobileDot(Math.min(index, displayServices.length - 1));
            }}
          >
            {displayServices.map((s: any, idx: number) => {
              const serviceName = s.name?.trim() || "Consultation";
              const serviceDesc = s.description || "";
              const serviceType = s.type ? String(s.type).charAt(0).toUpperCase() + String(s.type).slice(1) : "Clinic";
              const serviceDuration = s.duration || 30;
              const servicePrice = s.price ?? 500;

              return (
                <div
                  key={s.id || idx}
                  className="min-w-[260px] max-w-[280px] bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 snap-center shrink-0 flex flex-col justify-between"
                >
                  <div>
                    <div className="w-10 h-10 rounded-full bg-primary-50 dark:bg-primary-900/40 flex items-center justify-center text-primary-500 mb-4">
                      <Heart size={20} />
                    </div>
                    <h3 className="text-lg font-bold text-text-dark dark:text-foreground mb-1 truncate">
                      {serviceName}
                    </h3>
                    <p className="text-xs text-text-muted dark:text-muted-foreground mb-4 line-clamp-2 min-h-[32px]">
                      {serviceDesc}
                    </p>
                    <div className="flex items-center gap-2 mb-4">
                      <span className="bg-primary-50 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 text-[10px] font-medium px-2 py-0.5 rounded border border-primary-100 dark:border-primary-800">
                        {serviceType}
                      </span>
                      <span className="text-xs text-text-muted dark:text-muted-foreground flex items-center gap-1">
                        <Clock size={12} /> {serviceDuration} mins
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="mb-4">
                      <span className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                        ₹{servicePrice.toLocaleString()}
                      </span>
                    </div>
                    <button
                      onClick={() => scrollTo("booking")}
                      className="w-full bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold py-2.5 rounded-lg shadow-sm transition-colors"
                    >
                      Book Now
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-center gap-1.5 mt-2">
            {displayServices.map((_, i) => (
              <div
                key={i}
                className={`transition-all duration-300 ${
                  i === activeMobileDot ? "w-4 h-1.5 rounded-full bg-primary-500" : "w-1.5 h-1.5 rounded-full bg-primary-200 dark:bg-gray-700"
                }`}
              />
            ))}
          </div>
        </section>
      </div>

      {/* DESKTOP VIEW (hidden md:block) */}
      <div className="hidden md:block">
        <section id="services-desktop" className={`relative py-16 md:py-24 overflow-hidden ${cardColorClass(cardColor)}`}>
          <div
            className="absolute inset-0 opacity-[0.16] dark:opacity-[0.12] pointer-events-none"
            style={{
              backgroundImage: `radial-gradient(hsl(var(--pattern-line)) 1px, transparent 1px)`,
              backgroundSize: "20px 20px",
              maskImage: "radial-gradient(ellipse at center, black 40%, transparent 80%)",
              WebkitMaskImage: "radial-gradient(ellipse at center, black 40%, transparent 80%)",
            }}
          />
          <div className="container mx-auto px-[5px] md:px-4 relative z-10">
            <h2 className="font-heading font-bold text-3xl md:text-4xl text-foreground text-center mb-4">Medical Services</h2>
            <p className="text-text-gray text-center mb-12 max-w-lg mx-auto">Transparent pricing. Book instantly. No hidden charges.</p>

            {services.length === 0 ? null : !useCarouselLayout ? (
              <div
                className={
                  services.length === 1
                    ? "flex justify-center"
                    : "grid grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto"
                }
              >
                {services.map((s, i) => (
                  <AnimatedItem key={s.id} index={i} className={`h-full ${services.length === 1 ? "w-full max-w-[340px]" : ""}`}>
                    <DesktopServiceCard s={s} onBook={() => scrollTo("booking")} onSeeMore={() => setActiveService(s)} />
                  </AnimatedItem>
                ))}
              </div>
            ) : (
              <div className="max-w-5xl mx-auto">
                <Carousel setApi={setApi} opts={{ align: "start", loop: true }} className="px-2">
                  <CarouselContent className="-ml-4 sm:-ml-6">
                    {services.map((s) => (
                      <CarouselItem key={s.id} className="pl-4 sm:pl-6 basis-1/2 lg:basis-1/3">
                        <DesktopServiceCard s={s} onBook={() => scrollTo("booking")} onSeeMore={() => setActiveService(s)} />
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious className="inline-flex left-1 md:left-2 lg:-left-12 border-border bg-card" />
                  <CarouselNext className="inline-flex right-1 md:right-2 lg:-right-12 border-border bg-card" />
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
      </div>

      {/* Service Details Modal */}
      <Dialog open={!!activeService} onOpenChange={(open) => !open && setActiveService(null)}>
        <DialogContent className="max-w-lg p-6 bg-card border border-border rounded-2xl shadow-xl">
          {activeService && (
            <div className="space-y-4">
              <DialogHeader className="space-y-1">
                <div className="w-12 h-12 rounded-xl bg-royal/10 flex items-center justify-center mb-2">
                  <Heart size={22} className="text-royal" />
                </div>
                <DialogTitle className="font-heading font-bold text-xl text-foreground">
                  {activeService.name?.trim() || "Consultation"}
                </DialogTitle>
                <div className="flex items-center gap-2 pt-1">
                  <span className={`text-xs px-2 py-0.5 rounded-pill font-medium ${typeColor[activeService.type] || "bg-royal/10 text-royal"}`}>
                    {activeService.type}
                  </span>
                  <span className="text-xs text-text-gray">{activeService.duration} mins</span>
                </div>
              </DialogHeader>

              <div className="max-h-[50vh] overflow-y-auto pr-1">
                <p className="text-sm text-text-gray whitespace-pre-line leading-relaxed">
                  {activeService.description}
                </p>
              </div>

              <div className="pt-2 border-t border-border flex items-center justify-between">
                <div>
                  <span className="text-xs text-text-gray block">Fee</span>
                  <span className="font-heading font-extrabold text-2xl text-royal">
                    ₹{activeService.price?.toLocaleString()}
                  </span>
                </div>
                <Button
                  variant="cta"
                  className="font-heading font-semibold px-6"
                  onClick={() => {
                    setActiveService(null);
                    scrollTo("booking");
                  }}
                >
                  Book Now
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ServicesSection;
