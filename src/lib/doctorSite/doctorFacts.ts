// Trust facts for the doctor site, built ONLY from data the doctor actually
// entered (spec decision D2). Nothing here invents a number: a fact without
// data is simply left out, and the UI is designed to look intentional when sparse.

import { doctorDisplayName } from "../seo/doctorSeo";

// Indian/international medical degree abbreviations, in their conventional casing.
const DEGREES = [
  "MBBS", "MD", "MS", "BDS", "MDS", "DNB", "DM", "MCh", "BAMS", "BHMS", "BUMS", "BPT", "MPT", "DGO", "DCH",
  "DPM", "DA", "DLO", "DVD", "DOMS", "DDVL", "FRCS", "MRCP", "MRCOG", "FRCP", "FACS", "FCPS", "PhD", "BSc", "MSc",
];
const DEGREE_BY_LOWER = new Map(DEGREES.map((d) => [d.toLowerCase(), d]));
const SMALL_WORDS = new Set(["and", "of", "in", "the", "for", "with", "from", "at", "on"]);

/**
 * "mbbs, md (paediatrics)" -> "MBBS, MD (Paediatrics)". Only recognised degree
 * tokens are re-cased; anything else keeps the doctor's own casing, except an
 * all-lowercase word, which is title-cased.
 */
export function formatQualifications(raw: string | null | undefined): string {
  const text = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  return text.replace(/[A-Za-z][A-Za-z.]*/g, (word) => {
    const bare = word.replace(/\./g, "");
    const degree = DEGREE_BY_LOWER.get(bare.toLowerCase());
    if (degree) return degree;
    if (SMALL_WORDS.has(word) || word !== word.toLowerCase()) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

export type ReviewLike = { rating: number | null };

/** The profile fields these helpers read (a subset of the public profile row). */
export type DoctorProfileLike = {
  full_name?: string | null;
  display_name?: string | null;
  experience_years?: number | null;
  qualifications?: string | null;
  registration_number?: string | null;
  clinic_phone?: string | null;
  phone?: string | null;
  city?: string | null;
} | null | undefined;

export type DoctorSettingsLike = { whatsapp_number?: string | null; whatsapp_message?: string | null } | null | undefined;

export function ratingSummary(reviews: ReviewLike[] | null | undefined) {
  const rated = (reviews ?? []).filter((r) => typeof r.rating === "number" && r.rating > 0);
  if (rated.length === 0) return null;
  const average = rated.reduce((sum, r) => sum + (r.rating as number), 0) / rated.length;
  const distribution = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: rated.filter((r) => Math.round(r.rating as number) === stars).length }));
  return { average: Math.round(average * 10) / 10, count: rated.length, distribution };
}

export type TrustFact = { id: "experience" | "rating" | "qualifications" | "registration"; value: string; label: string };

export function trustFacts(profile: DoctorProfileLike, reviews: ReviewLike[] | null | undefined): TrustFact[] {
  const facts: TrustFact[] = [];
  const years = Number(profile?.experience_years);
  if (Number.isFinite(years) && years > 0) {
    facts.push({ id: "experience", value: `${years} yrs`, label: "Experience" });
  }
  const rating = ratingSummary(reviews);
  if (rating) {
    facts.push({ id: "rating", value: rating.average.toFixed(1), label: `${rating.count} review${rating.count === 1 ? "" : "s"}` });
  }
  const qualifications = formatQualifications(profile?.qualifications);
  if (qualifications) facts.push({ id: "qualifications", value: qualifications, label: "Qualifications" });
  const registration = (profile?.registration_number ?? "").trim();
  if (registration) facts.push({ id: "registration", value: registration, label: "Reg. no." });
  return facts;
}

/** Display name ("Dr. Pooja Sharma"), or "" if the profile has none. Never a placeholder doctor. */
export const doctorName = (profile: DoctorProfileLike) => doctorDisplayName(profile);

