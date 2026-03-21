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
  { icon: Globe, title: "Your Own Website", desc: "Professional branded website at drname.doctylia.com — live in minutes.", color: "bg-royal/10 text-royal", img: featureWebsite, bg: "bg-gradient-to-br from-royal/5 to-teal/5" },
  { icon: CalendarCheck, title: "Smart Appointments", desc: "Online booking, slot management, WhatsApp reminders — zero no-shows.", color: "bg-success/10 text-success", img: featureAppointments, bg: "bg-gradient-to-br from-teal/5 to-success/5" },
  { icon: CreditCard, title: "Billing & Invoices", desc: "Generate GST invoices, track payments, accept online payments via UPI.", color: "bg-accent/10 text-accent", img: featureBilling, bg: "bg-gradient-to-br from-royal/5 to-primary/5" },
  { icon: Users, title: "Patient Records", desc: "Digital patient history, prescriptions, reports — all in one place.", color: "bg-ai-purple/10 text-ai-purple", img: featurePatients, bg: "bg-gradient-to-br from-ai-purple/5 to-royal/5" },
  { icon: Brain, title: "AI Blog Writer", desc: "AI writes health articles for your website — boost SEO & patient trust.", color: "bg-spark/10 text-spark", img: featureAiBlog, bg: "bg-gradient-to-br from-spark/10 to-teal/5" },
  { icon: Video, title: "Online Consultation", desc: "Video consultations with integrated booking & payment flow.", color: "bg-teal/10 text-teal", img: featureConsultation, bg: "bg-gradient-to-br from-teal/5 to-royal/5" },
  { icon: MessageCircle, title: "WhatsApp Integration", desc: "Automated appointment confirmations, reminders, and follow-ups.", color: "bg-success/10 text-success", img: featureWhatsapp, bg: "bg-gradient-to-br from-success/5 to-teal/5" },
  { icon: BarChart3, title: "Analytics Dashboard", desc: "Track patients, revenue, appointments, and website traffic in real-time.", color: "bg-royal/10 text-royal", img: featureAnalytics, bg: "bg-gradient-to-br from-royal/5 to-primary/5" },
];

const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const item = { hidden: { opacity: 0, y: 30 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } } };

const FeaturesGrid = () => (
  <section id="features" className="py-20 bg-white">
    <div className="container mx-auto px-4">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <span className="text-sm font-semibold text-accent uppercase tracking-wider">Features</span>
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-primary mt-2">
          Everything Your Practice Needs
        </h2>
        <p className="text-muted-foreground mt-3">
          One platform to run, grow, and automate your entire medical practice.
        </p>
      </div>
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-60px" }}
        className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5"
      >
        {features.map((f) => (
          <motion.div
            key={f.title}
            variants={item}
            className="group rounded-xl bg-white border border-border hover:border-royal/30 hover:shadow-lg transition-all duration-300 overflow-hidden"
          >
            <div className={`h-36 overflow-hidden flex items-center justify-center ${f.bg}`}>
              <img src={f.img} alt={f.title} className="h-28 w-auto object-contain group-hover:scale-105 transition-transform duration-500" loading="lazy" />
            </div>
            <div className="p-5">
              <div className={`w-10 h-10 rounded-lg ${f.color} flex items-center justify-center mb-3`}>
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-heading font-semibold text-primary text-base">{f.title}</h3>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{f.desc}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  </section>
);

export default FeaturesGrid;
