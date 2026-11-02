import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { calculateCommissionSplit, resolveCommissionPercent } from "./commissionSplit";

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== "")
    .join("\n");

describe("commissionSplit client/edge parity", () => {
  const client = readFileSync(path.resolve(__dirname, "commissionSplit.ts"), "utf8");
  const edge = readFileSync(path.resolve(__dirname, "../../supabase/functions/_shared/commissionSplit.ts"), "utf8");

  it("are identical apart from comments", () => {
    expect(stripComments(edge)).toBe(stripComments(client));
  });
  it("comment stripping leaves real code (sanity)", () => {
    expect(stripComments(client)).toContain("export function calculateCommissionSplit");
  });
});

// Deterministic LCG so failures are reproducible.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe("calculateCommissionSplit property: commission + net == gross", () => {
  it("holds over 20000 random paise/percent pairs, with all parts non-negative integers", () => {
    const r = rng(12345);
    for (let i = 0; i < 20000; i++) {
      const paise = Math.floor(r() * 5_000_000); // up to Rs 50,000
      const percent = Math.round(r() * 10000) / 100; // 0.00-100.00
      const out = calculateCommissionSplit(paise / 100, percent);
      expect(out.commissionPaise + out.doctorNetPaise).toBe(out.grossPaise);
      expect(out.grossPaise).toBe(paise);
      expect(Number.isInteger(out.commissionPaise)).toBe(true);
      expect(out.commissionPaise).toBeGreaterThanOrEqual(0);
      expect(out.doctorNetPaise).toBeGreaterThanOrEqual(0);
      expect(out.commissionPaise).toBeLessThanOrEqual(out.grossPaise);
    }
  });
  it("holds with arbitrary (unclamped/odd) percent inputs", () => {
    const r = rng(99);
    for (let i = 0; i < 5000; i++) {
      const paise = Math.floor(r() * 1_000_000);
      const percent = (r() - 0.3) * 250; // negatives and >100
      const out = calculateCommissionSplit(paise / 100, percent);
      expect(out.commissionPercent).toBeGreaterThanOrEqual(0);
      expect(out.commissionPercent).toBeLessThanOrEqual(100);
      expect(out.commissionPaise + out.doctorNetPaise).toBe(out.grossPaise);
      expect(out.doctorNetPaise).toBeGreaterThanOrEqual(0);
    }
  });
  it("rupee views are the paise values / 100", () => {
    const out = calculateCommissionSplit(123.45, 12.5);
    expect(out.grossAmount).toBe(out.grossPaise / 100);
    expect(out.commissionAmount + out.doctorShare).toBeCloseTo(out.grossAmount, 2);
  });
  it("is monotone: higher percent never lowers commission", () => {
    const r = rng(7);
    for (let i = 0; i < 2000; i++) {
      const g = Math.floor(r() * 100000) / 100;
      const a = Math.round(r() * 5000) / 100;
      const b = a + Math.round(r() * 5000) / 100;
      expect(calculateCommissionSplit(g, b).commissionPaise).toBeGreaterThanOrEqual(calculateCommissionSplit(g, a).commissionPaise);
    }
  });
});

describe("resolveCommissionPercent edges", () => {
  it("falls back doctor -> default -> 10", () => {
    expect(resolveCommissionPercent(5, 20)).toBe(5);
    expect(resolveCommissionPercent(null, 20)).toBe(20);
    expect(resolveCommissionPercent(undefined, undefined)).toBe(10);
    expect(resolveCommissionPercent("", "")).toBe(10);
    expect(resolveCommissionPercent("abc", "15")).toBe(15);
  });
  it("doctor override of 0 is honoured (not treated as unset)", () => {
    expect(resolveCommissionPercent(0, 20)).toBe(0);
  });
  it("clamps to [0,100] and rounds to 2dp; NaN/Infinity fall through", () => {
    expect(resolveCommissionPercent(-5)).toBe(0);
    expect(resolveCommissionPercent(150)).toBe(100);
    expect(resolveCommissionPercent(12.3456)).toBe(12.35);
    expect(resolveCommissionPercent(NaN, 7)).toBe(7);
    expect(resolveCommissionPercent(Infinity, 7)).toBe(7);
  });
  it("zero or invalid gross yields all zeros", () => {
    for (const g of [0, -10, NaN, Infinity]) {
      const out = calculateCommissionSplit(g, 10);
      expect(out.grossPaise).toBe(0);
      expect(out.commissionPaise).toBe(0);
      expect(out.doctorNetPaise).toBe(0);
    }
  });
});
