// Crawler-facing HTML bodies for a team clinic page, a single-doctor page and a per-doctor page.
// GPTBot, ClaudeBot and PerplexityBot do not run JavaScript, so everything a person would read (who
// works here, what they treat, what it costs, where and when) is plain, escaped HTML with real
// internal links, led by an answer-first "Quick facts" paragraph built only from real data.
//
// NOTE: relative imports only - Vercel's bundler does not resolve "@/".
import { DIRECTORY_HIDDEN } from "../siteSwitches";
import { doctorPath, encodePathSegment } from "./blogSeo";
import { hoursLines, openDaysSummary, type HoursRowLike } from "./clinicHours";
import { activeTeam, distinctSpecialties, listedTeam } from "./clinicTeam";
import {
  acceptsOnlinePayment,
  doctorDisplayName,
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

type ServiceLike = { name: string; price?: unknown; duration?: unknown };

function serviceLine(s: ServiceLike): string {
  const duration = Number(s.duration);
  return `${escapeHtml(s.name)}${s.price ? ` - &#8377;${escapeHtml(String(s.price))}` : ""}${Number.isFinite(duration) && duration > 0 ? ` (${duration} minutes)` : ""}`;
}

function servicesHtml(services: ServiceLike[] | undefined, heading: string): string {
  const items = (services ?? []).slice(0, 12).map((s) => `<li>${serviceLine(s)}</li>`).join("");
  return items ? `<h2>${escapeHtml(heading)}</h2><ul>${items}</ul>` : "";
}

const rupees = (n: number) => `₹${n}`;

function feeNumbers(list: Array<{ consultation_fee?: unknown }>): number[] {
  return list.map((p) => Number(p.consultation_fee)).filter((n) => Number.isFinite(n) && n > 0);
}

/** "Consultation fees from ₹500." / "Consultation fee ₹500." / "" when no fee is known. */
function feeSentence(fees: number[]): string {
  if (!fees.length) return "";
  const min = Math.min(...fees);
  return min === Math.max(...fees) ? `Consultation fee ${rupees(min)}.` : `Consultation fees from ${rupees(min)}.`;
}

/** "X is rated 4.5 out of 5 from 12 patient reviews on Doctylia." from visible ratings, "" when there are none. */
function reviewSentence(subject: string, reviews: Array<{ rating?: unknown }> | undefined): string {
  const ratings = (reviews ?? []).map((r) => Number(r.rating)).filter((n) => Number.isFinite(n) && n > 0);
  if (!ratings.length) return "";
  const avg = (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1);
  return `${subject} is rated ${avg} out of 5 from ${ratings.length} patient review${ratings.length === 1 ? "" : "s"} on Doctylia.`;
}

/** Where the booking section lives (an absolute URL when the origin is known). */
function bookingUrl(origin: string | undefined, clinicSlug: string, doctorSlug?: string): string {
  const path = doctorSlug ? practitionerHref(clinicSlug, doctorSlug) : doctorPath(clinicSlug);
  return `${origin ?? ""}${path}#booking`;
}

function bookingLink(url: string): string {
  return `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`;
}

/** Plain-language steps; only what the booking widget really does. */
function howToBookHtml(url: string, onlinePayment: boolean): string {
  return `<h2>How to book</h2><p>Book an appointment online at ${bookingLink(url)}: choose the service, pick an available date and time slot, enter the patient's details and confirm.${onlinePayment ? " Online payment is available for consultations." : ""}</p>`;
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
  services?: ServiceLike[];
  workingHours?: HoursRowLike[];
  /** Public site origin; when given, the booking link is absolute. */
  origin?: string;
  /** Visible reviews of the clinic (ratings only). */
  reviews?: Array<{ rating?: unknown }>;
}): string {
  const { profile } = args;
  const name = seoClinicName(profile);
  const team = activeTeam(args.practitioners);
  const allSpecs = distinctSpecialties(team);
  const specs = allSpecs.slice(0, 3).join(", ");
  const city = String(profile?.city ?? "").trim();
  const url = bookingUrl(args.origin, profile.slug);
  const days = openDaysSummary(args.workingHours);
  // Answer-first paragraph for crawlers that do not run JavaScript: only facts present in the data.
  const quickFacts = [
    `${escapeHtml(name)} is a clinic${city ? ` in ${escapeHtml(city)}` : ""} with ${team.length} doctors${allSpecs.length ? `: ${escapeHtml(allSpecs.slice(0, 6).join(", "))}` : ""}.`,
    escapeHtml(feeSentence(feeNumbers(team))),
    days ? `Open ${escapeHtml(days)}.` : "",
    `Book online at ${bookingLink(url)}.`,
  ].filter(Boolean).join(" ");
  // Only doctors who did not opt out of the directory are advertised.
  const doctors = listedTeam(team)
    .map((p) => {
      const fee = Number(p.consultation_fee);
      const reviewCount = Number(p.review_count);
      const rating = Number(p.avg_rating);
      const facts = [
        p.specialization?.trim(),
        p.qualifications?.trim(),
        p.experience_years ? `${p.experience_years}+ years of experience` : "",
        Number.isFinite(fee) && fee > 0 ? `consultation fee ${rupees(fee)}` : "",
        reviewCount > 0 && Number.isFinite(rating) ? `rated ${rating.toFixed(1)} from ${reviewCount} review${reviewCount === 1 ? "" : "s"}` : "",
      ]
        .filter(Boolean)
        .map((f) => escapeHtml(String(f)))
        .join(", ");
      const bio = snippet(p.bio, BIO_SNIPPET_CHARS);
      return `<li><a href="${escapeHtml(practitionerHref(profile.slug, p.slug))}">${escapeHtml(formatDoctorName(p.display_name))}</a>${facts ? ` - ${facts}` : ""}${bio ? `<p>${escapeHtml(bio)}</p>` : ""}</li>`;
    })
    .join("");
  const reviews = reviewSentence(name, args.reviews);
  return `<main>${crumbs(profile, escapeHtml(name))}<h1>${escapeHtml(name)}${specs ? ` - ${escapeHtml(specs)}` : ""}</h1><h2>Quick facts</h2><p>${quickFacts}</p><p>${escapeHtml(args.description)}</p>${contactHtml(profile)}${doctors ? `<h2>Our doctors</h2><ul>${doctors}</ul>` : ""}${servicesHtml(args.services, "Services")}${hoursHtml(args.workingHours, "Clinic hours")}${reviews ? `<h2>Patient reviews</h2><p>${escapeHtml(reviews)}</p>` : ""}${howToBookHtml(url, acceptsOnlinePayment(profile))}</main>`;
}

