import { Facebook, Instagram, Youtube, Linkedin, MessageCircle, Phone, MapPin } from "lucide-react";
import { useDoctorData } from "@/contexts/DoctorContext";

const DEFAULT_SERVICES = ["abc", "xdvzdfvdf", "mmmm", "99999"];

const Footer = () => {
  const { profile, settings, services, gallery } = useDoctorData();
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  const whatsappUrl = settings?.whatsapp_number
    ? `https://wa.me/${settings.whatsapp_number.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(settings.whatsapp_message || "")}`
    : null;

  const socialLinks = [
    { icon: Facebook, url: settings?.social_facebook },
    { icon: Instagram, url: settings?.social_instagram },
    { icon: Youtube, url: settings?.social_youtube },
    { icon: Linkedin, url: settings?.social_linkedin },
  ].filter((s) => s.url);

  const isServicesActive = settings?.show_services !== false && (services?.length || 0) > 0;
  const isAboutActive = settings?.show_about !== false;
  const isGalleryActive = settings?.show_gallery === true && (gallery?.length || 0) > 0;
  const isReviewsActive = settings?.show_reviews !== false;
  const isContactActive = settings?.show_clinic_details !== false;

  const quickLinks = [
    { label: "About", target: "about", show: isAboutActive },
    { label: "Services", target: "services", show: isServicesActive },
    { label: "Gallery", target: "gallery", show: isGalleryActive },
    { label: "Reviews", target: "reviews", show: isReviewsActive },
    { label: "Contact", target: "contact", show: isContactActive },
  ].filter((l) => l.show);

  const docName = profile?.full_name ? `Dr. ${profile.full_name}` : "Dr. Rajkumar Prajapati";
  const docSpec = profile?.specialization || "General Physician";
  const docQual = profile?.qualifications || "MBBS MD";
  const clinicLoc = [profile?.clinic_name || "Sunrise", profile?.city || "Kota"].filter(Boolean).join(", ");
  const addressText = [profile?.address, profile?.city].filter(Boolean).join(", ") || "xyz, Kota";
  const phoneText = profile?.phone || "9752430783";

  const serviceNames = services && services.length > 0
    ? services.slice(0, 4).map((s: any) => s.name?.trim() || "Consultation")
    : DEFAULT_SERVICES;

  return (
    <>
      {/* MOBILE VIEW (md:hidden) */}
      <div className="md:hidden">
        <footer className="bg-surface-light dark:bg-gray-950 pt-6">
          <div className="wave-bg text-white px-6 pt-10 pb-6 mt-6">
            <div className="grid grid-cols-2 gap-8 mb-8">
              <div>
                <h4 className="font-bold text-lg mb-1">{docName}</h4>
                <p className="text-[10px] text-blue-100 mb-4 opacity-90 leading-relaxed">
                  {docSpec} - {docQual}<br />
                  {clinicLoc}
                </p>
                <h5 className="font-semibold text-sm mb-2 mt-4">Services</h5>
                <ul className="space-y-1.5 text-xs text-blue-100 opacity-90">
                  {serviceNames.map((sName, i) => (
                    <li key={i}>
                      <button onClick={() => scrollTo("services")} className="hover:text-white transition-colors text-left">
                        {sName}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h5 className="font-semibold text-sm mb-3">Quick Links</h5>
                <ul className="space-y-2 text-xs text-blue-100 opacity-90 mb-6">
                  <li><button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="hover:text-white">Home</button></li>
                  <li><button onClick={() => scrollTo("about")} className="hover:text-white">About</button></li>
                  <li><button onClick={() => scrollTo("services")} className="hover:text-white">Services</button></li>
                  <li><button onClick={() => scrollTo("gallery")} className="hover:text-white">Gallery</button></li>
                  <li><button onClick={() => scrollTo("reviews")} className="hover:text-white">Reviews</button></li>
                  <li><button onClick={() => scrollTo("contact")} className="hover:text-white">Contact</button></li>
                </ul>
                <h5 className="font-semibold text-sm mb-3">Contact Info</h5>
                <div className="space-y-2 text-xs text-blue-100 opacity-90">
                  <p className="flex items-center gap-2">
                    <Phone size={12} className="shrink-0" /> {phoneText}
                  </p>
                  <p className="flex items-center gap-2">
                    <MapPin size={12} className="shrink-0" /> {addressText}
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-blue-400/30 pt-6 text-center text-[10px] text-blue-100 opacity-80 space-y-2">
              <p>© {new Date().getFullYear()} {docName}. All Rights Reserved.</p>
              <p>Powered by Doctylia</p>
              <p>For educational purposes only. Consult your doctor.</p>
            </div>
          </div>
        </footer>
      </div>

      {/* DESKTOP VIEW (hidden md:block) */}
      <div className="hidden md:block">
        <footer className="relative bg-primary text-primary-foreground py-12">
          <svg
            className="absolute -top-px left-0 w-full h-10 md:h-14"
            viewBox="0 0 1440 60"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M0,32 C240,64 480,0 720,20 C960,40 1200,8 1440,28 L1440,0 L0,0 Z"
              className="fill-background"
            />
          </svg>
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-6 sm:gap-8">
              <div className="space-y-6 md:space-y-0 md:contents min-w-0">
                <div className="min-w-0 md:order-1">
                  <h3 className="font-heading font-bold text-lg sm:text-xl mb-2 break-words">Dr. {profile?.full_name || "Doctor"}</h3>
                  <p className="text-sm opacity-80 break-words">{profile?.specialization} · {profile?.qualifications}</p>
                  {profile?.clinic_name && <p className="text-sm opacity-80 mt-1 break-words">{profile.clinic_name}{profile.city ? `, ${profile.city}` : ""}</p>}
                  {socialLinks.length > 0 && (
                    <div className="flex flex-wrap gap-2.5 mt-4">
                      {socialLinks.map(({ icon: Icon, url }, i) => (
                        <a key={i} href={url} target="_blank" rel="noreferrer" className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-primary-foreground/10 flex items-center justify-center hover:bg-primary-foreground/20 transition-colors">
                          <Icon size={16} />
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {isServicesActive && services.length > 0 && (
                  <div className="min-w-0 md:order-3">
                    <h4 className="font-heading font-semibold mb-3">Services</h4>
                    <div className="space-y-2 text-sm opacity-80">
                      {services.slice(0, 5).map((s: any) => (
                        <button key={s.id} onClick={() => scrollTo("services")} className="block text-left hover:opacity-100 transition-opacity truncate max-w-full">
                          {s.name?.trim() || "Consultation"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-6 md:space-y-0 md:contents min-w-0">
                <div className="min-w-0 md:order-2">
                  <h4 className="font-heading font-semibold mb-3">Quick Links</h4>
                  <div className="space-y-2 text-sm opacity-80">
                    <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="block hover:opacity-100 transition-opacity text-left">Home</button>
                    {quickLinks.map((l) => (
                      <button key={l.label} onClick={() => scrollTo(l.target)} className="block hover:opacity-100 transition-opacity text-left">{l.label}</button>
                    ))}
                  </div>
                </div>

                <div className="min-w-0 md:order-4">
                  <h4 className="font-heading font-semibold mb-3">Contact Info</h4>
                  <div className="space-y-2.5 text-sm opacity-80">
                    {profile?.phone && (
                      <a href={`tel:${profile.phone}`} className="flex items-center gap-2 hover:opacity-100 transition-opacity min-w-0 break-all">
                        <Phone size={14} className="shrink-0" /> <span className="truncate">{profile.phone}</span>
                      </a>
                    )}
                    {profile?.address && (
                      <p className="flex items-start gap-2 min-w-0 break-words">
                        <MapPin size={14} className="shrink-0 mt-0.5" />
                        <span>{profile.address}{profile.city ? `, ${profile.city}` : ""}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-primary-foreground/10 mt-8 pt-6 flex flex-col md:flex-row justify-between items-center gap-4 text-center md:text-left">
              <p className="text-xs opacity-60">© {new Date().getFullYear()} Dr. {profile?.full_name}. All Rights Reserved.</p>
              <p className="text-xs opacity-40">Powered by Doctylia</p>
              <p className="text-xs opacity-40">For educational purposes only. Consult your doctor.</p>
            </div>
          </div>
        </footer>
      </div>

      {whatsappUrl && (
        <a href={whatsappUrl} target="_blank" rel="noreferrer"
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-success shadow-xl flex items-center justify-center hover:scale-110 transition-transform">
          <MessageCircle size={26} className="text-white" />
        </a>
      )}
    </>
  );
};

export default Footer;
