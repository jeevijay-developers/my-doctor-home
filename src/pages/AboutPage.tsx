import { useEffect } from "react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import CTABanner from "@/components/landing/CTABanner";
import AboutHero from "@/components/about/AboutHero";
import AboutIntro from "@/components/about/AboutIntro";
import WhatWeOffer from "@/components/about/WhatWeOffer";
import ForDoctorsPatients from "@/components/about/ForDoctorsPatients";
import WhyDoctylia from "@/components/about/WhyDoctylia";
import AboutHowItWorks from "@/components/about/AboutHowItWorks";
import AboutTrust from "@/components/about/AboutTrust";

const AboutPage = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
    const prev = document.title;
    document.title = "About Us | Doctylia";
    return () => { document.title = prev; };
  }, []);

  return (
    <div className="landing-page min-h-screen overflow-x-hidden bg-background">
      <LandingNavbar />
      <AboutHero />
      <AboutIntro />
      <WhatWeOffer />
      <ForDoctorsPatients />
      <WhyDoctylia />
      <AboutHowItWorks />
      <AboutTrust />
      <CTABanner />
      <LandingFooter />
    </div>
  );
};

export default AboutPage;
