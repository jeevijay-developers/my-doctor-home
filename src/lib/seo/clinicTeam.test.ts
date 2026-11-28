import { describe, expect, it } from "vitest";
import {
  activeTeam, distinctSpecialties, hasIndexableBio, isMultiDoctorClinic, isPractitionerIndexable, listedTeam,
  MIN_INDEXABLE_BIO_CHARS, MULTI_DOCTOR_MIN_ACTIVE,
} from "./clinicTeam";
import * as sitemapRules from "../../../supabase/functions/_shared/practitionerSitemap";
import { practitionerSitemapEntries } from "../../../supabase/functions/_shared/practitionerSitemap";

const bio = (n: number) => "a".repeat(n);

describe("clinicTeam: the one definition of a multi-doctor clinic", () => {
  it("2+ ACTIVE doctors make a team clinic; one, none or undefined do not", () => {
    const a = { slug: "a" }, b = { slug: "b" };
    expect(isMultiDoctorClinic([a, b])).toBe(true);
    expect(isMultiDoctorClinic([a])).toBe(false);
    expect(isMultiDoctorClinic([])).toBe(false);
    expect(isMultiDoctorClinic(undefined)).toBe(false);
    expect(isMultiDoctorClinic(null)).toBe(false);
  });
  it("a deactivated doctor falls back to the single layout", () => {
    expect(isMultiDoctorClinic([{ slug: "a" }, { slug: "b", is_active: false }])).toBe(false);
  });
  it("an unlisted doctor still counts toward the team (their page exists) but is not in listedTeam", () => {
    const list = [{ slug: "a" }, { slug: "b", directory_listed: false }];
    expect(isMultiDoctorClinic(list)).toBe(true);
    expect(listedTeam(list).map((p) => p.slug)).toEqual(["a"]);
    expect(activeTeam(list)).toHaveLength(2);
  });
  it("ignores rows without a slug and non-array input", () => {
    expect(isMultiDoctorClinic([{ slug: "a" }, { slug: "" }])).toBe(false);
    expect(activeTeam("oops" as never)).toEqual([]);
  });
});

describe("thin-content guard", () => {
  it("the threshold is 60 characters", () => {
    expect(MIN_INDEXABLE_BIO_CHARS).toBe(60);
    expect(hasIndexableBio(bio(59))).toBe(false);
    expect(hasIndexableBio(bio(60))).toBe(true);
  });
  it("measures the bio after collapsing whitespace, and rejects empty/null", () => {
    expect(hasIndexableBio(`${" \n ".repeat(40)}hi`)).toBe(false);
    expect(hasIndexableBio("")).toBe(false);
    expect(hasIndexableBio(null)).toBe(false);
    expect(hasIndexableBio(undefined)).toBe(false);
  });
  it("indexable needs a real bio AND not opted out of the directory", () => {
    expect(isPractitionerIndexable({ slug: "a", bio: bio(60) })).toBe(true);
    expect(isPractitionerIndexable({ slug: "a", bio: bio(60), directory_listed: null })).toBe(true);
    expect(isPractitionerIndexable({ slug: "a", bio: bio(60), directory_listed: false })).toBe(false);
    expect(isPractitionerIndexable({ slug: "a", bio: bio(10) })).toBe(false);
  });
});

describe("distinctSpecialties", () => {
  it("is case-insensitive, most common first, then doctor order; skips blanks and inactive doctors", () => {
    expect(distinctSpecialties([
      { slug: "1", specialization: "ENT" }, { slug: "2", specialization: "dentist" }, { slug: "3", specialization: "Dentist" },
      { slug: "4", specialization: "  " }, { slug: "5", specialization: "Skin", is_active: false },
    ])).toEqual(["dentist", "ENT"]);
  });
});

describe("sitemap mirror (supabase/functions/_shared/practitionerSitemap.ts) matches clinicTeam", () => {
  it("shares the constants", () => {
    expect(sitemapRules.MIN_INDEXABLE_BIO_CHARS).toBe(MIN_INDEXABLE_BIO_CHARS);
    expect(sitemapRules.MULTI_DOCTOR_MIN_ACTIVE).toBe(MULTI_DOCTOR_MIN_ACTIVE);
  });
  it("agrees on indexability and on the 2+ rule for a table of cases", () => {
    const bios = [undefined, null, "", "short", bio(59), bio(60), "x ".repeat(40), "  \n  "];
    for (const b of bios) for (const listed of [undefined, null, true, false]) {
      const p = { slug: "a", bio: b, directory_listed: listed };
      expect(sitemapRules.isIndexableBio(p.bio) && p.directory_listed !== false).toBe(isPractitionerIndexable(p));
    }
    const clinics = [{ id: "d", slug: "c" }];
    for (const active of [0, 1, 2, 3]) {
      const rows = Array.from({ length: active }, (_, i) => ({ doctor_id: "d", slug: `s${i}`, is_active: true, updated_at: null, bio: bio(80) }));
      const inSitemap = practitionerSitemapEntries(clinics, rows).length > 0;
      expect(inSitemap).toBe(isMultiDoctorClinic(rows));
    }
  });
});
