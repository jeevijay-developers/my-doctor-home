import { describe, expect, it } from "vitest";
import { practitionerSubject } from "./practitionerSubject";
import type { PublicPractitioner } from "../practitioners/types";

const doctor = (over: Partial<PublicPractitioner> = {}): PublicPractitioner => ({
  id: "pb", display_name: "Vikram Shah", slug: "vikram-shah", specialization: "Cardiologist", qualifications: "MD",
  experience_years: 12, bio: "Heart specialist.", photo_url: "https://cdn.example/vs.jpg", registration_number: "REG-9",
  consultation_fee: null, slot_duration_minutes: null, online_booking: true, bookable: true, is_primary: false,
  is_owner: false, sort_order: 1, directory_listed: true, review_count: 0, avg_rating: null, ...over,
});

const clinic = { id: "c1", full_name: "Asha Rao", clinic_name: "City Clinic", city: "Kota", consultation_fee: 750, profile_photo_url: "https://cdn.example/owner.jpg", bio: "Owner bio" };
const clinicSettings = {
  hero_photo_url: "https://cdn.example/clinic.jpg", about_photo_url: "https://cdn.example/about.jpg", hero_headline_line1: "Care for all",
  hero_headline_line2: "families", hero_description: "We are a clinic.", hero_stat_text: "20,000 patients", quick_stats: [{ value: "99%", label: "Happy" }],
  slot_duration_minutes: 20,
};

describe("practitionerSubject", () => {
  it("speaks for the doctor, not the clinic owner", () => {
    const s = practitionerSubject({ doctor: doctor(), profile: clinic, settings: clinicSettings, workingHours: [] });
    expect(s.doctorId).toBe("pb");
    expect(s.profile).toMatchObject({
      display_name: "Vikram Shah", specialization: "Cardiologist", qualifications: "MD", experience_years: 12,
      bio: "Heart specialist.", registration_number: "REG-9", profile_photo_url: "https://cdn.example/vs.jpg",
    });
    // Clinic facts stay: the page still says where the clinic is and how to call it.
    expect(s.profile).toMatchObject({ clinic_name: "City Clinic", city: "Kota", id: "c1" });
  });

  it("drops the clinic's own hero copy, stats and photos", () => {
    const s = practitionerSubject({ doctor: doctor(), profile: clinic, settings: clinicSettings, workingHours: [] });
    expect(s.settings).toMatchObject({
      hero_photo_url: "https://cdn.example/vs.jpg", about_photo_url: "https://cdn.example/vs.jpg", hero_headline_line1: "",
      hero_headline_line2: "", hero_description: "", hero_stat_text: "", quick_stats: [], slot_duration_minutes: 20,
    });
  });

  it("shows no photo at all, rather than the owner's, when the doctor has none", () => {
    const s = practitionerSubject({ doctor: doctor({ photo_url: null }), profile: clinic, settings: clinicSettings, workingHours: [] });
    expect(s.profile.profile_photo_url).toBe("");
    expect(s.settings.hero_photo_url).toBe("");
    expect(s.settings.about_photo_url).toBe("");
  });

  it("uses the doctor's own fee, else the clinic's", () => {
    expect(practitionerSubject({ doctor: doctor({ consultation_fee: 1200 }), profile: clinic, settings: {}, workingHours: [] }).profile.consultation_fee).toBe(1200);
    expect(practitionerSubject({ doctor: doctor(), profile: clinic, settings: {}, workingHours: [] }).profile.consultation_fee).toBe(750);
  });

  it("builds the hero facts with this doctor's own rating, after experience", () => {
    const s = practitionerSubject({ doctor: doctor({ review_count: 2, avg_rating: 4.5 }), profile: clinic, settings: {}, workingHours: [] });
    expect(s.facts.map((f) => f.id)).toEqual(["experience", "rating", "qualifications", "registration"]);
    expect(s.facts.find((f) => f.id === "rating")).toEqual({ id: "rating", value: "4.5", label: "2 reviews" });
  });

  it("has no rating fact for a doctor without reviews", () => {
    const s = practitionerSubject({ doctor: doctor(), profile: clinic, settings: {}, workingHours: [] });
    expect(s.facts.some((f) => f.id === "rating")).toBe(false);
  });

  it("carries the doctor's own hours and video-consultation flag", () => {
    const hours = [{ day_of_week: 1 }];
    const s = practitionerSubject({ doctor: doctor({ online_booking: false }), profile: clinic, settings: {}, workingHours: hours });
    expect(s.workingHours).toBe(hours);
    expect(s.onlineBooking).toBe(false);
  });
});
