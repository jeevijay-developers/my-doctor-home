import { Clock, MapPin, Star, Calendar, Users, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import drPhoto from "@/assets/dr-rahul.jpg";

const HeroBanner = () => {
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <section className="relative pt-24 pb-16 md:pt-32 md:pb-24 overflow-hidden bg-secondary">
      {/* Subtle pattern */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `radial-gradient(circle at 2px 2px, hsl(var(--navy)) 1px, transparent 0)`,
        backgroundSize: "40px 40px"
      }} />

      <div className="container mx-auto px-4 relative z-10">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          {/* Left */}
          <div className="space-y-6">
            <span className="inline-block px-4 py-1.5 rounded-pill bg-teal text-primary-foreground text-sm font-heading font-semibold">
              Cardiologist
            </span>
            <h1 className="font-heading font-extrabold text-4xl md:text-5xl lg:text-[52px] leading-tight text-primary">
              Dr. Rahul Sharma
            </h1>
            <p className="text-text-gray text-lg">MBBS, MD (Cardiology) — AIIMS New Delhi</p>

            <div className="flex flex-wrap gap-3 text-sm">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card shadow-sm text-foreground">
                <Clock size={14} className="text-royal" /> 15+ Years Experience
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card shadow-sm text-foreground">
                <MapPin size={14} className="text-royal" /> Sharma Heart Care, Mumbai
              </span>
            </div>

            <div className="flex gap-2">
              {["हिंदी", "English", "मराठी"].map((l) => (
                <span key={l} className="px-3 py-1 rounded-pill bg-card border border-border text-xs font-medium text-foreground">{l}</span>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex text-warning">
                {[...Array(5)].map((_, i) => <Star key={i} size={18} fill="currentColor" />)}
              </div>
              <span className="font-heading font-bold text-foreground">4.9</span>
              <span className="text-text-gray text-sm">· 187 reviews</span>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <Button size="lg" className="bg-primary text-primary-foreground font-heading font-semibold shadow-md hover:opacity-90" onClick={() => scrollTo("booking")}>
                <Calendar size={18} className="mr-2" /> Book Clinic Visit
              </Button>
              <Button size="lg" variant="outline" className="border-teal text-teal hover:bg-teal hover:text-primary-foreground font-heading font-semibold" onClick={() => scrollTo("online-consultation")}>
                <Video size={18} className="mr-2" /> Online Consultation
              </Button>
            </div>
          </div>

          {/* Right */}
          <div className="relative flex justify-center lg:justify-end">
            <div className="relative">
              <div className="w-72 h-80 md:w-80 md:h-96 rounded-2xl overflow-hidden shadow-xl border-t-4 border-royal">
                <img src={drPhoto} alt="Dr. Rahul Sharma" className="w-full h-full object-cover" />
              </div>

              {/* Floating cards */}
              <div className="absolute -left-8 top-8 bg-card rounded-xl shadow-lg px-4 py-2.5 flex items-center gap-2 animate-float" style={{ animationDelay: "0s" }}>
                <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center"><Calendar size={16} className="text-success" /></div>
                <div><p className="text-xs text-text-gray">Next slot</p><p className="text-sm font-heading font-bold text-foreground">Today 5:30 PM</p></div>
              </div>
              <div className="absolute -right-6 top-1/3 bg-card rounded-xl shadow-lg px-4 py-2.5 flex items-center gap-2 animate-float" style={{ animationDelay: "1s" }}>
                <div className="w-8 h-8 rounded-full bg-royal/10 flex items-center justify-center"><Users size={16} className="text-royal" /></div>
                <div><p className="text-xs text-text-gray">Treated</p><p className="text-sm font-heading font-bold text-foreground">5,000+</p></div>
              </div>
              <div className="absolute -left-4 bottom-8 bg-card rounded-xl shadow-lg px-4 py-2.5 flex items-center gap-2 animate-float" style={{ animationDelay: "2s" }}>
                <div className="w-8 h-8 rounded-full bg-warning/10 flex items-center justify-center"><Star size={16} className="text-warning" /></div>
                <div><p className="text-xs text-text-gray">Rating</p><p className="text-sm font-heading font-bold text-foreground">4.9 ★</p></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroBanner;
