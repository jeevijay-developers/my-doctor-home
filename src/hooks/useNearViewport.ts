import { useEffect, useRef, useState } from "react";

/**
 * True once the referenced element has come within `rootMargin` of the viewport (and
 * stays true afterwards). Used to hold back heavy third-party embeds (Google Maps,
 * Cloudflare Turnstile) until the visitor actually scrolls near them, instead of
 * downloading them during the initial load.
 *
 * Without IntersectionObserver support it resolves to true so the embed still works.
 */
export function useNearViewport<T extends Element>(rootMargin = "300px") {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (near) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [near, rootMargin]);

  return [ref, near] as const;
}
