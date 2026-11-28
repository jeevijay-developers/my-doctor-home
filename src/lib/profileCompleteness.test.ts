import { describe, it, expect, beforeEach } from "vitest";
import {
  MIN_INDEXABLE_BIO_CHARS, bioLength, clinicCompleteness, completenessChipLabel, dismissProfileNudge,
  doctorsNeedingProfileWork, isProfileNudgeDismissed, notIndexableNote, practitionerCompleteness,
  practitionerPublicPath,
} from "./profileCompleteness";
import { MIN_INDEXABLE_BIO_CHARS as SEO_MIN } from "./seo/clinicTeam";

const full = {
  display_name: "Dr. A", photo_url: "x.jpg", bio: "b".repeat(80), specialization: "ENT", qualifications: "MS",
  experience_years: 5, consultation_fee: 500, registration_number: "R1", directory_listed: true,
};

describe("profileCompleteness", () => {
  it("keeps the bio threshold in step with the SEO module", () => {
    expect(MIN_INDEXABLE_BIO_CHARS).toBe(SEO_MIN);
  });

  it("a full profile is 100% and indexable", () => {
    const c = practitionerCompleteness(full);
    expect(c.percent).toBe(100);
    expect(c.missing).toEqual([]);
    expect(c.indexable).toBe(true);
    expect(completenessChipLabel(c)).toBe("Profile 100%");
    expect(notIndexableNote(c)).toBeNull();
  });

  it("an empty profile lists everything and asks for a bio", () => {
    const c = practitionerCompleteness({});
    expect(c.percent).toBe(0);
    expect(c.missing).toHaveLength(7);
    expect(c.indexable).toBe(false);
    expect(completenessChipLabel(c)).toBe("Add a bio to appear in Google");
    expect(notIndexableNote(c)).toMatch(/at least 60/);
  });

  it("bio of 59 characters is not indexable, 60 is", () => {
    expect(practitionerCompleteness({ ...full, bio: "a".repeat(59) }).indexable).toBe(false);
    expect(practitionerCompleteness({ ...full, bio: "a".repeat(60) }).indexable).toBe(true);
    const short = practitionerCompleteness({ ...full, bio: "a".repeat(59) });
    expect(short.missing.find((m) => m.key === "bio")?.label).toContain("59 of 60");
  });

  it("counts whitespace-padded bios by their collapsed length", () => {
    expect(bioLength("  a   b \n c ")).toBe(5);
    expect(practitionerCompleteness({ ...full, bio: " ".repeat(100) }).hasIndexableBio).toBe(false);
  });

  it("a good bio but opted out of the directory is not indexable, with its own reason", () => {
    const c = practitionerCompleteness({ ...full, directory_listed: false });
    expect(c.indexable).toBe(false);
    expect(c.notIndexableReason).toBe("not_listed");
    expect(notIndexableNote(c)).toMatch(/not listed/);
    expect(completenessChipLabel(c)).toBe("Profile 100%");
  });

  it("null directory_listed counts as listed", () => {
    expect(practitionerCompleteness({ ...full, directory_listed: null }).indexable).toBe(true);
  });

  it("builds the doctor page path only for active doctors of a 2+ doctor clinic with both slugs", () => {
    const base = { clinicSlug: "sunrise", doctorSlug: "asha", isActive: true, activeDoctors: 2 };
    expect(practitionerPublicPath(base)).toBe("/dr/sunrise/doctor/asha");
    expect(practitionerPublicPath({ ...base, activeDoctors: 1 })).toBeNull();
    expect(practitionerPublicPath({ ...base, isActive: false })).toBeNull();
    expect(practitionerPublicPath({ ...base, doctorSlug: "" })).toBeNull();
    expect(practitionerPublicPath({ ...base, clinicSlug: null })).toBeNull();
    expect(practitionerPublicPath({ ...base, doctorSlug: "a b/c" })).toBe("/dr/sunrise/doctor/a%20b%2Fc");
  });

  it("scores the clinic", () => {
    expect(clinicCompleteness({}).percent).toBe(0);
    const c = clinicCompleteness({ clinicName: "C", address: "A", phone: "1", heroPhotoUrl: "h", aboutText: "t", hasWorkingHours: true });
    expect(c.percent).toBe(100);
  });

  it("picks the doctors that need work, never in a single-doctor clinic or for inactive doctors", () => {
    const a = { ...full, id: "a" };
    const b = { id: "b", display_name: "B", is_active: true };
    const c = { id: "c", display_name: "C", is_active: false };
    expect(doctorsNeedingProfileWork([a, b, c]).map((p) => p.id)).toEqual(["b"]);
    expect(doctorsNeedingProfileWork([b])).toEqual([]);
    expect(doctorsNeedingProfileWork([a, { ...a, id: "a2" }])).toEqual([]);
  });

  it("handles 9+ doctors and long names", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `d${i}`, display_name: "N".repeat(200), is_active: true }));
    expect(doctorsNeedingProfileWork(many)).toHaveLength(12);
  });

  describe("nudge dismissal", () => {
    beforeEach(() => window.localStorage.clear());
    it("is remembered per clinic", () => {
      expect(isProfileNudgeDismissed("c1")).toBe(false);
      dismissProfileNudge("c1");
      expect(isProfileNudgeDismissed("c1")).toBe(true);
      expect(isProfileNudgeDismissed("c2")).toBe(false);
    });
  });
});
