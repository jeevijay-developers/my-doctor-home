import { Heart, Baby, Bone, Eye, Brain, Stethoscope, Smile, Scissors, Pill, Activity } from "lucide-react";

const specialties = [
  { name: "General Physician", icon: Stethoscope, count: "3,200+" },
  { name: "Dentist", icon: Smile, count: "1,800+" },
  { name: "Pediatrician", icon: Baby, count: "1,400+" },
  { name: "Cardiologist", icon: Heart, count: "900+" },
  { name: "Orthopedic", icon: Bone, count: "750+" },
  { name: "Dermatologist", icon: Scissors, count: "680+" },
  { name: "Ophthalmologist", icon: Eye, count: "520+" },
  { name: "Neurologist", icon: Brain, count: "400+" },
  { name: "Gynecologist", icon: Activity, count: "1,100+" },
  { name: "Ayurvedic", icon: Pill, count: "350+" },
];

const Specialties = () => (
  <section className="py-14 md:py-20 bg-secondary">
    <div className="container mx-auto px-4">
      <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
        <span className="text-xs md:text-sm font-semibold text-accent uppercase tracking-wider">For Every Doctor</span>
        <h2 className="font-heading font-bold text-2xl sm:text-3xl md:text-4xl text-primary mt-2">
          Built for Every Specialty
        </h2>
        <p className="text-sm md:text-base text-muted-foreground mt-3">
          Whether you're a solo practitioner or run a multi-specialty clinic — Doctylia adapts to your practice.
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 md:gap-4 max-w-4xl mx-auto">
        {specialties.map((s) => (
          <div key={s.name} className="bg-white rounded-xl p-4 text-center border border-border hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group">
            <div className="w-12 h-12 rounded-xl bg-royal/8 flex items-center justify-center mx-auto mb-3 group-hover:bg-royal/15 transition-colors">
              <s.icon className="h-6 w-6 text-royal" />
            </div>
            <div className="font-heading font-semibold text-sm text-primary">{s.name}</div>
            <div className="text-[11px] text-muted-foreground mt-1">{s.count} doctors</div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default Specialties;
