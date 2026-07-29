import { Heart, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDoctorData } from "@/contexts/DoctorContext";

const typeColor: Record<string, string> = {
  clinic: "bg-royal/10 text-royal",
  online: "bg-teal/10 text-teal",
  both: "bg-primary/10 text-primary",
};

const ServicesSection = ({ showPackagesOnly }: { showPackagesOnly?: boolean }) => {
  const { services, packages } = useDoctorData();
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <section id="services" className="py-16 md:py-24 bg-card">
      <div className="container mx-auto px-4">
        {!showPackagesOnly && (
          <>
            <h2 className="font-heading font-bold text-3xl md:text-4xl text-primary text-center mb-4">Services & Fees</h2>
            <p className="text-text-gray text-center mb-12 max-w-lg mx-auto">Transparent pricing. Book instantly. No hidden charges.</p>

            <div className="flex flex-wrap justify-center gap-5 mb-20">
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
          </>
        )}

        {packages.length > 0 && (
          <>
            <h3 className="font-heading font-bold text-2xl text-primary text-center mb-8">Care Packages</h3>
            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {packages.map((p) => (
                <div key={p.id} className={`relative rounded-2xl p-6 bg-card border-2 transition-shadow hover:shadow-xl ${p.is_popular ? "border-primary shadow-lg" : "border-border"}`}>
                  {p.is_popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-pill bg-teal text-primary-foreground text-xs font-heading font-bold">
                      Most Popular
                    </span>
                  )}
                  <h4 className="font-heading font-bold text-lg text-foreground">{p.name}</h4>
                  {p.tagline && <p className="text-sm text-text-gray mb-4">{p.tagline}</p>}
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="font-heading font-extrabold text-3xl text-primary">₹{p.price.toLocaleString()}</span>
                    <span className="text-text-gray text-sm">/{p.duration}</span>
                  </div>
                  {p.original_price > 0 && (
                    <p className="text-sm text-text-gray line-through mb-5">₹{p.original_price.toLocaleString()}/{p.duration}</p>
                  )}
                  {Array.isArray(p.features) && p.features.length > 0 && (
                    <ul className="space-y-2 mb-6">
                      {p.features.map((f: string, i: number) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                          <Check size={16} className="text-teal flex-shrink-0" /> {f}
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button className={`w-full font-heading font-semibold ${p.is_popular ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground"}`} onClick={() => scrollTo("booking")}>
                    Subscribe Now
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default ServicesSection;
