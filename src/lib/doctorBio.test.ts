import { describe, it, expect } from "vitest";
import {
  BIO_MAX, SPECIALTY_TOPICS, analyzeBio, buildBioFromDetails, displayDoctorName, sanitizeBio, topicsFor,
} from "./doctorBio";

const FULL = {
  name: "Dr. Meera Shah", specialization: "Dermatologist", qualifications: "MBBS, MD (Dermatology)", experienceYears: 12,
  clinicName: "Shah Skin Clinic", locality: "Talwandi", city: "Kota",
  services: ["Acne treatment", "Hair fall consultation", "Skin allergy test"],
};
const wc = (s: string) => s.split(/\s+/).filter(Boolean).length;

describe("buildBioFromDetails", () => {
  it("builds a 90-170 word third-person bio with the search keywords", () => {
    const bio = buildBioFromDetails({ ...FULL, conditions: ["acne", "eczema", "hair fall"] });
    expect(wc(bio)).toBeGreaterThanOrEqual(90 - 25); // sparse data still reads well
    expect(wc(bio)).toBeLessThanOrEqual(170);
    expect(bio).toContain("Dr. Meera Shah is a Dermatologist in Talwandi, Kota with 12+ years of experience (MBBS, MD (Dermatology)).");
    expect(bio).toContain("Shah Skin Clinic");
    expect(bio).toContain("Acne treatment, Hair fall consultation and Skin allergy test");
    expect(bio).toContain("acne, eczema and hair fall");
    expect(bio).toMatch(/book an appointment online/);
    expect(bio).toContain("Dermatologist in Kota");
    expect(bio).not.toMatch(/\b(he|she|his|her|him)\b/i);
  });

  it("never prints undefined/null, empty brackets or double spaces", () => {
    for (const input of [{}, { name: "x" }, { specialization: "ENT Specialist" }, { name: "Dr. A", specialization: "Dentist", qualifications: "  ", city: undefined, services: [null, "", undefined] }]) {
      const bio = buildBioFromDetails(input as never);
      expect(bio).not.toMatch(/undefined|null|\(\s*\)|\s{2}|,\s*,|\bin \./);
    }
  });

  it("returns an empty string when there is nothing to talk about", () => {
    expect(buildBioFromDetails({})).toBe("");
    expect(buildBioFromDetails({ clinicName: "Only a clinic", city: "Kota" })).toBe("");
  });

  it("handles a name with and without Dr.", () => {
    expect(buildBioFromDetails({ name: "Dr Asha Rao", specialization: "Dentist" })).toMatch(/^Dr\. Asha Rao is a Dentist/);
    expect(buildBioFromDetails({ name: "dr. Asha Rao", specialization: "Dentist" })).toMatch(/^Dr\. Asha Rao is a Dentist/);
    expect(buildBioFromDetails({ name: "Asha Rao", specialization: "Dentist" })).toMatch(/^Dr\. Asha Rao is a Dentist/);
    expect(displayDoctorName("Drake Miller")).toBe("Dr. Drake Miller");
    expect(displayDoctorName("")).toBe("");
  });

  it("omits place, experience, qualifications and clinic sentences when missing", () => {
    const bio = buildBioFromDetails({ name: "Asha Rao", specialization: "Orthopedic" });
    expect(bio).toMatch(/^Dr\. Asha Rao is an Orthopedic\./);
    expect(bio).not.toMatch(/years|\(|Patients can consult|Services offered/);
    expect(bio).toMatch(/Looking for an Orthopedic\? You can book an appointment online/);
  });

  it("missing city keeps the locality, and missing both drops 'in'", () => {
    expect(buildBioFromDetails({ name: "A", specialization: "Dentist", locality: "Talwandi" })).toContain("a Dentist in Talwandi.");
    expect(buildBioFromDetails({ name: "A", specialization: "Dentist", city: "Kota" })).toContain("a Dentist in Kota.");
    expect(buildBioFromDetails({ name: "A", specialization: "Dentist" })).toMatch(/is a Dentist\./);
  });

  it("uses at most 6 services, de-duplicated, and none when absent", () => {
    const services = ["a", "b", "c", "d", "e", "f", "g", "A"];
    const bio = buildBioFromDetails({ name: "A", specialization: "Dentist", services });
    expect(bio).toContain("a, b, c, d, e and f.");
    expect(bio).not.toContain(" g");
    expect(buildBioFromDetails({ name: "A", specialization: "Dentist", services: [] })).not.toContain("Services offered");
  });

  it("copes with very long clinic names and bounds every field", () => {
    const bio = buildBioFromDetails({ ...FULL, clinicName: "C".repeat(500), qualifications: "Q".repeat(900) });
    expect(bio.length).toBeLessThan(BIO_MAX);
    expect(bio).toContain("C".repeat(120));
    expect(bio).not.toContain("C".repeat(121));
  });

  it("strips HTML and control characters from inputs (plain text out)", () => {
    const bio = buildBioFromDetails({ name: "<script>alert(1)</script>Dr. Evil", specialization: "Dentist<b>", clinicName: "A\u0000B\nC", city: "Ko<i>ta</i>" });
    expect(bio).not.toMatch(/[<>]/);
    expect(bio.includes(String.fromCharCode(0))).toBe(false);
    expect(bio).toContain("A B C");
  });

  it("ignores a non-numeric or zero experience", () => {
    expect(buildBioFromDetails({ name: "A", specialization: "Dentist", experienceYears: "abc" })).not.toMatch(/years of experience/);
    expect(buildBioFromDetails({ name: "A", specialization: "Dentist", experienceYears: 0 })).not.toMatch(/years of experience/);
    expect(buildBioFromDetails({ name: "A", specialization: "Dentist", experienceYears: "7" })).toContain("with 7+ years of experience");
  });
});

describe("SPECIALTY_TOPICS", () => {
  const LIST = [
    "General Physician", "Cardiologist", "Dermatologist", "Orthopedic", "Pediatrician",
    "Gynecologist", "ENT Specialist", "Neurologist", "Psychiatrist", "Ophthalmologist",
    "Dentist", "Urologist", "Pulmonologist", "Gastroenterologist", "Oncologist",
    "Endocrinologist", "Nephrologist", "Rheumatologist", "Surgeon",
  ];
  it("covers every specialization in the Doctors form with 3-8 plain topics (Other has none)", () => {
    expect(Object.keys(SPECIALTY_TOPICS).length).toBeGreaterThanOrEqual(25);
    for (const s of LIST) {
      const t = SPECIALTY_TOPICS[s];
      expect(t, s).toBeDefined();
      expect(t.length, s).toBeGreaterThanOrEqual(3);
      expect(t.length, s).toBeLessThanOrEqual(8);
    }
    expect(SPECIALTY_TOPICS.Other).toEqual([]);
  });
  it("contains no promotional or cure wording", () => {
    for (const topics of Object.values(SPECIALTY_TOPICS)) {
      expect(analyzeBio(topics.join(". ")).warnings).toEqual([]);
    }
  });
  it("topicsFor is case-insensitive and tolerates variants", () => {
    expect(topicsFor("dermatologist")).toBe(SPECIALTY_TOPICS.Dermatologist);
    expect(topicsFor("Orthopaedic Surgeon")).toBe(SPECIALTY_TOPICS.Orthopedic);
    expect(topicsFor("")).toEqual([]);
    expect(topicsFor("Astrologer")).toEqual([]);
  });
});

describe("analyzeBio", () => {
  const ctx = { specialization: "Dermatologist", city: "Kota", qualifications: "MBBS, MD", experienceYears: 12 };
  it("an empty bio is empty and not indexable", () => {
    const a = analyzeBio("", ctx);
    expect(a).toMatchObject({ length: 0, indexable: false, level: "empty" });
    expect(a.lengthHint).toMatch(/400-900/);
  });
  it("59 vs 60 characters flips indexable", () => {
    expect(analyzeBio("a".repeat(59)).indexable).toBe(false);
    expect(analyzeBio("a".repeat(59)).level).toBe("short");
    expect(analyzeBio("a".repeat(60)).indexable).toBe(true);
    expect(analyzeBio(`a${" ".repeat(30)}${"b".repeat(30)}`).length).toBe(32); // whitespace collapsed
  });
  it("checks each keyword with words, and reaches 'good' on a full bio", () => {
    const bio = buildBioFromDetails({ ...FULL, conditions: ["acne", "eczema"] });
    const a = analyzeBio(bio.padEnd(450, " "), { ...ctx, locality: "Talwandi" });
    expect(a.checks.every((c) => c.ok)).toBe(true);
    expect(a.checks.map((c) => c.key)).toEqual(["specialty", "place", "qualifications", "experience", "booking", "length"]);
    expect(a.level).toBe("good");
    expect(a.warnings).toEqual([]);
  });
  it("marks the missing keywords", () => {
    const a = analyzeBio("I love helping people feel better every single day of the week.", ctx);
    const by = Object.fromEntries(a.checks.map((c) => [c.key, c.ok]));
    expect(by).toMatchObject({ specialty: false, place: false, qualifications: false, experience: false, booking: false, length: true });
    expect(a.level).toBe("fair");
  });
  it("only checks what the details contain", () => {
    expect(analyzeBio("hello", {}).checks.map((c) => c.key)).toEqual(["booking", "length"]);
  });
  it("flags risky claims but never blocks", () => {
    const text = "The best, top, No.1 doctor. 100% guaranteed permanent cure, a miracle. Award-winning care.";
    const terms = analyzeBio(text).warnings.map((w) => w.term);
    expect(terms).toEqual(expect.arrayContaining(["best", "top", "no.1", "guarantee", "100%", "cure", "miracle", "award-winning"]));
    expect(analyzeBio("Number one in the city").warnings.map((w) => w.term)).toContain("no.1");
  });
  it("does not flag words that merely contain the term", () => {
    expect(analyzeBio("Topical treatment, bestow, secure, procure and accurate care.").warnings).toEqual([]);
  });
});

describe("sanitizeBio", () => {
  it("trims, collapses blank lines and strips control characters", () => {
    expect(sanitizeBio("  a\u0000b\n\n\n\n\nc \r\nd  ")).toBe("ab\n\nc\nd");
  });
  it("strips HTML tags and markdown markers", () => {
    expect(sanitizeBio("<b>Hi</b> **there** __you__ `code`\n# Title\n[link](http://x.y)<script>x</script>")).toBe("Hi there you code\nTitle\nlinkx");
  });
  it("keeps ordinary less-than and quotes", () => {
    expect(sanitizeBio("Waiting time < 10 minutes, \"friendly\" care")).toBe("Waiting time < 10 minutes, \"friendly\" care");
  });
  it("hard limit 2000", () => {
    expect(sanitizeBio("x".repeat(5000)).length).toBe(BIO_MAX);
  });
});
