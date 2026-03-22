import { motion } from "framer-motion";
import { Globe, CalendarCheck, CreditCard, Users, Brain, Video, MessageCircle, BarChart3 } from "lucide-react";
import featureWebsite from "@/assets/feature-website.png";
import featureAppointments from "@/assets/feature-appointments.png";
import featureBilling from "@/assets/feature-billing.png";
import featurePatients from "@/assets/feature-patients.png";
import featureAiBlog from "@/assets/feature-ai-blog.png";
import featureConsultation from "@/assets/feature-consultation.png";
import featureWhatsapp from "@/assets/feature-whatsapp.png";
import featureAnalytics from "@/assets/feature-analytics.png";

const features = [
  { icon: Globe, title: "Your Own Website", desc: "Get a professional branded website live in minutes — patients find & book you 24/7.", color: "bg-royal/10 text-royal", img: featureWebsite, bg: "bg-gradient-to-br from-royal/5 to-teal/5" },
  { icon: CalendarCheck, title: "Smart Appointments", desc: "Reduce no-shows by 70% with online booking + automated WhatsApp reminders.", color: "bg-success/10 text-success", img: featureAppointments, bg: "bg-gradient-to-br from-teal/5 to-success/5" },
  { icon: CreditCard, title: "Billing & Invoices", desc: "Auto-generate GST invoices, accept UPI payments — collect ₹0 outstanding.", color: "bg-accent/10 text-accent", img: featureBilling, bg: "bg-gradient-to-br from-royal/5 to-primary/5" },
  { icon: Users, title: "Patient Records", desc: "Digital patient history, prescriptions & reports — find any record in 2 seconds.", color: "bg-ai-purple/10 text-ai-purple", img: featurePatients, bg: "bg-gradient-to-br from-ai-purple/5 to-royal/5" },
  { icon: Brain, title: "AI Blog Writer", desc: "AI writes SEO health articles for your website — attract 3x more patients from Google.", color: "bg-spark/10 text-spark", img: featureAiBlog, bg: "bg-gradient-to-br from-spark/10 to-teal/5" },
  { icon: Video, title: "Online Consultation", desc: "Earn extra ₹20,000+/month with video consultations — no app download needed.", color: "bg-teal/10 text-teal", img: featureConsultation, bg: "bg-gradient-to-br from-teal/5 to-royal/5" },
  { icon: MessageCircle, title: "WhatsApp Integration", desc: "Auto reminders, confirmations & follow-ups — 80% fewer missed appointments.", color: "bg-success/10 text-success", img: featureWhatsapp, bg: "bg-gradient-to-br from-success/5 to-teal/5" },
  { icon: BarChart3, title: "Analytics Dashboard", desc: "Track revenue, patients & growth in real-time — make data-driven decisions.", color: "bg-royal/10 text-royal", img: featureAnalytics, bg: "bg-gradient-to-br from-royal/5 to-primary/5" },
];

const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const item = { hidden: { opacity: 0, y: 30 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } } };

const FeaturesGrid = () => (
  <section id="features" className="py-16 md:py-20 bg-white">
    <div className="container mx-auto px-4">
      <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
        <span className="text-xs md:text-sm font-semibold text-accent uppercase tracking-wider">Features</span>
        <h2 className="font-heading font-bold text-2xl sm:text-3xl md:text-4xl text-primary mt-2">
          Everything Your Practice Needs
        </h2>
        <p className="text-sm md:text-base text-muted-foreground mt-3">
          One platform to run, grow, and automate your entire medical practice.
        </p>
      </div>
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-60px" }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5"
      >
        {features.map((f) => (
          <motion.div
            key={f.title}
            variants={item}
            whileHover={{ y: -6, rotateY: 2, rotateX: -2 }}
            style={{ perspective: 800 }}
            className="group rounded-xl bg-white border border-border hover:border-royal/30 hover:shadow-xl transition-all duration-300 overflow-hidden"
          >
            <div className={`h-24 sm:h-32 md:h-36 overflow-hidden flex items-center justify-center ${f.bg}`}>
              <motion.img
                src={f.img}
                alt={f.title}
                className="h-16 sm:h-24 md:h-28 w-auto max-w-full object-contain"
                whileHover={{ scale: 1.1 }}
                transition={{ duration: 0.4 }}
                loading="lazy"
              />
            </div>
            <div className="p-3 md:p-5">
              <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg ${f.color} flex items-center justify-center mb-2 md:mb-3`}>
                <f.icon className="h-3.5 w-3.5 md:h-5 md:w-5" />
              </div>
              <h3 className="font-heading font-semibold text-primary text-xs sm:text-sm md:text-base">{f.title}</h3>
              <p className="text-[10px] sm:text-xs md:text-sm text-muted-foreground mt-1 leading-relaxed hidden sm:block">{f.desc}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  </section>
);

export default FeaturesGrid;
