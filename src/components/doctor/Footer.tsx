import { Facebook, Instagram, Youtube, Linkedin, MessageCircle } from "lucide-react";
import { useDoctorData } from "@/contexts/DoctorContext";

const Footer = () => {
  const { profile, settings } = useDoctorData();
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

  return (
    <>
      <footer className="bg-primary text-primary-foreground py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h3 className="font-heading font-bold text-xl mb-2">Dr. {profile?.full_name || "Doctor"}</h3>
              <p className="text-sm opacity-80">{profile?.specialization} · {profile?.qualifications}</p>
              {profile?.clinic_name && <p className="text-sm opacity-80 mt-1">{profile.clinic_name}{profile.city ? `, ${profile.city}` : ""}</p>}
            </div>
            <div>
              <h4 className="font-heading font-semibold mb-3">Quick Links</h4>
              <div className="space-y-2 text-sm opacity-80">
                {["About", "Services", "Gallery", "Reviews", "Contact"].map((l) => (
                  <button key={l} onClick={() => scrollTo(l.toLowerCase())} className="block hover:opacity-100 transition-opacity">{l}</button>
                ))}
              </div>
            </div>
            <div>
              {socialLinks.length > 0 && (
                <>
                  <h4 className="font-heading font-semibold mb-3">Follow Us</h4>
                  <div className="flex gap-3">
                    {socialLinks.map(({ icon: Icon, url }, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-lg bg-primary-foreground/10 flex items-center justify-center hover:bg-primary-foreground/20 transition-colors">
                        <Icon size={18} />
                      </a>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="border-t border-primary-foreground/10 mt-8 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-xs opacity-60">© {new Date().getFullYear()} Dr. {profile?.full_name}. All Rights Reserved.</p>
            <p className="text-xs opacity-40">Powered by Doctylia</p>
            <p className="text-xs opacity-40">For educational purposes only. Consult your doctor.</p>
          </div>
        </div>
      </footer>

      {whatsappUrl && (
        <a href={whatsappUrl} target="_blank" rel="noreferrer"
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-success shadow-xl flex items-center justify-center hover:scale-110 transition-transform">
          <MessageCircle size={26} className="text-primary-foreground" />
        </a>
      )}
    </>
  );
};

export default Footer;
