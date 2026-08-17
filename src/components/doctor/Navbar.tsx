import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { Menu, X, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDoctorData } from "@/contexts/DoctorContext";
import { supabase } from "@/integrations/supabase/client";
import { usePanelTheme } from "@/hooks/usePanelTheme";
import ThemeToggle from "@/components/ThemeToggle";

const allNavLinks = [
  { label: "Services", target: "services", settingKey: "show_services" },
  { label: "About", target: "about", settingKey: "show_about" },
  { label: "Gallery", target: "gallery", settingKey: "show_gallery" },
  { label: "Reviews", target: "reviews", settingKey: "show_reviews" },
  { label: "Contact", target: "contact", settingKey: null },
];

const Navbar = () => {
  const { profile, settings, services, gallery } = useDoctorData();
  const { slug } = useParams<{ slug: string }>();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hasPublishedBlog, setHasPublishedBlog] = useState(false);
  const { mode, setTheme } = usePanelTheme("doctylia-patient-theme");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!profile?.id) { setHasPublishedBlog(false); return; }
    supabase
      .from("blog_posts")
      .select("id", { count: "exact", head: true })
      .eq("doctor_id", profile.id)
      .eq("is_published", true)
      .then(({ count }) => setHasPublishedBlog((count ?? 0) > 0));
  }, [profile?.id]);

  const scrollTo = (id: string) => {
    document.getElementById(id.toLowerCase())?.scrollIntoView({ behavior: "smooth" });
    setMobileOpen(false);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setMobileOpen(false);
  };

  const whatsappUrl = settings?.whatsapp_number
    ? `https://wa.me/${settings.whatsapp_number.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(settings.whatsapp_message || "")}`
    : "#";

  const showBlogLink = hasPublishedBlog && slug && settings?.show_blog === true;

  const isServicesActive = settings?.show_services !== false && (services?.length || 0) > 0;
  const isAboutActive = settings?.show_about !== false;
  const isGalleryActive = settings?.show_gallery === true && (gallery?.length || 0) > 0;
  const isReviewsActive = settings?.show_reviews !== false;
  const isContactActive = settings?.show_clinic_details !== false;

  const navLinks = [
    { label: "Services", target: "services", show: isServicesActive },
    { label: "About", target: "about", show: isAboutActive },
    { label: "Gallery", target: "gallery", show: isGalleryActive },
    { label: "Reviews", target: "reviews", show: isReviewsActive },
    { label: "Contact", target: "contact", show: isContactActive },
  ].filter((l) => l.show);

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "bg-card/90 backdrop-blur-md shadow-sm border-b border-border" : "bg-transparent border-b border-transparent"}`}>
      <div className="container mx-auto flex items-center justify-between py-3.5 px-4">
        <div className="flex items-center gap-3">
          {profile?.profile_photo_url ? (
            <img src={profile.profile_photo_url} alt={profile.full_name} className="w-10 h-10 rounded-full object-cover ring-2 ring-royal/70 ring-offset-2 ring-offset-background" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-royal/10 flex items-center justify-center font-heading font-bold text-royal ring-2 ring-royal/20">
              {profile?.full_name?.charAt(0) || "D"}
            </div>
          )}
          <span className="font-heading font-bold text-foreground text-lg hidden sm:block">
            Dr. {profile?.full_name || "Doctor"}
          </span>
        </div>

        <div className="hidden lg:flex items-center gap-7">
          <button onClick={scrollToTop} className="text-sm font-semibold text-royal transition-colors">
            Home
          </button>
          {navLinks.slice(0, 2).map((l) => (
            <button key={l.label} onClick={() => scrollTo(l.target)} className="text-sm font-medium text-foreground/80 hover:text-royal transition-colors">
              {l.label}
            </button>
          ))}
          {showBlogLink && (
            <Link to={`/dr/${slug}/blog`} className="text-sm font-medium text-foreground/80 hover:text-royal transition-colors">
              Blog
            </Link>
          )}
          {navLinks.slice(2).map((l) => (
            <button key={l.label} onClick={() => scrollTo(l.target)} className="text-sm font-medium text-foreground/80 hover:text-royal transition-colors">
              {l.label}
            </button>
          ))}
          {slug && (
            <Link to={`/dr/${slug}/manage`} className="text-sm font-medium text-foreground/80 hover:text-royal transition-colors">
              My Appointment
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2">
          {settings?.whatsapp_number && (
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className="w-9 h-9 rounded-full bg-success flex items-center justify-center text-primary-foreground hover:opacity-90 transition shadow-sm">
              <MessageCircle size={18} />
            </a>
          )}
          <ThemeToggle mode={mode} onChange={setTheme} className="hidden sm:flex" />
          <Button size="sm" variant="cta" className="hidden sm:flex font-heading font-semibold" onClick={() => scrollTo("booking")}>
            Book Appointment
          </Button>
          <Link to="/staff-login" className="hidden sm:block">
            <Button size="sm" variant="outline" className="font-heading font-semibold">
              Staff Login
            </Button>
          </Link>
          <button className="lg:hidden p-2 rounded-lg hover:bg-secondary transition-colors" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden bg-card/95 backdrop-blur-md shadow-lg border-t border-border px-4 pb-4">
          <button onClick={scrollToTop} className="block w-full text-left py-3 text-royal font-semibold border-b border-border">
            Home
          </button>
          {navLinks.slice(0, 2).map((l) => (
            <button key={l.label} onClick={() => scrollTo(l.target)} className="block w-full text-left py-3 text-foreground font-medium border-b border-border last:border-0">
              {l.label}
            </button>
          ))}
          {showBlogLink && (
            <Link to={`/dr/${slug}/blog`} onClick={() => setMobileOpen(false)} className="block w-full text-left py-3 text-foreground font-medium border-b border-border">
              Blog
            </Link>
          )}
          {navLinks.slice(2).map((l) => (
            <button key={l.label} onClick={() => scrollTo(l.target)} className="block w-full text-left py-3 text-foreground font-medium border-b border-border last:border-0">
              {l.label}
            </button>
          ))}
          {slug && (
            <Link to={`/dr/${slug}/manage`} onClick={() => setMobileOpen(false)} className="block w-full text-left py-3 text-foreground font-medium border-b border-border">
              My Appointment
            </Link>
          )}
          <Button variant="cta" className="w-full mt-3 font-heading" onClick={() => scrollTo("booking")}>
            Book Appointment
          </Button>
          <Link to="/staff-login" onClick={() => setMobileOpen(false)}>
            <Button variant="outline" className="w-full mt-2 font-heading">
              Staff Login
            </Button>
          </Link>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
