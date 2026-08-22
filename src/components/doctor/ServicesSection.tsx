import { useEffect, useState } from "react";
import { ArrowUpRight, Clock, HeartPulse, Laptop, MapPin, Stethoscope } from "lucide-react";
import { useDoctorData } from "@/contexts/DoctorContext";
import AnimatedItem from "@/components/landing/AnimatedItem";
import { cardColorClass, type CardColor } from "@/lib/cardColor";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { scrollToSection } from "@/lib/scrollToSection";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import type { Tables } from "@/integrations/supabase/types";
import {
  Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi,
} from "@/components/ui/carousel";

const PRIMARY = "#3C83FC";
const DESCRIPTION_TRUNCATE_LENGTH = 140;
const CAROUSEL_THRESHOLD = 3;
type Service = Tables<"services">;

const formatPrice = (price: number) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
}).format(price);

const getServiceType = (type: string) => {
  if (type === "online") return { label: "Online", Icon: Laptop };
  if (type === "both") return { label: "Clinic & Online", Icon: Stethoscope };
  return { label: "At Clinic", Icon: MapPin };
};

const ServiceCard = ({ service, index, onBook, onSeeMore }: {
  service: Service;
  index: number;
  onBook: () => void;
  onSeeMore: () => void;
}) => {
  const type = getServiceType(service.type);
  const isLongDescription = (service.description?.length || 0) > DESCRIPTION_TRUNCATE_LENGTH;

  return (
    <AnimatedItem index={index} className="h-full">
      <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white p-5 shadow-[0_10px_30px_rgba(15,43,80,0.07)] transition-all duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_18px_38px_rgba(60,131,252,0.14)] dark:border-blue-900/60 dark:bg-gray-900 dark:hover:border-blue-700 sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-blue-50 transition-transform duration-500 group-hover:scale-125 dark:bg-blue-950/30" />

        <div className="relative flex items-start justify-between gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/40" style={{ color: PRIMARY }}>
            <HeartPulse className="h-6 w-6" strokeWidth={2} />
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50/80 px-2.5 py-1 text-[11px] font-bold text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
            <type.Icon className="h-3 w-3" />
            {type.label}
          </span>
        </div>

        <div className="relative mt-5 flex-1">
          <h3 className="font-heading text-lg font-extrabold leading-snug text-[#092b50] dark:text-white sm:text-xl">
            {service.name?.trim() || "Consultation"}
          </h3>
          {service.description && (
            <>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                {service.description}
              </p>
              {isLongDescription && (
                <button type="button" onClick={onSeeMore} className="mt-1.5 text-xs font-bold hover:underline" style={{ color: PRIMARY }}>
                  View details
                </button>
              )}
            </>
          )}
        </div>

        <div className="relative mt-6 border-t border-blue-50 pt-4 dark:border-blue-950">
          <div className="flex items-end justify-between gap-3">
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Consultation fee</span>
              <span className="mt-1 block font-heading text-2xl font-extrabold text-[#092b50] dark:text-white">
                {formatPrice(service.price)}
              </span>
            </div>
            <span className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <Clock className="h-4 w-4" style={{ color: PRIMARY }} />
              {service.duration || 30} min
            </span>
          </div>

          <button
            type="button"
            onClick={onBook}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white shadow-[0_8px_20px_rgba(60,131,252,0.22)] transition-all hover:brightness-95 active:scale-[0.98]"
            style={{ backgroundColor: PRIMARY }}
          >
            Book This Service
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>
      </article>
    </AnimatedItem>
  );
};

