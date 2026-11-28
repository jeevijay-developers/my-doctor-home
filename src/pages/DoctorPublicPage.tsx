import { useEffect, useMemo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import "@/styles/doctor-site.css";
import SmoothScroll from "@/components/doctor/motion/SmoothScroll";
import { dsScrollTo } from "@/components/doctor/motion/scroll";
import { DoctorProvider, useDoctorData } from "@/contexts/DoctorContext";
import Navbar from "@/components/doctor/Navbar";
import HeroBanner from "@/components/doctor/HeroBanner";
import AboutSection from "@/components/doctor/AboutSection";
import DoctorsSection from "@/components/doctor/DoctorsSection";
import ServicesSection from "@/components/doctor/ServicesSection";
import GallerySection from "@/components/doctor/GallerySection";
import BookingWidget from "@/components/doctor/BookingWidget";
import ReviewsSection from "@/components/doctor/ReviewsSection";
import BlogPreview from "@/components/doctor/BlogPreview";
import ClinicDetails from "@/components/doctor/ClinicDetails";
import ContactQueryForm from "@/components/doctor/ContactQueryForm";
import Footer from "@/components/doctor/Footer";
import BottomActionBar from "@/components/doctor/BottomActionBar";
import DoctorThemeProvider from "@/components/doctor/DoctorThemeProvider";
import { jsonLdScript } from "@/lib/jsonLd";
import { DEFAULT_TITLE, buildDoctorJsonLd, buildDoctorMeta, doctorDisplayName } from "@/lib/seo/doctorSeo";
import { clinicDisplayName, specialtiesLine } from "@/lib/doctorSite/teamClinic";
// Root of the doctor site: scopes the `ds-*` design tokens, smooth scroll and the
// reduced-motion policy (`motion` honours the OS setting via reducedMotion="user").
const DoctorSiteShell = ({ children }: { children: ReactNode }) => (
  <DoctorThemeProvider>
    <MotionConfig reducedMotion="user">
      <div className="doctor-site min-h-screen bg-ds-paper text-ds-ink">{children}</div>
    </MotionConfig>
  </DoctorThemeProvider>
);

function upsertMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  const prev = el.content;
  el.content = content;
  return () => {
    if (el) el.content = prev;
  };
}

function upsertCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  const prev = link.href;
  link.href = href;
  return () => {
    if (link) link.href = prev || `${window.location.origin}/`;
  };
}

