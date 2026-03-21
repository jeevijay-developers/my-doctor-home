import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingHero from "@/components/landing/LandingHero";
import TrustBar from "@/components/landing/TrustBar";
import FeaturesGrid from "@/components/landing/FeaturesGrid";
import HowItWorks from "@/components/landing/HowItWorks";
import DashboardPreview from "@/components/landing/DashboardPreview";
import PricingSection from "@/components/landing/PricingSection";
import Testimonials from "@/components/landing/Testimonials";
import FAQ from "@/components/landing/FAQ";
import ContactSection from "@/components/landing/ContactSection";
import CTABanner from "@/components/landing/CTABanner";
import LandingFooter from "@/components/landing/LandingFooter";
import AnimatedSection from "@/components/landing/AnimatedSection";

const LandingPage = () => (
  <div className="min-h-screen overflow-x-hidden">
    <LandingNavbar />
    <LandingHero />
    <TrustBar />
    <AnimatedSection>
      <FeaturesGrid />
    </AnimatedSection>
    <AnimatedSection>
      <HowItWorks />
    </AnimatedSection>
    <AnimatedSection>
      <DashboardPreview />
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

export default LandingPage;
