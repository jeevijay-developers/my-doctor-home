import { useEffect, useState } from "react";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";

// Mobile-only (md:hidden) auto-advancing, swipeable carousel for a list of
// cards whose desktop presentation stays a normal grid — used across the
// About page's six card sections. Built on the same embla-carousel-react
// instance already used by FeaturesGrid/HowItWorks on the homepage (no new
// dependency), just adding autoplay on top of that existing primitive.
export function MobileCardCarousel<T>({
  items,
  renderItem,
  itemClassName = "basis-[85%]",
  autoplayMs = 3000,
}: {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  itemClassName?: string;
  autoplayMs?: number;
}) {
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
      api.off("reInit", onSelect);
    };
  }, [api]);

  // Auto-advance every `autoplayMs` (embla's `loop` option makes the last ->
  // first wraparound a smooth continuous slide, not a jump). Paused while
  // the user's finger/pointer is actually down so a manual drag never fights
  // the timer, and restarted — from a fresh `autoplayMs` window — on every
  // pointer-up or slide settle, whichever the interaction produced.
  useEffect(() => {
    if (!api) return;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
    };
    const start = () => {
      stop();
      intervalId = setInterval(() => api.scrollNext(), autoplayMs);
    };
    start();
    api.on("pointerDown", stop);
    api.on("pointerUp", start);
    api.on("select", start);
    return () => {
      stop();
      api.off("pointerDown", stop);
      api.off("pointerUp", start);
      api.off("select", start);
    };
  }, [api, autoplayMs]);

  return (
    <div className="md:hidden">
      <Carousel setApi={setApi} opts={{ align: "start", loop: true }} className="px-1">
        <CarouselContent className="-ml-3">
          {items.map((item, i) => (
            <CarouselItem key={i} className={`pl-3 ${itemClassName}`}>
              {renderItem(item, i)}
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      <div className="flex justify-center gap-2 mt-4">
        {items.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Go to slide ${i + 1}`}
            onClick={() => api?.scrollTo(i)}
            className={`h-2 rounded-pill transition-all ${i === selected ? "w-6 bg-royal" : "w-2 bg-royal/25"}`}
          />
        ))}
      </div>
    </div>
  );
}

export default MobileCardCarousel;
