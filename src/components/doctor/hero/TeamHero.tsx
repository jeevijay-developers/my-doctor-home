import { useRef } from "react";
import { motion } from "framer-motion";
import { CalendarCheck2, MapPin, Phone, Star, Users } from "lucide-react";
import OptimizedImage from "@/components/shared/OptimizedImage";
import { HERO_IMAGE_WIDTH } from "@/lib/seo/imageUrl";
import { useDoctorData } from "@/contexts/DoctorContext";
import { getClinicMapsUrl } from "@/lib/clinicLocation";
import { getClinicStatus } from "@/lib/doctorSite/clinicStatus";
import { clinicPhone, isDefaultDescription, ratingSummary, siteLabels, telHref } from "@/lib/doctorSite/doctorFacts";
import {
  clinicDisplayName, collageDoctors, distinctSpecialties, initialsOf, longestExperience, specialtiesLine,
} from "@/lib/doctorSite/teamClinic";
import { formatDoctorName } from "@/lib/seo/doctorSeo";
import { dsCn as cn } from "../ui/dsCn";
import DsButton from "../ui/DsButton";
import { dsScrollTo } from "../motion/scroll";
import { useNow } from "../ui/useNow";
import { useSplitReveal } from "../motion/useSplitReveal";
import { bookNow } from "../siteActions";
import { DUR, EASE } from "../motion/tokens";

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: DUR.medium + 0.1, ease: EASE.out, delay },
});

