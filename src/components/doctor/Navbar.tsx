import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { Menu, X, Moon, Sun, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDoctorData } from "@/contexts/DoctorContext";
import { supabase } from "@/integrations/supabase/client";
import { usePanelTheme } from "@/hooks/usePanelTheme";

const DEFAULT_AVATAR = "https://lh3.googleusercontent.com/aida-public/AB6AXuClyFEerp4mAd3k1VHT2_ClTS4H1V1BmPJkNVr37q5OOjti61-JQUkFAbyfeWKvo6ML3RO8g0cOSiBFAZ_M3hr8OkEJHKAXd2ghxJPkeqXf1--VXbE2MdghyYalIdnll8fHn_jFT0D1348IzPSnm3J4ouWgd0Af9lf1EIr4GvtpG_atHK1cR82IwImf6HuP7nrsJGUWE3ErViCFvFykM9nJLqxT9sA-w-2mYn_vQ1-cDdfOQP_aCOT_";

const Navbar = () => {
  const { profile, settings, services, gallery } = useDoctorData();
  const { slug } = useParams<{ slug: string }>();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hasPublishedBlog, setHasPublishedBlog] = useState(false);
  const { mode, setTheme } = usePanelTheme("doctylia-patient-theme");

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

  const docName = profile?.full_name ? `Dr. ${profile.full_name}` : "Dr. Rajkumar Prajapati";
  const docSpec = profile?.specialization || "General Physician";
  const avatarSrc = profile?.profile_photo_url || DEFAULT_AVATAR;

  const toggleTheme = () => {
    setTheme(mode === "dark" ? "light" : "dark");
  };

  return (
    <header className="sticky top-0 z-50 bg-white dark:bg-card shadow-sm px-4 py-3 border-b border-border/40">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer" onClick={scrollToTop}>
          <img
            src={avatarSrc}
            alt={docName}
            className="w-10 h-10 rounded-full object-cover shrink-0"
          />
          <div>
            <h1 className="text-sm font-semibold text-text-dark dark:text-foreground leading-tight">
              {docName}
            </h1>
            <p className="text-xs text-text-muted dark:text-muted-foreground">{docSpec}</p>
          </div>
        </div>

        {/* Desktop links */}
        <div className="hidden lg:flex items-center gap-6">
          <button onClick={scrollToTop} className="text-sm font-semibold text-primary-600 hover:text-primary-500 transition-colors">
            Home
          </button>
          {navLinks.map((l) => (
            <button key={l.label} onClick={() => scrollTo(l.target)} className="text-sm font-medium text-text-dark dark:text-foreground hover:text-primary-600 transition-colors">
              {l.label}
            </button>
          ))}
          {showBlogLink && (
            <Link to={`/dr/${slug}/blog`} className="text-sm font-medium text-text-dark dark:text-foreground hover:text-primary-600 transition-colors">
              Blog
            </Link>
          )}
          {slug && (
            <Link to={`/dr/${slug}/manage`} className="text-sm font-medium text-text-dark dark:text-foreground hover:text-primary-600 transition-colors">
              My Appointment
            </Link>
          )}
        </div>

        <div className="flex items-center gap-3 text-text-muted">
          {settings?.whatsapp_number && (
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-full bg-success flex items-center justify-center text-white hover:opacity-90 transition shadow-sm">
              <MessageCircle size={16} />
            </a>
          )}
          <button
            aria-label="Dark Mode Toggle"
            onClick={toggleTheme}
            className="p-1.5 rounded-lg hover:bg-surface-light dark:hover:bg-muted text-text-muted dark:text-foreground transition-colors"
          >
            {mode === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <Button size="sm" variant="cta" className="hidden sm:flex font-heading font-semibold text-xs py-2 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 text-white" onClick={() => scrollTo("booking")}>
            Book Appointment
          </Button>
          <Button asChild size="sm" variant="cta" className="hidden sm:flex font-heading font-semibold text-xs py-2 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 text-white">
            <Link to="/staff-login">Staff Login</Link>
          </Button>
          <button
            aria-label="Menu"
            className="lg:hidden p-1.5 rounded-lg hover:bg-surface-light dark:hover:bg-muted text-text-muted dark:text-foreground transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="mt-3 pt-3 border-t border-border/40 space-y-2 bg-white dark:bg-card px-2 pb-2">
          <button onClick={scrollToTop} className="block w-full text-left py-2 text-primary-600 font-semibold border-b border-border/30">
            Home
          </button>
          {navLinks.map((l) => (
            <button key={l.label} onClick={() => scrollTo(l.target)} className="block w-full text-left py-2 text-text-dark dark:text-foreground font-medium border-b border-border/30">
              {l.label}
            </button>
          ))}
          {showBlogLink && (
            <Link to={`/dr/${slug}/blog`} onClick={() => setMobileOpen(false)} className="block w-full text-left py-2 text-text-dark dark:text-foreground font-medium border-b border-border/30">
              Blog
            </Link>
          )}
          {slug && (
            <Link to={`/dr/${slug}/manage`} onClick={() => setMobileOpen(false)} className="block w-full text-left py-2 text-text-dark dark:text-foreground font-medium border-b border-border/30">
              My Appointment
            </Link>
          )}
          <button
            onClick={() => scrollTo("booking")}
            className="w-full mt-2 bg-primary-500 hover:bg-primary-600 text-white text-xs font-semibold py-2.5 rounded-lg shadow-sm"
          >
            Book Appointment
          </button>
          <Link
            to="/staff-login"
            onClick={() => setMobileOpen(false)}
            className="block w-full mt-2 bg-primary-500 hover:bg-primary-600 text-white text-xs font-semibold py-2.5 rounded-lg shadow-sm text-center"
          >
            Staff Login
          </Link>
        </div>
      )}
    </header>
  );
};

export default Navbar;
