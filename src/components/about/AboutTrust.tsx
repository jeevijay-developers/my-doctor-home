import { ShieldCheck, KeyRound, ClipboardCheck, MonitorSmartphone } from "lucide-react";

const points = [
  { icon: ShieldCheck, title: "Professional Presence", desc: "A structured, consistent website format built for healthcare — not a generic template." },
  { icon: KeyRound, title: "Role-Based Access", desc: "Staff accounts only see the parts of the practice they're given access to." },
  { icon: ClipboardCheck, title: "Organized Records", desc: "Patient history, prescriptions, and appointments are kept in one structured system." },
  { icon: MonitorSmartphone, title: "Reliable Experience", desc: "The same platform doctors and patients use every day for real appointments." },
];

const AboutTrust = () => (
  <section className="py-14 md:py-20 bg-white">
    <div className="container mx-auto px-4">
      <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
        <span className="text-xs md:text-sm font-semibold text-accent uppercase tracking-wider">Built to Last</span>
        <h2 className="font-heading font-bold text-2xl sm:text-3xl md:text-4xl text-primary mt-2">
          A Platform You Can Rely On
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 max-w-5xl mx-auto">
        {points.map((p) => (
          <div key={p.title} className="text-center px-2">
            <div className="w-12 h-12 rounded-xl bg-royal/10 text-royal flex items-center justify-center mx-auto mb-3">
              <p.icon className="h-5 w-5" />
            </div>
            <h3 className="font-heading font-semibold text-primary text-sm md:text-base">{p.title}</h3>
            <p className="text-xs md:text-sm text-muted-foreground mt-1.5 leading-relaxed">{p.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default AboutTrust;
