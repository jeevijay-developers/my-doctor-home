import { describe, it, expect, beforeEach } from "vitest";
import {
  addressBannerKey, clinicDisplayUrl, dismissAddressBanner, isAddressBannerDismissed, normalizeSlugInput,
  shouldOfferAddressBanner, slugErrorMessage, swapSlugInPath, validateSlugFormat,
} from "./clinicSlug";

describe("validateSlugFormat", () => {
  it("accepts good slugs and enforces 3-50 chars", () => {
    expect(validateSlugFormat("abc")).toBeNull();
    expect(validateSlugFormat("sunrise-clinic-2")).toBeNull();
    expect(validateSlugFormat("ab")).toBe("SLUG_INVALID");
    expect(validateSlugFormat("a".repeat(50))).toBeNull();
    expect(validateSlugFormat("a".repeat(51))).toBe("SLUG_INVALID");
  });
  it("rejects leading/trailing/double dashes, upper case and symbols", () => {
    for (const s of ["-abc", "abc-", "a--b", "ABC", "a_b", "a b", "क्लिनिक"]) expect(validateSlugFormat(s)).toBe("SLUG_INVALID");
  });
  it("refuses reserved words", () => {
    for (const s of ["admin", "superadmin", "doctors", "health-articles", "rx", "blog", "queue", "manage", "api", "auth"]) {
      expect(validateSlugFormat(s)).not.toBeNull();
    }
    expect(validateSlugFormat("admin")).toBe("SLUG_RESERVED");
    expect(validateSlugFormat("health-articles")).toBe("SLUG_RESERVED");
  });
});

describe("normalizeSlugInput", () => {
  it("turns what the owner types into slug form", () => {
    expect(normalizeSlugInput("  Sunrise Clinic! ")).toBe("sunrise-clinic");
    expect(normalizeSlugInput("")).toBe("");
  });
});

describe("messages and urls", () => {
  it("has a message per code and a generic fallback", () => {
    expect(slugErrorMessage("SLUG_TAKEN")).toMatch(/already used/);
    expect(slugErrorMessage("SLUG_RESERVED")).toMatch(/reserved/);
    expect(slugErrorMessage("SLUG_INVALID")).toMatch(/3-50/);
    expect(slugErrorMessage("NOT_ALLOWED")).toMatch(/permission/);
    expect(slugErrorMessage(undefined)).toMatch(/Could not save/);
  });
  it("shows the display url", () => {
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

describe("shouldOfferAddressBanner", () => {
  const base = { activePractitioners: 2, currentSlug: "dr-a", suggestedSlug: "sunrise", dismissed: false, isOwner: true, slugLocked: false };
  it("offers only to the owner of a 2+ doctor clinic whose address differs", () => {
    expect(shouldOfferAddressBanner(base)).toBe(true);
    expect(shouldOfferAddressBanner({ ...base, activePractitioners: 1 })).toBe(false);
    expect(shouldOfferAddressBanner({ ...base, isOwner: false })).toBe(false);
    expect(shouldOfferAddressBanner({ ...base, dismissed: true })).toBe(false);
    expect(shouldOfferAddressBanner({ ...base, slugLocked: true })).toBe(false);
    expect(shouldOfferAddressBanner({ ...base, suggestedSlug: "dr-a" })).toBe(false);
    expect(shouldOfferAddressBanner({ ...base, suggestedSlug: null })).toBe(false);
  });
});

describe("banner dismissal", () => {
  beforeEach(() => window.localStorage.clear());
  it("is remembered per clinic", () => {
    expect(isAddressBannerDismissed("c1")).toBe(false);
    dismissAddressBanner("c1");
    expect(isAddressBannerDismissed("c1")).toBe(true);
    expect(isAddressBannerDismissed("c2")).toBe(false);
    expect(addressBannerKey("c1")).toContain("c1");
  });
});
