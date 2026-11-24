import { useEffect, useState } from "react";

/**
 * Which of the given section ids is currently in the reading zone (the band
 * just above the middle of the viewport). Drives the navbar's active state.
 */
export function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join("|");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const elements = key
      .split("|")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (elements.length === 0) return;

    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
        const first = elements.find((el) => visible.get(el.id));
        setActive(first ? first.id : null);
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [key]);

  return active;
}

/** True while the element with `id` overlaps the viewport at all. */
export function useSectionInView(id: string, rootMargin = "0px") {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = document.getElementById(id);
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin });
    observer.observe(el);
    return () => observer.disconnect();
  }, [id, rootMargin]);
  return inView;
}
