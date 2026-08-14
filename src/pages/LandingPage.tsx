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
import CTABanner from "@/components/landing/CTABanner";
import LandingFooter from "@/components/landing/LandingFooter";
import AnimatedSection from "@/components/landing/AnimatedSection";

const LandingPage = () => {
  const location = useLocation();

  // Nav links may arrive here from another page as "/#section" — react-router
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
      <LandingNavbar />
      <LandingHero />
      <TrustBar />
      <MediaLogos />
      <AnimatedSection>
        <FeaturesGrid />
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
        <Testimonials />
      </AnimatedSection>
      <AnimatedSection>
        <FAQ />
      </AnimatedSection>
      <AnimatedSection>
        <ContactSection />
      </AnimatedSection>
      <CTABanner />
      <LandingFooter />
    </div>
  );
};

export default LandingPage;
