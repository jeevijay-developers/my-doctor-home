import { useRef } from "react";
import { motion } from "framer-motion";
import { Clock3, MapPin, Phone, Star } from "lucide-react";
import OptimizedImage from "@/components/shared/OptimizedImage";
import { HERO_IMAGE_WIDTH } from "@/lib/seo/imageUrl";
import { useDoctorData } from "@/contexts/DoctorContext";
import { getClinicMapsUrl } from "@/lib/clinicLocation";
import { getClinicStatus } from "@/lib/doctorSite/clinicStatus";
import { clinicPhone, customClaims, doctorName, isDefaultDescription, isDefaultHeadline, siteLabels, telHref, trustFacts } from "@/lib/doctorSite/doctorFacts";
import { getStatIconComponent } from "@/lib/quickStats";
import { heroPhotoBadge } from "@/lib/doctorSite/heroSettings";
import { todaysHours } from "@/lib/doctorSite/clinicStatus";
import { dsCn as cn } from "./ui/dsCn";
import QuickBookCard from "./hero/QuickBookCard";
import { useNow } from "./ui/useNow";
import { useNextAvailable } from "./hero/useNextAvailable";
import { useSplitReveal } from "./motion/useSplitReveal";
import CountUp from "./effects/CountUp";
import { DUR, EASE } from "./motion/tokens";

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: DUR.medium + 0.1, ease: EASE.out, delay },
});

