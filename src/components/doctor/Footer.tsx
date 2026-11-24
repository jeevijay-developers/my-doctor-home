import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Facebook, Instagram, Linkedin, Mail, MapPin, Phone, Youtube } from "lucide-react";
import "@/styles/doctor-site.css";
import { useDoctorData } from "@/contexts/DoctorContext";
import OptimizedImage from "@/components/shared/OptimizedImage";
import { clinicPhone, doctorName as formatName, telHref, siteLabels } from "@/lib/doctorSite/doctorFacts";
import { getClinicMapsUrl } from "@/lib/clinicLocation";
import type { Tables } from "@/integrations/supabase/types";
import DsButton from "./ui/DsButton";
import { dsScrollTo, dsScrollToTop } from "./motion/scroll";

// `display_name` is an optional override that isn't a column in the generated
// profiles type; the name falls back to `full_name` when it's absent.
type Profile = Tables<"profiles"> & { display_name?: string | null };

type FooterProps = {
  /** The blog pages pass the doctor they already loaded; the home page reads the shared context. */
  profileOverride?: Profile | null;
};

const linkClass =
  "inline-flex min-h-11 items-center rounded-full text-ds-small text-[rgb(var(--ds-footer-ink-2))] transition-colors hover:text-[rgb(var(--ds-footer-ink))]";

/**
 * Closing footer (spec §5.11): who, how to reach them, where to go next. It is
 * also used by the blog pages, which sit outside the doctor home's wrapper, so
 * it carries the `doctor-site` token scope itself.
 */
