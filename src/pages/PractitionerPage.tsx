import { useEffect, useMemo, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { ArrowLeft, UserRound } from "lucide-react";
import "@/styles/doctor-site.css";
import { DoctorProvider, useDoctorData } from "@/contexts/DoctorContext";
import BookingWidget from "@/components/doctor/BookingWidget";
import Footer from "@/components/doctor/Footer";
import DoctorThemeProvider from "@/components/doctor/DoctorThemeProvider";
import OptimizedImage from "@/components/shared/OptimizedImage";
import { dsCn } from "@/components/doctor/ui/dsCn";
import { SELECT_DOCTOR_EVENT } from "@/components/doctor/DoctorsSection";
import { formatQualifications } from "@/lib/doctorSite/doctorFacts";
import { groupWorkingHours, formatDayRangeLabel } from "@/lib/workingHoursGrouping";
import { dayIntervals, type WorkingHoursRow } from "@/lib/doctorSite/clinicStatus";
import { hoursFor } from "@/lib/practitioners/hours";
import { practitionerFee } from "@/lib/practitioners/fee";
import { DEFAULT_TITLE, buildPractitionerJsonLd, buildPractitionerMeta, doctorDisplayName, formatDoctorName } from "@/lib/seo/doctorSeo";
import { jsonLdScript } from "@/lib/jsonLd";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const Shell = ({ children }: { children: ReactNode }) => (
  <DoctorThemeProvider>
    <MotionConfig reducedMotion="user">
      <div className="doctor-site min-h-screen bg-ds-paper text-ds-ink">{children}</div>
    </MotionConfig>
  </DoctorThemeProvider>
);

/** Sets a <meta> tag (created when missing) and returns the function that puts the previous value back. */
function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
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

function setCanonical(href: string) {
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
  const { profile, practitioners, allWorkingHours, rawWorkingHours, loading } = useDoctorData();

  const doctor = useMemo(() => (practitioners ?? []).find((p) => p.slug === doctorSlug) ?? null, [practitioners, doctorSlug]);

  // An unknown or inactive doctor has no page of its own: send the visitor to the clinic page.
  useEffect(() => {
    if (!loading && profile && !doctor) navigate(`/dr/${slug}`, { replace: true });
  }, [loading, profile, doctor, slug, navigate]);

  // Preselect this doctor in the booking widget (its listener is mounted before this effect runs).
  const doctorId = doctor?.id;
  const bookable = !!doctor?.bookable;
  useEffect(() => {
    if (!doctorId || !bookable) return;
    window.dispatchEvent(new CustomEvent(SELECT_DOCTOR_EVENT, { detail: { id: doctorId } }));
  }, [doctorId, bookable]);

  const input = useMemo(
    () => (profile && doctor ? { origin: window.location.origin, profile, practitioner: doctor } : null),
    [profile, doctor],
  );
  const meta = useMemo(() => (input ? buildPractitionerMeta(input) : null), [input]);
  const structuredData = useMemo(() => (input ? buildPractitionerJsonLd(input) : null), [input]);

  useEffect(() => {
    if (!meta?.title) return;
    const prevTitle = document.title;
    document.title = meta.title;
    const canonical = meta.canonical || window.location.href;
    const undo: Array<() => void> = [
      setCanonical(canonical),
      setMeta("name", "description", meta.description),
      setMeta("property", "og:title", meta.title),
      setMeta("property", "og:description", meta.description),
      setMeta("property", "og:url", canonical),
      setMeta("property", "og:type", "profile"),
      setMeta("name", "twitter:title", meta.title),
      setMeta("name", "twitter:description", meta.description),
    ];
    if (meta.image) {
      undo.push(setMeta("property", "og:image", meta.image), setMeta("name", "twitter:image", meta.image));
    }
    return () => {
      document.title = prevTitle || DEFAULT_TITLE;
      undo.forEach((fn) => fn());
    };
  }, [meta]);

  const groups = useMemo(() => {
    if (!doctor) return [];
    const rows = [...hoursFor(rawWorkingHours ?? allWorkingHours ?? [], doctor.id)].sort((a, b) => a.day_of_week - b.day_of_week);
    return groupWorkingHours(rows);
  }, [rawWorkingHours, allWorkingHours, doctor]);

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
  if (!doctor) return null; // the effect above is redirecting

  const name = formatDoctorName(doctor.display_name);
  const clinic = doctorDisplayName(profile);
  const years = Number(doctor.experience_years);
  const fee = practitionerFee(doctor, profile.consultation_fee);
  const facts = [
    { term: "Qualifications", detail: formatQualifications(doctor.qualifications) },
    { term: "Experience", detail: Number.isFinite(years) && years > 0 ? `${years} year${years === 1 ? "" : "s"} in practice` : "" },
    { term: "Registration no.", detail: (doctor.registration_number ?? "").trim() },
    { term: "Consultation fee", detail: `₹${fee}` },
  ].filter((f) => f.detail);

  return (
    <Shell>
      {structuredData && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }} />}
      <main id="main" className="mx-auto max-w-[1200px] px-5 py-10 sm:px-6 md:py-16 lg:px-8">
        <Link to={`/dr/${slug}`} className="inline-flex min-h-11 items-center gap-2 text-ds-body font-medium text-ds-accent-ink hover:underline">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
          {clinic ? `Back to ${clinic}'s clinic` : "Back to the clinic"}
        </Link>

        <header className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center">
          {doctor.photo_url ? (
            <OptimizedImage
              src={doctor.photo_url}
              alt={name}
              width={320}
              height={320}
              className="h-32 w-32 shrink-0 rounded-full object-cover ring-2 ring-ds-surface sm:h-40 sm:w-40"
            />
          ) : (
            <span aria-hidden="true" className="flex h-32 w-32 shrink-0 items-center justify-center rounded-full bg-ds-paper-2 text-ds-ink-2 sm:h-40 sm:w-40">
              <UserRound className="h-12 w-12" strokeWidth={1.5} />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="font-ds-display text-ds-h1 font-medium leading-tight text-ds-ink">{name}</h1>
            {doctor.specialization && <p className="mt-2 text-ds-body text-ds-ink-2">{doctor.specialization}</p>}
          </div>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            {doctor.bio?.trim() && (
              <section aria-labelledby="about-doctor">
                <h2 id="about-doctor" className="font-ds-display text-ds-h3 font-medium">About {name}</h2>
                <p className="mt-3 whitespace-pre-line text-[1.0625rem] leading-relaxed text-ds-ink-2 sm:text-ds-body">{doctor.bio.trim()}</p>
              </section>
            )}

            {facts.length > 0 && (
              <dl className="mt-8 border-t border-ds-line">
                {facts.map((f) => (
                  <div key={f.term} className="flex items-baseline justify-between gap-4 border-b border-ds-line py-3">
                    <dt className="text-ds-small text-ds-ink-3">{f.term}</dt>
                    <dd className="text-right text-[1.0625rem] text-ds-ink ds-tabular sm:text-ds-body">{f.detail}</dd>
                  </div>
                ))}
              </dl>
            )}

            {groups.length > 0 && (
              <section aria-labelledby="doctor-hours" className="mt-10">
                <h2 id="doctor-hours" className="font-ds-display text-ds-h3 font-medium">Hours</h2>
                <dl className="mt-4 border-t border-ds-line">
                  {groups.map((g) => {
                    const sessions = g.sample.is_open
                      ? dayIntervals(g.sample as unknown as WorkingHoursRow).map((i) => `${i.startLabel} – ${i.endLabel}`)
                      : ["Closed"];
                    const lines = sessions.length > 0 ? sessions : ["Contact the clinic"];
                    return (
                      <div key={g.days.join("-")} className="flex items-start justify-between gap-4 border-b border-ds-line py-3.5 text-[1.0625rem] text-ds-ink-2 sm:text-ds-body">
                        <dt>{formatDayRangeLabel(g.days, DAY_NAMES)}</dt>
                        <dd className={dsCn("text-right ds-tabular", !g.sample.is_open && "text-ds-danger")}>
                          {lines.map((line) => (
                            <span key={line} className="block whitespace-nowrap">{line}</span>
                          ))}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </section>
            )}
          </div>

          <div className="lg:col-span-5" id="booking-zone">
            {doctor.bookable ? (
              <BookingWidget />
            ) : (
              <p className="rounded-ds-lg border border-ds-line bg-ds-surface p-6 text-[1.0625rem] text-ds-ink-2 shadow-ds-1">
                Online booking is not open for this doctor. Please call the clinic.
              </p>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </Shell>
  );
};

const PractitionerPage = () => (
  <DoctorProvider>
    <PractitionerContent />
  </DoctorProvider>
);

export default PractitionerPage;
