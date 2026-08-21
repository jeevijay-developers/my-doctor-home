import { useEffect, useState } from "react";
import { Expand, Image as ImageIcon } from "lucide-react";
import { useDoctorData } from "@/contexts/DoctorContext";
import {
  Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi,
} from "@/components/ui/carousel";
import { cardColorClass, type CardColor } from "@/lib/cardColor";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { Tables } from "@/integrations/supabase/types";

const PRIMARY = "#3C83FC";
const AUTOPLAY_MS = 4500;
type GalleryPhoto = Tables<"gallery_photos">;

const GallerySection = ({ cardColor = "secondary" }: { cardColor?: CardColor }) => {
  const { gallery } = useDoctorData();
  const photos = gallery as GalleryPhoto[];
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [selectedPhoto, setSelectedPhoto] = useState(0);
  const [snapCount, setSnapCount] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [activePhoto, setActivePhoto] = useState<GalleryPhoto | null>(null);

  useEffect(() => {
    if (!carouselApi) return;
    const updateCarousel = () => {
      setSelectedPhoto(carouselApi.selectedScrollSnap());
      setSnapCount(carouselApi.scrollSnapList().length);
    };
    updateCarousel();
    carouselApi.on("select", updateCarousel);
    carouselApi.on("reInit", updateCarousel);
    return () => {
      carouselApi.off("select", updateCarousel);
      carouselApi.off("reInit", updateCarousel);
    };
  }, [carouselApi]);

  useEffect(() => {
    if (!carouselApi || photos.length <= 1 || hovering || activePhoto) return;
    const timer = window.setInterval(() => {
      if (carouselApi.canScrollNext()) carouselApi.scrollNext();
      else carouselApi.scrollTo(0);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [activePhoto, carouselApi, hovering, photos.length]);

  return (
    <>
      <section id="gallery" className={`relative overflow-hidden ${cardColorClass(cardColor)}`}>
        <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-blue-100/45 blur-3xl dark:bg-blue-900/15" />
        <div className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-blue-100/40 blur-3xl dark:bg-blue-900/15" />

        <div className="relative mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16 lg:px-12 lg:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-heading text-xs font-extrabold uppercase tracking-[0.18em]" style={{ color: PRIMARY }}>
              A Space Designed for Care
            </p>
            <h2 className="mt-3 font-heading text-3xl font-extrabold tracking-[-0.035em] text-[#092b50] dark:text-white sm:text-4xl lg:text-5xl">
              Our <span style={{ color: PRIMARY }}>Clinic</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400 sm:text-base">
              Take a look inside our welcoming, modern clinic designed around your comfort and care.
            </p>
          </div>

          <Carousel
            setApi={setCarouselApi}
            opts={{ align: "start", loop: photos.length > 3 }}
            className="mx-auto mt-9 max-w-6xl sm:mt-12"
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
          >
            <CarouselContent className="-ml-4 pb-2">
              {photos.map((photo) => (
                <CarouselItem key={photo.id} className="basis-[92%] pl-4 sm:basis-1/2 lg:basis-1/3">
                  <button
                    type="button"
                    onClick={() => setActivePhoto(photo)}
                    className="group block w-full overflow-hidden rounded-2xl border border-blue-100 bg-white p-2 text-left shadow-[0_10px_30px_rgba(15,43,80,0.08)] transition-all duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_18px_38px_rgba(60,131,252,0.16)] dark:border-blue-900/60 dark:bg-gray-900 dark:hover:border-blue-700"
                  >
                    <span className="relative block aspect-[4/3] overflow-hidden rounded-xl bg-blue-50 dark:bg-gray-800">
                      <img
                        src={photo.photo_url}
                        alt={photo.caption || "Clinic facility"}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <span className="absolute inset-0 bg-gradient-to-t from-[#092b50]/85 via-transparent to-transparent" />
                      <span className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-blue-700 opacity-0 shadow-md backdrop-blur transition-opacity group-hover:opacity-100 dark:bg-gray-900/90 dark:text-blue-300">
                        <Expand className="h-4 w-4" />
                      </span>
                      <span className="absolute bottom-0 left-0 right-0 flex items-end gap-2 p-4 text-white">
                        <ImageIcon className="mb-0.5 h-4 w-4 shrink-0" style={{ color: PRIMARY }} />
                        <span className="line-clamp-2 text-sm font-bold leading-5">
                          {photo.caption || "Our Clinic"}
                        </span>
                      </span>
                    </span>
                  </button>
                </CarouselItem>
              ))}
            </CarouselContent>

            <div className="mt-7 flex items-center justify-center gap-4">
              <CarouselPrevious className="static h-10 w-10 translate-y-0 border-blue-200 bg-white text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-gray-900 dark:text-blue-300" />
              <div className="flex items-center gap-1.5">
                {Array.from({ length: snapCount }, (_, index) => (
                  <button
                    key={index}
                    type="button"
                    aria-label={`Go to clinic image ${index + 1}`}
                    onClick={() => carouselApi?.scrollTo(index)}
                    className={`h-2 rounded-full transition-all duration-300 ${selectedPhoto === index ? "w-6" : "w-2 bg-blue-200 dark:bg-blue-900"}`}
                    style={selectedPhoto === index ? { backgroundColor: PRIMARY } : undefined}
                  />
                ))}
              </div>
              <CarouselNext className="static h-10 w-10 translate-y-0 border-blue-200 bg-white text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-gray-900 dark:text-blue-300" />
            </div>
          </Carousel>
        </div>
      </section>

      <Dialog open={Boolean(activePhoto)} onOpenChange={(open) => !open && setActivePhoto(null)}>
        <DialogContent className="max-w-4xl rounded-2xl border border-blue-100 bg-white/95 p-2 shadow-2xl backdrop-blur-md dark:border-blue-900 dark:bg-gray-950/95 sm:p-4">
          {activePhoto && (
            <div className="flex flex-col items-center gap-3">
              <div className="flex max-h-[80vh] w-full items-center justify-center overflow-hidden rounded-xl bg-[#092b50] p-2">
                <img
                  src={activePhoto.photo_url}
                  alt={activePhoto.caption || "Clinic photo"}
                  className="max-h-[75vh] max-w-full rounded-lg object-contain"
                />
              </div>
              {activePhoto.caption && (
                <p className="px-4 py-1 text-center text-sm font-semibold text-[#092b50] dark:text-white">
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
