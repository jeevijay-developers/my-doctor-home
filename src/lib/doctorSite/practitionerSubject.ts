// A team clinic's doctor page reuses the single-doctor site's hero, About and Services. Those read
// "the doctor" from the clinic profile, which in a team clinic is the OWNER, so this builds the same
// shapes from one practitioner instead: their own name, photo, credentials, fee, hours and rating,
// with the clinic-wide hero copy and stats (written for the clinic, not for them) left out.

import type { PublicPractitioner } from "../practitioners/types";
import { practitionerFee } from "../practitioners/fee";
import { trustFacts, type TrustFact } from "./doctorFacts";

export type DoctorSubject = {
  doctorId: string;
  /** The doctor takes video consultations (online services and the online row are hidden otherwise). */
  onlineBooking: boolean;
  profile: Record<string, any>;
  settings: Record<string, any>;
  workingHours: any[];
  /** Experience, this doctor's own rating, qualifications and registration, in the hero's order. */
  facts: TrustFact[];
};

export function practitionerSubject(input: {
  doctor: PublicPractitioner;
  profile: Record<string, any> | null | undefined;
  settings: Record<string, any> | null | undefined;
  workingHours: any[];
}): DoctorSubject {
  const { doctor } = input;
  const photo = doctor.photo_url ?? "";
  const profile = {
    ...input.profile,
    display_name: doctor.display_name,
    full_name: doctor.display_name,
    specialization: doctor.specialization,
    qualifications: doctor.qualifications,
    experience_years: doctor.experience_years,
    bio: doctor.bio,
    registration_number: doctor.registration_number,
    consultation_fee: practitionerFee(doctor, input.profile?.consultation_fee),
    profile_photo_url: photo,
  };
  const settings = {
    ...input.settings,
    hero_photo_url: photo,
    about_photo_url: photo,
    hero_headline_line1: "",
    hero_headline_line2: "",
    hero_description: "",
    hero_stat_text: "",
    quick_stats: [],
    seo_keywords: "",
  };

  const facts = trustFacts(profile, []);
  const avg = Number(doctor.avg_rating);
  if (doctor.review_count > 0 && Number.isFinite(avg) && avg > 0) {
    const rating: TrustFact = { id: "rating", value: avg.toFixed(1), label: `${doctor.review_count} review${doctor.review_count === 1 ? "" : "s"}` };
    const after = facts.findIndex((f) => f.id === "experience");
    facts.splice(after + 1, 0, rating);
  }

  return { doctorId: doctor.id, onlineBooking: doctor.online_booking, profile, settings, workingHours: input.workingHours, facts };
}
