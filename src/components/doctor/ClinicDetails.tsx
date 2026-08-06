import { MapPin, Phone, Clock, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDoctorData } from "@/contexts/DoctorContext";

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const InfoRow = ({ icon: Icon, children }: { icon: typeof MapPin; children: React.ReactNode }) => (
  <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
    <span className="w-9 h-9 rounded-full bg-royal/10 flex items-center justify-center shrink-0"><Icon size={16} className="text-royal" /></span>
    <div className="pt-1.5 flex-1 min-w-0">{children}</div>
  </div>
);

const ClinicDetails = () => {
  const { profile, workingHours, settings } = useDoctorData();
  const siteUrl = profile?.slug && typeof window !== "undefined" ? `${window.location.origin}/dr/${profile.slug}` : null;

  return (
    <section id="contact" className="relative py-16 md:py-24 bg-card overflow-hidden">
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
      <div className="container mx-auto px-4 relative z-10">
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-foreground text-center mb-12">Clinic Details & Contact</h2>
        <div className="grid md:grid-cols-2 gap-10 max-w-5xl mx-auto">
          <div className="aspect-video md:aspect-auto md:h-full rounded-2xl overflow-hidden bg-secondary border border-border shadow-sm">
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
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <MapPin size={32} className="mr-2" /> Location not set
              </div>
            )}
          </div>
          <div>
            {profile?.address && (
              <InfoRow icon={MapPin}>
                <p className="text-xs font-semibold text-text-gray uppercase tracking-wide mb-0.5">Address</p>
                <p className="text-foreground">{profile.address}{profile.city ? `, ${profile.city}` : ""}</p>
              </InfoRow>
            )}
            {profile?.phone && (
              <InfoRow icon={Phone}>
                <p className="text-xs font-semibold text-text-gray uppercase tracking-wide mb-0.5">Phone</p>
                <a href={`tel:${profile.phone}`} className="text-foreground hover:text-royal font-medium">{profile.phone}</a>
              </InfoRow>
            )}
            {siteUrl && (
              <InfoRow icon={Globe}>
                <p className="text-xs font-semibold text-text-gray uppercase tracking-wide mb-0.5">Website</p>
                <a href={siteUrl} className="text-royal hover:underline font-medium break-all">{siteUrl.replace(/^https?:\/\//, "")}</a>
              </InfoRow>
            )}
            {workingHours.length > 0 && (
              <InfoRow icon={Clock}>
                <p className="text-xs font-semibold text-text-gray uppercase tracking-wide mb-1.5">Timings</p>
                <div className="space-y-1">
                  {workingHours.map((wh: any) => (
                    <div key={wh.day_of_week} className="flex justify-between items-center text-sm gap-4">
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
              <Button variant="outline" className="border-success text-success rounded-full mt-4" asChild>
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
