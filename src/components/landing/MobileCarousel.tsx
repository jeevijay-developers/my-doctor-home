import { Children, useCallback, useEffect, useState, type ReactNode } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { cn } from "@/lib/utils";

type MobileCarouselProps = {
  children: ReactNode;
  /** Layout classes used from `md` up, where the carousel is switched off (e.g. "md:grid md:grid-cols-3"). */
  desktopClassName: string;
  /** Scrolls back to the first slide whenever this value changes. */
  resetKey?: string | number;
  /** Accessible name for the carousel region. */
  label: string;
};

/**
 * Swipeable carousel below the `md` breakpoint; a plain grid from `md` up.
 * One DOM tree serves both, so ids inside slides (SVG gradients) are not duplicated.
 * Embla is deactivated at `md`, which removes its transforms and lets `desktopClassName` lay out the cards.
 */
const MobileCarousel = ({ children, desktopClassName, resetKey, label }: MobileCarouselProps) => {
  const [emblaRef, api] = useEmblaCarousel({
    align: "center",
    containScroll: false,
    breakpoints: { "(min-width: 768px)": { active: false } },
  });
  const [selected, setSelected] = useState(0);
  const [snaps, setSnaps] = useState<number[]>([]);

  const sync = useCallback(() => {
    if (!api) return;
    setSnaps(api.scrollSnapList());
    setSelected(api.selectedScrollSnap());
  }, [api]);

  useEffect(() => {
    if (!api) return;
    sync();
    api.on("select", sync).on("reInit", sync);
    return () => {
      api.off("select", sync).off("reInit", sync);
    };
  }, [api, sync]);

  useEffect(() => {
    if (!api) return;
    api.reInit();
    api.scrollTo(0, true);
  }, [api, resetKey]);

  return (
    <div role="region" aria-roledescription="carousel" aria-label={label}>
      {/* The small negative margin keeps card shadows and focus rings from being clipped on mobile. */}
      <div ref={emblaRef} className="-m-1 overflow-hidden p-1 md:m-0 md:overflow-visible md:p-0">
        <div className={cn("flex gap-4", desktopClassName)}>
          {Children.toArray(children).map((child, i) => (
            <div
              key={i}
              role="group"
              aria-roledescription="slide"
              className="flex min-w-0 shrink-0 grow-0 basis-[86%] flex-col sm:basis-[60%] md:basis-auto [&>*]:flex-1"
            >
              {child}
            </div>
          ))}
        </div>
      </div>

      {snaps.length > 1 && (
        <div className="mt-4 flex justify-center gap-2 md:hidden">
          {snaps.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === selected}
              onClick={() => api?.scrollTo(i)}
              className={cn(
                "h-2 rounded-full transition-all",
                i === selected ? "w-6 bg-primary" : "w-2 bg-primary/25",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default MobileCarousel;
