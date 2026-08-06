import { useEffect } from "react";
import { DoctorProvider, useDoctorData } from "@/contexts/DoctorContext";
import Navbar from "@/components/doctor/Navbar";
import HeroBanner from "@/components/doctor/HeroBanner";
import QuickStats from "@/components/doctor/QuickStats";
import AboutSection from "@/components/doctor/AboutSection";
import ServicesSection from "@/components/doctor/ServicesSection";
import GallerySection from "@/components/doctor/GallerySection";
import OnlineConsultation from "@/components/doctor/OnlineConsultation";
import BookingWidget from "@/components/doctor/BookingWidget";
import ReviewsSection from "@/components/doctor/ReviewsSection";
import BlogPreview from "@/components/doctor/BlogPreview";
import ClinicDetails from "@/components/doctor/ClinicDetails";
import Footer from "@/components/doctor/Footer";
import AnimatedSection from "@/components/landing/AnimatedSection";
import SectionCard from "@/components/doctor/SectionCard";

const DoctorPageContent = () => {
  const { profile, settings, loading, services, reviews, gallery } = useDoctorData();

  useEffect(() => {
    if (!profile?.display_name) return;
    const previousTitle = document.title;
    const name = profile.display_name.trim();
    const formatted = /^dr\.?\s/i.test(name) ? name : `Dr. ${name}`;
    document.title = formatted;

    // Also sync og:title and twitter:title so social/preview scrapers reflect the doctor
    const setMeta = (selector: string, value: string) => {
      const el = document.head.querySelector<HTMLMetaElement>(selector);
      if (el) {
        const prev = el.content;
        el.content = value;
        return () => { el.content = prev; };
      }
      return () => {};
    };
    const restoreOg = setMeta('meta[property="og:title"]', formatted);
    const restoreTw = setMeta('meta[name="twitter:title"]', formatted);

    return () => {
      document.title = previousTitle;
      restoreOg();
      restoreTw();
    };
  }, [profile?.display_name]);


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-royal border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="font-heading font-bold text-2xl text-primary mb-2">Doctor Not Found</h1>
          <p className="text-muted-foreground">This page doesn't exist or hasn't been set up yet.</p>
        </div>
      </div>
    );
  }

  if (profile.plan_status === "cancelled") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary p-6">
        <div className="max-w-md text-center bg-card border rounded-2xl p-8 shadow-lg">
          <h1 className="font-heading font-bold text-2xl text-primary mb-2">This clinic is temporarily unavailable</h1>
          <p className="text-muted-foreground">Please check back later or contact the clinic directly.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <HeroBanner />
      {settings.show_quick_stats !== false && (
        <AnimatedSection><QuickStats /></AnimatedSection>
      )}
      {settings.show_about !== false && (
        <AnimatedSection><SectionCard><AboutSection /></SectionCard></AnimatedSection>
      )}
      {settings.show_services !== false && services.length > 0 && (
        <AnimatedSection><SectionCard><ServicesSection /></SectionCard></AnimatedSection>
      )}
      {settings.show_gallery && gallery.length > 0 && (
        <AnimatedSection><SectionCard><GallerySection /></SectionCard></AnimatedSection>
      )}
      {settings.show_online_consultation && (
        <AnimatedSection><OnlineConsultation /></AnimatedSection>
      )}
      <AnimatedSection><SectionCard><BookingWidget /></SectionCard></AnimatedSection>
      {settings.show_reviews !== false && (
        <AnimatedSection><SectionCard><ReviewsSection /></SectionCard></AnimatedSection>
      )}
      {settings.show_blog && (
        <AnimatedSection><SectionCard><BlogPreview /></SectionCard></AnimatedSection>
      )}
      {settings.show_clinic_details !== false && (
        <AnimatedSection><SectionCard><ClinicDetails /></SectionCard></AnimatedSection>
      )}
      <Footer />
    </div>
  );
};

const DoctorPublicPage = () => (
  <DoctorProvider>
    <DoctorPageContent />
  </DoctorProvider>
);

export default DoctorPublicPage;
