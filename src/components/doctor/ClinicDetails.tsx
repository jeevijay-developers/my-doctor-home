import { MapPin, Phone, Clock, MessageCircle, Navigation, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDoctorData } from "@/contexts/DoctorContext";

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const ClinicDetails = () => {
  const { profile, workingHours, settings } = useDoctorData();

  const addressQuery = [profile?.clinic_name, profile?.address, profile?.city].filter(Boolean).join(", ");
  const directionsUrl = addressQuery
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressQuery)}`
    : null;
  const whatsappUrl = settings?.whatsapp_number
    ? `https://wa.me/${settings.whatsapp_number.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(settings.whatsapp_message || "")}`
    : null;
  const website = (settings as any)?.website_url as string | undefined;

  const todayIdx = new Date().getDay();

  return (
    <section id="contact" className="py-16 md:py-24 bg-secondary">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
          <span className="inline-block px-3 py-1 rounded-full bg-royal/10 text-royal text-xs font-heading font-semibold uppercase tracking-wider">
            Visit
          </span>
          <h2 className="font-heading font-bold text-3xl md:text-4xl text-primary mt-3 mb-3 leading-tight">
            Clinic & Location
          </h2>
        </div>

        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6 lg:gap-8 max-w-6xl mx-auto">
          {/* Map + address card */}
          <div className="bg-card rounded-2xl overflow-hidden border border-border shadow-sm">
            <div className="aspect-[16/10] bg-secondary">
              {addressQuery ? (
                <iframe
                  title="Clinic location"
                  className="w-full h-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://www.google.com/maps?q=${encodeURIComponent(addressQuery)}&output=embed`}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  <MapPin size={28} className="mr-2" /> Location not set
                </div>
              )}
            </div>
            <div className="p-5 md:p-6 space-y-4">
              {profile?.clinic_name && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-text-gray font-heading font-semibold">Clinic</p>
                  <p className="font-heading font-semibold text-primary text-lg mt-0.5">{profile.clinic_name}</p>
                </div>
              )}
              {profile?.address && (
                <div className="flex items-start gap-3">
                  <MapPin size={18} className="text-royal mt-0.5 flex-shrink-0" />
                  <p className="text-foreground">
                    {profile.address}
                    {profile.city ? `, ${profile.city}` : ""}
                  </p>
                </div>
              )}
              {profile?.phone && (
                <div className="flex items-center gap-3">
                  <Phone size={18} className="text-royal flex-shrink-0" />
                  <a href={`tel:${profile.phone}`} className="text-foreground hover:text-royal">
                    {profile.phone}
                  </a>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                {profile?.phone && (
                  <Button variant="outline" className="btn-pop rounded-full border-royal text-royal hover:bg-royal hover:text-primary-foreground" asChild>
                    <a href={`tel:${profile.phone}`}>
                      <Phone size={15} className="mr-1.5" /> Call
                    </a>
                  </Button>
                )}
                {whatsappUrl && (
                  <Button variant="outline" className="btn-pop rounded-full border-success text-success hover:bg-success hover:text-primary-foreground" asChild>
                    <a href={whatsappUrl} target="_blank" rel="noreferrer">
                      <MessageCircle size={15} className="mr-1.5" /> WhatsApp
                    </a>
                  </Button>
                )}
                {directionsUrl && (
                  <Button variant="outline" className="btn-pop rounded-full border-primary text-primary hover:bg-primary hover:text-primary-foreground" asChild>
                    <a href={directionsUrl} target="_blank" rel="noreferrer">
                      <Navigation size={15} className="mr-1.5" /> Directions
                    </a>
                  </Button>
                )}
                {website && (
                  <Button variant="outline" className="btn-pop rounded-full" asChild>
                    <a href={website} target="_blank" rel="noreferrer">
                      <Globe size={15} className="mr-1.5" /> Website
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Working hours */}
          <div className="bg-card rounded-2xl border border-border shadow-sm p-5 md:p-6">
            <h3 className="font-heading font-semibold text-lg text-primary mb-5 flex items-center gap-2">
              <Clock size={18} className="text-royal" /> Working Hours
            </h3>
            <div className="space-y-1">
              {workingHours.length === 0 && (
                <p className="text-sm text-text-gray">Hours will be published soon.</p>
              )}
              {workingHours.map((wh: any) => {
                const isToday = wh.day_of_week === todayIdx;
                return (
                  <div
                    key={wh.day_of_week}
                    className={`flex justify-between items-center py-2.5 px-3 rounded-lg ${
                      isToday ? "bg-royal/5 border border-royal/20" : ""
                    }`}
                  >
                    <span className={`font-medium ${isToday ? "text-royal" : "text-foreground"}`}>
                      {dayNames[wh.day_of_week]}
                      {isToday && <span className="ml-2 text-[10px] uppercase tracking-wider">Today</span>}
                    </span>
                    {wh.is_open ? (
                      <span className="text-sm text-text-gray text-right">
                        {wh.start_time?.slice(0, 5)} – {wh.end_time?.slice(0, 5)}
                        {wh.start_time_2 && (
                          <>
                            <br />
                            {wh.start_time_2.slice(0, 5)} – {wh.end_time_2?.slice(0, 5)}
                          </>
                        )}
                      </span>
                    ) : (
                      <span className="text-sm text-destructive">Closed</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ClinicDetails;
