import { useEffect, useMemo, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import "@/styles/doctor-site.css";
import { DoctorProvider, useDoctorData } from "@/contexts/DoctorContext";
import Navbar from "@/components/doctor/Navbar";
import BookingWidget from "@/components/doctor/BookingWidget";
import ReviewsSection from "@/components/doctor/ReviewsSection";
import ClinicDetails from "@/components/doctor/ClinicDetails";
import Footer from "@/components/doctor/Footer";
import BottomActionBar from "@/components/doctor/BottomActionBar";
import DoctorThemeProvider from "@/components/doctor/DoctorThemeProvider";
import SmoothScroll from "@/components/doctor/motion/SmoothScroll";
import { dsScrollTo } from "@/components/doctor/motion/scroll";
import { SELECT_DOCTOR_EVENT } from "@/components/doctor/DoctorsSection";
import HeroBanner from "@/components/doctor/HeroBanner";
import AboutSection from "@/components/doctor/AboutSection";
import ServicesSection from "@/components/doctor/ServicesSection";
import DoctorHours from "@/components/doctor/practitioner/DoctorHours";
import DoctorArticles from "@/components/doctor/practitioner/DoctorArticles";
import OtherDoctors from "@/components/doctor/practitioner/OtherDoctors";
import { usePractitionerHead } from "@/components/doctor/practitioner/usePractitionerHead";
import { clinicDisplayName } from "@/lib/doctorSite/teamClinic";
import { doctorPageNoindex, otherDoctors } from "@/lib/doctorSite/practitionerPage";
import { hoursFor } from "@/lib/practitioners/hours";
import { practitionerSubject } from "@/lib/doctorSite/practitionerSubject";
import { buildPractitionerJsonLd, buildPractitionerMeta, formatDoctorName } from "@/lib/seo/doctorSeo";
import { jsonLdScript } from "@/lib/jsonLd";

// Root of the doctor site: scopes the `ds-*` design tokens and the reduced-motion policy.
const Shell = ({ children }: { children: ReactNode }) => (
  <DoctorThemeProvider>
    <MotionConfig reducedMotion="user">
      <div className="doctor-site min-h-screen bg-ds-paper text-ds-ink">{children}</div>
    </MotionConfig>
  </DoctorThemeProvider>
);

const Notice = ({ title, children }: { title: string; children?: ReactNode }) => (
  <Shell>
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="font-ds-display text-ds-h2 font-medium">{title}</h1>
        {children && <p className="mt-3 text-ds-ink-2">{children}</p>}
      </div>
    </main>
  </Shell>
);

const PractitionerContent = () => {
  const { slug = "", doctorSlug = "" } = useParams<{ slug: string; doctorSlug: string }>();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const { profile, settings, practitioners, allWorkingHours, rawWorkingHours, isTeamClinic, loading } = useDoctorData();

  const doctor = useMemo(() => (practitioners ?? []).find((p) => p.slug === doctorSlug) ?? null, [practitioners, doctorSlug]);
  // 2+ active doctors (the context says so; a bare list is read the same way). Fewer: no doctor pages.
  const team = isTeamClinic ?? (practitioners ?? []).length >= 2;

  // An unknown or inactive doctor, or a clinic that is down to one doctor, has no page of its own:
  // send the visitor to the clinic page.
  useEffect(() => {
    if (!loading && profile && (!doctor || !team)) navigate(`/dr/${slug}`, { replace: true });
  }, [loading, profile, doctor, team, slug, navigate]);

  // Preselect this doctor in the booking widget (its listener is mounted before this effect runs).
  // Silent: arriving on the page must show the doctor, not scroll down to the booking card.
  const doctorId = doctor?.id;
  const bookable = !!doctor?.bookable;
  useEffect(() => {
    if (!doctorId || !bookable || !team) return;
    window.dispatchEvent(new CustomEvent(SELECT_DOCTOR_EVENT, { detail: { id: doctorId, silent: true } }));
  }, [doctorId, bookable, team]);

  const input = useMemo(
    () =>
      profile && doctor
        ? { origin: window.location.origin, profile, practitioner: doctor, settings, workingHours: hoursFor(rawWorkingHours ?? allWorkingHours ?? [], doctor.id) }
        : null,
    [profile, doctor, settings, rawWorkingHours, allWorkingHours],
  );
  const meta = useMemo(() => (input ? buildPractitionerMeta(input) : null), [input]);
  const structuredData = useMemo(() => (input ? buildPractitionerJsonLd(input) : null), [input]);
  usePractitionerHead(meta, doctor ? doctorPageNoindex(doctor) : false);

  const rows = useMemo(
    () => (doctor ? hoursFor(rawWorkingHours ?? allWorkingHours ?? [], doctor.id) : []),
    [rawWorkingHours, allWorkingHours, doctor],
  );
  const others = useMemo(() => (doctor ? otherDoctors(practitioners, doctor.id) : []), [practitioners, doctor]);
  // The single-doctor site's hero, About and Services, fed this doctor instead of the clinic owner.
  const subject = useMemo(
    () => (doctor && profile ? practitionerSubject({ doctor, profile, settings, workingHours: rows }) : null),
    [doctor, profile, settings, rows],
  );

  // A link like /dr/x/doctor/y#booking lands on that section once the page has rendered.
  useEffect(() => {
    if (loading || !doctor || !hash) return;
    let target = hash.slice(1);
    try {
      target = decodeURIComponent(target);
    } catch {
      // A malformed escape is just not a section id.
    }
    const frame = window.requestAnimationFrame(() => dsScrollTo(target));
    return () => window.cancelAnimationFrame(frame);
  }, [hash, loading, doctor]);

  if (loading) {
    return (
      <Shell>
        <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-ds-line border-t-ds-accent" />
        </div>
      </Shell>
    );
  }
  if (!profile) return <Notice title="Doctor Not Found">This page doesn't exist or hasn't been set up yet.</Notice>;
  if (profile.plan_status === "cancelled") {
    return <Notice title="This clinic is temporarily unavailable">Please check back later or contact the clinic directly.</Notice>;
  }
  if (!doctor || !team) return null; // the effect above is redirecting

  const name = formatDoctorName(doctor.display_name);
  const clinicName = clinicDisplayName(profile);

  return (
    <Shell>
      <SmoothScroll>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-ds-accent focus:px-5 focus:py-3 focus:font-medium focus:text-white"
        >
          Skip to main content
        </a>
        {structuredData && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }} />}
        <Navbar />
        <main id="main">
          <HeroBanner subject={subject ?? undefined} backLink={{ href: `/dr/${slug}`, label: `Back to ${clinicName}` }} />
          {settings?.show_about !== false && <AboutSection subject={subject ?? undefined} />}
          {settings?.show_services !== false && <ServicesSection subject={subject ?? undefined} />}

          <div className="px-5 py-[4.5rem] sm:px-6 md:py-24 lg:px-8">
            <div className="mx-auto max-w-[1200px]">
              <div className="max-w-xl">
                <DoctorHours rows={rows as never} name={name} />
              </div>
            </div>
          </div>

          {/* Stable wrapper: BookingWidget swaps its root between states, so observers watch this. */}
          <div id="booking-zone">
            {doctor.bookable ? (
              <BookingWidget />
            ) : (
              <section id="booking" aria-label="Booking" className="px-5 py-12 sm:px-6 lg:px-8">
                <p className="mx-auto max-w-[1200px] rounded-ds-lg border border-ds-line bg-ds-surface p-6 text-[1.0625rem] text-ds-ink-2 shadow-ds-1 sm:text-ds-body">
                  Online booking is not open for this doctor. Please call the clinic.
                </p>
              </section>
            )}
          </div>

          {settings?.show_reviews !== false && <ReviewsSection practitionerId={doctor.id} />}
          <DoctorArticles
            clinicId={profile.id}
            clinicSlug={slug}
            doctorId={doctor.id}
            doctorSlug={doctor.slug}
            name={name}
            enabled={settings?.show_blog !== false}
          />
          <OtherDoctors doctors={others} clinicSlug={slug} clinicName={clinicName} />
          {settings?.show_clinic_details !== false && <ClinicDetails />}
        </main>
        <Footer />
        <BottomActionBar />
        {/* Keeps the footer clear of the fixed mobile action bar. */}
        <div aria-hidden="true" style={{ height: "var(--ds-bottom-bar)" }} />
      </SmoothScroll>
    </Shell>
  );
};

const PractitionerPage = () => (
  <DoctorProvider>
    <PractitionerContent />
  </DoctorProvider>
);

export default PractitionerPage;
