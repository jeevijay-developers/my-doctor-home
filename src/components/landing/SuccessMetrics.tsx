import { motion } from "framer-motion";
import { TrendingUp, CalendarCheck, Clock, IndianRupee } from "lucide-react";

const metrics = [
  {
    icon: IndianRupee,
    value: "₹2.4 Cr+",
    label: "Revenue Generated",
    desc: "Total revenue processed through Doctylia for doctors across India",
    gradient: "from-royal to-teal",
  },
  {
    icon: CalendarCheck,
    value: "50,000+",
    label: "Appointments Booked",
    desc: "Patients booked seamlessly through doctor websites powered by us",
    gradient: "from-teal to-accent",
  },
  {
    icon: Clock,
    value: "14 Hours",
    label: "Saved Per Week",
    desc: "Average time saved per doctor on admin work after switching to Doctylia",
    gradient: "from-accent to-spark",
  },
  {
    icon: TrendingUp,
    value: "98%",
    label: "Satisfaction Rate",
    desc: "Doctors who recommend Doctylia to their peers and colleagues",
    gradient: "from-success to-teal",
  },
];

const container = { hidden: {}, show: { transition: { staggerChildren: 0.15 } } };
const item = { hidden: { opacity: 0, scale: 0.9 }, show: { opacity: 1, scale: 1, transition: { duration: 0.5 } } };

const SuccessMetrics = () => (
  <section className="py-16 md:py-20 bg-primary relative overflow-hidden">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(var(--royal)/0.3),transparent_60%)]" />
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,hsl(var(--teal)/0.2),transparent_60%)]" />
    
    <div className="container mx-auto px-4 relative">
      <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
        <span className="text-xs md:text-sm font-semibold text-accent uppercase tracking-wider">Our Impact</span>
        <h2 className="font-heading font-bold text-2xl sm:text-3xl md:text-4xl text-white mt-2">
          Numbers That Speak Volumes
        </h2>
        <p className="text-sm md:text-base text-white/60 mt-3">
          Real results from real doctors across India
        </p>
      </div>
      
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-60px" }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 max-w-5xl mx-auto"
      >
        {metrics.map((m) => (
          <motion.div
            key={m.label}
            variants={item}
            whileHover={{ y: -4, scale: 1.02 }}
            className="relative group"
          >
            <div className="absolute inset-0 bg-gradient-to-br opacity-20 rounded-2xl blur-sm group-hover:opacity-30 transition-opacity" 
              style={{ backgroundImage: `linear-gradient(to bottom right, var(--tw-gradient-stops))` }} />
            <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5 md:p-6 text-center hover:bg-white/10 transition-colors">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${m.gradient} flex items-center justify-center mx-auto mb-4 shadow-lg`}>
                <m.icon className="h-6 w-6 text-white" />
              </div>
              <div className="font-heading font-extrabold text-2xl md:text-3xl text-white mb-1">{m.value}</div>
              <div className="font-heading font-semibold text-sm text-accent mb-2">{m.label}</div>
              <p className="text-xs text-white/50 leading-relaxed">{m.desc}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  </section>
);

export default SuccessMetrics;
