import { motion } from "framer-motion";
import { Heart, Baby, Bone, Eye, Brain, Stethoscope, Smile, Scissors, Pill, Activity } from "lucide-react";

const specialties = [
  { name: "General Physician", icon: Stethoscope, count: "3,200+", color: "bg-royal/8 text-royal" },
  { name: "Dentist", icon: Smile, count: "1,800+", color: "bg-teal/10 text-teal" },
  { name: "Pediatrician", icon: Baby, count: "1,400+", color: "bg-success/10 text-success" },
  { name: "Cardiologist", icon: Heart, count: "900+", color: "bg-destructive/10 text-destructive" },
  { name: "Orthopedic", icon: Bone, count: "750+", color: "bg-royal/8 text-royal" },
  { name: "Dermatologist", icon: Scissors, count: "680+", color: "bg-ai-purple/10 text-ai-purple" },
  { name: "Ophthalmologist", icon: Eye, count: "520+", color: "bg-teal/10 text-teal" },
  { name: "Neurologist", icon: Brain, count: "400+", color: "bg-warning/10 text-warning" },
  { name: "Gynecologist", icon: Activity, count: "1,100+", color: "bg-accent/10 text-accent" },
  { name: "Ayurvedic", icon: Pill, count: "350+", color: "bg-success/10 text-success" },
];

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, scale: 0.8 }, show: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: "easeOut" } } };

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
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-60px" }}
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 md:gap-4 max-w-4xl mx-auto"
      >
        {specialties.map((s) => (
          <motion.div
            key={s.name}
            variants={item}
            whileHover={{ y: -4, scale: 1.03 }}
            className="bg-white rounded-xl p-4 text-center border border-border hover:shadow-md transition-all duration-200 group cursor-default"
          >
            <div className={`w-12 h-12 rounded-xl ${s.color} flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform`}>
              <s.icon className="h-6 w-6" />
            </div>
            <div className="font-heading font-semibold text-sm text-primary">{s.name}</div>
            <div className="text-[11px] text-muted-foreground mt-1">{s.count} doctors</div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  </section>
);

export default Specialties;