/** Crawler body of a single-doctor page: the same answer-first facts as a team clinic, for one doctor. */
export function buildSingleDoctorBody(args: {
  profile: any;
  description: string;
  services?: ServiceLike[];
  workingHours?: HoursRowLike[];
  origin?: string;
  reviews?: Array<{ rating?: unknown }>;
}): string {
  const { profile } = args;
  const name = doctorDisplayName(profile);
  const spec = String(profile?.specialization ?? "").trim();
  const city = String(profile?.city ?? "").trim();
  const quals = String(profile?.qualifications ?? "").trim();
  const reg = String(profile?.registration_number ?? "").trim();
  const exp = Number(profile?.experience_years);
  const url = bookingUrl(args.origin, profile.slug);
  const days = openDaysSummary(args.workingHours);
  const quickFacts = [
    `${escapeHtml(name)}${spec ? `, ${escapeHtml(spec)}` : ""}, practises${city ? ` in ${escapeHtml(city)}` : ""}${Number.isFinite(exp) && exp > 0 ? ` and has ${exp}+ years of experience` : ""}.`,
    quals ? `Qualifications: ${escapeHtml(quals)}.` : "",
    reg ? `Registration no. ${escapeHtml(reg)}.` : "",
    escapeHtml(feeSentence(feeNumbers([{ consultation_fee: profile?.consultation_fee }]))),
    days ? `Open ${escapeHtml(days)}.` : "",
    `Book online at ${bookingLink(url)}.`,
  ].filter(Boolean).join(" ");
  const hubs = doctorHubPaths(profile);
  const nav = [
    !DIRECTORY_HIDDEN ? `<a href="/doctors">Doctors</a>` : `<a href="/">Doctylia</a>`,
    !DIRECTORY_HIDDEN && hubs.cityPath ? `<a href="${escapeHtml(hubs.cityPath)}">${escapeHtml(hubs.cityName ?? "")}</a>` : "",
    !DIRECTORY_HIDDEN && hubs.specialtyPath ? `<a href="${escapeHtml(hubs.specialtyPath)}">${escapeHtml(hubs.specialtyName ?? "")}</a>` : "",
  ].filter(Boolean).join(" / ");
  const reviews = reviewSentence(name, args.reviews);
  return `<main><nav aria-label="Breadcrumb">${nav}</nav><h1>${escapeHtml(name)}${spec ? ` - ${escapeHtml(spec)}` : ""}</h1><h2>Quick facts</h2><p>${quickFacts}</p><p>${escapeHtml(args.description)}</p>${contactHtml(profile)}${servicesHtml(args.services, "Services")}${hoursHtml(args.workingHours, "Consulting hours")}${reviews ? `<h2>Patient reviews</h2><p>${escapeHtml(reviews)}</p>` : ""}${howToBookHtml(url, acceptsOnlinePayment(profile))}</main>`;
}

