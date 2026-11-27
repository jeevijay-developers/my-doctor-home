import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, UserRound } from "lucide-react";
import OptimizedImage from "@/components/shared/OptimizedImage";
import { useDoctorData } from "@/contexts/DoctorContext";
import { formatQualifications } from "@/lib/doctorSite/doctorFacts";
import { formatDoctorName } from "@/lib/seo/doctorSeo";
import type { PublicPractitioner } from "@/lib/practitioners/types";
import { practitionerFee } from "@/lib/practitioners/fee";
import DsButton from "./ui/DsButton";
import SectionHeader from "./ui/SectionHeader";
import { dsCn } from "./ui/dsCn";
import { bookNow } from "./siteActions";
import { DUR, EASE, staggerDelay } from "./motion/tokens";

/** Event the booking widget listens for: preselect this doctor and open the "When" step. */
export const SELECT_DOCTOR_EVENT = "doctylia:select-doctor";

/** From this many doctors on, a row of specialty chips narrows the list. */
const FILTER_FROM = 4;

const DoctorCard = ({ doctor, index, clinicFee }: { doctor: PublicPractitioner; index: number; clinicFee: unknown }) => {
  const name = formatDoctorName(doctor.display_name);
  const years = Number(doctor.experience_years);
  const facts = [
    { term: "Qualifications", detail: formatQualifications(doctor.qualifications) },
    { term: "Experience", detail: Number.isFinite(years) && years > 0 ? `${years} year${years === 1 ? "" : "s"} in practice` : "" },
    { term: "Consultation fee", detail: `₹${practitionerFee(doctor, clinicFee)}` },
  ].filter((f) => f.detail);

  const book = () => {
    window.dispatchEvent(new CustomEvent(SELECT_DOCTOR_EVENT, { detail: { id: doctor.id } }));
    bookNow();
  };

  return (
    <motion.li
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: DUR.medium, ease: EASE.out, delay: staggerDelay(index) }}
      className="flex flex-col rounded-ds-lg border border-ds-line bg-ds-surface p-6 shadow-ds-1"
    >
      <div className="flex items-center gap-4">
        {doctor.photo_url ? (
          <OptimizedImage
            src={doctor.photo_url}
            alt=""
            width={144}
            height={144}
            loading="lazy"
            decoding="async"
            className="h-[4.5rem] w-[4.5rem] shrink-0 rounded-full object-cover ring-2 ring-ds-surface"
          />
        ) : (
          <span aria-hidden="true" className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-full bg-ds-paper-2 text-ds-ink-2">
            <UserRound className="h-7 w-7" strokeWidth={1.5} />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="font-ds-display text-ds-h3 font-medium leading-tight text-ds-ink">{name}</h3>
          {doctor.specialization && <p className="mt-1 text-ds-body text-ds-ink-2">{doctor.specialization}</p>}
          {doctor.review_count > 0 && doctor.avg_rating != null && (
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-ds-small text-ds-ink-2">
              <span className="font-medium text-ds-ink ds-tabular">★ {Number(doctor.avg_rating).toFixed(1)}</span>
              <span>{doctor.review_count} review{doctor.review_count === 1 ? "" : "s"}</span>
            </p>
          )}
        </div>
      </div>

      {facts.length > 0 && (
        <dl className="mt-5 border-t border-ds-line">
          {facts.map((f) => (
            <div key={f.term} className="flex items-baseline justify-between gap-4 border-b border-ds-line py-2.5">
              <dt className="text-ds-small text-ds-ink-3">{f.term}</dt>
              <dd className="text-right text-ds-body text-ds-ink ds-tabular">{f.detail}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-auto pt-6">
        {doctor.bookable ? (
          <DsButton onClick={book} className="group/btn w-full" aria-label={`Book with ${name}`}>
            Book
            <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform duration-ds-2 ease-ds-out group-hover/btn:translate-x-1" strokeWidth={2} />
          </DsButton>
        ) : (
          <p className="text-ds-body text-ds-ink-2">Online booking is not open for this doctor. Please call the clinic.</p>
        )}
      </div>
    </motion.li>
  );
};

/**
 * "Choose your doctor" (multi-doctor clinics only): one card per listed doctor. "Book" hands
 * the doctor to the booking widget through SELECT_DOCTOR_EVENT. A single-doctor clinic gets nothing.
 */
const DoctorsSection = () => {
  const { profile, practitioners, isMultiDoctor } = useDoctorData();
  const [specialty, setSpecialty] = useState<string | null>(null);
  const list = useMemo(() => practitioners ?? [], [practitioners]);

  const specialties = useMemo(
    () =>
      [...new Set(list.map((d) => (d.specialization ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [list],
  );

  if (!isMultiDoctor || list.length === 0) return null;

  const showFilter = list.length >= FILTER_FROM && specialties.length > 1;
  const visible = showFilter && specialty ? list.filter((d) => (d.specialization ?? "").trim() === specialty) : list;

  const chip = (label: string, on: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={dsCn(
        "inline-flex min-h-11 items-center rounded-full border px-4 text-ds-body font-medium transition-colors duration-ds-1",
        on ? "border-ds-accent bg-ds-accent-soft text-ds-ink ring-1 ring-ds-accent" : "border-ds-line bg-ds-surface text-ds-ink-2 hover:border-ds-ink/30",
      )}
    >
      {label}
    </button>
  );

  return (
    <section id="doctors" aria-labelledby="doctors-heading" className="bg-ds-paper-2 py-[4.5rem] md:py-32">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
        <SectionHeader
          id="doctors-heading"
          eyebrow="Our doctors"
          title="Choose your doctor"
          intro="Pick the doctor you would like to see, then choose a time that suits you."
        />

        {showFilter && (
          <div role="group" aria-label="Filter by specialty" className="mt-8 flex flex-wrap gap-2">
            {chip("All", specialty === null, () => setSpecialty(null))}
            {specialties.map((s) => chip(s, specialty === s, () => setSpecialty(s)))}
          </div>
        )}

        <ul aria-label="Doctors" className="mt-10 grid gap-5 md:mt-14 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((d, i) => (
            <DoctorCard key={d.id} doctor={d} index={i} clinicFee={profile?.consultation_fee} />
          ))}
        </ul>
      </div>
    </section>
  );
};

export default DoctorsSection;
