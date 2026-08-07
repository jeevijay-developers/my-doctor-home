import { ReactNode } from "react";

/**
 * Wraps a full-bleed patient-page section in a bounded, premium "card" —
 * rounded corners, border, shadow, and consistent max-width/spacing — without
 * touching the section's own internal markup, content, or logic. The
 * section's existing background, padding, and decorative overlays are left
 * completely intact; this just frames them.
 */
const SectionCard = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  // Left/right inset is a fixed 20px from the viewport edge at every breakpoint (not
  // responsive-scaled, and not capped by a max-width) per design spec. Each section's
  // own inner content still centers itself within its usual max-width, so this only
  // widens the card's background/border/shadow, not the readable content column.
  <div className={`px-5 mt-8 md:mt-12 ${className}`}>
    <div className="rounded-2xl md:rounded-3xl overflow-hidden border border-border/60 shadow-lg shadow-black/5 dark:shadow-black/30">
      {children}
    </div>
  </div>
);

export default SectionCard;
