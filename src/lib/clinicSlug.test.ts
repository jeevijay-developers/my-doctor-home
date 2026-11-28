import { describe, it, expect } from "vitest";
import { clinicDisplayUrl, clinicSitePath, swapSlugInPath } from "./clinicSlug";

describe("urls", () => {
  it("builds the path and the display url", () => {
    expect(clinicSitePath("sunrise")).toBe("/dr/sunrise");
    expect(clinicDisplayUrl("sunrise")).toBe("doctylia.com/dr/sunrise");
  });
});

describe("swapSlugInPath", () => {
  it("keeps the suffix, query and hash", () => {
    expect(swapSlugInPath("/dr/old", "old", "new")).toBe("/dr/new");
    expect(swapSlugInPath("/dr/old/blog/my-post", "old", "new", "?a=1", "#x")).toBe("/dr/new/blog/my-post?a=1#x");
    expect(swapSlugInPath("/dr/old/doctor/dr-b", "old", "new")).toBe("/dr/new/doctor/dr-b");
  });
  it("does not match a longer slug sharing the prefix", () => {
    expect(swapSlugInPath("/dr/older/blog", "old", "new")).toBeNull();
    expect(swapSlugInPath("/other", "old", "new")).toBeNull();
  });
});
