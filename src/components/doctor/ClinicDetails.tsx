import { MapPin, Phone, Clock, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDoctorData } from "@/contexts/DoctorContext";
import { cardColorClass, type CardColor } from "@/lib/cardColor";

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const InfoRow = ({ icon: Icon, children }: { icon: typeof MapPin; children: React.ReactNode }) => (
  <div className="flex items-start gap-1 sm:gap-3 py-1 sm:py-3 border-b border-border last:border-0">
    <span className="w-4 h-4 sm:w-9 sm:h-9 rounded-full bg-royal/10 flex items-center justify-center shrink-0"><Icon className="h-2 w-2 sm:h-4 sm:w-4 text-royal" /></span>
    <div className="pt-0.5 sm:pt-1.5 flex-1 min-w-0">{children}</div>
  </div>
);

const ClinicDetails = ({ cardColor = "card" }: { cardColor?: CardColor }) => {
  const { profile, workingHours, settings } = useDoctorData();
  const siteUrl = profile?.slug && typeof window !== "undefined" ? `${window.location.origin}/dr/${profile.slug}` : null;
  // Same "Get Directions" deep link already used by the Hero card.
  const mapsQuery = [profile?.clinic_name, profile?.address, profile?.city].filter(Boolean).join(", ");
  const directionsUrl = mapsQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}` : null;

  return (
    <section id="contact" className={`relative py-16 md:py-24 overflow-hidden ${cardColorClass(cardColor)}`}>
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.05] dark:opacity-[0.14] pointer-events-none"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <pattern id="clinic-geo-lines" width="80" height="80" patternUnits="userSpaceOnUse">
            <path d="M0 80 L80 0" stroke="hsl(var(--pattern-line))" strokeWidth="1" />
            <path d="M-20 20 L20 -20" stroke="hsl(var(--pattern-line))" strokeWidth="1" />
            <path d="M60 100 L100 60" stroke="hsl(var(--pattern-line))" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#clinic-geo-lines)" />
      </svg>
      <div className="container mx-auto px-[5px] md:px-4 relative z-10">
        <h2 className="font-heading font-bold text-sm sm:text-2xl md:text-3xl lg:text-4xl text-foreground text-center mb-3 sm:mb-8 md:mb-12">Clinic Details & Contact</h2>

        {/* Mobile only: single stacked card (map on top, icon rows, full-width
            Get Directions CTA) — desktop keeps the existing side-by-side
            map + info grid below, completely untouched. */}
        <div className="md:hidden max-w-md mx-auto rounded-2xl overflow-hidden border border-border shadow-sm bg-card">
          <div className="aspect-video w-full bg-secondary">
            {profile?.address || profile?.city ? (
              <iframe
                title="Clinic location"
                className="w-full h-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://www.google.com/maps?q=${encodeURIComponent(
                  [profile?.clinic_name, profile?.address, profile?.city].filter(Boolean).join(", ")
                )}&output=embed`}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                <MapPin className="h-5 w-5 mr-2" /> Location not set
              </div>
            )}
          </div>
          <div className="py-4 px-[5px] space-y-4">
            {profile?.address && (
              <div className="flex items-start gap-3">
                <span className="w-8 h-8 rounded-full bg-royal/10 flex items-center justify-center shrink-0"><MapPin className="h-4 w-4 text-royal" /></span>
                <p className="text-foreground text-sm pt-1.5">{profile.address}{profile.city ? `, ${profile.city}` : ""}</p>
              </div>
            )}
            {workingHours.length > 0 && (
              <div className="flex items-start gap-3">
                <span className="w-8 h-8 rounded-full bg-royal/10 flex items-center justify-center shrink-0"><Clock className="h-4 w-4 text-royal" /></span>
                <div className="pt-1.5 flex-1 min-w-0 space-y-1">
                  {workingHours.map((wh) => (
                    <div key={wh.day_of_week} className="flex justify-between items-center text-sm gap-3">
                      <span className="text-foreground">{dayNames[wh.day_of_week]}</span>
                      {wh.is_open ? (
                        <span className="text-text-gray text-right">
                          {wh.start_time?.slice(0, 5)} – {wh.end_time?.slice(0, 5)}
                          {wh.start_time_2 && `, ${wh.start_time_2.slice(0, 5)} – ${wh.end_time_2?.slice(0, 5)}`}
                        </span>
                      ) : (
                        <span className="text-destructive font-medium">Closed</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {profile?.phone && (
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-royal/10 flex items-center justify-center shrink-0"><Phone className="h-4 w-4 text-royal" /></span>
                <a href={`tel:${profile.phone}`} className="text-foreground hover:text-royal font-medium text-sm">{profile.phone}</a>
              </div>
            )}
            {siteUrl && (
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-royal/10 flex items-center justify-center shrink-0"><Globe className="h-4 w-4 text-royal" /></span>
                <a href={siteUrl} className="text-royal hover:underline font-medium break-all text-sm">{siteUrl.replace(/^https?:\/\//, "")}</a>
              </div>
            )}
            <div className="pt-1 space-y-2">
              {directionsUrl && (
                <Button variant="cta" className="w-full rounded-full font-heading font-semibold" asChild>
                  <a href={directionsUrl} target="_blank" rel="noreferrer">Get Directions</a>
                </Button>
              )}
              {settings?.whatsapp_number && (
                <Button variant="outline" className="w-full border-success text-success rounded-full font-heading font-semibold" asChild>
                  <a href={`https://wa.me/${settings.whatsapp_number.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">Chat on WhatsApp</a>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Desktop (md and up): existing side-by-side map + info grid, unchanged. */}
        <div className="hidden md:grid grid-cols-2 gap-2 sm:gap-6 md:gap-10 max-w-5xl mx-auto">
          <div className="aspect-video md:aspect-auto md:h-full rounded-lg sm:rounded-2xl overflow-hidden bg-secondary border border-border shadow-sm">
            {profile?.address || profile?.city ? (
              <iframe
                title="Clinic location"
                className="w-full h-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://www.google.com/maps?q=${encodeURIComponent(
                  [profile?.clinic_name, profile?.address, profile?.city].filter(Boolean).join(", ")
                )}&output=embed`}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[8px] sm:text-base">
                <MapPin className="h-3 w-3 sm:h-8 sm:w-8 mr-1 sm:mr-2" /> Location not set
              </div>
            )}
          </div>
          <div className="min-w-0">
            {profile?.address && (
              <InfoRow icon={MapPin}>
                <p className="text-[6px] sm:text-xs font-semibold text-text-gray uppercase tracking-wide mb-0.5">Address</p>
                <p className="text-foreground text-[8px] sm:text-base">{profile.address}{profile.city ? `, ${profile.city}` : ""}</p>
              </InfoRow>
            )}
            {profile?.phone && (
              <InfoRow icon={Phone}>
                <p className="text-[6px] sm:text-xs font-semibold text-text-gray uppercase tracking-wide mb-0.5">Phone</p>
                <a href={`tel:${profile.phone}`} className="text-foreground hover:text-royal font-medium text-[8px] sm:text-base">{profile.phone}</a>
              </InfoRow>
            )}
            {siteUrl && (
              <InfoRow icon={Globe}>
                <p className="text-[6px] sm:text-xs font-semibold text-text-gray uppercase tracking-wide mb-0.5">Website</p>
                <a href={siteUrl} className="text-royal hover:underline font-medium break-all text-[8px] sm:text-base">{siteUrl.replace(/^https?:\/\//, "")}</a>
              </InfoRow>
            )}
            {workingHours.length > 0 && (
              <InfoRow icon={Clock}>
                <p className="text-[6px] sm:text-xs font-semibold text-text-gray uppercase tracking-wide mb-1.5">Timings</p>
                <div className="space-y-0.5 sm:space-y-1">
                  {workingHours.map((wh: any) => (
                    <div key={wh.day_of_week} className="flex justify-between items-center text-[7px] sm:text-sm gap-1 sm:gap-4">
                      <span className="text-foreground">{dayNames[wh.day_of_week]}</span>
                      {wh.is_open ? (
                        <span className="text-text-gray text-right">
                          {wh.start_time?.slice(0, 5)} – {wh.end_time?.slice(0, 5)}
                          {wh.start_time_2 && `, ${wh.start_time_2.slice(0, 5)} – ${wh.end_time_2?.slice(0, 5)}`}
                        </span>
                      ) : (
                        <span className="text-destructive font-medium">Closed</span>
                      )}
                    </div>
                  ))}
                </div>
              </InfoRow>
            )}
            {settings?.whatsapp_number && (
              <Button variant="outline" className="border-success text-success rounded-full mt-2 sm:mt-4 h-6 px-2 text-[8px] sm:h-10 sm:px-4 sm:text-sm" asChild>
                <a href={`https://wa.me/${settings.whatsapp_number.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">Chat on WhatsApp</a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ClinicDetails;
