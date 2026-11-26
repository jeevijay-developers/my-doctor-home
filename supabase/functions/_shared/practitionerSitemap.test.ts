import { describe, expect, it } from "vitest";
import { practitionerSitemapEntries } from "./practitionerSitemap";

const docs = [{ id: "d1", slug: "dr-a" }, { id: "d2", slug: "dr-b" }];

describe("practitionerSitemapEntries", () => {
  it("lists doctor URLs only for clinics with 2+ active practitioners", () => {
    const rows = [
      { doctor_id: "d1", slug: "a", is_active: true, updated_at: "2026-01-01T00:00:00Z" },
      { doctor_id: "d1", slug: "b c", is_active: true, updated_at: null },
      { doctor_id: "d2", slug: "solo", is_active: true, updated_at: null },
    ];
    expect(practitionerSitemapEntries(docs, rows).map((e) => e.path)).toEqual(["/dr/dr-a/doctor/a", "/dr/dr-a/doctor/b%20c"]);
  });
  it("ignores inactive practitioners and unknown clinics", () => {
    const rows = [
      { doctor_id: "d1", slug: "a", is_active: true, updated_at: null },
      { doctor_id: "d1", slug: "b", is_active: false, updated_at: null },
      { doctor_id: "ghost", slug: "x", is_active: true, updated_at: null },
      { doctor_id: "ghost", slug: "y", is_active: true, updated_at: null },
    ];
    expect(practitionerSitemapEntries(docs, rows)).toEqual([]);
  });
});