const HeroBanner = () => {
  const { profile, reviews, settings, workingHours } = useDoctorData();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useSplitReveal(headingRef, { immediate: true });

  const name = doctorName(profile);
  const specialty = (profile?.specialization ?? "").trim();
  const place = (profile?.locality || profile?.city || "").trim();
  const now = useNow();
  const status = getClinicStatus(workingHours, now);
  const facts = trustFacts(profile, reviews);
  const claims = customClaims(settings);
  const labels = siteLabels(settings);
  const phone = clinicPhone(profile);
  const directions = (profile?.google_maps_url || "").trim() || getClinicMapsUrl(profile);
  const fee = Number(profile?.consultation_fee) > 0 ? Number(profile.consultation_fee) : null;
  const nextSlot = useNextAvailable(profile?.id, workingHours ?? [], settings?.slot_duration_minutes, settings?.booking_advance_days);

  // Platform-default copy is filler every doctor gets; show the doctor's own
  // headline if they wrote one, otherwise their name (the thing a patient checks first).
  const rawLine1 = (settings?.hero_headline_line1 ?? "").trim();
  const rawLine2 = (settings?.hero_headline_line2 ?? "").trim();
  const customHeadline = !isDefaultHeadline(rawLine1, rawLine2);
  const line1 = customHeadline ? rawLine1 : "";
  const line2 = customHeadline ? rawLine2 : "";
  const hasHeadline = Boolean(line1 || line2);
  const ownDescription = (settings?.hero_description ?? "").trim();
  const factualLead = [
    specialty ? `${specialty}${place ? ` in ${place}` : ""}.` : "",
    "Book a clinic visit online in under a minute, no phone call needed.",
  ].filter(Boolean).join(" ");
  const description = ownDescription && !isDefaultDescription(ownDescription) ? ownDescription : factualLead;
  const clinicName = (profile?.clinic_name ?? "").trim();
  const clinicAddress = [profile?.address, profile?.locality, profile?.city].map((v) => (v ?? "").trim()).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");
  const hoursToday = todaysHours(workingHours, now);

  // The hero portrait is the LCP element. It must be this exact URL/width: the
  // Edge function (api/seo.ts) preloads optimizedImageUrl(hero_photo_url, HERO_IMAGE_WIDTH).
  const heroPhoto = settings?.hero_photo_url || "";
  const fallbackPhoto = !heroPhoto ? profile?.profile_photo_url || "" : "";
  // Without a photo the clinic card carries Directions; don't offer it twice.
  const rowDirections = heroPhoto || fallbackPhoto ? directions : "";


  // The floating badge on the photo (My Website -> Hero Banner -> Photo badge).
  const badge = heroPhoto || fallbackPhoto ? heroPhotoBadge(settings, facts) : null;
  const BadgeIcon = badge ? getStatIconComponent(badge.icon) : null;

  const trustCells = [
    ...facts.map((f) => ({ key: f.id, value: f.value, label: f.label, rating: f.id === "rating", icon: undefined as string | undefined })),
    ...claims
      .filter((c) => !(badge && !badge.label && c.value === badge.value))
      .map((c) => ({ key: c.value, value: c.value, label: c.label || "Highlight", rating: false, icon: c.icon })),
  ];

  return (
    <section id="top" aria-labelledby="hero-heading" className="ds-grain relative overflow-hidden">
      <div className="mx-auto grid max-w-[1200px] gap-12 px-5 pb-16 pt-5 sm:px-6 md:pt-10 md:grid-cols-12 lg:gap-12 lg:px-8 lg:pb-28 lg:pt-12">
        {/* Phones: headline, then the booking card straight away (it must sit above the
            fixed action bar without scrolling); supporting copy follows. lg: editorial order. */}
        <div className="flex flex-col md:col-span-7 lg:pt-8">
          <motion.div {...rise(0)} className="order-1 flex flex-wrap items-center gap-x-3 gap-y-2">
            {(specialty || place) && (
              <p className="ds-eyebrow">
                {specialty}
                {specialty && place && <span aria-hidden="true" className="mx-2 text-ds-ink-3">·</span>}
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
                <span aria-hidden="true" className="relative flex h-2 w-2">
                  {status.state === "open" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ds-live-dot opacity-60 motion-reduce:hidden" />}
                  <span className={cn("relative inline-flex h-2 w-2 rounded-full", status.state === "open" ? "bg-ds-live-dot" : "bg-ds-ink-3")} />
                </span>
                {status.label}
              </p>
            )}
          </motion.div>

          <h1 id="hero-heading" ref={headingRef} className="order-2 mt-4 max-w-[15ch] font-ds-display text-ds-display font-medium text-ds-ink md:mt-5">
            {hasHeadline ? (
              <>
                {line1}
                {line1 && line2 && " "}
                {line2 && <em className="font-medium italic">{line2}</em>}
              </>
            ) : (
              name || "Book your visit"
            )}
          </h1>

          <motion.div {...rise(0.12)} className="order-3 mt-6 max-w-[34rem] md:order-5 md:mt-8">
            <QuickBookCard state={nextSlot} fee={fee} />
          </motion.div>

          {description && (
            <motion.p {...rise(0.18)} className="order-4 mt-6 max-w-[46ch] text-ds-lead text-ds-ink-2 md:order-3 md:mt-5">
              {description}
            </motion.p>
          )}

          {trustCells.length > 0 && (
            <motion.dl
              {...rise(0.22)}
              className="ds-glass order-5 mt-7 flex max-w-[34rem] flex-wrap overflow-hidden rounded-ds-md md:order-4"
            >
              {trustCells.map((cell) => {
                const CellIcon = cell.icon ? getStatIconComponent(cell.icon) : null;
                return (
                <div key={cell.key} className="flex min-w-0 flex-1 basis-[9rem] flex-col-reverse justify-end gap-1 border-ds-line/70 px-4 py-3.5 [&:not(:first-child)]:border-l">
                  <dt className="text-ds-label text-ds-ink-2">{cell.label}</dt>
                  <dd className="flex items-center gap-1.5 font-ds-display text-[1.375rem] font-medium leading-tight text-ds-ink ds-tabular">
                    {cell.rating && <Star aria-hidden="true" className="h-4 w-4 shrink-0 fill-ds-star text-ds-star" />}
                    {cell.rating && <span className="sr-only">Rated </span>}
                    {CellIcon && <CellIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-ds-accent" strokeWidth={1.75} />}
                    <span className="min-w-0 break-words">{cell.key === "qualifications" || cell.key === "registration" ? cell.value : <CountUp text={cell.value} />}</span>
                  </dd>
                </div>
                );
              })}
            </motion.dl>
          )}

          {rowDirections && (clinicAddress || hoursToday) && (
            <motion.dl {...rise(0.26)} className="order-6 mt-6 grid max-w-[34rem] gap-x-6 gap-y-3 text-ds-small sm:grid-cols-2">
              {clinicAddress && (
                <div className="flex gap-2.5">
                  <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ds-accent-ink" strokeWidth={1.75} />
                  <div className="min-w-0">
                    <dt className="text-ds-label font-medium uppercase tracking-[0.08em] text-ds-ink-3">{labels.location}</dt>
                    <dd className="text-ds-ink">{clinicName ? `${clinicName}, ` : ""}{clinicAddress}</dd>
                  </div>
                </div>
              )}
              {hoursToday && (
                <div className="flex gap-2.5">
                  <Clock3 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ds-accent-ink" strokeWidth={1.75} />
                  <div className="min-w-0">
                    <dt className="text-ds-label font-medium uppercase tracking-[0.08em] text-ds-ink-3">{labels.hours}</dt>
                    <dd className="text-ds-ink ds-tabular">{hoursToday}</dd>
                  </div>
                </div>
              )}
            </motion.dl>
          )}

          {(phone || rowDirections) && (
            <motion.div {...rise(0.28)} className="order-6 -ml-4 mt-4 flex flex-wrap gap-1">
              {phone && (
                <a href={telHref(phone)} className="inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-ds-small font-medium text-ds-ink transition-colors hover:bg-ds-ink/[0.06]">
                  <Phone aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  {labels.call ? <>{labels.call} <span className="ds-tabular text-ds-ink-2">{phone}</span></> : <>Call {phone}</>}
                </a>
              )}
              {rowDirections && (
                <a href={rowDirections} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-ds-small font-medium text-ds-ink transition-colors hover:bg-ds-ink/[0.06]">
                  <MapPin aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  {labels.directions}<span className="sr-only"> (opens Google Maps)</span>
                </a>
              )}
            </motion.div>
          )}
        </div>

        <div className="relative md:col-span-5 md:self-center">
          {/* Static on purpose: no tilt, parallax, zoom-in, glow or floating badge. */}
          <figure className="relative mx-auto w-full max-w-[440px] md:ml-auto md:mr-0">
            {heroPhoto || fallbackPhoto ? (
              <>
                <div className="relative">
                  <div className="aspect-[4/5] overflow-hidden rounded-ds-lg bg-ds-paper-2 shadow-ds-2 ring-1 ring-ds-line">
                    <OptimizedImage
                      src={heroPhoto || fallbackPhoto}
                      alt={name ? `Portrait of ${name}` : "Doctor portrait"}
                      width={HERO_IMAGE_WIDTH}
                      height={Math.round(HERO_IMAGE_WIDTH * 1.25)}
                      decoding="async"
                      {...{ fetchpriority: heroPhoto ? "high" : "auto" }}
                      className="h-full w-full object-cover object-top"
                    />
                  </div>
                  {badge && BadgeIcon && (
                    <div className="absolute -left-3 bottom-8 flex max-w-[16rem] items-center gap-3 rounded-ds-md border border-ds-line bg-ds-surface px-4 py-3 shadow-ds-2 sm:-left-8 sm:bottom-12">
                      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ds-accent-soft text-ds-accent-ink">
                        <BadgeIcon className={badge.icon === "Star" ? "h-5 w-5 fill-ds-star text-ds-star" : "h-5 w-5"} strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0 leading-tight">
                        <span className="block font-ds-display text-[1.25rem] font-medium text-ds-ink ds-tabular">{badge.value}</span>
                        {badge.label && <span className="block text-ds-label text-ds-ink-2">{badge.label}</span>}
                      </span>
                    </div>
                  )}
                </div>
                {(name || specialty) && (
                  <figcaption className="mt-3 flex items-baseline justify-between gap-3 px-1 text-ds-small">
                    <span className="whitespace-nowrap font-ds-display text-[1.0625rem] italic text-ds-ink">{name}</span>
                    <span className="truncate text-ds-ink-3">{[specialty, place].filter(Boolean).join(", ")}</span>
                  </figcaption>
                )}
              </>
            ) : (
              // No photo: a useful clinic card instead of an empty frame.
              <div className="relative overflow-hidden rounded-ds-lg border border-ds-line bg-ds-surface p-6 shadow-ds-2 sm:p-8">
                <p className="ds-eyebrow">{labels.location}</p>
                <p className="mt-3 font-ds-display text-ds-h3 font-medium text-ds-ink">{clinicName || name}</p>
                {clinicAddress && <p className="mt-2 text-ds-body text-ds-ink-2">{clinicAddress}</p>}
                {hoursToday && (
                  <p className="mt-5 border-t border-ds-line pt-4 text-ds-small text-ds-ink-2">
                    <span className="font-medium text-ds-ink">{labels.hours}</span> · <span className="ds-tabular">{hoursToday}</span>
                  </p>
                )}
                {directions && (
                  <a
                    href={directions}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-full border border-ds-line px-5 text-ds-small font-medium text-ds-ink transition-colors hover:bg-ds-ink/[0.04]"
                  >
                    <MapPin aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    {labels.directions}<span className="sr-only"> (opens Google Maps)</span>
                  </a>
                )}
              </div>
            )}
          </figure>
        </div>
      </div>
    </section>
  );
};

export default HeroBanner;
