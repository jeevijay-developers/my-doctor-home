import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { directorySlug } from "./slug";

describe("directorySlug", () => {
  it("lowercases and hyphenates", () => {
    expect(directorySlug("Kota")).toBe("kota");
    expect(directorySlug("  New Delhi ")).toBe("new-delhi");
    expect(directorySlug("Obstetrics & Gynaecology")).toBe("obstetrics-gynaecology");
  });

  it("collapses punctuation and trims hyphens", () => {
    expect(directorySlug("Kota, Rajasthan.")).toBe("kota-rajasthan");
    expect(directorySlug("--ENT--")).toBe("ent");
  });

  it("returns empty for null, undefined and non-latin-only input", () => {
    expect(directorySlug(null)).toBe("");
    expect(directorySlug(undefined)).toBe("");
    expect(directorySlug("कोटा")).toBe("");
  });

  it("keeps the Deno copy byte-identical (edge functions cannot import from src/)", () => {
    const here = readFileSync(resolve(__dirname, "slug.ts"), "utf8");
    const deno = readFileSync(resolve(__dirname, "../../../supabase/functions/_shared/directorySlug.ts"), "utf8");
    expect(deno).toBe(here);
  });
});
