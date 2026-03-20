import { MapPin, Phone, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDoctorData } from "@/contexts/DoctorContext";

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const ClinicDetails = () => {
  const { profile, workingHours, settings } = useDoctorData();

  return (
    <section id="contact" className="py-16 md:py-24 bg-card">
      <div className="container mx-auto px-4">
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-primary text-center mb-12">Clinic Details & Contact</h2>
        <div className="grid md:grid-cols-2 gap-10 max-w-5xl mx-auto">
          <div className="space-y-6">
            <div className="aspect-video rounded-xl overflow-hidden bg-secondary flex items-center justify-center text-muted-foreground">
              <MapPin size={32} className="mr-2" /> Map will display here
            </div>
            <div className="space-y-3">
              {profile?.address && (
                <div className="flex items-start gap-3">
                  <MapPin size={18} className="text-royal mt-0.5 flex-shrink-0" />
                  <p className="text-foreground">{profile.address}{profile.city ? `, ${profile.city}` : ""}</p>
                </div>
              )}
              {profile?.phone && (
                <div className="flex items-center gap-3">
                  <Phone size={18} className="text-royal flex-shrink-0" />
                  <a href={`tel:${profile.phone}`} className="text-foreground hover:text-royal">{profile.phone}</a>
                </div>
              )}
              {settings?.whatsapp_number && (
                <Button variant="outline" className="border-success text-success" asChild>
                  <a href={`https://wa.me/${settings.whatsapp_number.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">Chat on WhatsApp</a>
                </Button>
              )}
            </div>
          </div>
          <div>
            <h3 className="font-heading font-semibold text-lg text-primary mb-4 flex items-center gap-2"><Clock size={18} className="text-royal" /> Working Hours</h3>
            <div className="space-y-2">
              {workingHours.map((wh: any) => (
                <div key={wh.day_of_week} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                  <span className="font-medium text-foreground">{dayNames[wh.day_of_week]}</span>
                  {wh.is_open ? (
                    <span className="text-sm text-text-gray">
                      {wh.start_time?.slice(0, 5)} – {wh.end_time?.slice(0, 5)}
                      {wh.start_time_2 && `, ${wh.start_time_2.slice(0, 5)} – ${wh.end_time_2?.slice(0, 5)}`}
                    </span>
                  ) : (
                    <span className="text-sm text-destructive">Closed</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ClinicDetails;
