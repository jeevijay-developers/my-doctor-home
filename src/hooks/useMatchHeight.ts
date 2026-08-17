import { useEffect } from "react";

// Keeps two elements (looked up by id) at the same height by applying
// min-height = max(natural heights) to both, without touching either
// element's own content/padding/classes. Content length differs per doctor
// (bio length, working-hours summary, bullet count, etc.), so the gap
// between the two can't be a fixed padding value — this re-measures on
// resize and on any content-driven size change instead.
//
// The page this targets renders a loading spinner before the real content
// (including these two elements) mounts, so a plain "look them up once on
// mount" effect can run too early and find nothing. This waits for both
// elements to actually exist before wiring up the resize sync.
export function useMatchHeight(idA: string, idB: string) {
  useEffect(() => {
    let resizeObserver: ResizeObserver | null = null;
    let handler: (() => void) | null = null;

    const sync = (elA: HTMLElement, elB: HTMLElement) => {
      elA.style.minHeight = "";
      elB.style.minHeight = "";
      const max = Math.max(elA.offsetHeight, elB.offsetHeight);
      elA.style.minHeight = `${max}px`;
      elB.style.minHeight = `${max}px`;
    };

    const trySetup = () => {
      const elA = document.getElementById(idA);
      const elB = document.getElementById(idB);
      if (!elA || !elB) return false;
      handler = () => sync(elA, elB);
      handler();
      resizeObserver = new ResizeObserver(handler);
      resizeObserver.observe(elA);
      resizeObserver.observe(elB);
      window.addEventListener("resize", handler);
      return true;
    };

    let mutationObserver: MutationObserver | null = null;
    if (!trySetup()) {
      mutationObserver = new MutationObserver(() => {
        if (trySetup()) mutationObserver?.disconnect();
      });
      mutationObserver.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      if (handler) window.removeEventListener("resize", handler);
      document.getElementById(idA)?.style.removeProperty("min-height");
      document.getElementById(idB)?.style.removeProperty("min-height");
    };
  }, [idA, idB]);
}