/** Hero of a clinic that lists two or more doctors: the clinic leads, never the owner. */
const TeamHero = () => {
  const { profile, settings, reviews, workingHours, practitioners } = useDoctorData();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useSplitReveal(headingRef, { immediate: true });
  const now = useNow();

  const doctors = practitioners ?? [];
  const clinicName = clinicDisplayName(profile);
  const place = (profile?.locality || profile?.city || "").trim();
  const specialties = specialtiesLine(doctors);
  const specialtyCount = distinctSpecialties(doctors).length;
  const years = longestExperience(doctors);
  const rating = ratingSummary(reviews ?? []);
  const status = getClinicStatus(workingHours, now);
  const labels = siteLabels(settings);
  const phone = clinicPhone(profile);
  const directions = (profile?.google_maps_url || "").trim() || getClinicMapsUrl(profile);

  const ownDescription = (settings?.hero_description ?? "").trim();
  const description =
    ownDescription && !isDefaultDescription(ownDescription)
      ? ownDescription
      : `${specialties ? `${specialties} care` : "Care"} from ${doctors.length} doctors${place ? ` in ${place}` : ""}. Choose a doctor and book a visit online in under a minute.`;

  // The Edge function (api/seo.ts) preloads exactly this URL/width; do not change the contract.
  const heroPhoto = settings?.hero_photo_url || "";

  const cells = [
    { key: "doctors", value: String(doctors.length), label: "Doctors" },
    ...(years > 0 ? [{ key: "experience", value: `${years} yrs`, label: "Longest experience" }] : []),
    ...(rating ? [{ key: "rating", value: rating.average.toFixed(1), label: `${rating.count} review${rating.count === 1 ? "" : "s"}`, rating: true }] : []),
    ...(specialtyCount > 1 ? [{ key: "specialties", value: String(specialtyCount), label: "Specialties" }] : []),
  ];

  const collage = collageDoctors(doctors, 4);

  return (
    <section id="top" aria-labelledby="hero-heading" className="ds-grain relative overflow-hidden">
      <div className="mx-auto grid max-w-[1200px] gap-12 px-5 pb-16 pt-5 sm:px-6 md:grid-cols-12 md:pt-10 lg:gap-12 lg:px-8 lg:pb-28 lg:pt-12">
        <div className="flex flex-col md:col-span-7 lg:pt-8">
          <motion.div {...rise(0)} className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {(specialties || place) && (
              <p className="ds-eyebrow">
                {specialties}
                {specialties && place && <span aria-hidden="true" className="mx-2 text-ds-ink-3">·</span>}
                {place}
              </p>
            )}
            {status.state !== "unknown" && (
              <p
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-ds-label font-medium",
                  status.state === "open" ? "border-ds-live/25 bg-ds-live/[0.07] text-ds-live" : "border-ds-line bg-ds-surface/60 text-ds-ink-2",
                )}
              >
                <span aria-hidden="true" className={cn("inline-flex h-2 w-2 rounded-full", status.state === "open" ? "bg-ds-live-dot" : "bg-ds-ink-3")} />
                {status.label}
              </p>
            )}
          </motion.div>

          <h1 id="hero-heading" ref={headingRef} className="mt-4 max-w-[18ch] break-words font-ds-display text-ds-display font-medium text-ds-ink md:mt-5">
            {clinicName}
          </h1>

          <motion.p {...rise(0.12)} className="mt-5 max-w-[46ch] text-ds-lead text-ds-ink-2">
            {description}
          </motion.p>

          <motion.div {...rise(0.18)} className="mt-7 flex flex-col gap-3 sm:flex-row">
            <DsButton size="lg" onClick={bookNow}>
              <CalendarCheck2 aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} />
              Book appointment
            </DsButton>
            <DsButton
              size="lg"
              variant="secondary"
              href="#doctors"
              onClick={(e) => {
                e.preventDefault();
                dsScrollTo("doctors");
              }}
            >
              <Users aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} />
              Meet our doctors
            </DsButton>
          </motion.div>

          <motion.dl {...rise(0.22)} aria-label="Clinic at a glance" className="ds-glass mt-8 flex max-w-[34rem] flex-wrap overflow-hidden rounded-ds-md">
            {cells.map((cell) => (
              <div key={cell.key} className="flex min-w-0 flex-1 basis-[7.5rem] flex-col-reverse justify-end gap-1 border-ds-line/70 px-4 py-3.5 [&:not(:first-child)]:border-l">
                <dt className="text-ds-label text-ds-ink-2">{cell.label}</dt>
                <dd className="flex items-center gap-1.5 font-ds-display text-[1.375rem] font-medium leading-tight text-ds-ink ds-tabular">
                  {"rating" in cell && cell.rating && <Star aria-hidden="true" className="h-4 w-4 shrink-0 fill-ds-star text-ds-star" />}
                  {"rating" in cell && cell.rating && <span className="sr-only">Rated </span>}
                  {cell.value}
                </dd>
              </div>
            ))}
          </motion.dl>

          {(phone || directions) && (
            <motion.div {...rise(0.26)} className="-ml-4 mt-4 flex flex-wrap gap-1">
              {phone && (
                <a href={telHref(phone)} className="inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-ds-small font-medium text-ds-ink transition-colors hover:bg-ds-ink/[0.06]">
                  <Phone aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  {labels.call ? <>{labels.call} <span className="ds-tabular text-ds-ink-2">{phone}</span></> : <>Call {phone}</>}
                </a>
              )}
              {directions && (
                <a href={directions} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-ds-small font-medium text-ds-ink transition-colors hover:bg-ds-ink/[0.06]">
                  <MapPin aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  {labels.directions}<span className="sr-only"> (opens Google Maps)</span>
                </a>
              )}
            </motion.div>
          )}
        </div>

        <div className="relative md:col-span-5 md:self-center">
          {/* Static on purpose: no tilt, parallax, zoom-in or floating badge. */}
          <figure className="relative mx-auto w-full max-w-[440px] md:ml-auto md:mr-0">
            {heroPhoto ? (
              <div className="aspect-[4/5] overflow-hidden rounded-ds-lg bg-ds-paper-2 shadow-ds-2 ring-1 ring-ds-line">
                <OptimizedImage
                  src={heroPhoto}
                  alt={`${clinicName}`}
                  width={HERO_IMAGE_WIDTH}
                  height={Math.round(HERO_IMAGE_WIDTH * 1.25)}
                  decoding="async"
                  {...{ fetchpriority: "high" }}
                  className="h-full w-full object-cover object-top"
                />
              </div>
            ) : (
              <ul
                aria-label="Our doctors"
                data-testid="team-collage"
                className={cn("grid gap-3", collage.length === 1 ? "grid-cols-1" : "grid-cols-2")}
              >
                {collage.map((d, i) => {
                  const name = formatDoctorName(d.display_name);
                  const photo = (d.photo_url ?? "").trim();
                  return (
                    <li
                      key={d.id}
                      className={cn(
                        "relative aspect-[4/5] overflow-hidden rounded-ds-md bg-ds-paper-2 ring-1 ring-ds-line",
                        collage.length === 3 && i === 2 && "col-span-2 aspect-[2/1]",
                      )}
                    >
                      {photo ? (
                        <OptimizedImage
                          src={photo}
                          alt={name}
                          width={360}
                          height={450}
                          loading={i === 0 ? "eager" : "lazy"}
                          decoding="async"
                          className="h-full w-full object-cover object-top"
                        />
                      ) : (
                        <span aria-hidden="true" className="flex h-full w-full items-center justify-center bg-ds-accent-soft font-ds-display text-[2.5rem] font-medium text-ds-accent-ink">
                          {initialsOf(d.display_name) || "Dr"}
                        </span>
                      )}
                      <span className="absolute inset-x-0 bottom-0 truncate bg-ds-surface/90 px-3 py-2 text-ds-label font-medium text-ds-ink">
                        {name}
                        {!photo && <span className="sr-only"> (no photo)</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </figure>
        </div>
      </div>
    </section>
  );
};

export default TeamHero;
