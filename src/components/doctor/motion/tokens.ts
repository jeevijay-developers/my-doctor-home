// Motion tokens for the doctor public site. Mirrors the `ds-*` duration/easing
// utilities in tailwind.config.ts so CSS transitions, `motion` springs and GSAP
// timelines all share one rhythm. Spec §3.4.

/** Durations in seconds (motion + GSAP both take seconds). */
export const DUR = {
  press: 0.16,
  small: 0.24,
  medium: 0.42,
  reveal: 0.7,
} as const;

/** cubic-bezier control points, for `motion` (`ease: EASE.out`). */
export const EASE = {
  out: [0.22, 1, 0.36, 1] as [number, number, number, number],
  inOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
};

/** The same curves as GSAP ease strings (registered via CustomEase-free equivalents). */
export const GSAP_EASE = {
  out: "expo.out",
  inOut: "power3.inOut",
} as const;

/** Default spring for buttons, cards and layout changes. */
export const SPRING = { type: "spring", stiffness: 420, damping: 32, mass: 0.9 } as const;

/** Softer spring for larger surfaces (sheets, bottom bar). */
export const SPRING_SOFT = { type: "spring", stiffness: 260, damping: 30, mass: 1 } as const;

/** Per-item stagger, capped so long lists never make the reader wait. */
export const STAGGER = 0.04;
export const STAGGER_MAX_ITEMS = 6;

export const staggerDelay = (index: number) => Math.min(index, STAGGER_MAX_ITEMS) * STAGGER;
