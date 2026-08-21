import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowRight, CalendarDays, ChevronRight, Facebook, HeartPulse, Instagram, Linkedin, MapPin, Phone, Youtube } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { useDoctorData } from "@/contexts/DoctorContext";
import { scrollToSection } from "@/lib/scrollToSection";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;

type FooterProps = {
  profileOverride?: Profile | null;
};

const doctorDisplayName = (profile: Profile | null) => {
  const name = (profile?.display_name || profile?.full_name || "Doctor").trim();
  return /^dr\.?\s/i.test(name) ? name : `Dr. ${name}`;
};

const Footer = ({ profileOverride }: FooterProps) => {
  const doctorData = useDoctorData();
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const profile = profileOverride ?? doctorData.profile;
  const settings = profileOverride ? null : doctorData.settings;
  const services = profileOverride ? [] : doctorData.services;
  const gallery = profileOverride ? [] : doctorData.gallery;
  const doctorName = doctorDisplayName(profile);
  const doctorBasePath = `/dr/${slug || profile?.slug || ""}`;
  const isDoctorHome = location.pathname === doctorBasePath;
  const isArticleRoute = location.pathname.includes("/blog");
  const phone = profile?.clinic_phone || profile?.phone || "";
  const address = [profile?.address, profile?.city, profile?.state].filter(Boolean).join(", ");
  const clinicLine = [profile?.clinic_name, profile?.city].filter(Boolean).join(", ");

  const whatsappUrl = settings?.whatsapp_number
    ? `https://wa.me/${settings.whatsapp_number.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(settings.whatsapp_message || "")}`
    : null;

  const socialLinks = [
    { label: "Facebook", icon: Facebook, url: settings?.social_facebook },
    { label: "Instagram", icon: Instagram, url: settings?.social_instagram },
    { label: "YouTube", icon: Youtube, url: settings?.social_youtube },
    { label: "LinkedIn", icon: Linkedin, url: settings?.social_linkedin },
  ].filter((item) => Boolean(item.url));

  const quickLinks = [
    { label: "About", target: "about", show: settings?.show_about !== false },
    { label: "Medical Services", target: "services", show: settings?.show_services !== false && (services.length > 0 || isArticleRoute) },
    { label: "Our Clinic", target: "gallery", show: settings?.show_gallery === true && gallery.length > 0 },
    { label: "Patient Reviews", target: "reviews", show: settings?.show_reviews !== false },
    { label: "Contact", target: "contact", show: settings?.show_clinic_details !== false },
  ].filter((item) => item.show);

  const sectionLink = (target: string) => `${doctorBasePath}#${target}`;
  const handleSectionClick = (event: React.MouseEvent<HTMLAnchorElement>, target: string) => {
    if (!isDoctorHome) return;
    event.preventDefault();
    scrollToSection(target);
  };

  return (
    <>
      <footer className="relative overflow-hidden bg-[#061b33] text-white">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-[#3C83FC]/15 blur-3xl" />
        <div className="absolute -bottom-48 left-1/4 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-5 pb-8 pt-10 sm:px-8 sm:pt-14 lg:px-10">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-r from-[#155ba5] to-[#3C83FC] p-6 shadow-[0_20px_55px_rgba(0,0,0,0.2)] sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-10">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em] text-blue-100">
                <HeartPulse className="h-4 w-4" /> Compassionate medical care
              </span>
              <h2 className="mt-3 font-heading text-2xl font-black leading-tight sm:text-3xl">Your health deserves expert attention.</h2>
              <p className="mt-2 text-sm leading-6 text-blue-50 sm:text-base">Book a consultation with {doctorName} and take the next step toward better health.</p>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:mt-0 lg:shrink-0">
              <Link
                to={sectionLink("booking")}
                onClick={(event) => handleSectionClick(event, "booking")}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-extrabold text-[#0b3765] shadow-lg transition hover:-translate-y-0.5 hover:bg-blue-50"
              >
                <CalendarDays className="h-4 w-4 text-[#3C83FC]" /> Book Appointment
              </Link>
              {phone && (
                <a href={`tel:${phone}`} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/40 bg-white/10 px-5 py-3 text-sm font-extrabold text-white backdrop-blur transition hover:bg-white/20">
                  <Phone className="h-4 w-4" /> Call Clinic
                </a>
              )}
            </div>
          </div>

          <div className={`grid gap-10 py-12 sm:grid-cols-2 ${services.length > 0 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
            <div className="sm:col-span-2 lg:col-span-1">
              <Link to={doctorBasePath} className="inline-flex items-center gap-3">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white/10 shadow-lg">
                  {profile?.profile_photo_url ? (
                    <img src={profile.profile_photo_url} alt={doctorName} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <HeartPulse className="h-7 w-7 text-[#3C83FC]" />
                  )}
                </span>
                <span>
                  <span className="block font-heading text-lg font-extrabold leading-tight">{doctorName}</span>
                  <span className="mt-1 block text-xs font-medium text-blue-200">{profile?.specialization || "Medical Professional"}</span>
                </span>
              </Link>
              {profile?.qualifications && <p className="mt-4 max-w-xs text-sm leading-6 text-slate-300">{profile.qualifications}</p>}
              {clinicLine && <p className="mt-1 max-w-xs text-sm leading-6 text-slate-400">{clinicLine}</p>}
              {socialLinks.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {socialLinks.map(({ label, icon: Icon, url }) => (
                    <a key={label} href={url || undefined} target="_blank" rel="noreferrer" aria-label={`Visit ${label}`} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-blue-100 transition hover:-translate-y-0.5 hover:border-[#3C83FC] hover:bg-[#3C83FC] hover:text-white">
                      <Icon className="h-4 w-4" />
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="font-heading text-sm font-extrabold uppercase tracking-[0.12em] text-white">Explore</h3>
              <nav className="mt-5 space-y-3" aria-label="Footer navigation">
                <Link to={doctorBasePath} onClick={() => { if (isDoctorHome) window.scrollTo({ top: 0, behavior: "smooth" }); }} className="group flex items-center gap-2 text-sm text-slate-300 transition hover:text-white">
                  <ChevronRight className="h-4 w-4 text-[#3C83FC] transition-transform group-hover:translate-x-0.5" /> Home
                </Link>
                {quickLinks.map((item) => (
                  <Link key={item.target} to={sectionLink(item.target)} onClick={(event) => handleSectionClick(event, item.target)} className="group flex items-center gap-2 text-sm text-slate-300 transition hover:text-white">
                    <ChevronRight className="h-4 w-4 text-[#3C83FC] transition-transform group-hover:translate-x-0.5" /> {item.label}
                  </Link>
                ))}
                {(settings?.show_blog || isArticleRoute) && (
                  <Link to={`${doctorBasePath}/blog`} className="group flex items-center gap-2 text-sm text-slate-300 transition hover:text-white">
                    <ChevronRight className="h-4 w-4 text-[#3C83FC] transition-transform group-hover:translate-x-0.5" /> Health Articles
                  </Link>
                )}
              </nav>
            </div>

            {services.length > 0 && (
              <div>
                <h3 className="font-heading text-sm font-extrabold uppercase tracking-[0.12em] text-white">Medical Services</h3>
                <div className="mt-5 space-y-3">
                  {services.slice(0, 5).map((service) => (
                    <Link key={service.id} to={sectionLink("services")} onClick={(event) => handleSectionClick(event, "services")} className="group flex items-start gap-2 text-sm leading-5 text-slate-300 transition hover:text-white">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#3C83FC]" />
                      <span>{service.name?.trim() || "Consultation"}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="font-heading text-sm font-extrabold uppercase tracking-[0.12em] text-white">Clinic Contact</h3>
              <div className="mt-5 space-y-4 text-sm text-slate-300">
                {phone && (
                  <a href={`tel:${phone}`} className="group flex items-start gap-3 transition hover:text-white">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#3C83FC]/15 text-[#79aaff] transition group-hover:bg-[#3C83FC] group-hover:text-white"><Phone className="h-4 w-4" /></span>
                    <span className="pt-2 break-all">{phone}</span>
                  </a>
                )}
                {address && (
                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer" className="group flex items-start gap-3 transition hover:text-white">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#3C83FC]/15 text-[#79aaff] transition group-hover:bg-[#3C83FC] group-hover:text-white"><MapPin className="h-4 w-4" /></span>
                    <span className="pt-1 leading-6">{address}</span>
                  </a>
                )}
                {!phone && !address && <p className="leading-6 text-slate-400">Visit the doctor profile for current clinic information.</p>}
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 pt-7">
            <div className="flex flex-col items-center justify-between gap-4 text-center text-xs text-slate-400 md:flex-row md:text-left">
              <p>© {new Date().getFullYear()} {doctorName}. All rights reserved.</p>
              <Link to="/" className="inline-flex items-center gap-1.5 font-semibold text-blue-200 transition hover:text-white">Powered by Doctylia <ArrowRight className="h-3.5 w-3.5" /></Link>
              <p>Health information is educational and does not replace medical advice.</p>
            </div>
          </div>
        </div>
      </footer>

      {whatsappUrl && (
        <a href={whatsappUrl} target="_blank" rel="noreferrer" aria-label="Chat with the clinic on WhatsApp" className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full drop-shadow-xl transition duration-300 hover:-translate-y-1 hover:scale-105 sm:bottom-6 sm:right-6">
          <WhatsAppIcon className="h-14 w-14" />
        </a>
      )}
    </>
  );
};

export default Footer;
