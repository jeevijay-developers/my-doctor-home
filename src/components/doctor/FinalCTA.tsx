import { Calendar, Phone, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDoctorData } from "@/contexts/DoctorContext";

const FinalCTA = () => {
  const { profile, settings } = useDoctorData();
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  const whatsappUrl = settings?.whatsapp_number
    ? `https://wa.me/${settings.whatsapp_number.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(settings.whatsapp_message || "")}`
    : null;

  return (
    <section className="py-16 md:py-24 bg-card">
      <div className="container mx-auto px-4">
        <div className="relative overflow-hidden rounded-3xl bg-primary text-primary-foreground p-8 md:p-14 max-w-6xl mx-auto">
          <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-teal/30 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-royal/40 blur-3xl" />

          <div className="relative z-10 grid md:grid-cols-[1.4fr_1fr] gap-8 items-center">
            <div>
              <h2 className="font-heading font-extrabold text-3xl md:text-4xl leading-tight">
                Ready to book your consultation
                {profile?.full_name ? ` with Dr. ${profile.full_name}` : ""}?
              </h2>
              <p className="mt-3 text-primary-foreground/80 text-base md:text-lg max-w-xl">
                Choose a time that works for you. Quick confirmation, secure booking, and easy rescheduling.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row md:flex-col gap-3 md:justify-self-end w-full md:w-auto">
              <Button
                size="lg"
                onClick={() => scrollTo("booking")}
                className="btn-pop rounded-full bg-card text-primary hover:bg-card/90 font-heading font-semibold shadow-lg"
              >
                <Calendar size={18} className="mr-2" /> Book Appointment
              </Button>
              {profile?.phone && (
                <Button
                  size="lg"
                  variant="outline"
                  className="btn-pop rounded-full border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10 font-heading font-semibold"
                  asChild
                >
                  <a href={`tel:${profile.phone}`}>
                    <Phone size={18} className="mr-2" /> Call Now
                  </a>
                </Button>
              )}
              {whatsappUrl && (
                <Button
                  size="lg"
                  variant="outline"
                  className="btn-pop rounded-full border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10 font-heading font-semibold"
                  asChild
                >
                  <a href={whatsappUrl} target="_blank" rel="noreferrer">
                    <MessageCircle size={18} className="mr-2" /> WhatsApp
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FinalCTA;
