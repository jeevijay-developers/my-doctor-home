// Scrolling helpers for the doctor site. Work with or without Lenis running.
import type Lenis from "lenis";
import { prefersReducedMotion } from "./gsap";
import { EASE } from "./tokens";

// Height reserved for the fixed navbar when jumping to a section.
export const NAV_OFFSET = 76;

let activeLenis: Lenis | null = null;

/** Registered by <SmoothScroll> while Lenis is running. */
export const setActiveLenis = (lenis: Lenis | null) => {
  activeLenis = lenis;
};
export const getActiveLenis = () => activeLenis;

const bezier = ([x1, y1, x2, y2]: [number, number, number, number]) => {
  // Lenis wants an easing function (t -> progress). Solve the cubic-bezier for x = t.
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  return (t: number) => {
    let s = t;
    for (let i = 0; i < 6; i++) {
      const dx = sampleX(s) - t;
      const d = (3 * ax * s + 2 * bx) * s + cx;
      if (Math.abs(dx) < 1e-5 || d === 0) break;
      s -= dx / d;
    }
    return sampleY(Math.min(1, Math.max(0, s)));
  };
};

const easeOut = bezier(EASE.out);

type ScrollOptions = {
  /** After arriving, move keyboard/screen-reader focus here (selector inside the target). */
  focusSelector?: string;
};

/**
 * Scroll to a section of the doctor page by id. Uses Lenis when it is running
 * (short 0.6s glide, so reaching the booking form never feels slow) and the
 * native scroll otherwise. Also moves focus so keyboard and screen-reader users
 * land where sighted users are looking.
 */
export const dsScrollTo = (id: string, { focusSelector }: ScrollOptions = {}) => {
  const target = document.getElementById(id);
  if (!target) return;

  const focus = () => {
    // Something inside the section already took focus while we scrolled (e.g. the quick-book
    // flow opens straight on the name field): leave it, or the patient has to tap it again.
    const active = document.activeElement;
    if (active && active !== document.body && active !== target && target.contains(active)) return;
    const el = (focusSelector ? target.querySelector<HTMLElement>(focusSelector) : null) ?? target;
    if (!el.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
      el.setAttribute("tabindex", "-1");
    }
    el.focus({ preventScroll: true });
  };

  if (activeLenis) {
    activeLenis.scrollTo(target, { offset: -NAV_OFFSET, duration: 0.6, easing: easeOut, onComplete: focus, force: true });
    return;
  }
  const top = target.getBoundingClientRect().top + window.scrollY - NAV_OFFSET;
  window.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion() ? "auto" : "smooth" });
  window.setTimeout(focus, prefersReducedMotion() ? 0 : 450);
};

export const dsScrollToTop = () => {
  if (activeLenis) activeLenis.scrollTo(0, { duration: 0.8, easing: easeOut, force: true });
  else window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
};

