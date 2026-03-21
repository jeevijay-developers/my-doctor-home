import { motion } from "framer-motion";
import { Globe, CalendarCheck, CreditCard, Users, Brain, Video, MessageCircle, BarChart3 } from "lucide-react";

const features = [
  { icon: Globe, title: "Your Own Website", desc: "Professional branded website at drname.doctylia.com — live in minutes.", color: "bg-royal/10 text-royal", img: "https://images.unsplash.com/photo-1551434678-e076c223a692?w=200&h=120&fit=crop" },
  { icon: CalendarCheck, title: "Smart Appointments", desc: "Online booking, slot management, WhatsApp reminders — zero no-shows.", color: "bg-success/10 text-success", img: "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=200&h=120&fit=crop" },
  { icon: CreditCard, title: "Billing & Invoices", desc: "Generate GST invoices, track payments, accept online payments via UPI.", color: "bg-accent/10 text-accent", img: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=200&h=120&fit=crop" },
  { icon: Users, title: "Patient Records", desc: "Digital patient history, prescriptions, reports — all in one place.", color: "bg-ai-purple/10 text-ai-purple", img: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=200&h=120&fit=crop" },
  { icon: Brain, title: "AI Blog Writer", desc: "AI writes health articles for your website — boost SEO & patient trust.", color: "bg-spark/10 text-spark", img: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=200&h=120&fit=crop" },
  { icon: Video, title: "Online Consultation", desc: "Video consultations with integrated booking & payment flow.", color: "bg-teal/10 text-teal", img: "https://images.unsplash.com/photo-1609904603803-33fee8b1e0e0?w=200&h=120&fit=crop" },
  { icon: MessageCircle, title: "WhatsApp Integration", desc: "Automated appointment confirmations, reminders, and follow-ups.", color: "bg-success/10 text-success", img: "https://images.unsplash.com/photo-1611746872915-64382b5c76da?w=200&h=120&fit=crop" },
  { icon: BarChart3, title: "Analytics Dashboard", desc: "Track patients, revenue, appointments, and website traffic in real-time.", color: "bg-royal/10 text-royal", img: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=200&h=120&fit=crop" },
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
            <div className="h-28 overflow-hidden">
              <img src={f.img} alt={f.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
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