export const clinicPhone = (profile: DoctorProfileLike): string => (profile?.clinic_phone || profile?.phone || "").trim();

/** `tel:` href that dials correctly from any phone (adds +91 to bare 10-digit Indian numbers). */
export const telHref = (phone: string) => {
  const digits = phone.replace(/[^\d+]/g, "");
  if (/^\d{10}$/.test(digits)) return `tel:+91${digits}`;
  return `tel:${digits}`;
};

export const whatsappHref = (settings: DoctorSettingsLike): string => {
  const number = String(settings?.whatsapp_number ?? "").replace(/[^0-9]/g, "");
  if (!number) return "";
  const full = number.length === 10 ? `91${number}` : number;
  const text = (settings?.whatsapp_message ?? "").trim();
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
};

/** "Kothrud, Pune" style locality for eyebrows; falls back to city alone. */
export const locality = (profile: DoctorProfileLike): string => (profile?.city ?? "").trim();

// Values the platform itself pre-fills (DB column default on `hero_stat_text`,
// `DEFAULT_QUICK_STATS` saved by the admin editor). They were never typed by the
// doctor, so they are treated as "not provided" rather than shown as claims.
export const PLATFORM_DEFAULT_CLAIMS = new Set(["5,000+ patient consultations", "5,000+", "24/7"]);
const isPlatformDefault = (value: string) => PLATFORM_DEFAULT_CLAIMS.has(value.trim().toLowerCase());

export type CustomClaim = { value: string; label: string };
type QuickStatLike = { id?: string; label?: string; value?: string; active?: boolean };

export type ClaimSettingsLike = {
  hero_stat_text?: string | null;
  show_hero_stat_badge?: boolean | null;
  show_quick_stats?: boolean | null;
  quick_stats?: unknown;
  seo_keywords?: string | null;
} | null | undefined;

const readQuickStats = (settings: ClaimSettingsLike): QuickStatLike[] => {
  if (Array.isArray(settings?.quick_stats)) return settings.quick_stats as QuickStatLike[];
  // Older profiles keep the stats as JSON in `seo_keywords` (it may also hold plain keywords).
  try {
    const parsed = JSON.parse(settings?.seo_keywords ?? "");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * Claims the doctor wrote themselves (a custom hero stat, custom quick stats),
 * minus platform defaults and anything already covered by `trustFacts`
 * (experience comes from `experience_years`).
 */
export function customClaims(settings: ClaimSettingsLike): CustomClaim[] {
  const claims: CustomClaim[] = [];
  const heroStat = (settings?.hero_stat_text ?? "").trim();
  if (heroStat && settings?.show_hero_stat_badge !== false && !isPlatformDefault(heroStat)) {
    claims.push({ value: heroStat, label: "" });
  }
  if (settings?.show_quick_stats !== false) {
    for (const stat of readQuickStats(settings)) {
      const value = (stat.value ?? "").trim();
      if (stat.active === false || !value || stat.id === "experience" || isPlatformDefault(value)) continue;
      claims.push({ value, label: (stat.label ?? "").trim() });
    }
  }
  const seen = new Set<string>();
  return claims.filter((c) => !seen.has(c.value.toLowerCase()) && seen.add(c.value.toLowerCase()));
}

// Hero copy the platform pre-fills for every doctor (website_settings column
// defaults). Generic filler is replaced by facts built from the doctor's own data.
const DEFAULT_HEADLINES = new Set(["trusted care for|you & your family"]);
const DEFAULT_DESCRIPTIONS = new Set(["compassionate, personalized and professional healthcare for a better tomorrow."]);

export const isDefaultHeadline = (line1?: string | null, line2?: string | null) =>
  DEFAULT_HEADLINES.has(`${(line1 ?? "").trim().toLowerCase()}|${(line2 ?? "").trim().toLowerCase()}`);

export const isDefaultDescription = (text?: string | null) => DEFAULT_DESCRIPTIONS.has((text ?? "").trim().toLowerCase());
