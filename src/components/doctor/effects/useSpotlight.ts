import { useCallback } from "react";
import type { PointerEvent } from "react";

/**
 * Cursor spotlight (port of Magic UI's MagicCard, without React re-renders): spread the
 * returned handlers on an element with the `ds-spotlight` class. Mouse only, so touch
 * and pen users never see a stuck highlight.
 */
export function useSpotlight<T extends HTMLElement = HTMLElement>() {
  const onPointerMove = useCallback((event: PointerEvent<T>) => {
    if (event.pointerType !== "mouse") return;
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--ds-mx", `${event.clientX - rect.left}px`);
    el.style.setProperty("--ds-my", `${event.clientY - rect.top}px`);
    if (!el.hasAttribute("data-spot")) el.setAttribute("data-spot", "");
  }, []);
  const onPointerLeave = useCallback((event: PointerEvent<T>) => {
    event.currentTarget.removeAttribute("data-spot");
  }, []);
  return { onPointerMove, onPointerLeave };
}
