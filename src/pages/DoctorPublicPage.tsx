import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
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
import ContactQueryForm from "@/components/doctor/ContactQueryForm";
import Footer from "@/components/doctor/Footer";
import AnimatedSection from "@/components/landing/AnimatedSection";
import SectionCard from "@/components/doctor/SectionCard";
import { jsonLdScript } from "@/lib/jsonLd";
import { scrollToSection } from "@/lib/scrollToSection";

const DEFAULT_TITLE = "Doctylia - India's #1 Practice Management & Website Platform for Doctors";
const DEFAULT_DESCRIPTION =
  "Doctylia gives doctors in India their own branded website, 24/7 online appointment booking, patient medical records, GST billing, AI blog writer, and WhatsApp reminders. Start your 7-day free trial.";

function formatDoctorName(rawName: string): string {
  const trimmed = rawName.trim();
  if (!trimmed) return "";
  return /^dr\.?\s/i.test(trimmed) ? trimmed : `Dr. ${trimmed}`;
}

function upsertMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  const prev = el.content;
  el.content = content;
  return () => {
    if (el) el.content = prev;
  };
}

function upsertCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  const prev = link.href;
  link.href = href;
  return () => {
    if (link) link.href = prev || `${window.location.origin}/`;
  };
}

const DoctorPageContent = () => {
  const { profile, settings, loading, services, reviews, gallery } = useDoctorData();
  const { hash } = useLocation();

  const doctorName = useMemo(() => {
    const raw = (profile?.display_name || profile?.full_name || "").trim();
    return formatDoctorName(raw);
  }, [profile?.display_name, profile?.full_name]);

  const pageTitle = useMemo(() => {
    if (settings?.seo_title?.trim()) return settings.seo_title.trim();
    if (!doctorName) return "";
    const specPart = profile?.specialization ? ` - ${profile.specialization}` : "";
    const cityPart = profile?.city ? ` in ${profile.city}` : "";
    return `${doctorName}${specPart}${cityPart} | Doctylia`;
  }, [settings?.seo_title, doctorName, profile?.specialization, profile?.city]);

  const pageDescription = useMemo(() => {
    if (settings?.seo_description?.trim()) return settings.seo_description.trim();
    if (profile?.bio?.trim()) return profile.bio.trim().slice(0, 160);
    if (settings?.hero_description?.trim()) return settings.hero_description.trim().slice(0, 160);
    if (!doctorName) return DEFAULT_DESCRIPTION;
    const specPart = profile?.specialization ? `, ${profile.specialization}` : "";
    const cityPart = profile?.city ? ` in ${profile.city}` : "";
    const expPart = profile?.experience_years ? ` (${profile.experience_years}+ years experience)` : "";
    return `Book an appointment with ${doctorName}${specPart}${cityPart}${expPart}. View clinic timings, consultation fees, services, and verified patient reviews on Doctylia.`;
  }, [
    settings?.seo_description,
    settings?.hero_description,
    profile?.bio,
    profile?.specialization,
    profile?.city,
    profile?.experience_years,
    doctorName,
  ]);

  useEffect(() => {
    if (!pageTitle) return;
    const previousTitle = document.title;
    document.title = pageTitle;

    const canonicalUrl = profile?.slug
      ? `${window.location.origin}/dr/${profile.slug}`
      : window.location.href;
    const shareImage = profile?.profile_photo_url || settings?.hero_photo_url || "";

    const restoreCanonical = upsertCanonical(canonicalUrl);
    const restoreDesc = upsertMeta('meta[name="description"]', "name", "description", pageDescription);
    const restoreOgTitle = upsertMeta('meta[property="og:title"]', "property", "og:title", pageTitle);
    const restoreOgDesc = upsertMeta('meta[property="og:description"]', "property", "og:description", pageDescription);
    const restoreOgUrl = upsertMeta('meta[property="og:url"]', "property", "og:url", canonicalUrl);
    const restoreOgType = upsertMeta('meta[property="og:type"]', "property", "og:type", "profile");
    const restoreTwTitle = upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", pageTitle);
    const restoreTwDesc = upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", pageDescription);
    const restoreOgImage = shareImage
      ? upsertMeta('meta[property="og:image"]', "property", "og:image", shareImage)
      : () => {};
    const restoreTwImage = shareImage
      ? upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", shareImage)
      : () => {};

    return () => {
      document.title = previousTitle || DEFAULT_TITLE;
      restoreCanonical();
      restoreDesc();
      restoreOgTitle();
      restoreOgDesc();
      restoreOgUrl();
      restoreOgType();
      restoreTwTitle();
      restoreTwDesc();
      restoreOgImage();
      restoreTwImage();
    };
  }, [
    pageTitle,
    pageDescription,
    profile?.slug,
    profile?.profile_photo_url,
    settings?.hero_photo_url,
  ]);

  const structuredData = useMemo(() => {
    if (!profile || !doctorName) return null;
    const canonicalUrl = profile.slug
      ? `${window.location.origin}/dr/${profile.slug}`
      : window.location.href;
    const validReviews = (reviews || []).filter((r: any) => typeof r.rating === "number" && r.rating > 0);
    const avgRating =
      validReviews.length > 0
        ? (validReviews.reduce((acc: number, r: any) => acc + Number(r.rating), 0) / validReviews.length).toFixed(1)
        : null;

    const physicianEntity: Record<string, unknown> = {
      "@type": ["Physician", "MedicalBusiness"],
      "@id": `${canonicalUrl}#physician`,
      name: doctorName,
      url: canonicalUrl,
      description: pageDescription,
      ...(profile.specialization ? { medicalSpecialty: profile.specialization } : {}),
      ...(profile.profile_photo_url || settings?.hero_photo_url
        ? { image: profile.profile_photo_url || settings?.hero_photo_url }
        : {}),
      ...(profile.clinic_phone || profile.phone
        ? { telephone: profile.clinic_phone || profile.phone }
        : {}),
      ...(profile.consultation_fee
        ? { priceRange: `₹${profile.consultation_fee}` }
        : {}),
      ...(profile.address || profile.city || profile.state
        ? {
            address: {
              "@type": "PostalAddress",
              ...(profile.address ? { streetAddress: profile.address } : {}),
              ...(profile.city ? { addressLocality: profile.city } : {}),
              ...(profile.state ? { addressRegion: profile.state } : {}),
              addressCountry: "IN",
            },
          }
        : {}),
      ...(Array.isArray(services) && services.length > 0
        ? {
            availableService: services.slice(0, 12).map((s: any) => ({
              "@type": "MedicalProcedure",
              name: s.name,
              ...(s.description ? { description: s.description } : {}),
              ...(s.price
                ? {
                    offers: {
                      "@type": "Offer",
                      price: String(s.price),
                      priceCurrency: "INR",
                    },
                  }
                : {}),
            })),
          }
        : {}),
      ...(avgRating && validReviews.length > 0
        ? {
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: avgRating,
              reviewCount: String(validReviews.length),
              bestRating: "5",
              worstRating: "1",
            },
          }
        : {}),
    };

    const breadcrumbEntity = {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Doctylia",
          item: `${window.location.origin}/`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: doctorName,
          item: canonicalUrl,
        },
      ],
    };

    return {
      "@context": "https://schema.org",
      "@graph": [physicianEntity, breadcrumbEntity],
    };
  }, [profile, doctorName, pageDescription, settings?.hero_photo_url, services, reviews]);

  useEffect(() => {
    if (loading || !profile || !hash) return;
    const target = decodeURIComponent(hash.slice(1));
    const frame = window.requestAnimationFrame(() => scrollToSection(target));
    return () => window.cancelAnimationFrame(frame);
  }, [hash, loading, profile]);

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
  // so the slot counter only advances for cards that actually show - that
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
  const queryFormColor = nextCardColor(); // always rendered, right after Clinic Details

  return (
    <div className="min-h-screen bg-secondary/30 dark:bg-black">
      {structuredData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }}
        />
      )}
      <Navbar />
      <main>
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
        <AnimatedSection><SectionCard><ContactQueryForm cardColor={queryFormColor} /></SectionCard></AnimatedSection>
      </main>
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
