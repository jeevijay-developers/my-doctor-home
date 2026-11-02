import { Users, Star } from "lucide-react";
import { describe, expect, it } from "vitest";
import {
  AVAILABLE_STAT_ICONS,
  DEFAULT_QUICK_STATS,
  ICON_MAP,
  getStatIconComponent,
  resolveStatValue,
  type QuickStatItem,
} from "./quickStats";

const stat = (over: Partial<QuickStatItem> = {}): QuickStatItem => ({
  id: "x",
  label: "L",
  value: "",
  icon: "Users",
  active: true,
  ...over,
});

describe("icons", () => {
  it("ICON_MAP indexes every available icon uniquely", () => {
    expect(Object.keys(ICON_MAP)).toHaveLength(AVAILABLE_STAT_ICONS.length);
  });
  it("getStatIconComponent resolves known names and falls back to Users", () => {
    expect(getStatIconComponent("Star")).toBe(Star);
    expect(getStatIconComponent("Nope")).toBe(Users);
    expect(getStatIconComponent("")).toBe(Users);
  });
  it("every default stat uses a known icon", () => {
    for (const s of DEFAULT_QUICK_STATS) expect(ICON_MAP[s.icon]).toBeDefined();
  });
});

describe("resolveStatValue", () => {
  it("returns the trimmed explicit value", () => {
    expect(resolveStatValue(stat({ value: "  5,000+ " }))).toBe("5,000+");
  });
  it("derives experience from the profile when value is blank", () => {
    expect(resolveStatValue(stat({ id: "experience" }), { experience_years: 12 })).toBe("12+");
    expect(resolveStatValue(stat({ id: "experience", value: "   " }), { experience_years: 7 })).toBe("7+");
  });
  it("experience falls back to 0+ with no profile / null years", () => {
    expect(resolveStatValue(stat({ id: "experience" }))).toBe("0+");
    expect(resolveStatValue(stat({ id: "experience" }), { experience_years: null })).toBe("0+");
  });
  it("explicit value wins over the profile for experience", () => {
    expect(resolveStatValue(stat({ id: "experience", value: "20 yrs" }), { experience_years: 3 })).toBe("20 yrs");
  });
  it("returns empty string for other blank stats", () => {
    expect(resolveStatValue(stat({ id: "success" }))).toBe("");
  });
  it("whitespace-only value on a non-experience stat resolves to empty string", () => {
    expect(resolveStatValue(stat({ id: "success", value: "   " }))).toBe("");
  });
});
