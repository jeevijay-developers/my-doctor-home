import { Globe, CalendarCheck, CreditCard, Users, Brain, Video, MessageCircle, BarChart3 } from "lucide-react";

const features = [
  { icon: Globe, title: "Your Own Website", desc: "Professional branded website at drname.doctylia.com — live in minutes." },
  { icon: CalendarCheck, title: "Smart Appointments", desc: "Online booking, slot management, WhatsApp reminders — zero no-shows." },
  { icon: CreditCard, title: "Billing & Invoices", desc: "Generate GST invoices, track payments, accept online payments via UPI." },
  { icon: Users, title: "Patient Records", desc: "Digital patient history, prescriptions, reports — all in one place." },
  { icon: Brain, title: "AI Blog Writer", desc: "AI writes health articles for your website — boost SEO & patient trust." },
  { icon: Video, title: "Online Consultation", desc: "Video consultations with integrated booking & payment flow." },
  { icon: MessageCircle, title: "WhatsApp Integration", desc: "Automated appointment confirmations, reminders, and follow-ups." },
  { icon: BarChart3, title: "Analytics Dashboard", desc: "Track patients, revenue, appointments, and website traffic in real-time." },
];

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
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {features.map((f) => (
          <div
            key={f.title}
            className="group p-6 rounded-xl bg-secondary hover:bg-white hover:shadow-lg border border-transparent hover:border-border transition-all duration-300"
          >
            <div className="w-12 h-12 rounded-xl bg-royal/10 flex items-center justify-center mb-4 group-hover:bg-royal/20 transition-colors">
              <f.icon className="h-6 w-6 text-royal" />
            </div>
            <h3 className="font-heading font-semibold text-primary text-lg">{f.title}</h3>
            <p className="text-sm text-muted-foreground mt-2">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default FeaturesGrid;
