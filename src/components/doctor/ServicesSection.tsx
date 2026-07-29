import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDoctorData } from "@/contexts/DoctorContext";

const typeColor: Record<string, string> = {
  clinic: "bg-royal/10 text-royal",
  online: "bg-teal/10 text-teal",
  both: "bg-primary/10 text-primary",
};

const ServicesSection = () => {
  const { services } = useDoctorData();
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <section id="services" className="py-16 md:py-24 bg-card">
      <div className="container mx-auto px-4">
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-primary text-center mb-4">Services & Fees</h2>
        <p className="text-text-gray text-center mb-12 max-w-lg mx-auto">Transparent pricing. Book instantly. No hidden charges.</p>

        <div className="flex flex-wrap justify-center gap-5">
          {services.map((s) => (
            <div key={s.id} className="w-full sm:w-[320px] bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-shadow flex flex-col">
              <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center mb-4">
                <Heart size={22} className="text-primary-foreground" />
              </div>
              <h3 className="font-heading font-semibold text-foreground text-lg">{s.name?.trim() || "Consultation"}</h3>
              {s.description && <p className="text-sm text-text-gray mt-1">{s.description}</p>}
              <div className="flex items-center gap-2 mt-2 mb-3">
                <span className={`text-xs px-2 py-0.5 rounded-pill font-medium ${typeColor[s.type] || ""}`}>{s.type}</span>
                <span className="text-xs text-text-gray">{s.duration} mins</span>
              </div>
              <p className="font-heading font-extrabold text-2xl text-primary mb-4">₹{s.price.toLocaleString()}</p>
              <Button className="w-full bg-teal text-primary-foreground hover:opacity-90 font-heading font-semibold" onClick={() => scrollTo("booking")}>
                Book Now
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;
