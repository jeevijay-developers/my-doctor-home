import { useDoctorData } from "@/contexts/DoctorContext";
import { FloatingPathsBackground } from "@/components/ui/floating-paths";
import AnimatedSection from "@/components/landing/AnimatedSection";
import AboutSection from "./AboutSection";
import ServicesSection from "./ServicesSection";

const AboutServicesBackdrop = () => {
  const { settings, services } = useDoctorData();
  const showAbout = settings.show_about !== false;
  const showServices = settings.show_services !== false && services.length > 0;

  if (!showAbout && !showServices) return null;

  return (
    <FloatingPathsBackground position={-1}>
      {showAbout && (
        <AnimatedSection className="relative z-10">
          <AboutSection />
        </AnimatedSection>
      )}
      {showServices && (
        <AnimatedSection className="relative z-10">
          <ServicesSection />
        </AnimatedSection>
      )}
    </FloatingPathsBackground>
  );
};

export default AboutServicesBackdrop;
