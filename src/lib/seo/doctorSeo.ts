// Pure builders for a doctor's public-page SEO. Used by the Vercel Edge function
// (api/seo.ts, server HTML) and by DoctorPublicPage (client-side updates) so the
// two can never describe the same doctor differently.
import { directorySlug } from "../directory/slug";

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
  return /^dr\.?\s/i.test(trimmed) ? trimmed : `Dr. ${trimmed}`;
}

export function doctorDisplayName(profile: any): string {
  return formatDoctorName((profile?.display_name || profile?.full_name || "").trim());
}

export function buildDoctorMeta({ origin, profile, settings }: DoctorSeoInput) {
  const name = doctorDisplayName(profile);
  const spec = profile?.specialization ? ` - ${profile.specialization}` : "";
  const city = profile?.city ? ` in ${profile.city}` : "";
  const title = settings?.seo_title?.trim() || (name ? `${name}${spec}${city} | Doctylia` : "");

  let description = settings?.seo_description?.trim() || "";
  if (!description) description = profile?.bio?.trim().slice(0, 160) || "";
  if (!description) {
    // Skip the shared placeholder: identical descriptions across doctors read as duplicate content.
    const hero = settings?.hero_description?.trim();
    if (hero && hero !== PLACEHOLDER_HERO_DESCRIPTION) description = hero.slice(0, 160);
  }
  if (!description) {
    if (!name) description = DEFAULT_DESCRIPTION;
    else {
      const specPart = profile?.specialization ? `, ${profile.specialization}` : "";
      const exp = profile?.experience_years ? ` (${profile.experience_years}+ years experience)` : "";
      description = `Book an appointment with ${name}${specPart}${city}${exp}. View clinic timings, consultation fees, services, and verified patient reviews on Doctylia.`;
    }
  }

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

  // Append the area only when the free-text address doesn't already mention it.
  const address = String(profile.address ?? "").trim();
  const locality = String(profile.locality ?? "").trim();
  const streetAddress = [address, locality && !address.toLowerCase().includes(locality.toLowerCase()) ? locality : ""]
    .filter(Boolean)
    .join(", ");
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
    ...(streetAddress || profile.city || profile.state || profile.pincode
      ? {
          address: {
            "@type": "PostalAddress",
            ...(streetAddress ? { streetAddress } : {}),
            ...(profile.city ? { addressLocality: profile.city } : {}),
            ...(profile.state ? { addressRegion: profile.state } : {}),
            ...(profile.pincode ? { postalCode: profile.pincode } : {}),
            addressCountry: "IN",
          },
        }
      : {}),
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

  const hubs = doctorHubPaths(profile);
  const crumbs: Array<{ name: string; item: string }> = [{ name: "Doctylia", item: `${origin}/` }];
  if (hubs.cityPath) {
    crumbs.push({ name: "Doctors", item: `${origin}/doctors` });
    crumbs.push({ name: hubs.cityName!, item: `${origin}${hubs.cityPath}` });
    if (hubs.specialtyPath) crumbs.push({ name: hubs.specialtyName!, item: `${origin}${hubs.specialtyPath}` });
  }
  crumbs.push({ name, item: canonical });

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
