import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { Menu, X, Moon, Sun } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useDoctorData } from "@/contexts/DoctorContext";
import { supabase } from "@/integrations/supabase/client";
import { usePanelTheme } from "@/hooks/usePanelTheme";
import { scrollToSection } from "@/lib/scrollToSection";

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

  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileOpen]);

  const scrollTo = (id: string) => {
    setMobileOpen(false);
    requestAnimationFrame(() => requestAnimationFrame(() => scrollToSection(id.toLowerCase())));
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setMobileOpen(false);
  };



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
  ].filter((link) => link.show);

  const docName = profile?.full_name ? `Dr. ${profile.full_name}` : "Dr. Rajkumar Prajapati";
  const docSpec = profile?.specialization || "General Physician";
  const avatarSrc = profile?.profile_photo_url || DEFAULT_AVATAR;

  const toggleTheme = () => {
    setTheme(mode === "dark" ? "light" : "dark");
  };

  const mobileLinkClass = "block w-full border-b border-border/50 px-1 py-3.5 text-left text-base font-medium text-text-dark transition-colors hover:text-primary-600 dark:text-foreground";

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-[60] h-16 border-b border-border/40 bg-white/95 px-4 shadow-sm backdrop-blur-md dark:bg-card/95">
        <div className="container mx-auto flex h-full items-center justify-between px-0">
          <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={scrollToTop}>
            <img
              src={avatarSrc}
              alt={docName}
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold leading-tight text-text-dark dark:text-foreground">
                {docName}
              </span>
              <span className="block truncate text-xs text-text-muted dark:text-muted-foreground">{docSpec}</span>
            </span>
          </button>

          <nav className="hidden items-center gap-6 lg:flex" aria-label="Primary navigation">
            <button onClick={scrollToTop} className="text-sm font-semibold text-primary-600 transition-colors hover:text-primary-500">
              Home
            </button>
            {navLinks.map((link) => (
              <button key={link.label} onClick={() => scrollTo(link.target)} className="text-sm font-medium text-text-dark transition-colors hover:text-primary-600 dark:text-foreground">
                {link.label}
              </button>
            ))}
            {showBlogLink && (
              <Link to={`/dr/${slug}/blog`} className="text-sm font-medium text-text-dark transition-colors hover:text-primary-600 dark:text-foreground">
                Blog
              </Link>
            )}
            {slug && (
              <Link to={`/dr/${slug}/manage`} className="text-sm font-medium text-text-dark transition-colors hover:text-primary-600 dark:text-foreground">
                My Appointment
              </Link>
            )}
          </nav>

          <div className="flex shrink-0 items-center gap-2 text-text-muted sm:gap-3">
            <button
              aria-label="Toggle dark mode"
              onClick={toggleTheme}
              className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-light dark:text-foreground dark:hover:bg-muted"
            >
              {mode === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <Button size="sm" variant="cta" className="hidden rounded-lg bg-primary-500 px-4 py-2 font-heading text-xs font-semibold text-white hover:bg-primary-600 sm:flex" onClick={() => scrollTo("booking")}>
              Book Appointment
            </Button>
            <Button asChild size="sm" variant="cta" className="hidden rounded-lg bg-primary-500 px-4 py-2 font-heading text-xs font-semibold text-white hover:bg-primary-600 sm:flex">
              <Link to="/staff-login">Staff Login</Link>
            </Button>
            <button
              type="button"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation"
              className="rounded-lg border border-amber-400 p-1.5 text-text-muted transition-colors hover:bg-surface-light dark:text-foreground dark:hover:bg-muted lg:hidden"
              onClick={() => setMobileOpen((open) => !open)}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      <div className="h-16" aria-hidden="true" />

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Close menu"
              className="fixed inset-x-0 bottom-0 top-16 z-40 cursor-default bg-slate-950/35 backdrop-blur-[2px] lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              id="mobile-navigation"
              className="fixed bottom-0 right-0 top-16 z-50 flex w-[min(88vw,360px)] flex-col border-l border-border bg-white shadow-[-18px_0_45px_rgba(15,23,42,0.18)] dark:bg-card lg:hidden"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.85 }}
              role="dialog"
              aria-modal="true"
              aria-label="Mobile navigation"
            >
              <nav className="flex-1 overflow-y-auto px-6 pb-6 pt-4" aria-label="Mobile navigation links">
                <button onClick={scrollToTop} className={`${mobileLinkClass} font-semibold text-primary-600`}>
                  Home
                </button>
                {navLinks.map((link) => (
                  <button key={link.label} onClick={() => scrollTo(link.target)} className={mobileLinkClass}>
                    {link.label}
                  </button>
                ))}
                {showBlogLink && (
                  <Link to={`/dr/${slug}/blog`} onClick={() => setMobileOpen(false)} className={mobileLinkClass}>
                    Blog
                  </Link>
                )}
                {slug && (
                  <Link to={`/dr/${slug}/manage`} onClick={() => setMobileOpen(false)} className={mobileLinkClass}>
                    My Appointment
                  </Link>
                )}
              </nav>

              <div className="space-y-3 border-t border-border bg-slate-50 p-6 dark:bg-gray-900/60">
                <button
                  onClick={() => scrollTo("booking")}
                  className="w-full rounded-xl bg-primary-500 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-600"
                >
                  Book Appointment
                </button>
                <Link
                  to="/staff-login"
                  onClick={() => setMobileOpen(false)}
                  className="block w-full rounded-xl border border-primary-500 bg-white py-3 text-center text-sm font-semibold text-primary-600 transition-colors hover:bg-primary-50 dark:bg-card"
                >
                  Staff Login
                </Link>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default Navbar;
