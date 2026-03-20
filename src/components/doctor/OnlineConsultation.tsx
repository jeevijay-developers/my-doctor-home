import { Video, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDoctorData } from "@/contexts/DoctorContext";

const OnlineConsultation = () => {
  const { profile, settings } = useDoctorData();
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  if (!settings?.show_online_consultation) return null;

  return (
    <section id="online-consultation" className="py-16 md:py-24 bg-primary text-primary-foreground">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-2 gap-10 items-center max-w-5xl mx-auto">
          <div className="flex items-center justify-center">
            <div className="w-48 h-48 rounded-full bg-primary-foreground/10 flex items-center justify-center">
              <Video size={64} className="text-primary-foreground/80" />
            </div>
          </div>
          <div className="space-y-6">
            <h2 className="font-heading font-bold text-3xl">Consult Dr. {profile?.full_name} from Anywhere in India</h2>
            <p className="text-2xl font-heading font-bold">₹{settings.online_fee || 500} <span className="text-base font-normal opacity-80">per {settings.online_duration || 30}-minute session</span></p>
            <div className="space-y-3">
              {["Book Slot", "Pay Online", "Join Video Call"].map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary-foreground/10 flex items-center justify-center text-sm font-bold">{i + 1}</div>
                  <span>{step}</span>
                </div>
              ))}
            </div>
            <Button size="lg" variant="secondary" className="font-heading font-semibold" onClick={() => scrollTo("booking")}>Book Online Consultation</Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default OnlineConsultation;
