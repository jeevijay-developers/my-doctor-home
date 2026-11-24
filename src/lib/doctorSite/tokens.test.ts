import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the doctor-site palette: every text color must stay readable on every
// background it can sit on, in both themes. Values are read from the stylesheet
// itself, so editing a token there without re-checking contrast fails here.

const css = readFileSync(resolve(__dirname, "../../styles/doctor-site.css"), "utf8");

const block = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`selector ${selector} not found`);
  return css.slice(start, css.indexOf("}", start));
};

const tokens = (selector: string) => {
  const out: Record<string, [number, number, number]> = {};
  for (const match of block(selector).matchAll(/--ds-([a-z0-9-]+):\s*(\d+)\s+(\d+)\s+(\d+);/g)) {
    out[match[1]] = [Number(match[2]), Number(match[3]), Number(match[4])];
  }
  return out;
};

const luminance = ([r, g, b]: [number, number, number]) => {
  const [lr, lg, lb] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
};

const contrast = (a: [number, number, number], b: [number, number, number]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const WHITE: [number, number, number] = [255, 255, 255];
const BACKGROUNDS = ["paper", "paper-2", "surface"];

describe.each([
  ["light", ".doctor-site"],
  ["dark", ".dark .doctor-site"],
])("doctor-site tokens (%s)", (_theme, selector) => {
  // Dark overrides light and inherits any token it does not redefine (the CSS cascade).
  const t = selector === ".doctor-site" ? tokens(selector) : { ...tokens(".doctor-site"), ...tokens(selector) };

  it("defines every token the Tailwind `ds` namespace maps", () => {
    for (const name of ["paper", "paper-2", "surface", "ink", "ink-2", "ink-3", "line", "accent", "accent-hover",
      "accent-ink", "accent-soft", "live", "live-dot", "warm", "star", "danger"]) {
      expect(t[name], name).toBeDefined();
    }
  });

  it("body text passes AAA (7:1) on every background", () => {
    for (const bg of BACKGROUNDS) expect(contrast(t.ink, t[bg])).toBeGreaterThanOrEqual(7);
  });

  it.each(["ink-2", "ink-3", "accent-ink", "live", "warm", "danger"])(
    "%s passes AA (4.5:1) on every background",
    (fg) => {
      for (const bg of BACKGROUNDS) expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("footer text is readable on the footer background", () => {
    expect(contrast(t["footer-ink"], t["footer-bg"])).toBeGreaterThanOrEqual(7);
    expect(contrast(t["footer-ink-2"], t["footer-bg"])).toBeGreaterThanOrEqual(7);
  });

  it("white text passes AA on the accent fill and its hover state", () => {
    expect(contrast(WHITE, t.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(WHITE, t["accent-hover"])).toBeGreaterThanOrEqual(4.5);
  });

  it("ink stays readable on selected (accent-soft) chips", () => {
    expect(contrast(t.ink, t["accent-soft"])).toBeGreaterThanOrEqual(7);
  });
});
