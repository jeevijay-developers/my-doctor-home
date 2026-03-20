import { Video, CreditCard, MessageCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

const steps = [
  { icon: Clock, label: "Book Slot", desc: "Choose your preferred time" },
  { icon: CreditCard, label: "Pay Online", desc: "Secure payment via UPI/Card" },
  { icon: Video, label: "Join Video Call", desc: "Link sent on WhatsApp" },
];

const OnlineConsultation = () => {
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <section id="online-consultation" className="py-16 md:py-24 gradient-navy-teal text-primary-foreground">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="flex justify-center">
            <div className="w-64 h-64 rounded-2xl bg-primary-foreground/10 flex items-center justify-center">
              <Video size={80} className="text-primary-foreground/80" />
            </div>
          </div>
          <div className="space-y-6">
            <h2 className="font-heading font-bold text-3xl md:text-4xl">Consult Dr. Sharma from Anywhere in India</h2>
            <p className="text-xl font-heading font-bold">₹600 <span className="text-base font-normal opacity-80">per 30-minute session</span></p>
            <div className="grid sm:grid-cols-3 gap-4">
              {steps.map((s, i) => (
                <div key={i} className="bg-primary-foreground/10 rounded-xl p-4 text-center">
                  <s.icon size={28} className="mx-auto mb-2" />
                  <p className="font-heading font-semibold text-sm">{s.label}</p>
                  <p className="text-xs opacity-80 mt-1">{s.desc}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 text-sm opacity-90">
              <span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse" />
              Available Today · Mon–Sat, 2:00 PM – 4:00 PM
            </div>
            <Button size="lg" className="bg-primary-foreground text-primary font-heading font-semibold hover:opacity-90" onClick={() => scrollTo("booking")}>
              Book Online Consultation
            </Button>
            <p className="text-xs opacity-60">Video call via Doctylia — no app download needed</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default OnlineConsultation;
