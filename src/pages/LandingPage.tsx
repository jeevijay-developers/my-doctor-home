import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingHero from "@/components/landing/LandingHero";
import TrustBar from "@/components/landing/TrustBar";
import FeaturesGrid from "@/components/landing/FeaturesGrid";
import BeforeAfter from "@/components/landing/BeforeAfter";
import Specialties from "@/components/landing/Specialties";
import DemoBanner from "@/components/landing/DemoBanner";
import CaseStudies from "@/components/landing/CaseStudies";
import PricingSection from "@/components/landing/PricingSection";
import Testimonials from "@/components/landing/Testimonials";
import FAQ, { LANDING_FAQS } from "@/components/landing/FAQ";
import ContactSection from "@/components/landing/ContactSection";
import CTABanner from "@/components/landing/CTABanner";
import LandingFooter from "@/components/landing/LandingFooter";
import AnimatedSection from "@/components/landing/AnimatedSection";
import { jsonLdScript } from "@/lib/jsonLd";

const LANDING_TITLE = "Doctylia - India's #1 Practice Management & Website Platform for Doctors";
const LANDING_DESCRIPTION =
  "Doctylia gives doctors in India their own branded website, 24/7 online appointment booking, patient medical records, GST billing, AI blog writer, and WhatsApp reminders. Start your 7-day free trial.";

// Structured data must match the FAQ answers visible on the page.
const LANDING_FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: LANDING_FAQS.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

function upsertMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href: string) {
  let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
}

const LandingPage = () => {
  const location = useLocation();

  useEffect(() => {
    document.title = LANDING_TITLE;
    const canonicalUrl = `${window.location.origin}/`;
    upsertCanonical(canonicalUrl);
    upsertMeta('meta[name="description"]', "name", "description", LANDING_DESCRIPTION);
    upsertMeta('meta[property="og:title"]', "property", "og:title", LANDING_TITLE);
    upsertMeta('meta[property="og:description"]', "property", "og:description", LANDING_DESCRIPTION);
    upsertMeta('meta[property="og:url"]', "property", "og:url", canonicalUrl);
    upsertMeta('meta[property="og:type"]', "property", "og:type", "website");
    upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", LANDING_TITLE);
    upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", LANDING_DESCRIPTION);
  }, []);

  // Nav links may arrive here from another page as "/#section" - react-router
  // doesn't auto-scroll to a hash on navigation the way a full page load
  // does, so do it ourselves once the section elements exist.
  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    const timer = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    }, 100);
    return () => clearTimeout(timer);
  }, [location.hash]);

  return (
    <div className="landing-page min-h-screen overflow-x-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(LANDING_FAQ_SCHEMA) }}
      />
      <LandingNavbar />
      <main>
        <LandingHero />
        <TrustBar />
        <AnimatedSection>
          <FeaturesGrid />
        </AnimatedSection>
        <AnimatedSection>
          <BeforeAfter />
        </AnimatedSection>
        <AnimatedSection>
          <Specialties />
        </AnimatedSection>
        <AnimatedSection>
          <DemoBanner />
        </AnimatedSection>
        <AnimatedSection>
          <CaseStudies />
        </AnimatedSection>
        <AnimatedSection>
          <PricingSection />
        </AnimatedSection>
        <AnimatedSection>
          <Testimonials />
        </AnimatedSection>
        <AnimatedSection>
          <FAQ />
        </AnimatedSection>
        <AnimatedSection>
          <ContactSection />
        </AnimatedSection>
        <CTABanner />
      </main>
      <LandingFooter />
    </div>
  );
};

export default LandingPage;
