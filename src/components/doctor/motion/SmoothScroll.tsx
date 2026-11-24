import { useEffect, type ReactNode } from "react";
import type Lenis from "lenis";
import { loadGsap, prefersReducedMotion, whenIdle } from "./gsap";
import { getActiveLenis, setActiveLenis } from "./scroll";

/**
 * Mounts Lenis smooth scrolling for the doctor page only, driven by GSAP's
 * ticker so ScrollTrigger reads the same scroll position every frame.
 *
 * Nothing here is needed for first paint, so Lenis and GSAP are fetched as async
 * chunks once the browser is idle; until then the page scrolls natively.
 *
 * - Off entirely for `prefers-reduced-motion: reduce`.
 * - Touch keeps native momentum scrolling (`syncTouch: false`).
 * - Paused while any Radix dialog/drawer has locked the page
 *   (react-remove-scroll marks <body data-scroll-locked>), so modals scroll normally.
 * - Scroll areas inside the page opt out with `data-lenis-prevent`.
 */
const SmoothScroll = ({ children }: { children: ReactNode }) => {
  useEffect(() => {
    if (prefersReducedMotion()) return;

    let disposed = false;
    let teardown: (() => void) | undefined;

    const start = async () => {
      const [{ default: LenisCtor }, { gsap, ScrollTrigger }] = await Promise.all([import("lenis"), loadGsap()]);
      if (disposed) return;

      const lenis: Lenis = new LenisCtor({
        autoRaf: false,
        lerp: 0.12,
        wheelMultiplier: 1,
        syncTouch: false,
        anchors: false,
        // Overlays scroll natively. Without this, Lenis cancels wheel/touch events
        // inside a Radix dialog or vaul drawer while it is stopped for the scroll lock.
        prevent: (node: HTMLElement) =>
          Boolean(node.closest?.('[role="dialog"],[role="alertdialog"],[data-vaul-drawer],[data-radix-popper-content-wrapper],[data-radix-select-viewport],[data-lenis-prevent]')),
      });
      setActiveLenis(lenis);

      lenis.on("scroll", ScrollTrigger.update);
      const tick = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);

      const syncLock = () => {
        if (document.body.hasAttribute("data-scroll-locked")) lenis.stop();
        else lenis.start();
      };
      const observer = new MutationObserver(syncLock);
      observer.observe(document.body, { attributes: true, attributeFilter: ["data-scroll-locked"] });
      syncLock();

      teardown = () => {
        observer.disconnect();
        gsap.ticker.remove(tick);
        gsap.ticker.lagSmoothing(500, 33);
        lenis.destroy();
        if (getActiveLenis() === lenis) setActiveLenis(null);
      };
    };

    const cancelIdle = whenIdle(() => {
      void start();
    });

    return () => {
      disposed = true;
      cancelIdle();
      teardown?.();
    };
  }, []);

  return <>{children}</>;
};

export default SmoothScroll;
