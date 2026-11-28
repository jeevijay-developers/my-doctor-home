// Presentation helpers for a clinic that lists two or more active doctors ("team clinic").
// Pure functions: the components pass in what DoctorContext already loaded.

import type { PublicPractitioner } from "../practitioners/types";
import { doctorDisplayName } from "../seo/doctorSeo";
import { ratingSummary } from "./doctorFacts";

type ProfileLike = { clinic_name?: string | null; full_name?: string | null; display_name?: string | null } | null | undefined;

/**
 * The name a team clinic goes by. Falls back to the owner's name ("Dr. Asha Rao's clinic"; the
 * prefix is added once, never doubled) and never to a bare placeholder.
 */
export function clinicDisplayName(profile: ProfileLike): string {
  const clinic = (profile?.clinic_name ?? "").trim();
  if (clinic) return clinic;
  const owner = doctorDisplayName(profile);
  return owner ? `${owner}'s clinic` : "Our clinic";
}

/** First letters of the first two words of a person's name, ignoring a leading "Dr.". */
export function initialsOf(name: string): string {
  return (name ?? "")
    .replace(/^dr\.?\s*/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0])
    .join("")
    .toUpperCase();
}

/** Distinct specialties (case-insensitive), most common first, then in doctor order. */
export function distinctSpecialties(doctors: PublicPractitioner[]): string[] {
  const seen = new Map<string, { label: string; count: number; first: number }>();
  doctors.forEach((d, i) => {
    const label = (d.specialization ?? "").trim().replace(/\s+/g, " ");
    if (!label) return;
    const key = label.toLowerCase();
    const hit = seen.get(key);
    if (hit) hit.count += 1;
    else seen.set(key, { label, count: 1, first: i });
  });
  return [...seen.values()].sort((a, b) => b.count - a.count || a.first - b.first).map((s) => s.label);
}

/** "Cardiology, Dermatology, ENT and more" (at most `max` names). Empty when nobody has a specialty. */
export function specialtiesLine(doctors: PublicPractitioner[], max = 3): string {
  const all = distinctSpecialties(doctors);
  if (all.length === 0) return "";
  if (all.length <= max) return all.join(", ");
  return `${all.slice(0, max).join(", ")} and more`;
}

/** The longest experience among the doctors, in years (0 when nobody entered one). */
export function longestExperience(doctors: PublicPractitioner[]): number {
  return doctors.reduce((best, d) => {
    const years = Number(d.experience_years);
    return Number.isFinite(years) && years > best ? Math.floor(years) : best;
  }, 0);
}

/** Up to `max` doctors for the hero collage: those with a photo first, keeping their order. */
export function collageDoctors(doctors: PublicPractitioner[], max = 4): PublicPractitioner[] {
  const withPhoto = doctors.filter((d) => (d.photo_url ?? "").trim());
  const without = doctors.filter((d) => !(d.photo_url ?? "").trim());
  return [...withPhoto, ...without].slice(0, max);
}

/** Path of one doctor's own page. */
export const doctorProfilePath = (clinicSlug: string, doctorSlug: string) =>
  `/dr/${encodeURIComponent(clinicSlug)}/doctor/${encodeURIComponent(doctorSlug)}`;

/** Tailwind grid for the doctor cards: more columns only when there are enough cards to fill them. */
export function doctorGridClass(count: number): string {
  if (count <= 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-1 md:grid-cols-2";
  if (count === 3) return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
  return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
}

export const DOCTOR_FILTER_FROM = 4;
export const DOCTOR_SEARCH_FROM = 9;

type ReviewLike = { rating: number | null; practitioner_id?: string | null };

/** Tab ids for the reviews: "all", "clinic" (no doctor) or a practitioner id. */
export type ReviewTab = string;

/** Reviews belonging to a tab. A review without a doctor is the clinic's; every review is in exactly one doctor-or-clinic tab. */
export function reviewsForTab<T extends ReviewLike>(reviews: T[], tab: ReviewTab, knownDoctorIds: Set<string>): T[] {
  if (tab === "all") return reviews;
  if (tab === "clinic") return reviews.filter((r) => !r.practitioner_id || !knownDoctorIds.has(r.practitioner_id));
  return reviews.filter((r) => r.practitioner_id === tab);
}

/** Aggregate for the active tab only (so "All" is never the sum of tab aggregates). */
export const tabRatingSummary = (reviews: ReviewLike[]) => ratingSummary(reviews);
