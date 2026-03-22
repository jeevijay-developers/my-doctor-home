import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingHero from "@/components/landing/LandingHero";
import TrustBar from "@/components/landing/TrustBar";
import MediaLogos from "@/components/landing/MediaLogos";
import FeaturesGrid from "@/components/landing/FeaturesGrid";
import BeforeAfter from "@/components/landing/BeforeAfter";
import HowItWorks from "@/components/landing/HowItWorks";
import DashboardPreview from "@/components/landing/DashboardPreview";
import Specialties from "@/components/landing/Specialties";
import SuccessMetrics from "@/components/landing/SuccessMetrics";
import DetailedFeatures from "@/components/landing/DetailedFeatures";
import PricingSection from "@/components/landing/PricingSection";
import Testimonials from "@/components/landing/Testimonials";
import FAQ from "@/components/landing/FAQ";
import Guarantee from "@/components/landing/Guarantee";
import ContactSection from "@/components/landing/ContactSection";
import CTABanner from "@/components/landing/CTABanner";
import LandingFooter from "@/components/landing/LandingFooter";
import AnimatedSection from "@/components/landing/AnimatedSection";

const LandingPage = () => (
  <div className="min-h-screen overflow-x-hidden">
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
    <SuccessMetrics />
    <AnimatedSection>
      <DetailedFeatures />
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
    <Guarantee />
    <AnimatedSection>
      <ContactSection />
    </AnimatedSection>
    <CTABanner />
    <LandingFooter />
  </div>
);

export default LandingPage;
