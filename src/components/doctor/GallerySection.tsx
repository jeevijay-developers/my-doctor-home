import { useEffect, useState } from "react";
import { useDoctorData } from "@/contexts/DoctorContext";
import {
  Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext, type CarouselApi,
} from "@/components/ui/carousel";
import { cardColorClass, type CardColor } from "@/lib/cardColor";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const CAROUSEL_THRESHOLD = 3;
const AUTOPLAY_MS = 4000;

const DEFAULT_CLINIC_PHOTOS = [
  {
    id: "g1",
    photo_url: "https://lh3.googleusercontent.com/aida-public/AB6AXuDSVPfSEYxtT2zhOZ0BSo7KlD37OGv5TdJ7B3YwzRpLr-h8mk44AxYHDEWfw87SAkVuReDDLoHguiguXLHUA4jftZkDx5Tanawq_5WKQr4o5eoQYuiYhkX1NHyRVvPBgyuaOTqUnORgJHYEeG-uQ1oIaF5EcghF7oyDF7rUMGavwrPsttCuqHHgFAu9Thsb5uNak_fH0nOE1Y21jEVGSAaNOLnDRAiQ4NvyWDAKalwWv5xHnOtxK_B5",
    caption: "Reception & Waiting Area",
  },
  {
    id: "g2",
    photo_url: "https://lh3.googleusercontent.com/aida-public/AB6AXuB0bN4N_bd1gkptL1EN7HZ2Y12MKB0vRH8dMqDDcwAR6yaH2uk_RIiT-XgJnlIAUFheVXsG6EG8ddIMe2lEwmYTdY1JDCJb8jzcExOh6djVT0wgRFaz938751nFf5Fe2CgKkmnL2y3dCpwyHmk265XfpX0I-r3S0fLxEUZxFpl0ri-QRps682OdP9PVFjFOLDgJ3mpAL7c3URuYkPdoH3uOq0eKl22eeP0SCcTgxHBJYLvLXMOVS15n",
    caption: "Consultation Room",
  },
];

const DesktopGalleryCard = ({ p, onClick, className = "" }: { p: any; onClick?: () => void; className?: string }) => (
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
  const [activeMobileDot, setActiveMobileDot] = useState(0);

  const photos = gallery && gallery.length > 0 ? gallery : DEFAULT_CLINIC_PHOTOS;
  const useCarouselLayout = gallery.length > CAROUSEL_THRESHOLD;

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setSelected(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => { api.off("select", onSelect); };
  }, [api]);

  useEffect(() => {
    if (!api || gallery.length <= 1 || hovering || activePhoto) return;
    const timer = setInterval(() => api.scrollNext(), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [api, gallery.length, hovering, activePhoto]);

  return (
    <>
      {/* MOBILE VIEW (md:hidden) */}
      <div className="md:hidden">
        <section id="gallery" className="py-10 bg-primary-50 dark:bg-gray-900/80 bg-pattern rounded-3xl my-4">
          <div className="text-center px-4 mb-6">
            <h2 className="text-2xl font-bold text-text-dark dark:text-foreground">Our Clinic</h2>
          </div>

          <div
            className="flex overflow-x-auto hide-scrollbar px-4 gap-4 pb-6 snap-x justify-start"
            onScroll={(e) => {
              const target = e.currentTarget;
              const scrollPos = target.scrollLeft;
              const cardWidth = 320;
              const index = Math.round(scrollPos / cardWidth);
              setActiveMobileDot(Math.min(index, photos.length - 1));
            }}
          >
            {photos.map((p: any, idx: number) => (
              <div
                key={p.id || idx}
                onClick={() => setActivePhoto(p)}
                className="min-w-[300px] max-w-[320px] bg-white dark:bg-gray-800 p-2 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 snap-center shrink-0 cursor-pointer hover:shadow-md transition-shadow"
              >
                <img
                  alt={p.caption || "Clinic Facility"}
                  className="w-full h-48 object-cover rounded-xl bg-gray-200 dark:bg-gray-700"
                  src={p.photo_url}
                  loading="lazy"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-center gap-1.5 mt-2">
            {photos.map((_, i) => (
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
        <section id="gallery-desktop" className={`relative py-16 md:py-24 overflow-hidden ${cardColorClass(cardColor)}`}>
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
              <div
                className={
                  gallery.length === 1
                    ? "flex justify-center"
                    : "grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 max-w-4xl mx-auto"
                }
              >
                {gallery.map((p: any) => (
                  <DesktopGalleryCard
                    key={p.id}
                    p={p}
                    onClick={() => setActivePhoto(p)}
                    className={gallery.length === 1 ? "w-full max-w-[360px]" : ""}
                  />
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
                      <CarouselItem key={p.id} className="pl-4 sm:pl-6 basis-1/2 lg:basis-1/3">
                        <DesktopGalleryCard p={p} onClick={() => setActivePhoto(p)} />
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious className="inline-flex left-1 md:left-2 lg:-left-12 border-border bg-card" />
                  <CarouselNext className="inline-flex right-1 md:right-2 lg:-right-12 border-border bg-card" />
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
      </div>

      {/* Lightbox Dialog */}
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
    </>
  );
};

export default GallerySection;
