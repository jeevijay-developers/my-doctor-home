import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingHero from "@/components/landing/LandingHero";
import TrustBar from "@/components/landing/TrustBar";
import FeaturesGrid from "@/components/landing/FeaturesGrid";
import HowItWorks from "@/components/landing/HowItWorks";
import PricingSection from "@/components/landing/PricingSection";
import Testimonials from "@/components/landing/Testimonials";
import FAQ from "@/components/landing/FAQ";
import CTABanner from "@/components/landing/CTABanner";
import LandingFooter from "@/components/landing/LandingFooter";

const LandingPage = () => (
  <div className="min-h-screen">
    <LandingNavbar />
    <LandingHero />
    <TrustBar />
    <FeaturesGrid />
    <HowItWorks />
    <PricingSection />
    <Testimonials />
    <FAQ />
    <CTABanner />
    <LandingFooter />
  </div>
);

export default LandingPage;
