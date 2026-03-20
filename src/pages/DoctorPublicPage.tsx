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

const DoctorPageContent = () => {
  const { profile, settings, loading, services, packages, reviews, gallery } = useDoctorData();

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

  return (
    <div className="min-h-screen">
      <Navbar />
      <HeroBanner />
      {settings.show_quick_stats !== false && <QuickStats />}
      {settings.show_about !== false && <AboutSection />}
      {settings.show_services !== false && services.length > 0 && <ServicesSection />}
      {settings.show_packages && packages.length > 0 && <ServicesSection showPackagesOnly />}
      {settings.show_gallery && gallery.length > 0 && <GallerySection />}
      {settings.show_online_consultation && <OnlineConsultation />}
      <BookingWidget />
      {settings.show_reviews !== false && <ReviewsSection />}
      {settings.show_blog && <BlogPreview />}
      {settings.show_clinic_details !== false && <ClinicDetails />}
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
