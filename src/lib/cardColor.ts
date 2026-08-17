// Shared alternating color for the patient-side page's top-level cards.
// Color A ("secondary") is the Hero Section card's existing background;
// Color B ("card") is the Patient Review card's existing background — both
// pre-existing design tokens, no new colors introduced. DoctorPublicPage.tsx
// hands each visible card the next color in sequence (skipping cards that
// don't render for a given doctor), so the alternation stays correct
// regardless of which optional sections are enabled.
export type CardColor = "secondary" | "card";

export const cardColorClass = (color: CardColor) => (color === "secondary" ? "bg-secondary" : "bg-card");
