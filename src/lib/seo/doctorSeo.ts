// Pure builders for a doctor's public-page SEO. Used by the Vercel Edge function
// (api/seo.ts, server HTML) and by DoctorPublicPage (client-side updates) so the
// two can never describe the same doctor differently.
import { directorySlug } from "../directory/slug";
import { isGoogleMapsUrl } from "../googleMapsUrl";
import { DIRECTORY_HIDDEN } from "../siteSwitches";
import { activeTeam, distinctSpecialties, isMultiDoctorClinic, listedTeam } from "./clinicTeam";
import { openingHoursSpecification, type HoursRowLike } from "./clinicHours";
import {
  fitTitle, isAutoSeoDescription, isAutoSeoTitle, parseMapsLatLng, titleCandidates, trimDescription, TITLE_SUFFIX,
} from "./seoText";

export const DEFAULT_TITLE = "Doctylia - India's #1 Practice Management & Website Platform for Doctors";
export const DEFAULT_DESCRIPTION =
  "Doctylia gives doctors in India their own branded website, 24/7 online appointment booking, patient medical records, GST billing, AI blog writer, and WhatsApp reminders. Start your 7-day free trial.";

/** website_settings.hero_description column default; identical for every doctor who never edited it. */
const PLACEHOLDER_HERO_DESCRIPTION = "Compassionate, personalized and professional healthcare for a better tomorrow.";

export interface DoctorSeoInput {
  origin: string;
  profile: any;
  settings?: any;
  services?: any[];
  reviews?: any[];
  /** Active doctors of a multi-doctor clinic (get_public_practitioners rows). Fewer than 2 changes nothing. */
  practitioners?: PractitionerSeo[];
  /** Clinic working_hours rows (multi-doctor clinic JSON-LD only). */
  workingHours?: HoursRowLike[];
  /** A clinic photo (first gallery photo) used for og:image when there is no hero photo. */
  clinicImage?: string | null;
}

/** The public columns of get_public_practitioners that SEO uses. */
export interface PractitionerSeo {
  id?: string;
  slug: string;
  display_name: string;
  specialization?: string | null;
  qualifications?: string | null;
  experience_years?: number | null;
  bio?: string | null;
  photo_url?: string | null;
  registration_number?: string | null;
  is_active?: boolean;
  is_primary?: boolean;
  /** Online booking is open for this doctor (get_public_practitioners.bookable). */
  bookable?: boolean | null;
  /** false = the doctor opted out of the directory: their page is served noindex. */
  directory_listed?: boolean | null;
  consultation_fee?: number | string | null;
  /** Visible reviews written for this doctor (get_public_practitioners). */
  review_count?: number | string | null;
  avg_rating?: number | string | null;
}

/** Active doctors with a slug, in the order given. */
export function activePractitioners(list?: PractitionerSeo[] | null): PractitionerSeo[] {
  return activeTeam(list);
}

function practitionerPath(clinicSlug: string, doctorSlug: string): string {
  return `/dr/${clinicSlug}/doctor/${doctorSlug}`;
}

