import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring } from "framer-motion";
import { CalendarCheck2, Menu, Moon, Sun, X } from "lucide-react";
import OptimizedImage from "@/components/shared/OptimizedImage";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { useDoctorData } from "@/contexts/DoctorContext";
import { dsCn as cn } from "./ui/dsCn";
import { doctorName, siteLabels } from "@/lib/doctorSite/doctorFacts";
import { clinicDisplayName, initialsOf } from "@/lib/doctorSite/teamClinic";
import DsButton from "./ui/DsButton";
import { useActiveSection } from "./ui/useActiveSection";
import { dsScrollTo, dsScrollToTop } from "./motion/scroll";
import { bookNow, useDoctorTheme } from "./siteActions";
import { DUR, EASE } from "./motion/tokens";

const Monogram = ({ name }: { name: string }) => {
  const initials = initialsOf(name);
  return (
    <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ds-accent-soft font-ds-display text-lg font-medium text-ds-accent-ink">
      {initials || "Dr"}
    </span>
  );
};

const Navbar = () => {
  const { profile, settings, isTeamClinic } = useDoctorData();
  // A clinic with several doctors is led by the clinic, not by its owner.
  const team = isTeamClinic === true;
  const labels = siteLabels(settings);
  const { slug } = useParams<{ slug: string }>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { isDark, toggle } = useDoctorTheme();
  const { scrollY, scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.4 });
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 24));

  const name = team ? clinicDisplayName(profile) : doctorName(profile);
  const specialty = team
    ? (profile?.locality || profile?.city || "").trim()
    : (profile?.specialization ?? "").trim();
  const avatar = team ? "" : profile?.profile_photo_url || "";

  // Four links only, in page order: About, Articles, Contact (plus My appointment below).
  // "Contact" goes to Clinic details & contact, or to the question form if the doctor hides that section.
  const links = useMemo(
    () =>
      (team
        ? [
            { label: "Doctors", target: "doctors", show: true },
            { label: "Services", target: "services", show: settings?.show_services !== false },
            { label: "Reviews", target: "reviews", show: settings?.show_reviews !== false },
            { label: "Articles", target: "blog", show: settings?.show_blog !== false },
            { label: "Contact", target: settings?.show_clinic_details !== false ? "contact" : "ask", show: true },
          ]
        : [
            { label: "About", target: "about", show: settings?.show_about !== false },
            { label: "Articles", target: "blog", show: settings?.show_blog !== false },
            { label: "Contact", target: settings?.show_clinic_details !== false ? "contact" : "ask", show: true },
          ]
      ).filter((l) => l.show),
    [settings, team],
  );
  const active = useActiveSection(links.map((l) => l.target));

  const go = (target: string) => {
    setMenuOpen(false);
    // Let the drawer start closing (and release its scroll lock) before scrolling.
    window.setTimeout(() => dsScrollTo(target, { focusSelector: "h2" }), menuOpen ? 220 : 0);
  };

  const manageHref = slug ? `/dr/${slug}/manage` : null;

  return (
    <>
      <header
        className={cn(
          // Frosted glass: a full-width bar on phones, a floating pill from md. The glass is dense
          // (ds-glass-strong) so text under it never competes with the links after a fast jump.
          "pointer-events-none fixed inset-x-0 top-0 z-50 md:px-4 md:pt-3",
        )}
      >
        <div
          className={cn(
            "ds-glass ds-glass-strong pointer-events-auto relative mx-auto flex h-16 max-w-[1200px] items-center gap-4 px-4 transition-shadow duration-ds-2 ease-ds-out sm:px-6 md:rounded-full md:pl-3 md:pr-2 lg:grid lg:grid-cols-[1fr_auto_1fr]",
            scrolled && "shadow-ds-2",
          )}
        >
          {/* Reading progress: a thin beam along the bottom edge. */}
          <motion.span
            aria-hidden="true"
            style={{ scaleX: progress }}
            className="pointer-events-none absolute inset-x-6 -bottom-px h-[2px] origin-left rounded-full bg-gradient-to-r from-ds-accent to-[rgb(var(--ds-aurora-3))]"
          />
          <button
            type="button"
            onClick={dsScrollToTop}
            className="flex min-h-11 min-w-0 shrink items-center gap-3 rounded-full pr-2 text-left lg:max-w-[16rem]"
          >
            {avatar ? (
              <OptimizedImage src={avatar} alt="" width={96} height={96} decoding="async" className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-ds-line" />
            ) : (
              <Monogram name={name} />
            )}
            <span className="min-w-0">
              {name && <span className="block truncate font-ds-display text-[1.1875rem] font-medium leading-tight">{name}</span>}
              {specialty && <span className="block truncate text-ds-label text-ds-ink-2">{specialty}</span>}
              <span className="sr-only"> (back to top)</span>
            </span>
          </button>

          <nav aria-label="Sections" className="hidden justify-self-center items-center gap-0.5 whitespace-nowrap lg:flex">
            {links.map((link) => {
              const isActive = active === link.target;
              return (
                <button
                  key={link.target}
                  type="button"
                  onClick={() => go(link.target)}
                  aria-current={isActive ? "location" : undefined}
                  className={cn(
                    "relative rounded-full px-3 py-2 text-ds-small font-medium transition-colors duration-ds-1",
                    isActive ? "text-ds-ink" : "text-ds-ink-2 hover:text-ds-ink",
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="ds-nav-active"
                      className="absolute inset-0 -z-10 rounded-full bg-ds-ink/[0.06]"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                  {link.label}
                </button>
              );
            })}
            {manageHref && (
              <Link to={manageHref} className="rounded-full px-3 py-2 text-ds-small font-medium text-ds-ink-2 transition-colors hover:text-ds-ink">
                My appointment
              </Link>
            )}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1 lg:justify-self-end">
            <button
              type="button"
              onClick={toggle}
              aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
              className="flex h-11 w-11 items-center justify-center rounded-full text-ds-ink-2 transition-colors hover:bg-ds-ink/[0.06] hover:text-ds-ink"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={isDark ? "sun" : "moon"}
                  initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
                  transition={{ duration: DUR.small, ease: EASE.out }}
                  className="flex"
                >
                  {isDark ? <Sun className="h-5 w-5" strokeWidth={1.75} /> : <Moon className="h-5 w-5" strokeWidth={1.75} />}
                </motion.span>
              </AnimatePresence>
            </button>

            {manageHref && (
              <Link
                to={manageHref}
                className="hidden h-11 items-center whitespace-nowrap rounded-full px-3 text-ds-small font-medium text-ds-ink-2 hover:text-ds-ink md:flex lg:hidden"
              >
                My appointment
              </Link>
            )}

            <DsButton onClick={bookNow} className="ml-1 hidden md:inline-flex">
              <CalendarCheck2 className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
              {labels.book}
            </DsButton>

            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              className="flex h-11 w-11 items-center justify-center rounded-full text-ds-ink transition-colors hover:bg-ds-ink/[0.06] lg:hidden"
            >
              <Menu className="h-6 w-6" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </header>

      {/* Reserves the header's height so the hero starts below it. */}
      <div className="h-16 md:h-[4.75rem]" aria-hidden="true" />

      <Drawer open={menuOpen} onOpenChange={setMenuOpen} shouldScaleBackground={false}>
        <DrawerContent className="doctor-site rounded-t-ds-lg border-ds-line bg-ds-paper pb-[max(1.25rem,env(safe-area-inset-bottom))] text-ds-ink lg:hidden">
          <div className="flex items-center justify-between px-5 pb-2 pt-3">
            <DrawerTitle className="font-ds-display text-ds-h3 font-medium">{name || "Menu"}</DrawerTitle>
            <DrawerDescription className="sr-only">Jump to a section of the page</DrawerDescription>
            <DrawerClose className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-ds-ink/[0.06]" aria-label="Close menu">
              <X className="h-5 w-5" strokeWidth={1.75} />
            </DrawerClose>
          </div>
          <nav aria-label="Sections" className="px-3">
            {links.map((link, index) => (
              <motion.button
                key={link.target}
                type="button"
                onClick={() => go(link.target)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.03 * index, duration: DUR.small, ease: EASE.out }}
                className="flex min-h-14 w-full items-center justify-between rounded-ds-md px-3 text-left font-ds-display text-[1.375rem] font-medium hover:bg-ds-ink/[0.04]"
              >
                {link.label}
                <span aria-hidden="true" className="text-ds-ink-3">→</span>
              </motion.button>
            ))}
            {manageHref && (
              <Link
                to={manageHref}
                onClick={() => setMenuOpen(false)}
                className="flex min-h-14 w-full items-center justify-between rounded-ds-md px-3 font-ds-display text-[1.375rem] font-medium hover:bg-ds-ink/[0.04]"
              >
                My appointment <span aria-hidden="true" className="text-ds-ink-3">→</span>
              </Link>
            )}
          </nav>
          <div className="mt-3 px-5">
            <DsButton size="lg" className="w-full" onClick={() => { setMenuOpen(false); window.setTimeout(bookNow, 220); }}>
              {labels.book}
            </DsButton>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
};

export default Navbar;
