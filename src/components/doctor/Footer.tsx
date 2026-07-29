import { Facebook, Instagram, Youtube, Linkedin, MessageCircle } from "lucide-react";
import { useDoctorData } from "@/contexts/DoctorContext";

const Footer = () => {
  const { profile, settings } = useDoctorData();
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  const whatsappUrl = settings?.whatsapp_number
    ? `https://wa.me/${settings.whatsapp_number.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(settings.whatsapp_message || "")}`
    : null;

  const socialLinks = [
    { icon: Facebook, url: settings?.social_facebook, label: "Facebook" },
    { icon: Instagram, url: settings?.social_instagram, label: "Instagram" },
    { icon: Youtube, url: settings?.social_youtube, label: "YouTube" },
    { icon: Linkedin, url: settings?.social_linkedin, label: "LinkedIn" },
  ].filter((s) => s.url);

  return (
    <>
      <footer className="bg-primary text-primary-foreground pt-14 pb-24 lg:pb-10">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-10">
            <div>
              <h3 className="font-heading font-bold text-xl">Dr. {profile?.full_name || "Doctor"}</h3>
              {profile?.specialization && (
                <p className="text-sm opacity-80 mt-2">{profile.specialization}</p>
              )}
              {profile?.qualifications && (
                <p className="text-sm opacity-70 mt-1">{profile.qualifications}</p>
              )}
              {profile?.clinic_name && (
                <p className="text-sm opacity-70 mt-3">
                  {profile.clinic_name}
                  {profile.city ? `, ${profile.city}` : ""}
                </p>
              )}
            </div>
            <div>
              <h4 className="font-heading font-semibold mb-3 text-sm uppercase tracking-wider opacity-80">Quick Links</h4>
              <div className="grid grid-cols-2 gap-y-2 text-sm opacity-80">
                {["About", "Services", "Reviews", "Contact"].map((l) => (
                  <button key={l} onClick={() => scrollTo(l.toLowerCase())} className="text-left hover:opacity-100 hover:underline transition">
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-heading font-semibold mb-3 text-sm uppercase tracking-wider opacity-80">Connect</h4>
              <div className="flex gap-2 flex-wrap">
                {socialLinks.map(({ icon: Icon, url, label }, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={label}
                    className="w-10 h-10 rounded-full bg-primary-foreground/10 flex items-center justify-center hover:bg-primary-foreground/20 transition-colors"
                  >
                    <Icon size={17} />
                  </a>
                ))}
                {socialLinks.length === 0 && (
                  <p className="text-xs opacity-60">Social links not available.</p>
                )}
              </div>
            </div>
          </div>
          <div className="border-t border-primary-foreground/10 mt-10 pt-6 flex flex-col md:flex-row justify-between items-center gap-3 text-xs opacity-60">
            <p>© {new Date().getFullYear()} Dr. {profile?.full_name}. All Rights Reserved.</p>
            <p>Powered by Doctylia</p>
            <p className="opacity-70">For educational purposes only. Consult your doctor.</p>
          </div>
        </div>
      </footer>

      {whatsappUrl && (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="Chat on WhatsApp"
          className="hidden lg:flex fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-success shadow-xl items-center justify-center hover:scale-110 transition-transform"
        >
          <MessageCircle size={26} className="text-primary-foreground" />
        </a>
      )}
    </>
  );
};

export default Footer;
