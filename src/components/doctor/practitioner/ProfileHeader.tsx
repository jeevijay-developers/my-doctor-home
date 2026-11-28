import { ArrowLeft, CalendarCheck2, Phone } from "lucide-react";
import { Link } from "react-router-dom";
import OptimizedImage from "@/components/shared/OptimizedImage";
import { clinicPhone, formatQualifications, telHref } from "@/lib/doctorSite/doctorFacts";
import { initialsOf } from "@/lib/doctorSite/teamClinic";
import { practitionerFee } from "@/lib/practitioners/fee";
import type { PublicPractitioner } from "@/lib/practitioners/types";
import { formatDoctorName } from "@/lib/seo/doctorSeo";
import DsButton from "../ui/DsButton";
import { dsScrollTo } from "../motion/scroll";
import { bookNow } from "../siteActions";
import { SELECT_DOCTOR_EVENT } from "../DoctorsSection";

type Props = {
  doctor: PublicPractitioner;
  profile: Record<string, any> | null;
  clinicName: string;
  clinicHref: string;
};

/** Photo (or initials), name, specialty, rating and the facts a patient checks first, plus one clear next step. */
const ProfileHeader = ({ doctor, profile, clinicName, clinicHref }: Props) => {
  const name = formatDoctorName(doctor.display_name);
  const years = Number(doctor.experience_years);
  const fee = practitionerFee(doctor, profile?.consultation_fee);
  const phone = clinicPhone(profile);
  const rating = doctor.review_count > 0 && doctor.avg_rating != null ? Number(doctor.avg_rating) : null;
  const facts = [
    { term: "Qualifications", detail: formatQualifications(doctor.qualifications) },
    { term: "Experience", detail: Number.isFinite(years) && years > 0 ? `${years} year${years === 1 ? "" : "s"} in practice` : "" },
    { term: "Registration no.", detail: (doctor.registration_number ?? "").trim() },
    { term: "Consultation fee", detail: `₹${fee}` },
  ].filter((f) => f.detail);

  const book = () => {
    window.dispatchEvent(new CustomEvent(SELECT_DOCTOR_EVENT, { detail: { id: doctor.id } }));
    bookNow();
  };

  return (
    <section id="top" aria-labelledby="doctor-name" className="px-5 pb-10 pt-6 sm:px-6 md:pb-14 lg:px-8">
      <div className="mx-auto max-w-[1200px]">
        <Link to={clinicHref} className="inline-flex min-h-11 items-center gap-2 text-[1.0625rem] font-medium text-ds-accent-ink hover:underline sm:text-ds-body">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
          Back to {clinicName}
        </Link>

        <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
          {doctor.photo_url ? (
            <OptimizedImage
              src={doctor.photo_url}
              alt={name}
              width={416}
              height={416}
              className="h-36 w-36 shrink-0 rounded-ds-lg object-cover object-top ring-1 ring-ds-line sm:h-44 sm:w-44 lg:h-52 lg:w-52"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-36 w-36 shrink-0 items-center justify-center rounded-ds-lg bg-ds-accent-soft font-ds-display text-[3rem] font-medium text-ds-accent-ink sm:h-44 sm:w-44 lg:h-52 lg:w-52"
            >
              {initialsOf(doctor.display_name) || "Dr"}
            </span>
          )}

          <div className="min-w-0 flex-1">
            <h1 id="doctor-name" className="break-words font-ds-display text-ds-h2 font-medium leading-tight text-ds-ink">{name}</h1>
            {doctor.specialization && <p className="mt-2 text-ds-lead text-ds-ink-2">{doctor.specialization}</p>}
            {rating !== null && (
              <button
                type="button"
                onClick={() => dsScrollTo("reviews", { focusSelector: "h2" })}
                className="mt-3 inline-flex min-h-11 flex-wrap items-baseline gap-x-2 text-left text-[1.0625rem] text-ds-ink-2 underline-offset-4 hover:underline sm:text-ds-body"
              >
                <span className="font-medium text-ds-ink ds-tabular">★ {rating.toFixed(1)}</span>
                <span>{doctor.review_count} review{doctor.review_count === 1 ? "" : "s"}</span>
              </button>
            )}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {doctor.bookable ? (
                <DsButton size="lg" onClick={book} className="whitespace-normal text-center">
                  <CalendarCheck2 aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} />
                  Book with {name}
                </DsButton>
              ) : (
                phone && (
                  <DsButton size="lg" href={telHref(phone)}>
                    <Phone aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} />
                    Call the clinic to book
                  </DsButton>
                )
              )}
            </div>
          </div>
        </div>

        {facts.length > 0 && (
          <dl className="mt-8 grid border-t border-ds-line sm:grid-cols-2 sm:gap-x-10">
            {facts.map((f) => (
              <div key={f.term} className="flex items-baseline justify-between gap-4 border-b border-ds-line py-3">
                <dt className="text-ds-small text-ds-ink-3">{f.term}</dt>
                <dd className="min-w-0 break-words text-right text-[1.0625rem] text-ds-ink ds-tabular sm:text-ds-body">{f.detail}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
};

export default ProfileHeader;
