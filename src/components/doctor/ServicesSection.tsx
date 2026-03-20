import { Heart, Activity, Stethoscope, Monitor, Video, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const services = [
  { icon: Stethoscope, name: "General Consultation", price: 500, type: "Clinic", duration: "30 mins" },
  { icon: Heart, name: "Cardiac Consultation", price: 800, type: "Both", duration: "45 mins" },
  { icon: Activity, name: "ECG Interpretation", price: 300, type: "Clinic", duration: "15 mins" },
  { icon: Monitor, name: "Echo Cardiogram", price: 1200, type: "Clinic", duration: "40 mins" },
  { icon: Video, name: "Online Consultation", price: 600, type: "Online", duration: "30 mins" },
];

const packages = [
  {
    name: "Basic Heart Checkup",
    tagline: "Essential cardiac monitoring",
    price: 1500, original: 2000, duration: "month",
    features: ["1 Consultation/month", "ECG included", "WhatsApp support", "Diet plan"],
    popular: false,
  },
  {
    name: "Cardiac Care Plan",
    tagline: "Complete monthly cardiac care",
    price: 3000, original: 4500, duration: "month",
    features: ["2 Consultations/month", "ECG + Echo", "Unlimited WhatsApp", "Medication review", "Priority slots"],
    popular: true,
  },
  {
    name: "Premium Cardiac",
    tagline: "VIP comprehensive cardiac management",
    price: 6000, original: 8000, duration: "month",
    features: ["4 Consultations/month", "All tests included", "24/7 emergency line", "Home visit (1/month)", "Family counseling"],
    popular: false,
  },
];

const typeColor: Record<string, string> = {
  Clinic: "bg-royal/10 text-royal",
  Online: "bg-teal/10 text-teal",
  Both: "bg-primary/10 text-primary",
};

const ServicesSection = () => {
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <section id="services" className="py-16 md:py-24 bg-card">
      <div className="container mx-auto px-4">
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-primary text-center mb-4">Services & Fees</h2>
        <p className="text-text-gray text-center mb-12 max-w-lg mx-auto">Transparent pricing. Book instantly. No hidden charges.</p>

        {/* Services grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-20">
          {services.map((s, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-shadow group">
              <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center mb-4">
                <s.icon size={22} className="text-primary-foreground" />
              </div>
              <h3 className="font-heading font-semibold text-foreground text-lg">{s.name}</h3>
              <div className="flex items-center gap-2 mt-2 mb-3">
                <span className={`text-xs px-2 py-0.5 rounded-pill font-medium ${typeColor[s.type]}`}>{s.type}</span>
                <span className="text-xs text-text-gray">{s.duration}</span>
              </div>
              <p className="font-heading font-extrabold text-2xl text-primary mb-4">₹{s.price.toLocaleString()}</p>
              <Button className="w-full bg-teal text-primary-foreground hover:opacity-90 font-heading font-semibold" onClick={() => scrollTo("booking")}>
                Book Now
              </Button>
            </div>
          ))}
        </div>

        {/* Packages */}
        <h3 className="font-heading font-bold text-2xl text-primary text-center mb-8">Care Packages</h3>
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {packages.map((p, i) => (
            <div key={i} className={`relative rounded-2xl p-6 bg-card border-2 transition-shadow hover:shadow-xl ${p.popular ? "border-primary shadow-lg" : "border-border"}`}>
              {p.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-pill bg-teal text-primary-foreground text-xs font-heading font-bold">
                  Most Popular
                </span>
              )}
              <h4 className="font-heading font-bold text-lg text-foreground">{p.name}</h4>
              <p className="text-sm text-text-gray mb-4">{p.tagline}</p>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="font-heading font-extrabold text-3xl text-primary">₹{p.price.toLocaleString()}</span>
                <span className="text-text-gray text-sm">/{p.duration}</span>
              </div>
              <p className="text-sm text-text-gray line-through mb-5">₹{p.original.toLocaleString()}/{p.duration}</p>
              <ul className="space-y-2 mb-6">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-foreground">
                    <Check size={16} className="text-teal flex-shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <Button className={`w-full font-heading font-semibold ${p.popular ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground"}`} onClick={() => scrollTo("booking")}>
                Subscribe Now
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ServicesSection;
