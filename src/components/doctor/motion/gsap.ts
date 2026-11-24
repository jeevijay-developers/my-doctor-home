// Lazy loader for GSAP on the doctor site. GSAP + ScrollTrigger + SplitText are ~50 KB
// gzip, and nothing on screen needs them to paint: headings are real text and the
// reveals are an enhancement. So they live in their own async chunk, fetched after the
// page is up, and registered exactly once.
// (SplitText and ScrollTrigger ship free in the `gsap` package since 3.13.)

type GsapModule = typeof import("gsap");
type ScrollTriggerModule = typeof import("gsap/ScrollTrigger");
type SplitTextModule = typeof import("gsap/SplitText");

export type GsapKit = {
  gsap: GsapModule["gsap"];
  ScrollTrigger: ScrollTriggerModule["ScrollTrigger"];
  SplitText: SplitTextModule["SplitText"];
};

let kit: Promise<GsapKit> | null = null;

/** Resolves with the registered GSAP toolkit; every caller shares one load. */
export const loadGsap = (): Promise<GsapKit> => {
  kit ??= Promise.all([import("gsap"), import("gsap/ScrollTrigger"), import("gsap/SplitText")]).then(
    ([core, trigger, split]) => {
      core.gsap.registerPlugin(trigger.ScrollTrigger, split.SplitText);
      return { gsap: core.gsap, ScrollTrigger: trigger.ScrollTrigger, SplitText: split.SplitText };
    },
  );
  return kit;
};

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** Runs `task` when the browser is idle (or shortly after, where requestIdleCallback is missing). */
export const whenIdle = (task: () => void, timeout = 1500) => {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (w.requestIdleCallback) {
    const handle = w.requestIdleCallback(task, { timeout });
    return () => w.cancelIdleCallback?.(handle);
  }
  const handle = window.setTimeout(task, 200);
  return () => window.clearTimeout(handle);
};
