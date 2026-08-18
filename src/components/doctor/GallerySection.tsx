import { useEffect, useState } from "react";
import { useDoctorData } from "@/contexts/DoctorContext";
import {
  Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext, type CarouselApi,
} from "@/components/ui/carousel";
import { cardColorClass, type CardColor } from "@/lib/cardColor";
import { Dialog, DialogContent } from "@/components/ui/dialog";

// Switch from a static grid to a carousel once there are enough photos to page through.
const CAROUSEL_THRESHOLD = 3;
const AUTOPLAY_MS = 4000;

const GalleryCard = ({ p, onClick, className = "" }: { p: any; onClick?: () => void; className?: string }) => (
  <div
    onClick={onClick}
    className={`rounded-2xl overflow-hidden group cursor-pointer shadow-sm bg-card border border-border/50 py-2 px-[5px] sm:py-2.5 md:px-2.5 flex flex-col h-full hover:shadow-md transition-all duration-300 ${className}`}
  >
    <div className="w-full aspect-[4/3] rounded-xl overflow-hidden relative bg-muted/20 flex items-center justify-center">
      <img
        src={p.photo_url}
        alt={p.caption || "Clinic"}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-contain block group-hover:scale-105 transition-transform duration-300"
      />
    </div>
    {p.caption && (
      <p className="text-sm text-text-gray text-center mt-2 font-medium line-clamp-2 px-0 md:px-1">
        {p.caption}
      </p>
    )}
  </div>
);

const GallerySection = ({ cardColor = "secondary" }: { cardColor?: CardColor }) => {
  const { gallery } = useDoctorData();
  const [api, setApi] = useState<CarouselApi>();
  const [selected, setSelected] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [activePhoto, setActivePhoto] = useState<any | null>(null);

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
    if (!api || gallery.length <= 1 || hovering || activePhoto) return;
    const timer = setInterval(() => api.scrollNext(), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [api, gallery.length, hovering, activePhoto]);

  if (gallery.length === 0) return null;

  return (
    <section id="gallery" className={`relative py-16 md:py-24 overflow-hidden ${cardColorClass(cardColor)}`}>
      <div
        className="absolute inset-0 opacity-[0.05] dark:opacity-[0.12] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--pattern-line)) 1px, transparent 0)`,
          backgroundSize: "24px 24px",
        }}
      />
      <div className="container mx-auto px-[5px] md:px-4 relative z-10">
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-foreground text-center mb-12">Our Clinic</h2>

        {!useCarouselLayout ? (
          <>
            {/* Mobile View: Always swipeable carousel without chevrons */}
            <div className="block md:hidden max-w-5xl mx-auto">
              <Carousel setApi={setApi} opts={{ align: "start", loop: gallery.length > 1 }} className="px-2">
                <CarouselContent className="-ml-4">
                  {gallery.map((p: any) => (
                    <CarouselItem key={p.id} className="pl-4 basis-[88%]">
                      <GalleryCard p={p} onClick={() => setActivePhoto(p)} />
                    </CarouselItem>
                  ))}
                </CarouselContent>
              </Carousel>
              {gallery.length > 1 && (
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
              )}
            </div>

            {/* Desktop View (<= 3 items): Static grid/flex layout without carousel and without arrows */}
            <div
              className={
                gallery.length === 1
                  ? "hidden md:flex justify-center"
                  : "hidden md:grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 max-w-4xl mx-auto"
              }
            >
              {gallery.map((p: any) => (
                <GalleryCard
                  key={p.id}
                  p={p}
                  onClick={() => setActivePhoto(p)}
                  className={gallery.length === 1 ? "w-full max-w-[360px]" : ""}
                />
              ))}
            </div>
          </>
        ) : (
          /* Desktop (> 3 items) & Mobile (> 3 items): Carousel */
          <div
            className="max-w-5xl mx-auto"
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
          >
            <Carousel setApi={setApi} opts={{ align: "start", loop: true }} className="px-2">
              <CarouselContent className="-ml-4 sm:-ml-6">
                {gallery.map((p: any) => (
                  <CarouselItem key={p.id} className="pl-4 sm:pl-6 basis-[88%] sm:basis-1/2 lg:basis-1/3">
                    <GalleryCard p={p} onClick={() => setActivePhoto(p)} />
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="hidden md:inline-flex left-1 md:left-2 lg:-left-12 border-border bg-card" />
              <CarouselNext className="hidden md:inline-flex right-1 md:right-2 lg:-right-12 border-border bg-card" />
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

      {/* Photo Lightbox Dialog */}
      <Dialog open={!!activePhoto} onOpenChange={(open) => !open && setActivePhoto(null)}>
        <DialogContent className="max-w-4xl p-2 sm:p-4 bg-card/95 backdrop-blur-md border border-border">
          {activePhoto && (
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="max-h-[80vh] w-full flex items-center justify-center overflow-hidden rounded-xl bg-black/40 p-2">
                <img
                  src={activePhoto.photo_url}
                  alt={activePhoto.caption || "Clinic photo"}
                  className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
                />
              </div>
              {activePhoto.caption && (
                <p className="text-sm font-medium text-foreground text-center px-4 py-1">
                  {activePhoto.caption}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default GallerySection;
