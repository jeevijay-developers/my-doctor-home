import { useEffect, type RefObject } from "react";
import { loadGsap, prefersReducedMotion } from "./gsap";
import { DUR, GSAP_EASE } from "./tokens";

type Options = {
  /** Play immediately (hero) instead of when the heading scrolls into view. */
  immediate?: boolean;
  delay?: number;
};

/** How long after mount the hero may still start its reveal. Later than this the text has been on screen for a while and hiding it again would be a flash. */
const HERO_REVEAL_WINDOW_MS = 450;

/**
 * Kinetic heading reveal (spec §3.4): lines slide up inside a clip mask.
 *
 * Progressive enhancement: the heading is ordinary text from first paint, and GSAP
 * loads as a separate async chunk. The reveal only plays if it can do so without
 * making already-visible text disappear and reappear:
 * - hero: only if GSAP arrives within HERO_REVEAL_WINDOW_MS of mounting;
 * - section headings: only if the heading is still below the fold when GSAP arrives.
 * Otherwise the text simply stays put. Off entirely for reduced motion. The split is
 * reverted after playing so the heading reflows normally (zoom, resize, translation),
 * and `aria: "auto"` keeps the full sentence as its accessible name meanwhile.
 */
export function useSplitReveal(ref: RefObject<HTMLElement>, { immediate = false, delay = 0 }: Options = {}) {
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;

    const mountedAt = performance.now();
    let cancelled = false;
    let revert: (() => void) | undefined;

    loadGsap().then(({ gsap, SplitText }) => {
      const node = ref.current;
      if (cancelled || !node) return;

      if (immediate) {
        if (performance.now() - mountedAt > HERO_REVEAL_WINDOW_MS) return;
      } else if (node.getBoundingClientRect().top < window.innerHeight * 0.88) {
        return; // already on screen: leave it readable
      }

      const ctx = gsap.context(() => {
        SplitText.create(node, {
          type: "lines",
          mask: "lines",
          linesClass: "ds-split-line",
          aria: "auto",
          autoSplit: true,
          onSplit(self) {
            return gsap.from(self.lines, {
              yPercent: 105,
              duration: DUR.reveal + 0.2,
              ease: GSAP_EASE.out,
              stagger: 0.08,
              delay,
              scrollTrigger: immediate ? undefined : { trigger: node, start: "top 88%", once: true },
              onComplete: () => self.revert(),
            });
          },
        });
      }, node);
      revert = () => ctx.revert();
    });

    return () => {
      cancelled = true;
      revert?.();
    };
  }, [ref, immediate, delay]);
}
