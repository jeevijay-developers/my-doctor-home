// Crawler-facing HTML bodies for a team clinic page and a per-doctor page. GPTBot, ClaudeBot and
// PerplexityBot do not run JavaScript, so everything a person would read (who works here, what they
// treat, where and when) is plain, escaped HTML with real internal links.
//
// NOTE: relative imports only - Vercel's bundler does not resolve "@/".
import { DIRECTORY_HIDDEN } from "../siteSwitches";
import { doctorPath, encodePathSegment } from "./blogSeo";
import { hoursLines, type HoursRowLike } from "./clinicHours";
import { activeTeam, distinctSpecialties, listedTeam } from "./clinicTeam";
import {
  doctorHubPaths,
  formatDoctorName,
  seoClinicName,
  type PractitionerSeo,
} from "./doctorSeo";
import { escapeHtml } from "./injectHead";

const BIO_SNIPPET_CHARS = 220;

export function practitionerHref(clinicSlug: string, doctorSlug: string): string {
  return `${doctorPath(clinicSlug)}/doctor/${encodePathSegment(doctorSlug)}`;
}

function snippet(text: string | null | undefined, max: number): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).replace(/\s+\S*$/, "")}...`;
}

function whereLine(profile: any): string {
  return [profile?.address, profile?.locality, profile?.city, profile?.state, profile?.pincode]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    // The free-text address often already names the area/city: show each part once.
    .reduce<string[]>((acc, part) => (acc.join(", ").toLowerCase().includes(part.toLowerCase()) ? acc : [...acc, part]), [])
    .join(", ");
}

function contactHtml(profile: any): string {
  const where = whereLine(profile);
  const phone = String(profile?.clinic_phone || profile?.phone || "").trim();
  return `${where ? `<p>Address: ${escapeHtml(where)}</p>` : ""}${phone ? `<p>Phone: ${escapeHtml(phone)}</p>` : ""}`;
}

function hoursHtml(rows: HoursRowLike[] | undefined, heading: string): string {
  const lines = hoursLines(rows);
  if (!lines.length) return "";
  return `<h2>${escapeHtml(heading)}</h2><ul>${lines.map((l) => `<li>${escapeHtml(l.label)}: ${escapeHtml(l.text)}</li>`).join("")}</ul>`;
}

function servicesHtml(services: Array<{ name: string; price?: unknown }> | undefined, heading: string): string {
  const items = (services ?? [])
    .slice(0, 12)
    .map((s) => `<li>${escapeHtml(s.name)}${s.price ? ` - &#8377;${escapeHtml(String(s.price))}` : ""}</li>`)
    .join("");
  return items ? `<h2>${escapeHtml(heading)}</h2><ul>${items}</ul>` : "";
}

/** Home / (hub crumbs only while the directory is live) / ... as plain links. */
function crumbs(profile: any, tail: string): string {
  const hubs = doctorHubPaths(profile);
  const parts = [
    `<a href="/">Doctylia</a>`,
    !DIRECTORY_HIDDEN ? `<a href="/doctors">Doctors</a>` : "",
    !DIRECTORY_HIDDEN && hubs.cityPath ? `<a href="${escapeHtml(hubs.cityPath)}">${escapeHtml(hubs.cityName ?? "")}</a>` : "",
    tail,
  ];
  return `<nav aria-label="Breadcrumb">${parts.filter(Boolean).join(" / ")}</nav>`;
}

export function buildClinicBody(args: {
  profile: any;
  description: string;
  practitioners: PractitionerSeo[];
  services?: Array<{ name: string; price?: unknown }>;
  workingHours?: HoursRowLike[];
}): string {
  const { profile } = args;
  const name = seoClinicName(profile);
  const team = activeTeam(args.practitioners);
  const specs = distinctSpecialties(team).slice(0, 3).join(", ");
  // Only doctors who did not opt out of the directory are advertised.
  const doctors = listedTeam(team)
    .map((p) => {
      const facts = [
        p.specialization?.trim(),
        p.qualifications?.trim(),
        p.experience_years ? `${p.experience_years}+ years of experience` : "",
      ]
        .filter(Boolean)
        .map((f) => escapeHtml(String(f)))
        .join(", ");
      const bio = snippet(p.bio, BIO_SNIPPET_CHARS);
      return `<li><a href="${escapeHtml(practitionerHref(profile.slug, p.slug))}">${escapeHtml(formatDoctorName(p.display_name))}</a>${facts ? ` - ${facts}` : ""}${bio ? `<p>${escapeHtml(bio)}</p>` : ""}</li>`;
    })
    .join("");
  return `<main>${crumbs(profile, escapeHtml(name))}<h1>${escapeHtml(name)}${specs ? ` - ${escapeHtml(specs)}` : ""}</h1><p>${escapeHtml(args.description)}</p>${contactHtml(profile)}${doctors ? `<h2>Our doctors</h2><ul>${doctors}</ul>` : ""}${servicesHtml(args.services, "Services")}${hoursHtml(args.workingHours, "Clinic hours")}</main>`;
}

export function buildPractitionerBody(args: {
  profile: any;
  practitioner: PractitionerSeo;
  description: string;
  /** Services this doctor offers (the caller applies service_practitioners). */
  services?: Array<{ name: string; price?: unknown }>;
  /** The clinic's rows; only this doctor's are shown. */
  workingHours?: HoursRowLike[];
}): string {
  const { profile, practitioner } = args;
  const clinic = seoClinicName(profile);
  const name = formatDoctorName(practitioner.display_name);
  const fee = Number(practitioner.consultation_fee);
  const facts = [
    practitioner.qualifications && `<p>${escapeHtml(practitioner.qualifications)}</p>`,
    practitioner.experience_years ? `<p>${escapeHtml(String(practitioner.experience_years))}+ years of experience</p>` : "",
    practitioner.registration_number ? `<p>Registration no. ${escapeHtml(practitioner.registration_number)}</p>` : "",
    Number.isFinite(fee) && fee > 0 ? `<p>Consultation fee: &#8377;${escapeHtml(String(fee))}</p>` : "",
  ].filter(Boolean).join("");
  const bio = (practitioner.bio ?? "").replace(/\s+/g, " ").trim();
  const ownHours = (args.workingHours ?? []).filter((r) => practitioner.id && r.practitioner_id === practitioner.id);
  const clinicLink = `<a href="${escapeHtml(doctorPath(profile.slug))}">${escapeHtml(clinic || "Clinic")}</a>`;
  return `<main><nav aria-label="Breadcrumb"><a href="/">Doctylia</a> / ${clinicLink} / ${escapeHtml(name)}</nav><h1>${escapeHtml(name)}${practitioner.specialization ? ` - ${escapeHtml(practitioner.specialization)}` : ""}</h1><p>${escapeHtml(args.description)}</p>${facts}${bio ? `<h2>About ${escapeHtml(name)}</h2><p>${escapeHtml(bio)}</p>` : ""}${servicesHtml(args.services, `Services by ${name}`)}${hoursHtml(ownHours, "Consulting hours")}${clinic ? `<h2>${escapeHtml(clinic)}</h2>` : ""}${contactHtml(profile)}</main>`;
}