const Footer = ({ profileOverride }: FooterProps) => {
  const doctorData = useDoctorData();
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const profile = profileOverride ?? doctorData.profile;
  const settings = profileOverride ? null : doctorData.settings;
  const labels = siteLabels(settings);
  const services = profileOverride ? [] : doctorData.services;
  const gallery = profileOverride ? [] : doctorData.gallery;

  const name = formatName(profile) || "Doctor";
  const specialty = (profile?.specialization ?? "").trim();
  const base = `/dr/${slug || profile?.slug || ""}`;
  const isDoctorHome = location.pathname === base;
  const isArticleRoute = location.pathname.includes("/blog");
  const phone = clinicPhone(profile);
  const email = (profile?.clinic_email ?? "").trim();
  const address = [profile?.address, profile?.city, profile?.state].filter(Boolean).join(", ");
  const clinicLine = [profile?.clinic_name, profile?.city].filter(Boolean).join(", ");
  const directions = (profile?.google_maps_url ?? "").trim() || getClinicMapsUrl(profile);

  const socials = [
    { label: "Facebook", icon: Facebook, url: settings?.social_facebook },
    { label: "Instagram", icon: Instagram, url: settings?.social_instagram },
    { label: "YouTube", icon: Youtube, url: settings?.social_youtube },
    { label: "LinkedIn", icon: Linkedin, url: settings?.social_linkedin },
  ].filter((item) => Boolean(item.url));

  const quickLinks = [
    { label: "About", target: "about", show: settings?.show_about !== false },
    { label: "Gallery", target: "gallery", show: settings?.show_gallery === true },
    { label: "Services", target: "services", show: settings?.show_services !== false },
    { label: "Reviews", target: "reviews", show: settings?.show_reviews !== false },
    { label: "Clinic details", target: "contact", show: settings?.show_clinic_details !== false },
    { label: "Contact", target: "ask", show: true },
  ].filter((item) => item.show);

  const sectionHref = (target: string) => `${base}#${target}`;
  const jump = (event: React.MouseEvent<HTMLAnchorElement>, target: string) => {
    if (!isDoctorHome) return; // on other pages the link navigates to the home section
    event.preventDefault();
    dsScrollTo(target, { focusSelector: "h2" });
  };

  return (
    <footer className="doctor-site !bg-[rgb(var(--ds-footer-bg))] !text-[rgb(var(--ds-footer-ink))]">
      <div className="mx-auto max-w-[1200px] px-5 pb-10 pt-16 sm:px-6 md:pt-24 lg:px-8">
        <div className="grid gap-12 border-b border-white/[0.12] pb-14 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="ds-eyebrow !text-[rgb(var(--ds-footer-ink-2))]">Your next step</p>
            <p className="mt-4 max-w-[16ch] font-ds-display text-ds-h2 font-medium leading-[1.08]">
              Book a visit with {name}.
            </p>
            <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
              <DsButton
                href={sectionHref("booking")}
                size="lg"
                magnetic
                onClick={(event: React.MouseEvent<HTMLAnchorElement>) => {
                  event.preventDefault(); // keep it a single-page navigation (no full reload on a phone)
                  if (isDoctorHome) dsScrollTo("booking", { focusSelector: "[data-booking-start]" });
                  else navigate(sectionHref("booking"));
                }}
                className="!bg-[rgb(var(--ds-footer-ink))] !text-[rgb(var(--ds-footer-bg))] hover:!bg-white"
              >
                {labels.book} <ArrowRight aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={2} />
              </DsButton>
              {phone && (
                <DsButton href={telHref(phone)} size="lg" variant="secondary" className="!border-white/25 !bg-transparent !text-[rgb(var(--ds-footer-ink))] hover:!bg-white/10">
                  <Phone aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} /> {labels.call || `Call ${phone}`}
                </DsButton>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 lg:col-span-5">
            <nav aria-label="Explore" className="min-w-0">
              <h2 className="text-ds-label font-medium uppercase tracking-[0.08em] text-[rgb(var(--ds-footer-ink-2))]">Explore</h2>
              <ul className="mt-3 space-y-0.5">
                <li>
                  <Link to={base} onClick={() => { if (isDoctorHome) dsScrollToTop(); }} className={linkClass}>Home</Link>
                </li>
                {quickLinks.map((item) => (
                  <li key={item.target}>
                    <Link to={sectionHref(item.target)} onClick={(event) => jump(event, item.target)} className={linkClass}>{item.label}</Link>
                  </li>
                ))}
                {(settings?.show_blog !== false || isArticleRoute) && (
                  <li><Link to={`${base}/blog`} className={linkClass}>Health articles</Link></li>
                )}
                <li><Link to={`${base}/manage`} className={linkClass}>My appointment</Link></li>
              </ul>
            </nav>

            <div className="min-w-0">
              <h2 className="text-ds-label font-medium uppercase tracking-[0.08em] text-[rgb(var(--ds-footer-ink-2))]">Contact</h2>
              <ul className="mt-3 space-y-1 text-ds-small text-[rgb(var(--ds-footer-ink-2))]">
                {phone && (
                  <li><a href={telHref(phone)} className="inline-flex min-h-11 items-center gap-2 hover:text-[rgb(var(--ds-footer-ink))]"><Phone aria-hidden="true" className="h-4 w-4 shrink-0" />{phone}</a></li>
                )}
                {email && (
                  <li><a href={`mailto:${email}`} className="inline-flex min-h-11 items-center gap-2 break-all hover:text-[rgb(var(--ds-footer-ink))]"><Mail aria-hidden="true" className="h-4 w-4 shrink-0" />{email}</a></li>
                )}
                {address && (
                  <li>
                    <a href={directions || undefined} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-start gap-2 py-2 leading-snug hover:text-[rgb(var(--ds-footer-ink))]">
                      <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{address}<span className="sr-only"> (opens Google Maps)</span></span>
                    </a>
                  </li>
                )}
                {!phone && !email && !address && <li className="leading-6">Visit the doctor's page for clinic information.</li>}
              </ul>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-8 pt-10 md:flex-row md:items-end md:justify-between">
          <Link to={base} className="inline-flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 ring-1 ring-white/20">
              {profile?.profile_photo_url ? (
                <OptimizedImage src={profile.profile_photo_url} alt="" width={96} height={96} className="h-full w-full object-cover" loading="lazy" decoding="async" />
              ) : (
                <span aria-hidden="true" className="font-ds-display text-xl">{name.replace(/^Dr\.?\s*/i, "").charAt(0)}</span>
              )}
            </span>
            <span>
              <span className="block font-ds-display text-[1.25rem] font-medium leading-tight">{name}</span>
              <span className="block text-ds-small text-[rgb(var(--ds-footer-ink-2))]">{[specialty, clinicLine].filter(Boolean).join(" · ")}</span>
            </span>
          </Link>

          {socials.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Social media">
              {socials.map(({ label, icon: Icon, url }) => (
                <li key={label}>
                  <a href={url || undefined} target="_blank" rel="noreferrer" aria-label={`${label} (opens in a new tab)`} className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 text-[rgb(var(--ds-footer-ink))] transition-colors hover:bg-white/10">
                    <Icon aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-white/[0.12] pt-6 text-ds-label text-[rgb(var(--ds-footer-ink-2))] md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} {name}. All rights reserved.</p>
          <p className="max-w-[48ch]">Health information here is educational and does not replace medical advice.</p>
          <Link to="/" className="inline-flex min-h-11 items-center gap-1.5 font-medium hover:text-[rgb(var(--ds-footer-ink))]">
            Powered by Doctylia <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
