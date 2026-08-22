import { Building2, CalendarClock, Clock3, Globe, MapPin, Navigation, Phone, type LucideIcon } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { useDoctorData } from "@/contexts/DoctorContext";
import { cardColorClass, type CardColor } from "@/lib/cardColor";
import { getClinicMapsQuery, getClinicMapsUrl } from "@/lib/clinicLocation";
import { groupWorkingHours, formatDayRangeLabel } from "@/lib/workingHoursGrouping";
import type { Tables } from "@/integrations/supabase/types";

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type WorkingHour = Tables<"working_hours">;

const formatTime = (value: string | null) => {
  if (!value) return "";
  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return value.slice(0, 5);
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

const formatSchedule = (hours: WorkingHour) => {
  if (!hours.is_open) return "Closed";
  const firstSlot = hours.start_time && hours.end_time ? `${formatTime(hours.start_time)} – ${formatTime(hours.end_time)}` : "";
  const secondSlot = hours.start_time_2 && hours.end_time_2 ? `${formatTime(hours.start_time_2)} – ${formatTime(hours.end_time_2)}` : "";
  return [firstSlot, secondSlot].filter(Boolean).join(" · ") || "Contact clinic for hours";
};

const ContactCard = ({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) => (
  <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 transition hover:border-blue-200 hover:bg-blue-50 dark:border-blue-900/60 dark:bg-blue-950/20 dark:hover:border-blue-800">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#3C83FC] shadow-sm dark:bg-gray-900">
      <Icon className="h-5 w-5" />
    </span>
    <div className="min-w-0 pt-0.5">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <div className="mt-1 break-words text-sm font-bold leading-6 text-[#092b50] dark:text-white">{children}</div>
    </div>
  </div>
);

const ClinicDetails = ({ cardColor = "card" }: { cardColor?: CardColor }) => {
  const { profile, workingHours, settings } = useDoctorData();
  const clinicName = profile?.clinic_name || (profile?.full_name ? `Dr. ${profile.full_name}'s Clinic` : "Clinic");
  const location = [profile?.address, profile?.city, profile?.state].filter(Boolean).join(", ");
  const phone = profile?.phone || "";
  const email = profile?.clinic_email || "";
  const mapsQuery = getClinicMapsQuery(profile);
  const directionsUrl = getClinicMapsUrl(profile);
  const schedule = [...((workingHours || []) as WorkingHour[])].sort((a, b) => a.day_of_week - b.day_of_week);
  const scheduleGroups = groupWorkingHours(schedule);
  const today = new Date().getDay();
  const todayHours = schedule.find((item) => item.day_of_week === today);
  const whatsappUrl = settings?.whatsapp_number
    ? `https://wa.me/${settings.whatsapp_number.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(settings.whatsapp_message || "")}`
    : "";

  return (
    <section id="contact" className={`relative overflow-hidden py-14 md:py-24 ${cardColorClass(cardColor)}`}>
      <div className="absolute left-0 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-blue-100/50 blur-3xl dark:bg-blue-950/20" />
      <div className="relative z-10 mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <div className="mx-auto mb-9 max-w-3xl text-center md:mb-12">
          <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em] text-[#3C83FC]">
            <Building2 className="h-4 w-4" /> Visit the clinic
          </span>
          <h2 className="mt-3 font-heading text-3xl font-black tracking-tight text-[#092b50] dark:text-white md:text-5xl">Clinic Details & Contact</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-500 dark:text-slate-400 md:text-base">
            Find the clinic, check consultation hours, or contact the team before your visit.
          </p>
        </div>

        <div className="mx-auto grid max-w-6xl overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-[0_18px_55px_rgba(15,43,80,0.1)] dark:border-blue-900/60 dark:bg-gray-900 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="relative min-h-[300px] overflow-hidden bg-blue-50 sm:min-h-[390px] lg:min-h-full dark:bg-gray-800">
            {mapsQuery ? (
              <iframe
                title={`${clinicName} location`}
                className="absolute inset-0 h-full w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://www.google.com/maps?q=${encodeURIComponent(mapsQuery)}&output=embed`}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-[#3C83FC] shadow-lg dark:bg-gray-900"><MapPin className="h-8 w-8" /></span>
                <h3 className="mt-5 font-heading text-xl font-extrabold text-[#092b50] dark:text-white">Clinic location</h3>
                <p className="mt-2 max-w-xs text-sm leading-6 text-slate-500 dark:text-slate-400">Location details will appear here when they are added by the clinic.</p>
              </div>
            )}

            {directionsUrl && (
              <a href={directionsUrl} target="_blank" rel="noreferrer" className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-xl bg-[#3C83FC] px-4 py-3 text-sm font-extrabold text-white shadow-[0_10px_25px_rgba(60,131,252,0.35)] transition hover:-translate-y-0.5 hover:bg-blue-500">
                <Navigation className="h-4 w-4" /> Get Directions
              </a>
            )}
          </div>

          <div className="p-5 sm:p-7 lg:p-8">
            <div className="flex items-start justify-between gap-4 border-b border-blue-50 pb-5 dark:border-blue-950">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#3C83FC]">Clinic information</p>
                <h3 className="mt-1.5 font-heading text-2xl font-black text-[#092b50] dark:text-white">{clinicName}</h3>
              </div>
              {todayHours && (
                <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-extrabold ${todayHours.is_open ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300"}`}>
                  {todayHours.is_open ? "Open today" : "Closed today"}
                </span>
              )}
            </div>

            <div className="mt-5 grid gap-3">
              {location && <ContactCard icon={MapPin} label="Address">{location}</ContactCard>}
              {phone && <ContactCard icon={Phone} label="Phone"><a href={`tel:${phone}`} className="transition hover:text-[#3C83FC]">{phone}</a></ContactCard>}
              {email && <ContactCard icon={Globe} label="Email"><a href={`mailto:${email}`} className="break-all transition hover:text-[#3C83FC]">{email}</a></ContactCard>}
            </div>

            <div className="mt-6 rounded-2xl border border-blue-100 p-4 dark:border-blue-900/60 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="inline-flex items-center gap-2 font-heading text-sm font-extrabold text-[#092b50] dark:text-white"><CalendarClock className="h-4 w-4 text-[#3C83FC]" /> Consultation Hours</p>
                {todayHours && <span className="text-xs font-semibold text-slate-400">Today: {formatSchedule(todayHours)}</span>}
              </div>
              {scheduleGroups.length > 0 ? (
                <div className="divide-y divide-slate-100 dark:divide-gray-800">
                  {scheduleGroups.map((group) => {
                    const isToday = group.days.includes(today);
                    return (
                      <div key={group.days.join("-")} className={`flex items-center justify-between gap-4 py-2.5 text-xs sm:text-sm ${isToday ? "font-extrabold text-[#092b50] dark:text-white" : "text-slate-500 dark:text-slate-400"}`}>
                        <span>{formatDayRangeLabel(group.days, dayNames)}</span>
                        <span className={`text-right ${group.sample.is_open ? "" : "font-bold text-red-500"}`}>{formatSchedule(group.sample)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-xl bg-blue-50 p-3 text-sm text-slate-600 dark:bg-blue-950/30 dark:text-slate-300">
                  <Clock3 className="h-4 w-4 shrink-0 text-[#3C83FC]" /> Please call the clinic to confirm consultation hours.
                </div>
              )}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {phone && <a href={`tel:${phone}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#3C83FC] px-4 py-3 text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(60,131,252,0.25)] transition hover:-translate-y-0.5 hover:bg-blue-500"><Phone className="h-4 w-4" /> Call Clinic</a>}
              {whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-extrabold text-emerald-700 transition hover:-translate-y-0.5 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"><WhatsAppIcon className="h-5 w-5" /> WhatsApp</a>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ClinicDetails;
