import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import OptimizedImage from "@/components/shared/OptimizedImage";
import { doctorGridClass, doctorProfilePath, initialsOf } from "@/lib/doctorSite/teamClinic";
import { formatDoctorName } from "@/lib/seo/doctorSeo";
import type { PublicPractitioner } from "@/lib/practitioners/types";
import SectionHeader from "../ui/SectionHeader";
import { dsCn } from "../ui/dsCn";

const MAX_SHOWN = 6;

/** The clinic's other doctors, each card a link to their own page. Hidden when there is nobody else. */
const OtherDoctors = ({ doctors, clinicSlug, clinicName }: { doctors: PublicPractitioner[]; clinicSlug: string; clinicName: string }) => {
  if (doctors.length === 0) return null;
  const shown = doctors.slice(0, MAX_SHOWN);
  return (
    <section id="doctors" aria-labelledby="other-doctors-heading" className="bg-ds-paper-2 py-[4.5rem] md:py-28">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
        <SectionHeader
          id="other-doctors-heading"
          eyebrow="Our doctors"
          title={`Other doctors at ${clinicName}`}
          aside={
            doctors.length > MAX_SHOWN ? (
              <Link to={`/dr/${encodeURIComponent(clinicSlug)}#doctors`} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-ds-line bg-ds-surface/70 px-6 text-ds-small font-semibold transition-colors hover:border-ds-ink/30">
                See all doctors <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            ) : undefined
          }
        />
        <ul aria-label="Other doctors" className={dsCn("mt-8 grid gap-4 md:mt-12", doctorGridClass(shown.length))}>
          {shown.map((d) => {
            const name = formatDoctorName(d.display_name);
            return (
              <li key={d.id} className="min-w-0">
                <Link
                  to={doctorProfilePath(clinicSlug, d.slug)}
                  className="group flex h-full items-center gap-4 rounded-ds-lg border border-ds-line bg-ds-surface p-4 shadow-ds-1 transition-colors hover:border-ds-ink/30"
                >
                  {d.photo_url ? (
                    <OptimizedImage src={d.photo_url} alt="" width={128} height={128} loading="lazy" className="h-16 w-16 shrink-0 rounded-full object-cover object-top ring-1 ring-ds-line" />
                  ) : (
                    <span aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-ds-accent-soft font-ds-display text-xl font-medium text-ds-accent-ink">
                      {initialsOf(d.display_name) || "Dr"}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-ds-display text-[1.1875rem] font-medium leading-snug text-ds-ink">{name}</span>
                    {d.specialization && <span className="block break-words text-ds-small text-ds-ink-2">{d.specialization}</span>}
                    <span className="mt-1 inline-flex items-center gap-1 text-ds-small font-semibold text-ds-accent-ink">
                      View profile <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform duration-ds-2 group-hover:translate-x-1" />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};

export default OtherDoctors;
