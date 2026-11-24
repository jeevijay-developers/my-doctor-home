import { describe, expect, it } from "vitest";
import { parseCount } from "./countUp";

describe("parseCount", () => {
  it("splits a fact into the number and its surrounding text", () => {
    const p = parseCount("6 yrs")!;
    expect([p.prefix, p.value, p.suffix]).toEqual(["", 6, " yrs"]);
    expect(p.format(3.4)).toBe("3");
  });
  it("keeps decimals and digit grouping while counting", () => {
    expect(parseCount("4.5")!.format(2.25)).toBe("2.3");
    expect(parseCount("1,200+")!.format(1200)).toBe("1,200");
    expect(parseCount("1,00,000+")!.format(100000)).toBe("1,00,000");
  });
  it("leaves text without a number alone", () => {
    expect(parseCount("MBBS, MD")).toBeNull();
  });
});