export function buildPractitionerBody(args: {
  profile: any;
  practitioner: PractitionerSeo;
  description: string;
  /** Services this doctor offers (the caller applies service_practitioners). */
  services?: ServiceLike[];
  /** The clinic's rows; only this doctor's are shown. */
  workingHours?: HoursRowLike[];
  origin?: string;
}): string {
  const { profile, practitioner } = args;
  const clinic = seoClinicName(profile);
  const name = formatDoctorName(practitioner.display_name);
  const fee = Number(practitioner.consultation_fee);
  const city = String(profile?.city ?? "").trim();
  const ownHours = (args.workingHours ?? []).filter((r) => practitioner.id && r.practitioner_id === practitioner.id);
  const url = bookingUrl(args.origin, profile.slug, practitioner.slug);
  const days = openDaysSummary(ownHours);
  const spec = practitioner.specialization?.trim() ?? "";
  const quickFacts = [
    `${escapeHtml(name)}${spec ? `, ${escapeHtml(spec)}` : ""}, sees patients${clinic ? ` at ${escapeHtml(clinic)}` : ""}${city ? ` in ${escapeHtml(city)}` : ""}${practitioner.experience_years ? ` and has ${escapeHtml(String(practitioner.experience_years))}+ years of experience` : ""}.`,
    practitioner.qualifications ? `Qualifications: ${escapeHtml(practitioner.qualifications)}.` : "",
    escapeHtml(feeSentence(feeNumbers([practitioner]))),
    days ? `Consults ${escapeHtml(days)}.` : "",
    `Book online at ${bookingLink(url)}.`,
  ].filter(Boolean).join(" ");
  const facts = [
    practitioner.qualifications && `<p>${escapeHtml(practitioner.qualifications)}</p>`,
    practitioner.experience_years ? `<p>${escapeHtml(String(practitioner.experience_years))}+ years of experience</p>` : "",
    practitioner.registration_number ? `<p>Registration no. ${escapeHtml(practitioner.registration_number)}</p>` : "",
    Number.isFinite(fee) && fee > 0 ? `<p>Consultation fee: &#8377;${escapeHtml(String(fee))}</p>` : "",
  ].filter(Boolean).join("");
  const bio = (practitioner.bio ?? "").replace(/\s+/g, " ").trim();
  const clinicLink = `<a href="${escapeHtml(doctorPath(profile.slug))}">${escapeHtml(clinic || "Clinic")}</a>`;
  const reviewCount = Number(practitioner.review_count);
  const rating = Number(practitioner.avg_rating);
  const reviews = reviewCount > 0 && Number.isFinite(rating)
    ? `${name} is rated ${rating.toFixed(1)} out of 5 from ${reviewCount} patient review${reviewCount === 1 ? "" : "s"} on Doctylia.`
    : "";
  return `<main><nav aria-label="Breadcrumb"><a href="/">Doctylia</a> / ${clinicLink} / ${escapeHtml(name)}</nav><h1>${escapeHtml(name)}${practitioner.specialization ? ` - ${escapeHtml(practitioner.specialization)}` : ""}</h1><h2>Quick facts</h2><p>${quickFacts}</p><p>${escapeHtml(args.description)}</p>${facts}${bio ? `<h2>About ${escapeHtml(name)}</h2><p>${escapeHtml(bio)}</p>` : ""}${servicesHtml(args.services, `Services by ${name}`)}${hoursHtml(ownHours, "Consulting hours")}${reviews ? `<h2>Patient reviews</h2><p>${escapeHtml(reviews)}</p>` : ""}${clinic ? `<h2>${escapeHtml(clinic)}</h2>` : ""}${contactHtml(profile)}${howToBookHtml(url, acceptsOnlinePayment(profile))}</main>`;
}
