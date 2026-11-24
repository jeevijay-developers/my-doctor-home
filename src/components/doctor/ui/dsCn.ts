import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge only knows Tailwind's built-in font sizes, so it reads the doctor
// site's custom `text-ds-small` / `text-ds-h2` ... as text *colors* and drops them
// whenever a `text-ds-ink` color follows in the same call. This merger knows the
// `ds` font-size scale (tailwind.config.ts `fontSize`) so size and color coexist.
const dsMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["ds-display", "ds-h2", "ds-h3", "ds-lead", "ds-body", "ds-small", "ds-label"] }],
    },
  },
});

export function dsCn(...inputs: ClassValue[]) {
  return dsMerge(clsx(inputs));
}
