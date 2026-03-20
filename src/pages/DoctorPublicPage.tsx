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

const DoctorPublicPage = () => (
  <div className="min-h-screen">
    <Navbar />
    <HeroBanner />
    <QuickStats />
    <AboutSection />
    <ServicesSection />
    <GallerySection />
    <OnlineConsultation />
    <BookingWidget />
    <ReviewsSection />
    <BlogPreview />
    <ClinicDetails />
    <Footer />
  </div>
);

export default DoctorPublicPage;
