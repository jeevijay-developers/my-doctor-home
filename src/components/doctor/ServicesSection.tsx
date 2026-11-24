import { useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronDown, Clock } from "lucide-react";
import { displayPrice, serviceType } from "@/lib/doctorSite/services";
import { useDoctorData } from "@/contexts/DoctorContext";
import { FEATURE_KEYS } from "@/lib/features";
import type { Tables } from "@/integrations/supabase/types";
import DsButton from "./ui/DsButton";
import SectionHeader from "./ui/SectionHeader";
import { bookNow } from "./siteActions";
import { DUR, EASE, staggerDelay } from "./motion/tokens";

type Service = Tables<"services">;

const INITIAL_VISIBLE = 6;
const LONG_DESCRIPTION = 140;

type RowProps = {
  index: number;
  name: string;
  description?: string | null;
  type: string | null | undefined;
  duration: number | null | undefined;
  price: number | null;
  onBook: () => void;
};

const ServiceRow = ({ index, name, description, type, duration, price, onBook }: RowProps) => {
  const [open, setOpen] = useState(false);
  const descId = useId();
  const kind = serviceType(type);
  const isLong = (description?.length ?? 0) > LONG_DESCRIPTION;

  return (
    <motion.li
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: DUR.medium, ease: EASE.out, delay: staggerDelay(index) }}
      className="group relative grid grid-cols-[auto_1fr] gap-x-4 border-t border-ds-line py-6 last:border-b sm:gap-x-6 md:grid-cols-[3rem_1fr_auto] md:items-center md:py-7"
    >
      <span aria-hidden="true" className="pt-1 font-ds-display text-[1.0625rem] italic text-ds-ink-3 ds-tabular md:pt-0">
        {String(index + 1).padStart(2, "0")}
      </span>

      <div className="min-w-0">
        <h3 className="font-ds-display text-ds-h3 font-medium text-ds-ink">{name}</h3>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-ds-small text-ds-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <kind.Icon aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            {kind.label}
          </span>
          {Number(duration) > 0 && (
            <span className="inline-flex items-center gap-1.5 ds-tabular">
              <Clock aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
              {duration} min
            </span>
          )}
          {price !== null && <span className="font-semibold text-ds-ink ds-tabular">₹{price.toLocaleString("en-IN")}</span>}
        </p>
        {description && (
          <div className="mt-3 max-w-[62ch]">
            <p id={descId} className={`text-ds-body text-ds-ink-2 ${open || !isLong ? "" : "line-clamp-2"}`}>
              {description}
            </p>
            {isLong && (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-controls={descId}
                className="mt-1 inline-flex min-h-11 items-center gap-1 text-ds-small font-medium text-ds-accent-ink underline-offset-4 hover:underline"
              >
                {open ? "Show less" : "Read more"}
                <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform duration-ds-2 ${open ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="col-start-2 mt-4 md:col-start-3 md:mt-0">
        <DsButton variant="secondary" onClick={onBook} className="group/btn w-full sm:w-auto" aria-label={`Book ${name}`}>
          Book
          <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform duration-ds-2 ease-ds-out group-hover/btn:translate-x-1" strokeWidth={2} />
        </DsButton>
      </div>
    </motion.li>
  );
};

const ServicesSection = () => {
  const { services, profile, settings, hasFeature } = useDoctorData();
  const [showAll, setShowAll] = useState(false);
  // An online-only service can only be booked when the doctor's plan offers online consultation.
  const onlineAllowed = hasFeature?.(FEATURE_KEYS.ONLINE_CONSULTATION) === true;
  const list = ((services ?? []) as Service[]).filter((service) => service.type !== "online" || onlineAllowed);
  const visible = showAll ? list : list.slice(0, INITIAL_VISIBLE);

  const online = Boolean(settings?.show_online_consultation) && hasFeature?.(FEATURE_KEYS.ONLINE_CONSULTATION);
  const onlineFee = Number(settings?.online_fee) > 0 ? Number(settings.online_fee) : null;

  // Same event as before: BookingWidget preselects the service (and its visit type).
  const book = (service: Partial<Service>) => {
    window.dispatchEvent(new CustomEvent("doctylia:select-service", { detail: service }));
    bookNow();
  };

  // No services added yet: the booking widget still sells a plain consultation, so list exactly that
  // (the doctor's own consultation fee and slot length; nothing invented, price omitted if unset).
  const defaultFee = Number(profile?.consultation_fee) > 0 ? Number(profile.consultation_fee) : null;
  const defaultDuration = Number(settings?.slot_duration_minutes) || null;

  return (
    <section id="services" aria-labelledby="services-heading" className="ds-grain ds-dots bg-ds-paper-2 py-[4.5rem] md:py-32">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
        <SectionHeader
          id="services-heading"
          eyebrow="Services"
          title={<>Services &amp; consultations</>}
          intro="Choose a service to book it directly. Prices and visit lengths are set by the clinic."
        />

        <ol className="mt-10 md:mt-14" aria-label="Services">
          {visible.map((service, index) => (
            <ServiceRow
              key={service.id}
              index={index}
              name={service.name?.trim() || "Consultation"}
              description={service.description}
              type={service.type}
              duration={service.duration}
              price={displayPrice(service, profile?.consultation_fee)}
              onBook={() => book(service)}
            />
          ))}
          {list.length === 0 && (
            <ServiceRow
              index={0}
              name="Clinic consultation"
              description="See the doctor at the clinic. Pick a time that suits you and book it online."
              type="clinic"
              duration={defaultDuration}
              price={defaultFee}
              onBook={() => book({ id: undefined, type: "clinic" })}
            />
          )}
          {online && (
            <ServiceRow
              index={Math.max(visible.length, list.length === 0 ? 1 : 0)}
              name="Online consultation"
              description="Speak with the doctor by video from wherever you are. Book a slot, pay online, and join the call from your phone."
              type="online"
              duration={Number(settings?.online_duration) || null}
              price={onlineFee}
              onBook={() => book({ id: undefined, type: "online" })}
            />
          )}
        </ol>

        <AnimatePresence>
          {list.length > INITIAL_VISIBLE && !showAll && (
            <motion.div exit={{ opacity: 0 }} className="mt-8 flex justify-center">
              <DsButton variant="quiet" onClick={() => setShowAll(true)}>
                Show all {list.length} services
                <ChevronDown aria-hidden="true" className="h-4 w-4" />
              </DsButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};

export default ServicesSection;
