import { Stethoscope, Video, Building2, ArrowRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDoctorData } from "@/contexts/DoctorContext";

const typeMeta: Record<string, { label: string; icon: any; className: string }> = {
  clinic: { label: "Clinic Visit", icon: Building2, className: "bg-royal/10 text-royal" },
  online: { label: "Online", icon: Video, className: "bg-teal/10 text-teal" },
  both: { label: "Clinic + Online", icon: Stethoscope, className: "bg-primary/10 text-primary" },
};

const ServicesSection = () => {
  const { services } = useDoctorData();
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  if (services.length === 0) return null;

  return (
    <section id="services" className="py-16 md:py-24 bg-card">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
          <span className="inline-block px-3 py-1 rounded-full bg-teal/10 text-teal text-xs font-heading font-semibold uppercase tracking-wider">
            Services
          </span>
          <h2 className="font-heading font-bold text-3xl md:text-4xl text-primary mt-3 mb-3 leading-tight">
            Consultations & Fees
          </h2>
          <p className="text-text-gray">
            Transparent pricing. Book instantly. No hidden charges.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto">
          {services.map((s: any) => {
            const meta = typeMeta[s.type] || typeMeta.clinic;
            const Icon = meta.icon;
            return (
              <div
                key={s.id}
                className="hover-lift group relative bg-card border border-border rounded-2xl p-6 flex flex-col overflow-hidden"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-royal via-teal to-royal opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-royal/10 flex items-center justify-center">
                    <Icon size={22} className="text-royal" />
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${meta.className}`}>
                    {meta.label}
                  </span>
                </div>

                <h3 className="font-heading font-semibold text-foreground text-lg leading-snug">
                  {s.name?.trim() || "Consultation"}
                </h3>
                {s.description && (
                  <p className="text-sm text-text-gray mt-1.5 line-clamp-2">{s.description}</p>
                )}

                <div className="flex items-center gap-3 text-xs text-text-gray mt-3">
                  <span className="flex items-center gap-1">
                    <Clock size={12} /> {s.duration} mins
                  </span>
                </div>

                <div className="mt-5 pt-5 border-t border-border flex items-end justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-text-gray font-heading font-semibold">
                      Fee
                    </p>
                    <p className="font-heading font-extrabold text-2xl text-primary leading-none mt-1">
                      ₹{Number(s.price).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="btn-pop rounded-full bg-primary text-primary-foreground hover:opacity-90 font-heading font-semibold"
                    onClick={() => scrollTo("booking")}
                  >
                    Book <ArrowRight size={14} className="ml-1" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;
