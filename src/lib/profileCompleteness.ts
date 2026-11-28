import { practitionerPagePath } from "./seo/blogSeo";

// How complete a doctor's (or the clinic's) public profile is, and whether the doctor's own page is
// allowed into Google. Pure, so the Doctors page, Settings, the doctor's self-edit card and the
// dashboard nudge all say the same thing.

/**
 * Mirrors MIN_INDEXABLE_BIO_CHARS in src/lib/seo/clinicTeam.ts (and the edge/sitemap copies) BY VALUE.
 * Below this many characters (whitespace collapsed) a doctor page is served noindex and left out of
 * the sitemap. Kept here rather than imported so the admin bundle does not depend on the edge module;
 * a test pins the two numbers together.
 */
export const MIN_INDEXABLE_BIO_CHARS = 60;

export const bioLength = (bio?: string | null): number => (bio ?? "").replace(/\s+/g, " ").trim().length;

export interface PractitionerProfileLike {
  display_name?: string | null;
  photo_url?: string | null;
  bio?: string | null;
  specialization?: string | null;
  qualifications?: string | null;
  experience_years?: number | null;
  consultation_fee?: number | null;
  registration_number?: string | null;
  directory_listed?: boolean | null;
}

export type CompletenessKey =
  | "photo" | "bio" | "specialization" | "qualifications" | "experience" | "fee" | "registration";

export interface MissingItem {
  key: CompletenessKey;
  /** Friendly text for a checklist ("Add a photo"). */
  label: string;
}

export interface ProfileCompleteness {
  percent: number;
  done: number;
  total: number;
  missing: MissingItem[];
  /** The bio alone is enough for the page to be indexed (and the doctor listed). */
  hasIndexableBio: boolean;
  indexable: boolean;
  /** Why the page is kept out of Google, or null when it is not. */
  notIndexableReason: "not_listed" | "short_bio" | null;
}

const text = (v?: string | null) => (v ?? "").trim().length > 0;

export function practitionerCompleteness(p: PractitionerProfileLike): ProfileCompleteness {
  const len = bioLength(p.bio);
  const hasIndexableBio = len >= MIN_INDEXABLE_BIO_CHARS;
  const checks: [CompletenessKey, boolean, string][] = [
    ["photo", text(p.photo_url), "Add a photo"],
    [
      "bio",
      hasIndexableBio,
      len === 0
        ? `Write a bio (at least ${MIN_INDEXABLE_BIO_CHARS} characters)`
        : `Make your bio longer (${len} of ${MIN_INDEXABLE_BIO_CHARS} characters)`,
    ],
    ["specialization", text(p.specialization), "Add a specialization"],
    ["qualifications", text(p.qualifications), "Add qualifications"],
    ["experience", p.experience_years != null && p.experience_years > 0, "Add years of experience"],
    ["fee", p.consultation_fee != null, "Set a consultation fee"],
    ["registration", text(p.registration_number), "Add a registration number"],
  ];
  const done = checks.filter(([, ok]) => ok).length;
  const listed = p.directory_listed !== false;
  return {
    percent: Math.round((done / checks.length) * 100),
    done,
    total: checks.length,
    missing: checks.filter(([, ok]) => !ok).map(([key, , label]) => ({ key, label })),
    hasIndexableBio,
    indexable: hasIndexableBio && listed,
    notIndexableReason: !listed ? "not_listed" : !hasIndexableBio ? "short_bio" : null,
  };
}

/** Short chip text for a doctor row. */
export function completenessChipLabel(c: ProfileCompleteness): string {
  return c.hasIndexableBio ? `Profile ${c.percent}%` : "Add a bio to appear in Google";
}

/** One sentence for why a page is not indexable yet, or null. */
export function notIndexableNote(c: ProfileCompleteness): string | null {
  if (c.notIndexableReason === "not_listed") {
    return "Hidden from Google: this doctor is not listed in the directory.";
  }
  if (c.notIndexableReason === "short_bio") {
    return `Google will not list this page until the bio has at least ${MIN_INDEXABLE_BIO_CHARS} characters.`;
  }
  return null;
}

/**
 * The doctor's own public page path, or null when there is none to link to: the clinic is not
 * multi-doctor (a single-doctor clinic has no /doctor/ pages), the doctor is inactive, or a slug is missing.
 */
export function practitionerPublicPath(opts: {
  clinicSlug?: string | null;
  doctorSlug?: string | null;
  isActive?: boolean | null;
  activeDoctors: number;
}): string | null {
  if (opts.activeDoctors < 2 || opts.isActive === false) return null;
  const clinic = (opts.clinicSlug ?? "").trim();
  const doctor = (opts.doctorSlug ?? "").trim();
  if (!clinic || !doctor) return null;
  return practitionerPagePath(clinic, doctor);
}

export interface ClinicProfileLike {
  clinicName?: string | null;
  address?: string | null;
  phone?: string | null;
  heroPhotoUrl?: string | null;
  aboutText?: string | null;
  hasWorkingHours?: boolean;
}

export function clinicCompleteness(c: ClinicProfileLike) {
  const checks: [string, boolean, string][] = [
    ["clinic_name", text(c.clinicName), "Add the clinic name"],
    ["address", text(c.address), "Add the clinic address"],
    ["phone", text(c.phone), "Add a clinic phone number"],
    ["hero_photo", text(c.heroPhotoUrl), "Add a clinic photo"],
    ["about", text(c.aboutText), "Write about your clinic"],
    ["hours", !!c.hasWorkingHours, "Set opening hours"],
  ];
  const done = checks.filter(([, ok]) => ok).length;
  return {
    percent: Math.round((done / checks.length) * 100),
    done,
    total: checks.length,
    missing: checks.filter(([, ok]) => !ok).map(([key, , label]) => ({ key, label })),
  };
}

/** Doctors of a multi-doctor clinic whose page is not indexable yet or whose profile is under 60%. */
export function doctorsNeedingProfileWork<T extends PractitionerProfileLike & { id: string; is_active?: boolean | null }>(
  active: T[],
): T[] {
  if (active.length < 2) return [];
  return active.filter((p) => {
    if (p.is_active === false) return false;
    const c = practitionerCompleteness(p);
    return !c.indexable || c.percent < 60;
  });
}

export const profileNudgeKey = (clinicId: string) => `doctylia:doctor-profiles-nudge-dismissed:${clinicId}`;

export function isProfileNudgeDismissed(clinicId: string): boolean {
  try {
    return window.localStorage.getItem(profileNudgeKey(clinicId)) === "1";
  } catch {
    return false;
  }
}

export function dismissProfileNudge(clinicId: string): void {
  try {
    window.localStorage.setItem(profileNudgeKey(clinicId), "1");
  } catch {
    /* private mode: the card simply shows again */
  }
}
