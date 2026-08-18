import { MapPin, Phone, Clock, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDoctorData } from "@/contexts/DoctorContext";
import { cardColorClass, type CardColor } from "@/lib/cardColor";

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const DEFAULT_SCHEDULE = [
  { day: "Sunday", is_open: false, text: "Closed" },
  { day: "Monday", is_open: true, text: "09:00 – 13:00, 17:00 – 21:00" },
  { day: "Tuesday", is_open: true, text: "09:00 – 13:00, 17:00 – 21:00" },
  { day: "Wednesday", is_open: true, text: "09:00 – 13:00, 17:00 – 21:00" },
  { day: "Thursday", is_open: true, text: "09:00 – 13:00, 17:00 – 21:00" },
  { day: "Friday", is_open: true, text: "09:00 – 13:00, 17:00 – 21:00" },
  { day: "Saturday", is_open: true, text: "09:00 – 14:00" },
];

const InfoRow = ({ icon: Icon, children }: { icon: typeof MapPin; children: React.ReactNode }) => (
  <div className="flex items-start gap-1 sm:gap-3 py-1 sm:py-3 border-b border-border last:border-0">
    <span className="w-4 h-4 sm:w-9 sm:h-9 rounded-full bg-royal/10 flex items-center justify-center shrink-0">
      <Icon className="h-2 w-2 sm:h-4 sm:w-4 text-royal" />
    </span>
    <div className="pt-0.5 sm:pt-1.5 flex-1 min-w-0">{children}</div>
  </div>
);

const ClinicDetails = ({ cardColor = "card" }: { cardColor?: CardColor }) => {
  const { profile, workingHours, settings } = useDoctorData();

  const locationValue = [profile?.address, profile?.city].filter(Boolean).join(", ") || profile?.clinic_name || "xyz, Kota";
  const phoneVal = profile?.phone || "9752430783";
  const siteUrl = profile?.slug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/dr/${profile.slug}`
    : "192.168.29.92:8080/dr/rajkumar-prajapati";

  const mapsQuery = [profile?.clinic_name, profile?.address, profile?.city].filter(Boolean).join(", ") || "xyz, Kota";
  const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`;

  const scheduleList = workingHours && workingHours.length > 0
    ? workingHours.map((wh: any) => {
        const dName = dayNames[wh.day_of_week];
        if (!wh.is_open) return { day: dName, is_open: false, text: "Closed" };
        const time1 = wh.start_time && wh.end_time ? `${wh.start_time.slice(0, 5)} – ${wh.end_time.slice(0, 5)}` : "";
        const time2 = wh.start_time_2 && wh.end_time_2 ? `, ${wh.start_time_2.slice(0, 5)} – ${wh.end_time_2.slice(0, 5)}` : "";
        return { day: dName, is_open: true, text: `${time1}${time2}` || "09:00 – 13:00, 17:00 – 21:00" };
      })
    : DEFAULT_SCHEDULE;

  return (
    <section id="contact" className={`relative py-10 md:py-24 overflow-hidden ${cardColorClass(cardColor)}`}>
      <div className="container mx-auto px-4 relative z-10">
        <h2 className="font-heading font-bold text-xl md:text-4xl text-foreground text-center mb-6 md:mb-12">
          Clinic Details & Contact
        </h2>

        {/* Mobile View: Single stacked card with Map iframe on top */}
        <div className="md:hidden max-w-md mx-auto rounded-2xl overflow-hidden border border-border shadow-sm bg-white dark:bg-gray-800">
          <div className="aspect-video w-full bg-secondary">
            <iframe
              title="Clinic location"
              className="w-full h-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://www.google.com/maps?q=${encodeURIComponent(mapsQuery)}&output=embed`}
            />
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-start gap-3">
              <span className="w-8 h-8 rounded-full bg-primary-50 dark:bg-primary-900/40 flex items-center justify-center shrink-0 text-primary-500">
                <MapPin size={16} />
              </span>
              <p className="text-xs text-text-dark dark:text-foreground font-medium pt-1.5">{locationValue}</p>
            </div>

            <div className="flex items-start gap-3">
              <span className="w-8 h-8 rounded-full bg-primary-50 dark:bg-primary-900/40 flex items-center justify-center shrink-0 text-primary-500">
                <Clock size={16} />
              </span>
              <div className="w-full text-[10px] text-text-dark dark:text-foreground pt-1.5 space-y-1">
                {scheduleList.map((item, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>{item.day}</span>
                    {!item.is_open ? (
                      <span className="text-red-500 font-medium">{item.text}</span>
                    ) : (
                      <span>{item.text}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-primary-50 dark:bg-primary-900/40 flex items-center justify-center shrink-0 text-primary-500">
                <Phone size={16} />
              </span>
              <a href={`tel:${phoneVal}`} className="text-xs font-semibold text-text-dark dark:text-foreground hover:underline">
                {phoneVal}
              </a>
            </div>

            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-primary-50 dark:bg-primary-900/40 flex items-center justify-center shrink-0 text-primary-500">
                <Globe size={16} />
              </span>
              <a
                href={siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary-500 truncate hover:underline"
              >
                {siteUrl.replace(/^https?:\/\//, "")}
              </a>
            </div>

            <div className="pt-2">
              <a
                href={directionsUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold py-3 rounded-xl shadow-sm flex items-center justify-center transition-colors"
              >
                Get Directions
              </a>
            </div>
          </div>
        </div>

        {/* Desktop View (md and up): Original side-by-side map + info grid */}
        <div className="hidden md:grid grid-cols-2 gap-6 md:gap-10 max-w-5xl mx-auto">
          <div className="aspect-video md:aspect-auto md:h-full rounded-2xl overflow-hidden bg-secondary border border-border shadow-sm">
            <iframe
              title="Clinic location desktop"
              className="w-full h-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://www.google.com/maps?q=${encodeURIComponent(mapsQuery)}&output=embed`}
            />
          </div>
          <div className="min-w-0">
            <InfoRow icon={MapPin}>
              <p className="text-xs font-semibold text-text-gray uppercase tracking-wide mb-0.5">Address</p>
              <p className="text-foreground text-base">{locationValue}</p>
            </InfoRow>

            <InfoRow icon={Phone}>
              <p className="text-xs font-semibold text-text-gray uppercase tracking-wide mb-0.5">Phone</p>
              <a href={`tel:${phoneVal}`} className="text-foreground hover:text-royal font-medium text-base">{phoneVal}</a>
            </InfoRow>

            <InfoRow icon={Globe}>
              <p className="text-xs font-semibold text-text-gray uppercase tracking-wide mb-0.5">Website</p>
              <a href={siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`} className="text-royal hover:underline font-medium break-all text-base">
                {siteUrl.replace(/^https?:\/\//, "")}
              </a>
            </InfoRow>

            <InfoRow icon={Clock}>
              <p className="text-xs font-semibold text-text-gray uppercase tracking-wide mb-1.5">Timings</p>
              <div className="space-y-1">
                {scheduleList.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-sm gap-4">
                    <span className="text-foreground">{item.day}</span>
                    {!item.is_open ? (
                      <span className="text-destructive font-medium">{item.text}</span>
                    ) : (
                      <span className="text-text-gray text-right">{item.text}</span>
                    )}
                  </div>
                ))}
              </div>
            </InfoRow>

            {settings?.whatsapp_number && (
              <Button variant="outline" className="border-success text-success rounded-full mt-4 h-10 px-4 text-sm" asChild>
                <a href={`https://wa.me/${settings.whatsapp_number.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">
                  Chat on WhatsApp
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ClinicDetails;
