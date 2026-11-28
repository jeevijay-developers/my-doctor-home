import { useId, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronDown } from "lucide-react";
import OptimizedImage from "@/components/shared/OptimizedImage";
import { useDoctorData } from "@/contexts/DoctorContext";
import { clinicDisplayName, distinctSpecialties } from "@/lib/doctorSite/teamClinic";
import DsButton from "./ui/DsButton";
import SectionHeader from "./ui/SectionHeader";
import { bookNow } from "./siteActions";
import { DUR, EASE, staggerDelay } from "./motion/tokens";

const STORY_PREVIEW = 420;

/**
 * "About the clinic" for a clinic with several doctors. The story is the clinic's; if no
 * clinic-level text exists the owner's about text stands in, but never the owner's credentials,
 * and the owner's portrait is not used (the page is about the clinic). Each doctor's own
 * credentials live on their card and profile page.
 */
const TeamAbout = () => {
  const { profile, settings, practitioners } = useDoctorData();
  const reduce = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const storyId = useId();

  const clinicName = clinicDisplayName(profile);
  const story = (profile?.bio ?? "").trim();
  const isLong = story.length > STORY_PREVIEW;
  const photo = settings?.about_photo_url || "";
  const doctors = practitioners ?? [];
  const specialties = distinctSpecialties(doctors);
  const address = [profile?.address, profile?.locality, profile?.city, profile?.state]
    .map((v: string | null | undefined) => (v ?? "").trim())
    .filter(Boolean)
    .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
    .join(", ");

  const facts = [
    { term: "Doctors", detail: String(doctors.length) },
    { term: "Specialties", detail: specialties.join(", ") },
    { term: "Address", detail: address },
  ].filter((f) => f.detail);

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
              <OptimizedImage src={photo} alt={`${clinicName}`} width={860} height={1075} loading="lazy" decoding="async" className="h-full w-full object-cover object-center" />
            </motion.div>
          </figure>
        )}

        <div className={photo ? "order-1 lg:order-2 lg:col-span-7 lg:pt-6" : "lg:col-span-8 lg:col-start-3"}>
          <SectionHeader id="about-heading" eyebrow="About the clinic" title={`About ${clinicName}`} />

          {story && (
            <div className="mt-6 max-w-[62ch]">
              <p id={storyId} className={`whitespace-pre-line break-words text-ds-lead text-ds-ink-2 ${expanded || !isLong ? "" : "line-clamp-6"}`}>
                {story}
              </p>
              {isLong && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  aria-expanded={expanded}
                  aria-controls={storyId}
                  className="mt-2 inline-flex min-h-11 items-center gap-1 text-ds-small font-medium text-ds-accent-ink underline-offset-4 hover:underline"
                >
                  {expanded ? "Show less" : "Read the full story"}
                  <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform duration-ds-2 ${expanded ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>
          )}

          {facts.length > 0 && (
            <dl className="mt-8 max-w-[40rem] border-t border-ds-line">
              {facts.map((item, index) => (
                <motion.div
                  key={item.term}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: DUR.medium, ease: EASE.out, delay: staggerDelay(index) }}
                  className="grid gap-1 border-b border-ds-line py-4 sm:grid-cols-[11rem_1fr] sm:gap-6"
                >
                  <dt className="text-ds-label font-medium uppercase tracking-[0.08em] text-ds-ink-3">{item.term}</dt>
                  <dd className="break-words text-ds-body text-ds-ink">{item.detail}</dd>
                </motion.div>
              ))}
            </dl>
          )}

          <div className="mt-9">
            <DsButton size="lg" onClick={bookNow}>
              Book appointment
              <ArrowRight aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={2} />
            </DsButton>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TeamAbout;
