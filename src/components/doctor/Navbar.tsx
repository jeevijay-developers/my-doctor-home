import { useState, useEffect } from "react";
import { Menu, X, MessageCircle, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDoctorData } from "@/contexts/DoctorContext";

const navLinks = ["About", "Services", "Gallery", "Reviews", "Contact"];

const Navbar = () => {
  const { profile, settings } = useDoctorData();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id.toLowerCase())?.scrollIntoView({ behavior: "smooth" });
    setMobileOpen(false);
  };

  const whatsappUrl = settings?.whatsapp_number
    ? `https://wa.me/${settings.whatsapp_number.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(settings.whatsapp_message || "")}`
    : "#";

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "bg-card shadow-md" : "bg-transparent"}`}>
      <div className="container mx-auto flex items-center justify-between py-3 px-4">
        <div className="flex items-center gap-3">
          {profile?.profile_photo_url ? (
            <img src={profile.profile_photo_url} alt={profile.full_name} className="w-10 h-10 rounded-full object-cover border-2 border-royal" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-royal/10 flex items-center justify-center font-heading font-bold text-royal">
              {profile?.full_name?.charAt(0) || "D"}
            </div>
          )}
          <span className="font-heading font-bold text-primary text-lg hidden sm:block">
            Dr. {profile?.full_name || "Doctor"}
          </span>
        </div>

        <div className="hidden lg:flex items-center gap-6">
          {navLinks.map((l) => (
            <button key={l} onClick={() => scrollTo(l)} className="text-sm font-medium text-foreground hover:text-royal transition-colors">
              {l}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {settings?.whatsapp_number && (
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className="w-9 h-9 rounded-lg bg-success flex items-center justify-center text-primary-foreground hover:opacity-90 transition">
              <MessageCircle size={18} />
            </a>
          )}
          <Button size="sm" className="hidden sm:flex gradient-hero text-primary-foreground font-heading font-semibold" onClick={() => scrollTo("booking")}>
            Book Appointment
          </Button>
          <button className="lg:hidden p-2" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden bg-card shadow-lg border-t border-border px-4 pb-4">
          {navLinks.map((l) => (
            <button key={l} onClick={() => scrollTo(l)} className="block w-full text-left py-3 text-foreground font-medium border-b border-border last:border-0">
              {l}
            </button>
          ))}
          <Button className="w-full mt-3 gradient-hero text-primary-foreground font-heading" onClick={() => scrollTo("booking")}>
            Book Appointment
          </Button>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
