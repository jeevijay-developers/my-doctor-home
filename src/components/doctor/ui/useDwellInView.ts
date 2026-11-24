import { useEffect, useRef, useState } from "react";

/**
 * True once the element has stayed on screen for `dwellMs` (and stays true afterwards).
 * For heavy third-party embeds (Google Maps pulls ~1 MB of script): loading them as the
 * visitor scrolls past makes the scroll hitch, so wait until they have actually stopped to look.
 * Without IntersectionObserver it resolves to true so the embed still works.
 */
export function useDwellInView<T extends Element>(dwellMs = 600, threshold = 0.25) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (seen) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    let timer: number | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        window.clearTimeout(timer);
        if (entry.isIntersecting) timer = window.setTimeout(() => setSeen(true), dwellMs);
      },
      { threshold },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [seen, dwellMs, threshold]);

  return [ref, seen] as const;
}
