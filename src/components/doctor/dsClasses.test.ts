import { describe, expect, it } from "vitest";
import config from "../../../tailwind.config";

// A `text-ds-*` size that is not in tailwind.config.ts silently renders as body text (this happened
// with `text-ds-h1` on the doctor page heading). Fail loudly instead.
const sources = import.meta.glob(["./**/*.tsx", "../../pages/PractitionerPage.tsx", "../../pages/DoctorPublicPage.tsx"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("doctor-site design classes", () => {
  it("only uses text-ds-* sizes and colours that exist in the theme", () => {
    const ext = (config as any).theme?.extend ?? {};
    const sizes = Object.keys(ext.fontSize ?? {});
    const colourBases = new Set(Object.keys(ext.colors?.ds ?? {}).map((c) => c.toLowerCase()));
    colourBases.delete("default");
    const sizeNames = new Set(sizes.map((s) => s.replace(/^ds-/, "")));
    expect(sizeNames.size).toBeGreaterThan(3);
    expect(colourBases.size).toBeGreaterThan(5);

    const bad: string[] = [];
    for (const [file, text] of Object.entries(sources)) {
      if (file.includes(".test.")) continue;
      for (const m of text.matchAll(/\btext-ds-([a-z0-9]+(?:-[a-z0-9]+)*)\b/g)) {
        const name = m[1];
        const known = sizeNames.has(name) || colourBases.has(name);
        if (!known) bad.push(`${file}: text-ds-${name}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
