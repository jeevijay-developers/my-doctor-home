import { useId, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronDown } from "lucide-react";
import OptimizedImage from "@/components/shared/OptimizedImage";
import { useDoctorData } from "@/contexts/DoctorContext";
import { doctorName, formatQualifications } from "@/lib/doctorSite/doctorFacts";
import DsButton from "./ui/DsButton";
import SectionHeader from "./ui/SectionHeader";
import { bookNow } from "./siteActions";
import { DUR, EASE, staggerDelay } from "./motion/tokens";

const BIO_PREVIEW = 420;

/**
 * About the doctor (spec §5.5): their own photo and bio, credentials as a
 * definition list, one action. Every line comes from what the doctor entered;
 * nothing is written on their behalf, and missing items are simply left out.
 */
const AboutSection = () => {
  const { profile, settings } = useDoctorData();
  const reduce = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const bioId = useId();

  const name = doctorName(profile);
  const bio = (profile?.bio ?? "").trim();
  const isLongBio = bio.length > BIO_PREVIEW;
  const photo = settings?.about_photo_url || profile?.profile_photo_url || "";
  const years = Number(profile?.experience_years);
  const place = [profile?.locality, profile?.city].map((v) => (v ?? "").trim()).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");

  const credentials = [
    { term: "Specialty", detail: (profile?.specialization ?? "").trim() },
    { term: "Qualifications", detail: formatQualifications(profile?.qualifications) },
    { term: "Experience", detail: Number.isFinite(years) && years > 0 ? `${years} year${years === 1 ? "" : "s"} in practice` : "" },
    { term: "Registration no.", detail: (profile?.registration_number ?? "").trim() },
    { term: "Clinic", detail: [(profile?.clinic_name ?? "").trim(), place].filter(Boolean).join(", ") },
  ].filter((c) => c.detail);

  return (
    <section id="about" aria-labelledby="about-heading" className="relative py-[4.5rem] md:py-32">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-5 sm:px-6 lg:grid-cols-12 lg:gap-16 lg:px-8">
        {photo && (
          <figure className="order-2 mx-auto w-full max-w-[420px] lg:order-1 lg:col-span-5 lg:mx-0 lg:max-w-none">
            <motion.div
              initial={reduce ? false : { clipPath: "inset(12% 8% 12% 8% round 28px)" }}
              whileInView={{ clipPath: "inset(0% 0% 0% 0% round 28px)" }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 1.1, ease: EASE.out }}
              className="aspect-[4/5] overflow-hidden rounded-ds-lg bg-ds-paper-2 ring-1 ring-ds-line"
            >
              <OptimizedImage
                src={photo}
                alt={name || "The doctor"}
                width={860}
                height={1075}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover object-top"
              />
            </motion.div>
            {name && (
              <figcaption className="mt-3 px-1 font-ds-display text-[1.0625rem] italic text-ds-ink-2">
                {name}
                {profile?.specialization ? `, ${String(profile.specialization).trim()}` : ""}
              </figcaption>
            )}
          </figure>
        )}

        <div className={photo ? "order-1 lg:order-2 lg:col-span-7 lg:pt-6" : "lg:col-span-8 lg:col-start-3"}>
          <SectionHeader id="about-heading" eyebrow="About the doctor" title={name ? `Meet ${name}` : "About the doctor"} />

          {bio && (
            <div className="mt-6 max-w-[62ch]">
              <p id={bioId} className={`whitespace-pre-line text-ds-lead text-ds-ink-2 ${expanded || !isLongBio ? "" : "line-clamp-6"}`}>
                {bio}
              </p>
              {isLongBio && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  aria-expanded={expanded}
                  aria-controls={bioId}
                  className="mt-2 inline-flex min-h-11 items-center gap-1 text-ds-small font-medium text-ds-accent-ink underline-offset-4 hover:underline"
                >
                  {expanded ? "Show less" : "Read the full story"}
                  <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform duration-ds-2 ${expanded ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>
          )}

          {credentials.length > 0 && (
            <dl className="mt-8 max-w-[40rem] border-t border-ds-line">
              {credentials.map((item, index) => (
                <motion.div
                  key={item.term}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: DUR.medium, ease: EASE.out, delay: staggerDelay(index) }}
                  className="grid gap-1 border-b border-ds-line py-4 sm:grid-cols-[11rem_1fr] sm:gap-6"
                >
                  <dt className="text-ds-label font-medium uppercase tracking-[0.08em] text-ds-ink-3">{item.term}</dt>
                  <dd className="text-ds-body text-ds-ink">{item.detail}</dd>
                </motion.div>
              ))}
            </dl>
          )}

          <div className="mt-9">
            <DsButton size="lg" magnetic onClick={bookNow}>
              {name ? `Book with ${name}` : "Book an appointment"}
              <ArrowRight aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={2} />
            </DsButton>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
