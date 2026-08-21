import { useEffect } from "react";
import { DoctorProvider, useDoctorData } from "@/contexts/DoctorContext";
import Navbar from "@/components/doctor/Navbar";
import HeroBanner from "@/components/doctor/HeroBanner";
import AboutSection from "@/components/doctor/AboutSection";
import ServicesSection from "@/components/doctor/ServicesSection";
import GallerySection from "@/components/doctor/GallerySection";
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

  // Alternating card colors follow the visible section order below.
  // Color B ("card") = Patient Review testimonial card. The Stats card
  // (rendered inside HeroBanner) is always slot 1 (B) when shown, hardcoded
  // in HeroBanner.tsx itself since its position never varies. Everything
  // from here on is a card that may or may not render for a given doctor,
  // so the slot counter only advances for cards that actually show — that
  // way the alternation stays correct (and keeps working for any future
  // card added to this list) regardless of which optional sections are on.
  let slot = settings.show_quick_stats !== false ? 2 : 1;
  const nextCardColor = () => {
    const color = slot % 2 === 0 ? "secondary" : "card";
    slot += 1;
    return color;
  };

  const showAbout = settings.show_about !== false;
  const showServices = settings.show_services !== false && services.length > 0;
  const showGallery = Boolean(settings.show_gallery) && gallery.length > 0;
  const showReviews = settings.show_reviews !== false;
  const showBlog = Boolean(settings.show_blog);
  const showClinicDetails = settings.show_clinic_details !== false;

  const servicesColor = showServices ? nextCardColor() : undefined;
  const aboutColor = showAbout ? nextCardColor() : undefined;
  const galleryColor = showGallery ? nextCardColor() : undefined;
  const bookingColor = nextCardColor(); // always rendered
  const reviewsColor = showReviews ? nextCardColor() : undefined;
  const blogColor = showBlog ? nextCardColor() : undefined;
  const clinicDetailsColor = showClinicDetails ? nextCardColor() : undefined;

  return (
    <div className="min-h-screen bg-secondary/30 dark:bg-black">
      <Navbar />
      <HeroBanner cardColor={servicesColor ?? aboutColor ?? "secondary"} />
      {showServices && (
        <AnimatedSection><SectionCard><ServicesSection cardColor={servicesColor} /></SectionCard></AnimatedSection>
      )}
      {showAbout && (
        <AnimatedSection><SectionCard><AboutSection cardColor={aboutColor} /></SectionCard></AnimatedSection>
      )}
      {showGallery && (
        <AnimatedSection><SectionCard><GallerySection cardColor={galleryColor} /></SectionCard></AnimatedSection>
      )}
      <AnimatedSection><SectionCard><BookingWidget cardColor={bookingColor} /></SectionCard></AnimatedSection>
      {showReviews && (
        <AnimatedSection><SectionCard><ReviewsSection cardColor={reviewsColor} /></SectionCard></AnimatedSection>
      )}
      {showBlog && (
        <AnimatedSection><SectionCard><BlogPreview cardColor={blogColor} /></SectionCard></AnimatedSection>
      )}
      {showClinicDetails && (
        <AnimatedSection><SectionCard><ClinicDetails cardColor={clinicDetailsColor} /></SectionCard></AnimatedSection>
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
