import { describe, expect, it } from "vitest";
import {
  clinicDisplayName, collageDoctors, distinctSpecialties, doctorGridClass, doctorProfilePath, initialsOf,
  longestExperience, reviewsForTab, specialtiesLine,
} from "./teamClinic";

const d = (id: string, over: Record<string, unknown> = {}) =>
  ({ id, display_name: id, slug: id, specialization: null, experience_years: null, photo_url: null, ...over }) as never;

describe("clinicDisplayName", () => {
  it("uses the clinic name", () => expect(clinicDisplayName({ clinic_name: "  Little Steps  " })).toBe("Little Steps"));
  it("falls back to the owner once, without doubling Dr.", () => {
    expect(clinicDisplayName({ full_name: "Dr. Asha Rao" })).toBe("Dr. Asha Rao's clinic");
    expect(clinicDisplayName({ full_name: "asha rao" })).toMatch(/^Dr. [Aa]sha [Rr]ao.s clinic$/);
  });
  it("never returns an empty string", () => expect(clinicDisplayName(null)).toBe("Our clinic"));
});

describe("initialsOf", () => {
  it("ignores Dr. and takes two letters", () => expect(initialsOf("Dr. asha rao kumar")).toBe("AR"));
  it("is empty for nothing", () => expect(initialsOf("")).toBe(""));
});

describe("specialties", () => {
  const list = [d("a", { specialization: "Cardiology" }), d("b", { specialization: "cardiology " }), d("c", { specialization: "ENT" }), d("e", { specialization: "Skin" }), d("f", { specialization: "Dental" })];
  it("dedupes case-insensitively, most common first", () => expect(distinctSpecialties(list)[0]).toBe("Cardiology"));
  it("caps the line at three and adds 'and more'", () => expect(specialtiesLine(list)).toBe("Cardiology, ENT, Skin and more"));
  it("lists all when 3 or fewer", () => expect(specialtiesLine(list.slice(0, 3))).toBe("Cardiology, ENT"));
  it("is empty without specialties", () => expect(specialtiesLine([d("a")])).toBe(""));
});

describe("longestExperience", () => {
  it("takes the maximum", () => expect(longestExperience([d("a", { experience_years: 4 }), d("b", { experience_years: 21 })])).toBe(21));
  it("is 0 when none entered", () => expect(longestExperience([d("a")])).toBe(0));
});

describe("collageDoctors", () => {
  it("puts photographed doctors first and caps at four", () => {
    const list = [d("a"), d("b", { photo_url: "x" }), d("c"), d("e", { photo_url: "y" }), d("f"), d("g")];
    expect(collageDoctors(list).map((x) => x.id)).toEqual(["b", "e", "a", "c"]);
  });
});

describe("paths and grid", () => {
  it("builds the doctor page path", () => expect(doctorProfilePath("asha", "dr-ravi")).toBe("/dr/asha/doctor/dr-ravi"));
  it("scales columns with the count", () => {
    expect(doctorGridClass(2)).not.toContain("lg:grid-cols-3");
    expect(doctorGridClass(3)).toContain("lg:grid-cols-3");
    expect(doctorGridClass(9)).toContain("xl:grid-cols-4");
  });
});

describe("reviewsForTab", () => {
  const known = new Set(["pa", "pb"]);
  const rs = [{ rating: 5, practitioner_id: "pa" }, { rating: 4, practitioner_id: null }, { rating: 3, practitioner_id: "gone" }, { rating: 5, practitioner_id: "pb" }];
  it("all is everything", () => expect(reviewsForTab(rs, "all", known)).toHaveLength(4));
  it("a doctor tab is only theirs", () => expect(reviewsForTab(rs, "pa", known)).toHaveLength(1));
  it("clinic is no-doctor plus reviews of doctors no longer listed", () => expect(reviewsForTab(rs, "clinic", known)).toHaveLength(2));
  it("tabs partition the list (no double count)", () => {
    const sum = ["pa", "pb", "clinic"].reduce((n, t) => n + reviewsForTab(rs, t, known).length, 0);
    expect(sum).toBe(rs.length);
  });
});