/** "pooja sharma" / "ANITA SHARMA" -> "Pooja Sharma". Mixed-case input is assumed deliberate and left alone. */
export function normalizePersonName(name: string): string {
  const trimmed = (name ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  if (trimmed !== trimmed.toLowerCase() && trimmed !== trimmed.toUpperCase()) return trimmed;
  return trimmed.toLowerCase().replace(/(^|[\s.\-'])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function formatDoctorName(rawName: string): string {
  const trimmed = normalizePersonName(rawName);
  if (!trimmed) return "";
  if (/^dr\.?\s/i.test(trimmed)) return trimmed;
  const glued = trimmed.match(/^dr\.(\S.*)$/i);
  if (glued) return `Dr. ${normalizePersonName(glued[1])}`;
  return /^dr\.?$/i.test(trimmed) ? "" : `Dr. ${trimmed}`;
}

export function doctorDisplayName(profile: any): string {
  return formatDoctorName((profile?.display_name?.trim() || profile?.full_name?.trim() || ""));
}

/** What a team clinic goes by: its clinic name, else the owner's name (never "Dr. Dr."). */
export function seoClinicName(profile: any): string {
  return String(profile?.clinic_name ?? "").trim() || doctorDisplayName(profile);
}

function cleanUrl(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** The doctor-led title the app has always generated (and MyWebsite saves back as if typed). */
function doctorLedTitle(profile: any): string {
  const name = doctorDisplayName(profile);
  const spec = profile?.specialization ? ` - ${profile.specialization}` : "";
  const city = profile?.city ? ` in ${profile.city}` : "";
  return name ? `${name}${spec}${city}${TITLE_SUFFIX}` : "";
}

/** The doctor-led fallback description (also what MyWebsite pre-fills when there is no bio). */
function doctorLedDescription(profile: any): string {
  const name = doctorDisplayName(profile);
  if (!name) return DEFAULT_DESCRIPTION;
  const city = profile?.city ? ` in ${profile.city}` : "";
  const specPart = profile?.specialization ? `, ${profile.specialization}` : "";
  const exp = profile?.experience_years ? ` (${profile.experience_years}+ years experience)` : "";
  return `Book an appointment with ${name}${specPart}${city}${exp}. Clinic timings, fees, services and patient reviews on Doctylia.`;
}

/** A stored seo_title the owner really wrote, or "" when it is blank or generated by the app. */
function customSeoTitle(settings: any, profile: any, generated: string[]): string {
  const stored = String(settings?.seo_title ?? "").trim();
  return stored && !isAutoSeoTitle(stored, [doctorLedTitle(profile), ...generated]) ? stored : "";
}

function customSeoDescription(settings: any, profile: any, generated: string[]): string {
  const stored = String(settings?.seo_description ?? "").trim();
  if (!stored) return "";
  const auto = isAutoSeoDescription(stored, [doctorLedDescription(profile), ...generated], [profile?.bio, settings?.hero_description]);
  return auto ? "" : stored;
}

function buildClinicMeta({ origin, profile, settings, practitioners, clinicImage }: DoctorSeoInput) {
  const name = seoClinicName(profile);
  const team = activeTeam(practitioners);
  const allSpecs = distinctSpecialties(team);
  const specs = allSpecs.slice(0, 3).join(", ");
  const city = profile?.city ? ` in ${profile.city}` : "";
  const generatedTitle = name ? fitTitle(titleCandidates(name, allSpecs.slice(0, 3), String(profile?.city ?? ""))) : "";
  const title = customSeoTitle(settings, profile, [generatedTitle]) || generatedTitle;

  const generatedDescription = name
    ? trimDescription(
        `${name}${city} has ${team.length} doctors${specs ? ` (${specs})` : ""}. Book an appointment online and see timings, fees, services and patient reviews on Doctylia.`,
      )
    : DEFAULT_DESCRIPTION;
  const description = customSeoDescription(settings, profile, [generatedDescription]) || generatedDescription;

  return {
    title,
    description,
    canonical: profile?.slug ? `${origin}/dr/${profile.slug}` : "",
    // The clinic's own pictures first; the owner's portrait only when nothing else exists.
    image: (cleanUrl(settings?.hero_photo_url) || cleanUrl(clinicImage) || profile?.profile_photo_url || "") as string,
  };
}

export function buildDoctorMeta(input: DoctorSeoInput) {
  if (isMultiDoctorClinic(input.practitioners)) return buildClinicMeta(input);
  const { origin, profile, settings } = input;
  const name = doctorDisplayName(profile);
  const generatedTitle = name ? fitTitle(titleCandidates(name, profile?.specialization ? [String(profile.specialization)] : [], String(profile?.city ?? ""))) : "";
  const title = customSeoTitle(settings, profile, [generatedTitle]) || generatedTitle;

  let description = customSeoDescription(settings, profile, []);
  if (!description) description = trimDescription(profile?.bio);
  if (!description) {
    // Skip the shared placeholder: identical descriptions across doctors read as duplicate content.
    const hero = settings?.hero_description?.trim();
    if (hero && hero !== PLACEHOLDER_HERO_DESCRIPTION) description = trimDescription(hero);
  }
  if (!description) description = doctorLedDescription(profile);

  return {
    title,
    description,
    canonical: profile?.slug ? `${origin}/dr/${profile.slug}` : "",
    image: (profile?.profile_photo_url || settings?.hero_photo_url || "") as string,
  };
}

/** Where this doctor sits in the directory; paths are null when city/specialty are missing. */
export function doctorHubPaths(profile: any) {
  const city = directorySlug(profile?.city);
  const spec = directorySlug(profile?.specialization);
  return {
    cityPath: city ? `/doctors/${city}` : null,
    cityName: city ? String(profile.city).trim() : null,
    specialtyPath: city && spec ? `/doctors/${city}/${spec}` : null,
    specialtyName: spec ? String(profile.specialization).trim() : null,
  };
}

/** Free-text address + area (only when the address doesn't already mention it) as a PostalAddress, or null. */
export function postalAddress(profile: any): Record<string, unknown> | null {
  const address = String(profile?.address ?? "").trim();
  const locality = String(profile?.locality ?? "").trim();
  const streetAddress = [address, locality && !address.toLowerCase().includes(locality.toLowerCase()) ? locality : ""]
    .filter(Boolean)
    .join(", ");
  if (!(streetAddress || profile?.city || profile?.state || profile?.pincode)) return null;
  return {
    "@type": "PostalAddress",
    ...(streetAddress ? { streetAddress } : {}),
    ...(profile.city ? { addressLocality: profile.city } : {}),
    ...(profile.state ? { addressRegion: profile.state } : {}),
    ...(profile.pincode ? { postalCode: profile.pincode } : {}),
    addressCountry: "IN",
  };
}

/** Online payment is switched on and the clinic's payout account is live (the BookingWidget's own gate). */
export function acceptsOnlinePayment(profile: any): boolean {
  return profile?.razorpay_payment_enabled === true && profile?.razorpay_account_status === "active";
}

/** "MBBS, MD (Medicine)" -> ["MBBS", "MD (Medicine)"]: commas inside brackets do not split. */
export function splitQualifications(raw: unknown): string[] {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if ((ch === "," || ch === ";" || ch === "\n") && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return [...new Set(out.map((q) => q.replace(/\s+/g, " ").trim()).filter(Boolean))].slice(0, 8);
}

/** The "Book an appointment" action every clinic / doctor node offers; its target is the booking section of the page. */
function reserveAction(canonical: string): Record<string, unknown> {
  return {
    "@type": "ReserveAction",
    name: "Book an appointment",
    target: { "@type": "EntryPoint", urlTemplate: `${canonical}#booking`, inLanguage: "en-IN" },
    result: { "@type": "Reservation", name: "Appointment booking" },
  };
}

/** Facts for AI answers and local search, added only where the data exists (nothing is invented). */
function discoveryFields(args: {
  profile: any;
  canonical: string;
  specialties: string[];
  services?: any[];
  acceptingNew?: boolean;
}): Record<string, unknown> {
  const { profile, canonical, specialties, services } = args;
  const city = String(profile?.city ?? "").trim();
  const coords = parseMapsLatLng(profile?.google_maps_url);
  const known = [...new Set([...specialties, ...(Array.isArray(services) ? services.slice(0, 12).map((s: any) => String(s?.name ?? "").trim()) : [])].filter(Boolean))];
  return {
    ...(city ? { areaServed: { "@type": "City", name: city } } : {}),
    ...(coords ? { geo: { "@type": "GeoCoordinates", latitude: coords.latitude, longitude: coords.longitude } } : {}),
    ...(known.length ? { knowsAbout: known } : {}),
    ...(acceptsOnlinePayment(profile) ? { paymentAccepted: "Online payment", currenciesAccepted: "INR" } : {}),
    ...(args.acceptingNew ? { isAcceptingNewPatients: true } : {}),
    ...(canonical ? { potentialAction: reserveAction(canonical) } : {}),
  };
}

function credentialFields(registration: unknown, qualifications: unknown): Record<string, unknown> {
  const reg = String(registration ?? "").trim();
  const quals = splitQualifications(qualifications);
  return {
    ...(reg ? { identifier: { "@type": "PropertyValue", name: "Medical registration number", value: reg } } : {}),
    ...(quals.length ? { hasCredential: quals.map((q) => ({ "@type": "EducationalOccupationalCredential", name: q })) } : {}),
  };
}

export function buildDoctorJsonLd(input: DoctorSeoInput) {
  const { origin, profile, settings, services = [], reviews = [] } = input;
  const name = doctorDisplayName(profile);
  if (!profile || !name) return null;

  const meta = buildDoctorMeta(input);
  const canonical = meta.canonical || origin;
  const validReviews = (reviews || []).filter((r: any) => typeof r.rating === "number" && r.rating > 0);
  const avgRating = validReviews.length
    ? (validReviews.reduce((a: number, r: any) => a + Number(r.rating), 0) / validReviews.length).toFixed(1)
    : null;

  const sameAs = [settings?.social_facebook, settings?.social_instagram, settings?.social_linkedin, settings?.social_youtube].filter(
    (u: unknown) => typeof u === "string" && /^https?:\/\//i.test(u as string),
  );

  const physician: Record<string, unknown> = {
    "@type": ["Physician", "MedicalBusiness"],
    "@id": `${canonical}#physician`,
    name,
    url: canonical,
    description: meta.description,
    ...(profile.specialization ? { medicalSpecialty: profile.specialization } : {}),
    ...(meta.image ? { image: meta.image } : {}),
    ...(profile.clinic_phone || profile.phone ? { telephone: profile.clinic_phone || profile.phone } : {}),
    ...(profile.consultation_fee ? { priceRange: `₹${profile.consultation_fee}` } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(isGoogleMapsUrl(profile.google_maps_url) ? { hasMap: String(profile.google_maps_url).trim() } : {}),
    ...(postalAddress(profile) ? { address: postalAddress(profile) } : {}),
    ...(Array.isArray(services) && services.length > 0
      ? {
          availableService: services.slice(0, 12).map((s: any) => ({
            "@type": "MedicalProcedure",
            name: s.name,
            ...(s.description ? { description: s.description } : {}),
            ...(s.price ? { offers: { "@type": "Offer", price: String(s.price), priceCurrency: "INR" } } : {}),
          })),
        }
      : {}),
    ...(avgRating
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: avgRating,
            reviewCount: String(validReviews.length),
            bestRating: "5",
            worstRating: "1",
          },
        }
      : {}),
  };

  const teamForFacts = activePractitioners(input.practitioners);
  const bookableNow = teamForFacts.some((p) => p.bookable === true);
  Object.assign(
    physician,
    discoveryFields({
      profile,
      canonical,
      specialties: profile.specialization ? [String(profile.specialization).trim()] : [],
      services,
      acceptingNew: bookableNow,
    }),
    credentialFields(profile.registration_number, profile.qualifications),
  );

  // Multi-doctor clinic: the main node describes the clinic itself, and the doctors are embedded as
  // minimal Physician members (same @id as the full node on each doctor's own page).
  const team = activePractitioners(input.practitioners);
  const multi = team.length >= 2 && !!profile.slug;
  if (multi) {
    physician["@type"] = ["MedicalClinic", "MedicalBusiness"];
    physician["@id"] = `${canonical}#clinic`;
    physician.name = seoClinicName(profile);
    // The owner's specialty and credentials belong to the owner's own doctor node, not to the clinic;
    // the clinic lists what all of its doctors treat.
    delete physician.medicalSpecialty;
    delete physician.identifier;
    delete physician.hasCredential;
    const clinicSpecialties = distinctSpecialties(team).slice(0, 8);
    if (clinicSpecialties.length) physician.medicalSpecialty = clinicSpecialties;
    const teamKnown = [...new Set([...clinicSpecialties, ...(Array.isArray(services) ? services.slice(0, 12).map((s: any) => String(s?.name ?? "").trim()) : [])].filter(Boolean))];
    if (teamKnown.length) physician.knowsAbout = teamKnown;
    else delete physician.knowsAbout;
    // A clinic has no single fee: a range across its doctors, or nothing.
    delete physician.priceRange;
    // The clinic-level aggregateRating is deliberately dropped: each doctor's page carries that
    // doctor's own rating (get_public_practitioners.avg_rating), and the clinic figure would double
    // count the same reviews. It would also be a self-serving rating on the business's own site,
    // which Google does not accept for review rich results.
    delete physician.aggregateRating;
    const fees = team.map((p) => Number(p.consultation_fee)).filter((n) => Number.isFinite(n) && n > 0);
    if (fees.length && Math.min(...fees) < Math.max(...fees)) physician.priceRange = `₹${Math.min(...fees)}-₹${Math.max(...fees)}`;
    const hours = openingHoursSpecification(input.workingHours);
    if (hours.length) physician.openingHoursSpecification = hours;
    const logo = cleanUrl(settings?.logo_url);
    if (logo) physician.logo = logo;
    // Doctors who opted out of the directory are not advertised.
    physician.member = listedTeam(team).map((p) => ({
      "@type": "Physician",
      "@id": `${origin}${practitionerPath(profile.slug, p.slug)}#physician`,
      name: formatDoctorName(p.display_name),
      url: `${origin}${practitionerPath(profile.slug, p.slug)}`,
      ...(p.specialization ? { medicalSpecialty: p.specialization } : {}),
      ...(p.photo_url ? { image: p.photo_url } : {}),
    }));
  }

  const hubs = doctorHubPaths(profile);
  const crumbs: Array<{ name: string; item: string }> = [{ name: "Doctylia", item: `${origin}/` }];
  if (multi) {
    // The hub pages are redirected while the directory is switched off: never point a breadcrumb at them.
    if (hubs.cityPath && !DIRECTORY_HIDDEN) {
      crumbs.push({ name: "Doctors", item: `${origin}/doctors` });
      crumbs.push({ name: hubs.cityName!, item: `${origin}${hubs.cityPath}` });
    }
    crumbs.push({ name: seoClinicName(profile), item: canonical });
  } else {
    if (hubs.cityPath) {
      crumbs.push({ name: "Doctors", item: `${origin}/doctors` });
      crumbs.push({ name: hubs.cityName!, item: `${origin}${hubs.cityPath}` });
      if (hubs.specialtyPath) crumbs.push({ name: hubs.specialtyName!, item: `${origin}${hubs.specialtyPath}` });
    }
    crumbs.push({ name, item: canonical });
  }

  return {
    "@context": "https://schema.org",
    "@graph": [
      physician,
      {
        "@type": "BreadcrumbList",
        itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.item })),
      },
    ],
  };
}

export interface PractitionerSeoInput {
  origin: string;
  profile: any;
  practitioner: PractitionerSeo;
  /** Services this doctor offers (name only is used). */
  services?: Array<{ name: string }>;
  settings?: any;
  /** Clinic working_hours rows; only this doctor's rows are used. */
  workingHours?: HoursRowLike[];
  /** The clinic's picture, used when the doctor has no photo of their own. */
  clinicImage?: string | null;
}

export function buildPractitionerMeta({ origin, profile, practitioner, settings, clinicImage }: PractitionerSeoInput) {
  const name = formatDoctorName(practitioner?.display_name ?? "");
  const specialization = practitioner?.specialization?.trim() || "";
  const city = profile?.city ? ` in ${profile.city}` : "";
  const title = name ? `${name}${specialization ? ` - ${specialization}` : ""}${city} | Doctylia` : "";

  // The bio is free text the doctor types: newlines and runs of spaces collapse so a meta tag stays one line.
  let description = practitioner?.bio?.replace(/\s+/g, " ").trim().slice(0, 160) || "";
  if (!description && name) {
    const clinicName = String(profile?.clinic_name ?? "").trim();
    const owner = doctorDisplayName(profile);
    const where = clinicName ? ` at ${clinicName}` : owner ? ` at ${owner}'s clinic` : "";
    const exp = practitioner.experience_years ? ` (${practitioner.experience_years}+ years experience)` : "";
    description = `Book an appointment with ${name}${specialization ? `, ${specialization}` : ""}${city}${exp}${where}. Timings, fees and online booking on Doctylia.`;
  }

  return {
    title,
    description,
    canonical: profile?.slug && practitioner?.slug ? `${origin}${practitionerPath(profile.slug, practitioner.slug)}` : "",
    image: (practitioner?.photo_url || cleanUrl(settings?.hero_photo_url) || cleanUrl(clinicImage) || "") as string,
  };
}

export function buildPractitionerJsonLd(input: PractitionerSeoInput) {
  const { origin, profile, practitioner } = input;
  const name = formatDoctorName(practitioner?.display_name ?? "");
  if (!profile?.slug || !practitioner?.slug || !name) return null;

  const meta = buildPractitionerMeta(input);
  const clinicUrl = `${origin}/dr/${profile.slug}`;
  const clinicName = seoClinicName(profile);
  const address = postalAddress(profile);
  const phone = profile.clinic_phone || profile.phone;
  const fee = Number(practitioner.consultation_fee);
  const ownHours = (input.workingHours ?? []).filter((r) => practitioner.id && r.practitioner_id === practitioner.id);
  const hours = openingHoursSpecification(ownHours);
  const physician: Record<string, unknown> = {
    "@type": "Physician",
    "@id": `${meta.canonical}#physician`,
    name,
    url: meta.canonical,
    description: meta.description,
    ...(practitioner.specialization ? { medicalSpecialty: practitioner.specialization } : {}),
    ...(meta.image ? { image: meta.image } : {}),
    // The clinic node lives on another page, so describe it here too instead of leaving a bare @id.
    worksFor: { "@type": "MedicalClinic", "@id": `${clinicUrl}#clinic`, name: clinicName, url: clinicUrl },
    ...(phone ? { telephone: phone } : {}),
    ...(address ? { address } : {}),
    ...(Number.isFinite(fee) && fee > 0 ? { priceRange: `₹${fee}` } : {}),
    ...(hours.length ? { openingHoursSpecification: hours } : {}),
    ...discoveryFields({
      profile,
      canonical: meta.canonical,
      specialties: practitioner.specialization ? [practitioner.specialization.trim()] : [],
      services: input.services,
      acceptingNew: practitioner.bookable === true,
    }),
    ...credentialFields(practitioner.registration_number, practitioner.qualifications),
  };
  // Per-doctor rating, only when this doctor has reviews of their own (never the clinic aggregate).
  const reviewCount = Number(practitioner.review_count);
  const avg = practitioner.avg_rating == null ? NaN : Number(practitioner.avg_rating);
  if (Number.isFinite(reviewCount) && reviewCount > 0 && Number.isFinite(avg)) {
    physician.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: avg.toFixed(1),
      reviewCount: String(reviewCount),
      bestRating: "5",
      worstRating: "1",
    };
  }

  return {
    "@context": "https://schema.org",
    "@graph": [
      physician,
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { name: "Doctylia", item: `${origin}/` },
          { name: clinicName || "Clinic", item: clinicUrl },
          { name, item: meta.canonical },
        ].map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.item })),
      },
    ],
  };
}
