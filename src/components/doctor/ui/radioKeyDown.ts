import type { KeyboardEvent } from "react";

/**
 * Arrow keys move through a group of role="radio" buttons and select as they go
 * (the WAI-ARIA radio group pattern). Put it on the role="radiogroup" element and give
 * the checked radio tabIndex 0 and the others -1, so the group is one Tab stop.
 */
export const radioKeyDown = (event: KeyboardEvent<HTMLElement>) => {
  const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
  const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
  if (!forward && !backward) return;
  const radios = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)'));
  const index = radios.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0) return;
  event.preventDefault();
  const next = radios[(index + (forward ? 1 : -1) + radios.length) % radios.length];
  next.focus();
  next.click();
};