const DoctorPageContent = () => {
  const { profile, settings, loading, services, reviews, isMultiDoctor, isTeamClinic, practitioners } = useDoctorData();
  const team = isTeamClinic === true;
  const { hash } = useLocation();

  const doctorName = useMemo(() => doctorDisplayName(profile), [profile]);

  const seoMeta = useMemo(
    () => buildDoctorMeta({ origin: window.location.origin, profile, settings }),
    [profile, settings],
  );
  // A clinic with several doctors is titled by the clinic ("Clinic - Cardiology, ENT in Pune | Doctylia"),
  // unless the owner wrote their own SEO title. The edge function renders the crawler copy separately.
  const pageTitle = useMemo(() => {
    if (!team || !seoMeta.title || settings?.seo_title?.trim()) return seoMeta.title;
    const specialties = specialtiesLine(practitioners ?? [], 2);
    const city = (profile?.city ?? "").trim();
    return `${clinicDisplayName(profile)}${specialties ? ` - ${specialties}` : ""}${city ? ` in ${city}` : ""} | Doctylia`;
  }, [team, seoMeta.title, settings, practitioners, profile]);
  const pageDescription = seoMeta.description;
  const teamImage = team ? settings?.hero_photo_url || "" : "";

  useEffect(() => {
    if (!pageTitle) return;
    const previousTitle = document.title;
    document.title = pageTitle;

    const canonicalUrl = seoMeta.canonical || window.location.href;
    const shareImage = teamImage || seoMeta.image;

    const restoreCanonical = upsertCanonical(canonicalUrl);
    const restoreDesc = upsertMeta('meta[name="description"]', "name", "description", pageDescription);
    const restoreOgTitle = upsertMeta('meta[property="og:title"]', "property", "og:title", pageTitle);
    const restoreOgDesc = upsertMeta('meta[property="og:description"]', "property", "og:description", pageDescription);
    const restoreOgUrl = upsertMeta('meta[property="og:url"]', "property", "og:url", canonicalUrl);
    const restoreOgType = upsertMeta('meta[property="og:type"]', "property", "og:type", team ? "website" : "profile");
    const restoreTwTitle = upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", pageTitle);
    const restoreTwDesc = upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", pageDescription);
    const restoreOgImage = shareImage
      ? upsertMeta('meta[property="og:image"]', "property", "og:image", shareImage)
      : () => {};
    const restoreTwImage = shareImage
      ? upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", shareImage)
      : () => {};

    return () => {
      document.title = previousTitle || DEFAULT_TITLE;
      restoreCanonical();
      restoreDesc();
      restoreOgTitle();
      restoreOgDesc();
      restoreOgUrl();
      restoreOgType();
      restoreTwTitle();
      restoreTwDesc();
      restoreOgImage();
      restoreTwImage();
    };
  }, [pageTitle, pageDescription, seoMeta.canonical, seoMeta.image, teamImage, team]);

  const structuredData = useMemo(
    () => buildDoctorJsonLd({ origin: window.location.origin, profile, settings, services, reviews, practitioners }),
    [profile, settings, services, reviews, practitioners],
  );

  useEffect(() => {
    if (loading || !profile || !hash) return;
    let target = hash.slice(1);
    try {
      target = decodeURIComponent(target);
    } catch {
      // A malformed escape (e.g. "#%E0%A4%A") is just not a section id; use it as typed.
    }
    const frame = window.requestAnimationFrame(() => dsScrollTo(target));
    return () => window.cancelAnimationFrame(frame);
  }, [hash, loading, profile]);

  if (loading) {
    return (
      <DoctorSiteShell>
        <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-ds-line border-t-ds-accent" />
        </div>
      </DoctorSiteShell>
    );
  }

  if (!profile) {
    return (
      <DoctorSiteShell>
        <main className="flex min-h-screen items-center justify-center px-6">
          <div className="max-w-md text-center">
            <h1 className="font-ds-display text-ds-h2 font-medium">Doctor Not Found</h1>
            <p className="mt-3 text-ds-ink-2">This page doesn't exist or hasn't been set up yet.</p>
          </div>
        </main>
      </DoctorSiteShell>
    );
  }

  if (profile.plan_status === "cancelled") {
    return (
      <DoctorSiteShell>
        <main className="flex min-h-screen items-center justify-center px-6">
          <div className="max-w-md rounded-ds-md border border-ds-line bg-ds-surface p-8 text-center shadow-ds-1">
            <h1 className="font-ds-display text-ds-h3 font-medium">This clinic is temporarily unavailable</h1>
            <p className="mt-3 text-ds-ink-2">Please check back later or contact the clinic directly.</p>
          </div>
        </main>
      </DoctorSiteShell>
    );
  }

  const showAbout = settings.show_about !== false;
  const showServices = settings.show_services !== false;
  const showGallery = Boolean(settings.show_gallery);
  const showReviews = settings.show_reviews !== false;
  const showBlog = settings.show_blog !== false;
  const showClinicDetails = settings.show_clinic_details !== false;


  return (
    <DoctorSiteShell>
    <SmoothScroll>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-ds-accent focus:px-5 focus:py-3 focus:font-medium focus:text-white"
      >
        Skip to main content
      </a>
      {structuredData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }}
        />
      )}
      <Navbar />
      <main id="main">
        {/* Single doctor: hero, about, gallery, services, booking, reviews, articles, clinic details, contact form.
            Several bookable doctors add "Choose your doctor" (#doctors) after About. A team clinic (2+ active
            doctors) is clinic-first: hero, doctors, about the clinic, services, gallery, booking, reviews,
            articles, clinic details, contact form. */}
        <HeroBanner />
        {team ? (
          <>
            <DoctorsSection />
            {showAbout && <AboutSection />}
            {showServices && <ServicesSection />}
            {showGallery && <GallerySection />}
          </>
        ) : (
          <>
            {showAbout && <AboutSection />}
            {isMultiDoctor && <DoctorsSection />}
            {showGallery && <GallerySection />}
            {showServices && <ServicesSection />}
          </>
        )}
        {/* Stable wrapper: BookingWidget swaps its root between states, so observers watch this. */}
        <div id="booking-zone">
          <BookingWidget />
        </div>
        {showReviews && <ReviewsSection />}
        {showBlog && <BlogPreview />}
        {showClinicDetails && <ClinicDetails />}
        <ContactQueryForm />
      </main>
      <Footer />
      <BottomActionBar />
      {/* Keeps the footer clear of the fixed mobile action bar. */}
      <div aria-hidden="true" style={{ height: "var(--ds-bottom-bar)" }} />
    </SmoothScroll>
    </DoctorSiteShell>
  );
};

const DoctorPublicPage = () => (
  <DoctorProvider>
    <DoctorPageContent />
  </DoctorProvider>
);

export default DoctorPublicPage;
