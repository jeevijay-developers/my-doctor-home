import { Mail, MapPin, Navigation, Phone } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { useDoctorData } from "@/contexts/DoctorContext";
import { getClinicMapsQuery, getClinicMapsUrl } from "@/lib/clinicLocation";
import { groupWorkingHours, formatDayRangeLabel } from "@/lib/workingHoursGrouping";
import { dayIntervals, getClinicStatus, istNow, type WorkingHoursRow } from "@/lib/doctorSite/clinicStatus";
import { clinicPhone, telHref, whatsappHref } from "@/lib/doctorSite/doctorFacts";
import type { Tables } from "@/integrations/supabase/types";
import { dsCn as cn } from "./ui/dsCn";
import DsButton from "./ui/DsButton";
import SectionHeader from "./ui/SectionHeader";
import { useNow } from "./ui/useNow";
import { useDwellInView } from "./ui/useDwellInView";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type WorkingHour = Tables<"working_hours">;

/** One line per session ("9:00 AM – 1:00 PM"), so two sessions stack instead of wrapping mid-time. */
const scheduleLines = (row: WorkingHour): string[] => {
  if (!row.is_open) return ["Closed"];
  const sessions = dayIntervals(row as WorkingHoursRow).map((i) => `${i.startLabel} – ${i.endLabel}`);
  return sessions.length > 0 ? sessions : ["Contact the clinic"];
};

/**
 * Visit the clinic (spec §5.10): where it is, when it is open, and the three
 * ways to reach it, each one tap. The map loads only when scrolled near
 * (a Google embed is ~1 MB and sets a third-party cookie).
 */
const ClinicDetails = () => {
  const { profile, workingHours, settings } = useDoctorData();
  const [mapRef, mapNear] = useDwellInView<HTMLDivElement>();

  const clinicName = (profile?.clinic_name ?? "").trim();
  const address = [profile?.address, profile?.locality, profile?.city, profile?.state]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(", ");
  const phone = clinicPhone(profile);
  const email = (profile?.clinic_email ?? "").trim();
  const whatsapp = whatsappHref(settings);
  const mapsQuery = getClinicMapsQuery(profile);
  const directionsUrl = (profile?.google_maps_url ?? "").trim() || getClinicMapsUrl(profile);

  const schedule = [...((workingHours ?? []) as WorkingHour[])].sort((a, b) => a.day_of_week - b.day_of_week);
  const groups = groupWorkingHours(schedule);
  const now = useNow();
  const today = istNow(now).day;
  const status = getClinicStatus(workingHours as WorkingHoursRow[], now);

  if (!address && !clinicName && !phone && !email && groups.length === 0) return null;

  return (
    <section id="contact" aria-labelledby="contact-heading" className="py-[4.5rem] md:py-32">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
        <SectionHeader
          id="contact-heading"
          eyebrow="Visit the clinic"
          title={clinicName || "Find the clinic"}
          intro={address || undefined}
        />

        <div className="mt-10 grid gap-8 md:mt-14 lg:grid-cols-12 lg:gap-12">
          <div ref={mapRef} className="relative min-h-[320px] overflow-hidden rounded-ds-lg bg-ds-paper-2 ring-1 ring-ds-line lg:col-span-7 lg:min-h-[480px]">
            {mapsQuery && mapNear ? (
              <iframe
                title={`Map showing ${clinicName || "the clinic"}`}
                className="absolute inset-0 h-full w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://www.google.com/maps?q=${encodeURIComponent(mapsQuery)}&output=embed`}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                <MapPin className="h-10 w-10 text-ds-ink-3" strokeWidth={1.25} />
              </div>
            )}
            {directionsUrl && (
              <div className="absolute inset-x-4 bottom-4">
                <DsButton href={directionsUrl} target="_blank" rel="noreferrer" size="lg" className="w-full shadow-ds-2 sm:w-auto">
                  <Navigation aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  Get directions<span className="sr-only"> (opens Google Maps)</span>
                </DsButton>
              </div>
            )}
          </div>

          <div className="lg:col-span-5">
            {groups.length > 0 && (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-ds-display text-ds-h3 font-medium">Hours</h3>
                  {status.state !== "unknown" && (
                    <p className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-ds-label font-medium", status.state === "open" ? "border-ds-live/25 bg-ds-live/[0.07] text-ds-live" : "border-ds-line text-ds-ink-2")}>
                      <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", status.state === "open" ? "bg-ds-live-dot" : "bg-ds-ink-3")} />
                      {status.label}
                    </p>
                  )}
                </div>
                <dl className="mt-4 border-t border-ds-line">
                  {groups.map((group) => {
                    const isToday = group.days.includes(today);
                    return (
                      <div key={group.days.join("-")} className={cn("flex items-start justify-between gap-4 border-b border-ds-line py-3.5 text-ds-body", isToday ? "font-semibold text-ds-ink" : "text-ds-ink-2")}>
                        <dt>
                          {formatDayRangeLabel(group.days, DAY_NAMES)}
                          {isToday && <span className="ml-2 text-ds-label font-medium text-ds-accent-ink">Today</span>}
                        </dt>
                        <dd className={cn("text-right ds-tabular", !group.sample.is_open && "text-ds-danger")}>
                          {scheduleLines(group.sample).map((line) => (
                            <span key={line} className="block whitespace-nowrap">{line}</span>
                          ))}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            )}

            {(phone || whatsapp || email) && (
              <div className="mt-8 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {phone && (
                  <DsButton href={telHref(phone)} variant="secondary" size="lg" className="justify-start">
                    <Phone aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    Call {phone}
                  </DsButton>
                )}
                {whatsapp && (
                  <DsButton href={whatsapp} target="_blank" rel="noreferrer" variant="secondary" size="lg" className="justify-start">
                    <span aria-hidden="true" className="flex"><WhatsAppIcon className="h-5 w-5" /></span>
                    WhatsApp<span className="sr-only"> (opens in a new tab)</span>
                  </DsButton>
                )}
                {email && (
                  <DsButton href={`mailto:${email}`} variant="secondary" size="lg" className="justify-start sm:col-span-2 lg:col-span-1 xl:col-span-2">
                    <Mail aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    <span className="truncate">{email}</span>
                  </DsButton>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ClinicDetails;
