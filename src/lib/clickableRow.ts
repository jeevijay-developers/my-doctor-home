import type { KeyboardEvent, MouseEvent } from "react";

// Spread onto a <tr> or <Card> to make the whole row/card open on click,
// while staying keyboard-reachable (Enter/Space) like a real button.
// Combine with stopRowClick on any checkbox/menu inside the row so those
// controls keep working without also triggering the row's own action.
export function clickableRowProps(onActivate: () => void, ariaLabel: string) {
  return {
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
    role: "button" as const,
    tabIndex: 0,
    "aria-label": ariaLabel,
  };
}

export function stopRowClick(e: MouseEvent) {
  e.stopPropagation();
}

export const CLICKABLE_ROW_CLASSES =
  "cursor-pointer hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";
