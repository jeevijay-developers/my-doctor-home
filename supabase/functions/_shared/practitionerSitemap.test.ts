import { describe, expect, it } from "vitest";
import { isIndexableBio, practitionerSitemapEntries } from "./practitionerSitemap";

const docs = [{ id: "d1", slug: "dr-a" }, { id: "d2", slug: "dr-b" }];
const BIO = "A doctor with a real, written biography that is clearly longer than sixty characters.";

describe("practitionerSitemapEntries", () => {
  it("lists doctor URLs only for clinics with 2+ active practitioners", () => {
    const rows = [
      { doctor_id: "d1", slug: "a", is_active: true, updated_at: "2026-01-01T00:00:00Z", bio: BIO },
      { doctor_id: "d1", slug: "b c", is_active: true, updated_at: null, bio: BIO },
      { doctor_id: "d2", slug: "solo", is_active: true, updated_at: null, bio: BIO },
    ];
    expect(practitionerSitemapEntries(docs, rows).map((e) => e.path)).toEqual(["/dr/dr-a/doctor/a", "/dr/dr-a/doctor/b%20c"]);
  });
  it("ignores inactive practitioners and unknown clinics", () => {
    const rows = [
      { doctor_id: "d1", slug: "a", is_active: true, updated_at: null, bio: BIO },
      { doctor_id: "d1", slug: "b", is_active: false, updated_at: null, bio: BIO },
      { doctor_id: "ghost", slug: "x", is_active: true, updated_at: null, bio: BIO },
      { doctor_id: "ghost", slug: "y", is_active: true, updated_at: null, bio: BIO },
    ];
    expect(practitionerSitemapEntries(docs, rows)).toEqual([]);
  });
  it("skips doctors with directory_listed=false but still counts them toward the 2+ rule", () => {
    const rows = [
      { doctor_id: "d1", slug: "a", is_active: true, updated_at: null, directory_listed: true, bio: BIO },
      { doctor_id: "d1", slug: "b", is_active: true, updated_at: null, directory_listed: false, bio: BIO },
    ];
    expect(practitionerSitemapEntries(docs, rows).map((e) => e.path)).toEqual(["/dr/dr-a/doctor/a"]);
  });
  it("treats a missing or null directory_listed (column not migrated yet) as listed", () => {
    const rows = [
      { doctor_id: "d1", slug: "a", is_active: true, updated_at: null, bio: BIO },
      { doctor_id: "d1", slug: "b", is_active: true, updated_at: null, directory_listed: null, bio: BIO },
    ];
    expect(practitionerSitemapEntries(docs, rows)).toHaveLength(2);
  });
  it("omits noindex pages: a doctor with an empty or short bio is not listed, but still counts toward the 2+ rule", () => {
    const rows = [
      { doctor_id: "d1", slug: "a", is_active: true, updated_at: null, bio: BIO },
      { doctor_id: "d1", slug: "b", is_active: true, updated_at: null, bio: "" },
      { doctor_id: "d1", slug: "c", is_active: true, updated_at: null, bio: null },
      { doctor_id: "d1", slug: "d", is_active: true, updated_at: null },
      { doctor_id: "d1", slug: "e", is_active: true, updated_at: null, bio: "Short bio." },
    ];
    expect(practitionerSitemapEntries(docs, rows).map((e) => e.path)).toEqual(["/dr/dr-a/doctor/a"]);
  });
  it("a clinic with one active doctor lists nothing even when that doctor has a bio", () => {
    const rows = [
      { doctor_id: "d1", slug: "a", is_active: true, updated_at: null, bio: BIO },
      { doctor_id: "d1", slug: "b", is_active: false, updated_at: null, bio: BIO },
    ];
    expect(practitionerSitemapEntries(docs, rows)).toEqual([]);
  });
  it("counts the bio after collapsing whitespace", () => {
    expect(isIndexableBio(`${"a ".repeat(29)}a`)).toBe(false); // 59 chars
    expect(isIndexableBio("a".repeat(60))).toBe(true);
    expect(isIndexableBio(`${" ".repeat(80)}short`)).toBe(false);
  });
});
