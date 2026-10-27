// Head + crawlable body for the directory hubs (/doctors, /doctors/:city,
// /doctors/:city/:specialty). Doctor-card data comes from the search_doctors RPC.
import { DIRECTORY_MIN_INDEXABLE } from "../directory/slug";
import { escapeHtml, INDEXABLE, NOINDEX, type PageHead } from "./injectHead";
import { formatDoctorName } from "./doctorSeo";

export interface DirectoryDoctor {
  slug: string;
  full_name: string | null;
  specialization: string | null;
  city: string | null;
  locality?: string | null;
  clinic_name?: string | null;
  experience_years?: number | null;
  avg_rating?: number | string | null;
  review_count?: number | string | null;
}
export interface DirectoryFacet {
  kind: "city" | "specialty";
  slug: string;
  label: string;
  doctor_count: number | string;
}

export interface HubContext {
  origin: string;
  citySlug?: string;
  specialtySlug?: string;
  cityLabel?: string;
  specialtyLabel?: string;
  doctors: DirectoryDoctor[];
  total: number;
  facets: DirectoryFacet[];
}

export function hubPath(citySlug?: string, specialtySlug?: string): string {
  if (!citySlug) return "/doctors";
  return specialtySlug ? `/doctors/${citySlug}/${specialtySlug}` : `/doctors/${citySlug}`;
}

export function hubHeading(cityLabel?: string, specialtyLabel?: string): string {
  if (cityLabel && specialtyLabel) return `${specialtyLabel} doctors in ${cityLabel}`;
  if (cityLabel) return `Doctors in ${cityLabel}`;
  return "Find a doctor";
}

export function isHubIndexable(total: number, citySlug?: string): boolean {
  return citySlug ? total >= DIRECTORY_MIN_INDEXABLE : total > 0;
}

export function buildHubHead(ctx: HubContext): PageHead {
  const { origin, cityLabel, specialtyLabel, total } = ctx;
  const canonical = `${origin}${hubPath(ctx.citySlug, ctx.specialtySlug)}`;
  const h1 = hubHeading(cityLabel, specialtyLabel);
  const noun = total === 1 ? "doctor" : "doctors";

  let title: string;
  let description: string;
  if (cityLabel && specialtyLabel) {
    title = `${h1} - Book Appointment Online | Doctylia`;
    description = `Find ${total} ${specialtyLabel} ${noun} in ${cityLabel}. View profiles, qualifications, consultation fees and clinic details, and book an appointment online.`;
  } else if (cityLabel) {
    title = `${h1} - Book Appointment Online | Doctylia`;
    description = `Browse ${total} ${noun} in ${cityLabel} across specialties. Compare profiles and fees and book an appointment online with Doctylia.`;
  } else {
    title = "Find a Doctor Near You - Book Appointment Online | Doctylia";
    description =
      "Search doctors by name, specialty and city across India. View profiles and clinic details and book an appointment online with Doctylia.";
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        name: h1,
        numberOfItems: ctx.doctors.length,
        itemListElement: ctx.doctors.map((d, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: `${origin}/dr/${d.slug}`,
          name: formatDoctorName(d.full_name ?? ""),
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Doctylia", item: `${origin}/` },
          { "@type": "ListItem", position: 2, name: "Doctors", item: `${origin}/doctors` },
          ...(cityLabel ? [{ "@type": "ListItem", position: 3, name: cityLabel, item: `${origin}${hubPath(ctx.citySlug)}` }] : []),
          ...(cityLabel && specialtyLabel ? [{ "@type": "ListItem", position: 4, name: specialtyLabel, item: canonical }] : []),
        ],
      },
    ],
  };

  return {
    title,
    description,
    canonical,
    robots: isHubIndexable(total, ctx.citySlug) ? INDEXABLE : NOINDEX,
    jsonLd: [jsonLd],
    bodyHtml: buildHubBody(ctx, h1),
  };
}

function buildHubBody(ctx: HubContext, h1: string): string {
  const doctors = ctx.doctors
    .map((d) => {
      const bits = [d.specialization, d.locality, d.city]
        .filter(Boolean)
        .map((s) => escapeHtml(String(s)))
        .join(", ");
      return `<li><a href="/dr/${encodeURIComponent(d.slug)}">${escapeHtml(formatDoctorName(d.full_name ?? ""))}</a>${bits ? ` - ${bits}` : ""}</li>`;
    })
    .join("");
  const facets = ctx.facets
    .map((f) => {
      // A specialty facet without a city has no hub URL to link to.
      if (f.kind === "specialty" && !ctx.citySlug) return "";
      const href = f.kind === "city" ? hubPath(f.slug) : hubPath(ctx.citySlug, f.slug);
      return `<li><a href="${href}">${escapeHtml(f.label)}</a> (${Number(f.doctor_count)})</li>`;
    })
    .join("");
  return `<main><h1>${escapeHtml(h1)}</h1>${doctors ? `<ul>${doctors}</ul>` : ""}${facets ? `<nav aria-label="Browse"><ul>${facets}</ul></nav>` : ""}</main>`;
}

export function buildDoctorBody(args: {
  name: string;
  description: string;
  specialization?: string | null;
  city?: string | null;
  address?: string | null;
  services: Array<{ name: string }>;
  hubs: { cityPath: string | null; cityName: string | null; specialtyPath: string | null; specialtyName: string | null };
}): string {
  const where = [args.address, args.city].filter(Boolean).map((s) => escapeHtml(String(s))).join(", ");
  const services = args.services.slice(0, 12).map((s) => `<li>${escapeHtml(s.name)}</li>`).join("");
  const crumbs = [
    `<a href="/doctors">Doctors</a>`,
    args.hubs.cityPath ? `<a href="${args.hubs.cityPath}">${escapeHtml(args.hubs.cityName ?? "")}</a>` : "",
    args.hubs.specialtyPath ? `<a href="${args.hubs.specialtyPath}">${escapeHtml(args.hubs.specialtyName ?? "")}</a>` : "",
  ]
    .filter(Boolean)
    .join(" / ");
  return `<main><nav aria-label="Breadcrumb">${crumbs}</nav><h1>${escapeHtml(args.name)}${args.specialization ? ` - ${escapeHtml(args.specialization)}` : ""}</h1><p>${escapeHtml(args.description)}</p>${where ? `<p>${where}</p>` : ""}${services ? `<h2>Services</h2><ul>${services}</ul>` : ""}</main>`;
}
