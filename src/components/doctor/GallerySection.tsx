import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Expand } from "lucide-react";
import { useDoctorData } from "@/contexts/DoctorContext";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Tables } from "@/integrations/supabase/types";
import SectionHeader from "./ui/SectionHeader";
import { DUR, EASE, staggerDelay } from "./motion/tokens";

type Photo = Tables<"gallery_photos">;

// One to three photos: an even row (a masonry of two leaves the right half empty).
const FEW_COLUMNS: Record<number, string> = { 1: "max-w-xl", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" };

// Mixed aspect ratios give the grid an editorial rhythm without cropping faces.
const SHAPES = ["aspect-[4/5]", "aspect-[1/1]", "aspect-[4/3]", "aspect-[3/4]", "aspect-[1/1]", "aspect-[4/5]"];

/**
 * The clinic gallery (spec §5.8). No autoplay: moving content under a reading
 * patient is disorienting, so photos change only when asked to. A lightbox with
 * previous/next opens on tap.
 */
const GallerySection = () => {
  const { gallery } = useDoctorData();
  const photos = (gallery ?? []) as Photo[];
  const [open, setOpen] = useState<number | null>(null);
  const lastShown = useRef<Photo | null>(null);

  if (photos.length === 0) {
    return (
      <section id="gallery" aria-labelledby="gallery-heading" className="py-[4.5rem] md:py-32">
        <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
          <SectionHeader id="gallery-heading" eyebrow="The clinic" title="A look inside" intro="Where you will be seen." />
          <p className="mt-10 rounded-ds-lg border border-dashed border-ds-line px-6 py-14 text-center text-ds-body text-ds-ink-2 md:mt-14">
            Photos of the clinic will appear here soon.
          </p>
        </div>
      </section>
    );
  }

  if (open !== null && photos[open]) lastShown.current = photos[open];
  // While the dialog fades out `open` is already null; keep showing the last photo instead of blanking it.
  const current = open !== null ? photos[open] : lastShown.current;
  const step = (delta: number) => setOpen((i) => (i === null ? i : (i + delta + photos.length) % photos.length));

  return (
    <section id="gallery" aria-labelledby="gallery-heading" className="py-[4.5rem] md:py-32">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
        <SectionHeader id="gallery-heading" eyebrow="The clinic" title="A look inside" intro="Where you will be seen." />

        <ul className={`mt-10 md:mt-14 ${photos.length <= 3 ? `grid gap-3 sm:gap-4 ${FEW_COLUMNS[photos.length]}` : "columns-2 gap-3 sm:gap-4 lg:columns-3"}`}>
          {photos.map((photo, index) => (
            <motion.li
              key={photo.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: DUR.medium, ease: EASE.out, delay: staggerDelay(index % 3) }}
              className="mb-3 break-inside-avoid sm:mb-4"
            >
              <button
                type="button"
                onClick={() => setOpen(index)}
                className="group relative block w-full overflow-hidden rounded-ds-md bg-ds-paper-2 ring-1 ring-ds-line"
                aria-label={`Open photo ${index + 1} of ${photos.length}${photo.caption ? `: ${photo.caption}` : ""}`}
              >
                <img
                  src={photo.photo_url}
                  alt={photo.caption || "Clinic photo"}
                  loading="lazy"
                  decoding="async"
                  className={`${photos.length <= 3 ? "aspect-[4/3]" : SHAPES[index % SHAPES.length]} w-full object-cover transition-transform duration-ds-4 ease-ds-out group-hover:scale-[1.04]`}
                />
                <span aria-hidden="true" className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-ds-paper/90 text-ds-ink opacity-0 shadow-ds-1 backdrop-blur transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Expand className="h-4 w-4" />
                </span>
              </button>
              {photo.caption && <p className="mt-2 px-1 text-ds-small text-ds-ink-2">{photo.caption}</p>}
            </motion.li>
          ))}
        </ul>
      </div>

      <Dialog open={open !== null} onOpenChange={(isOpen) => !isOpen && setOpen(null)}>
        <DialogContent className="doctor-site max-w-4xl gap-3 rounded-ds-lg border-ds-line bg-ds-paper p-3 text-ds-ink sm:p-5">
          <DialogTitle className="sr-only">{current?.caption || "Clinic photo"}</DialogTitle>
          <DialogDescription className="sr-only">
            Photo {(open ?? 0) + 1} of {photos.length}. Use the arrow keys or buttons to move between photos.
          </DialogDescription>
          {current && (
            <div
              className="relative"
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") step(1);
                if (event.key === "ArrowLeft") step(-1);
              }}
            >
              <img src={current.photo_url} alt={current.caption || "Clinic photo"} className="max-h-[72vh] w-full rounded-ds-md bg-ds-paper-2 object-contain" />
              {photos.length > 1 && (
                <>
                  <button type="button" onClick={() => step(-1)} aria-label="Previous photo" className="absolute left-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-ds-paper/90 shadow-ds-2 backdrop-blur">
                    <ChevronLeft aria-hidden="true" className="h-5 w-5" />
                  </button>
                  <button type="button" onClick={() => step(1)} aria-label="Next photo" className="absolute right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-ds-paper/90 shadow-ds-2 backdrop-blur">
                    <ChevronRight aria-hidden="true" className="h-5 w-5" />
                  </button>
                </>
              )}
              <p className="mt-3 flex items-center justify-between px-1 text-ds-small text-ds-ink-2">
                <span>{current.caption}</span>
                <span className="ds-tabular">{(open ?? 0) + 1} / {photos.length}</span>
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default GallerySection;