const ServicesSection = ({ cardColor = "card" }: { cardColor?: CardColor }) => {
  const { services } = useDoctorData();
  const [activeService, setActiveService] = useState<Service | null>(null);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [selectedService, setSelectedService] = useState(0);
  const isDesktop = useIsDesktop();
  const showCarousel = services.length === 0 || !isDesktop || services.length > CAROUSEL_THRESHOLD;

  const bookService = () => scrollToSection("booking");

  useEffect(() => {
    if (!carouselApi) return;
    const updateSelected = () => setSelectedService(carouselApi.selectedScrollSnap());
    updateSelected();
    carouselApi.on("select", updateSelected);
    carouselApi.on("reInit", updateSelected);
    return () => {
      carouselApi.off("select", updateSelected);
      carouselApi.off("reInit", updateSelected);
    };
  }, [carouselApi]);

  return (
    <>
      <section id="services" className={`relative overflow-hidden ${cardColorClass(cardColor)}`}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_50%_0%,rgba(60,131,252,0.12),transparent_70%)]" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08] dark:opacity-[0.06]"
          style={{
            backgroundImage: "radial-gradient(#3C83FC 1px, transparent 1px)",
            backgroundSize: "24px 24px",
            maskImage: "linear-gradient(to bottom, black, transparent 70%)",
            WebkitMaskImage: "linear-gradient(to bottom, black, transparent 70%)",
          }}
        />

        <div className="relative mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16 lg:px-12 lg:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-heading text-xs font-extrabold uppercase tracking-[0.18em]" style={{ color: PRIMARY }}>
              Our Expertise
            </p>
            <h2 className="mt-3 font-heading text-3xl font-extrabold tracking-[-0.035em] text-[#092b50] dark:text-white sm:text-4xl lg:text-5xl">
              Medical <span style={{ color: PRIMARY }}>Services</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400 sm:text-base">
              Professional care with transparent pricing, clear consultation times, and instant appointment booking.
            </p>
          </div>

          {showCarousel ? (
            <Carousel
              setApi={setCarouselApi}
              opts={{ align: "start", loop: services.length > 3 }}
              className="mx-auto mt-9 max-w-6xl sm:mt-12"
            >
              <CarouselContent className="-ml-4 pb-2">
                {(services as Service[]).map((service, index) => (
                  <CarouselItem key={service.id} className="basis-[88%] pl-4 sm:basis-1/2 lg:basis-1/3">
                    <ServiceCard
                      service={service}
                      index={index}
                      onBook={bookService}
                      onSeeMore={() => setActiveService(service)}
                    />
                  </CarouselItem>
                ))}
              </CarouselContent>

              <div className="mt-7 flex items-center justify-center gap-4">
                <CarouselPrevious className="static h-10 w-10 translate-y-0 border-blue-200 bg-white text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-gray-900 dark:text-blue-300" />
                <div className="flex items-center gap-1.5">
                  {(services as Service[]).map((service, index) => (
                    <button
                      key={service.id}
                      type="button"
                      aria-label={`Go to service ${index + 1}`}
                      onClick={() => carouselApi?.scrollTo(index)}
                      className={`h-2 rounded-full transition-all duration-300 ${selectedService === index ? "w-6" : "w-2 bg-blue-200 dark:bg-blue-900"}`}
                      style={selectedService === index ? { backgroundColor: PRIMARY } : undefined}
                    />
                  ))}
                </div>
                <CarouselNext className="static h-10 w-10 translate-y-0 border-blue-200 bg-white text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-gray-900 dark:text-blue-300" />
              </div>
            </Carousel>
          ) : (
            <div className="mx-auto mt-9 grid max-w-6xl gap-6 sm:mt-12 lg:grid-cols-3">
              {(services as Service[]).map((service, index) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  index={index}
                  onBook={bookService}
                  onSeeMore={() => setActiveService(service)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <Dialog open={Boolean(activeService)} onOpenChange={(open) => !open && setActiveService(null)}>
        <DialogContent className="max-w-lg rounded-2xl border border-blue-100 bg-card p-6 shadow-xl dark:border-blue-900">
          {activeService && (
            <div className="space-y-5">
              <DialogHeader className="space-y-3 text-left">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/40" style={{ color: PRIMARY }}>
                  <HeartPulse className="h-6 w-6" />
                </span>
                <DialogTitle className="font-heading text-xl font-extrabold text-[#092b50] dark:text-white">
                  {activeService.name?.trim() || "Consultation"}
                </DialogTitle>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">{getServiceType(activeService.type).label}</span>
                  <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{activeService.duration || 30} min</span>
                </div>
              </DialogHeader>

              <p className="max-h-[45vh] overflow-y-auto whitespace-pre-line text-sm leading-7 text-slate-600 dark:text-slate-300">
                {activeService.description}
              </p>

              <div className="flex items-center justify-between gap-4 border-t border-blue-100 pt-4 dark:border-blue-900">
                <div>
                  <span className="block text-xs font-semibold text-slate-400">Consultation fee</span>
                  <span className="font-heading text-2xl font-extrabold text-[#092b50] dark:text-white">{formatPrice(activeService.price)}</span>
                </div>
                <button
                  type="button"
                  className="h-11 rounded-xl px-6 text-sm font-bold text-white"
                  style={{ backgroundColor: PRIMARY }}
                  onClick={() => {
                    setActiveService(null);
                    requestAnimationFrame(bookService);
                  }}
                >
                  Book Now
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ServicesSection;
