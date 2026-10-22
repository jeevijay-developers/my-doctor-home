import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingHero from "@/components/landing/LandingHero";
import TrustBar from "@/components/landing/TrustBar";
import MediaLogos from "@/components/landing/MediaLogos";
import FeaturesGrid from "@/components/landing/FeaturesGrid";
import BeforeAfter from "@/components/landing/BeforeAfter";
import HowItWorks from "@/components/landing/HowItWorks";
import DashboardPreview from "@/components/landing/DashboardPreview";
import Specialties from "@/components/landing/Specialties";
import PricingSection from "@/components/landing/PricingSection";
import Testimonials from "@/components/landing/Testimonials";
import FAQ from "@/components/landing/FAQ";
import ContactSection from "@/components/landing/ContactSection";
import AboutSummary from "@/components/landing/AboutSummary";
import CaseStudies from "@/components/landing/CaseStudies";
import { jsonLdScript } from "@/lib/jsonLd";
import CTABanner from "@/components/landing/CTABanner";
import LandingFooter from "@/components/landing/LandingFooter";
import AnimatedSection from "@/components/landing/AnimatedSection";

const LANDING_TITLE = "Doctylia - India's #1 Practice Management & Website Platform for Doctors";
const LANDING_DESCRIPTION =
  "Doctylia gives doctors in India their own branded website, 24/7 online appointment booking, patient medical records, GST billing, AI blog writer, and WhatsApp reminders. Start your 7-day free trial.";

const LANDING_FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How quickly can I set up my clinic website?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Most doctors are live within 10 minutes! Simply enter your details, choose your specialty, upload your photo, and your professional website is ready. No coding or design skills needed.",
      },
    },
    {
      "@type": "Question",
      name: "Will my website show up on Google when patients search for me?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes! Every Doctylia website is built with SEO best practices - proper meta tags, fast loading, mobile optimization, and Google Business integration. Patients searching for your name or specialty in your city will find you easily.",
      },
    },
    {
      "@type": "Question",
      name: "How does the online appointment booking work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Patients visit your website, select a service, pick an available date and time slot based on your schedule, and confirm the booking. Both you and the patient receive instant WhatsApp and email confirmations.",
      },
    },
    {
      "@type": "Question",
      name: "Is my patient data safe and private?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Absolutely. We use 256-bit SSL encryption, HIPAA-ready cloud infrastructure, and strict access controls. Your patient data is stored on secure servers in India and is never shared with third parties.",
      },
    },
    {
      "@type": "Question",
      name: "Can I use my own domain name like www.drsharma.com?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes! On the Pro and Premium plans, you can connect your own custom domain (e.g., www.drsharma.com) or use our free subdomain (doctylia.com/dr/dr-sharma).",
      },
    },
    {
      "@type": "Question",
      name: "How does the AI Blog Writer work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Just enter a health topic (e.g., '5 Tips for Managing Diabetes in Summer'), and our AI generates a well-researched, patient-friendly blog post in seconds. You can edit and publish it directly to your website to attract more patients from Google.",
      },
    },
    {
      "@type": "Question",
      name: "Can I manage multiple clinic locations?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes! The Premium plan supports up to 3 clinic locations, each with its own address, working hours, and booking calendar - all managed from one dashboard.",
      },
    },
    {
      "@type": "Question",
      name: "What if I want to cancel my subscription?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "You can cancel anytime from your dashboard with one click - no lock-in contracts, no cancellation fees. Every paid plan starts with a 7-day free trial, and we also offer a 30-day money-back guarantee.",
      },
    },
    {
      "@type": "Question",
      name: "Do I need any technical knowledge to use Doctylia?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Not at all! If you can use WhatsApp, you can use Doctylia. Our interface is designed specifically for busy doctors - everything is point-and-click simple. Plus, our support team is always available on WhatsApp to help.",
      },
    },
  ],
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
        <MediaLogos />
        <AnimatedSection>
          <FeaturesGrid />
        </AnimatedSection>
        <AnimatedSection>
          <AboutSummary />
        </AnimatedSection>
        <AnimatedSection>
          <BeforeAfter />
        </AnimatedSection>
        <AnimatedSection>
          <HowItWorks />
        </AnimatedSection>
        <AnimatedSection>
          <DashboardPreview />
        </AnimatedSection>
        <AnimatedSection>
          <Specialties />
        </AnimatedSection>
        <AnimatedSection>
          <PricingSection />
        </AnimatedSection>
        <AnimatedSection>
          <CaseStudies />
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
