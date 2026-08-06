import { useEffect, useState } from "react";
import { useDoctorData } from "@/contexts/DoctorContext";
import {
  Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext, type CarouselApi,
} from "@/components/ui/carousel";

// Switch from a static grid to a carousel once there are enough photos to page through.
const CAROUSEL_THRESHOLD = 3;
const AUTOPLAY_MS = 4000;

const GalleryCard = ({ p, className = "" }: { p: any; className?: string }) => (
  <div className={`rounded-2xl overflow-hidden group cursor-pointer shadow-sm ${className}`}>
    <img
      src={p.photo_url}
      alt={p.caption || "Clinic"}
      loading="lazy"
      decoding="async"
      className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-300"
    />
    {p.caption && <p className="text-sm text-text-gray text-center mt-2">{p.caption}</p>}
  </div>
);

const GallerySection = () => {
  const { gallery } = useDoctorData();
  const [api, setApi] = useState<CarouselApi>();
  const [selected, setSelected] = useState(0);
  const [hovering, setHovering] = useState(false);

  const useCarouselLayout = gallery.length > CAROUSEL_THRESHOLD;

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setSelected(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => { api.off("select", onSelect); };
  }, [api]);

  // Autoplay — advances one slide at a time, paused while the pointer is over the carousel.
  useEffect(() => {
    if (!api || !useCarouselLayout || hovering) return;
    const timer = setInterval(() => api.scrollNext(), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [api, useCarouselLayout, hovering]);

  if (gallery.length === 0) return null;

  return (
    <section id="gallery" className="relative py-16 md:py-24 bg-secondary overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.05] dark:opacity-[0.12] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--pattern-line)) 1px, transparent 0)`,
          backgroundSize: "24px 24px",
        }}
      />
      <div className="container mx-auto px-4 relative z-10">
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-foreground text-center mb-12">Our Clinic</h2>

        {!useCarouselLayout ? (
          <div
            className={
              gallery.length === 1
                ? "flex justify-center"
                : "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 max-w-4xl mx-auto"
            }
          >
            {gallery.map((p: any) => (
              <GalleryCard key={p.id} p={p} className={gallery.length === 1 ? "w-full max-w-[360px]" : ""} />
            ))}
          </div>
        ) : (
          <div
            className="max-w-5xl mx-auto"
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
          >
            <Carousel setApi={setApi} opts={{ align: "start", loop: true }} className="px-2">
              <CarouselContent className="-ml-4 sm:-ml-6">
                {gallery.map((p: any) => (
                  <CarouselItem key={p.id} className="pl-4 sm:pl-6 basis-full md:basis-1/2 lg:basis-1/3">
                    <GalleryCard p={p} />
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="left-1 md:left-2 lg:-left-12 border-border bg-card" />
              <CarouselNext className="right-1 md:right-2 lg:-right-12 border-border bg-card" />
            </Carousel>
            <div className="flex justify-center gap-2 mt-6">
              {gallery.map((p: any, i: number) => (
                <button
                  key={p.id}
                  aria-label={`Go to image ${i + 1}`}
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

export default GallerySection;
