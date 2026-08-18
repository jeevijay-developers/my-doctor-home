/**
 * Doctor public-page sections render a mobile and a desktop variant side by
 * side (`md:hidden` / `hidden md:block`), each with its own id — the desktop
 * variant suffixed `-desktop` — so only one is ever visible at a time.
 * Scrolling straight to `id` targets the CSS-hidden element on desktop
 * viewports (a no-op), so resolve to whichever variant is actually visible.
 */
export const scrollToSection = (id: string) => {
  const isVisible = (el: HTMLElement | null): el is HTMLElement =>
    !!el && el.offsetParent !== null;

  const primary = document.getElementById(id);
  const desktop = document.getElementById(`${id}-desktop`);
  const target = isVisible(primary) ? primary : isVisible(desktop) ? desktop : primary || desktop;
  target?.scrollIntoView({ behavior: "smooth" });
};
