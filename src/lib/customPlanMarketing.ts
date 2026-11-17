// Public copy for the Custom Plan card, shared by the landing pricing section and /pricing so
// the two never drift. It describes the real feature: a doctor on Pro or Premium sends a
// request from Settings > Subscription (features + monthly appointment limit); the Doctylia
// team sets the final price and dates (see "Custom plans" in CLAUDE.md).
export const CUSTOM_PLAN_FEATURES = [
  "A feature set built around your practice",
  "Negotiated monthly price on top of Pro or Premium",
  "Custom monthly appointment limit, or unlimited",
  "Reviewed and approved by the Doctylia team",
  "Request it from your admin panel once you are on Pro or Premium",
];

export const CUSTOM_PLAN_COPY = {
  name: "Custom Plan",
  badge: "Tailored to You",
  desc: "Need a different feature set or appointment volume? Ask for exactly what your practice needs.",
  priceLabel: "Custom",
  priceNote: "Price agreed on top of Pro or Premium",
  cta: "Get Started",
  ctaNote: "Request it from your admin panel",
};
