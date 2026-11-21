export const CONTACT_TOPICS = [
  { value: "demo", label: "Book a demo" },
  { value: "pricing", label: "Pricing & plans" },
  { value: "support", label: "Technical support" },
  { value: "other", label: "Something else" },
] as const;

export type ContactTopic = (typeof CONTACT_TOPICS)[number]["value"];

/** Reads ?topic=... from the URL; anything unknown falls back to "demo". */
export const topicFromParam = (value: string | null): ContactTopic =>
  CONTACT_TOPICS.find((t) => t.value === value)?.value ?? "demo";
