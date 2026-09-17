import { Globe, CalendarClock, FolderKanban, Users2, Smartphone, TrendingUp, type LucideIcon } from "lucide-react";
import MobileCardCarousel from "./MobileCardCarousel";

type Reason = { icon: LucideIcon; title: string; desc: string };

const reasons: Reason[] = [
  { icon: Globe, title: "Professional Digital Presence", desc: "A branded website live in minutes, instead of relying on a directory listing alone." },
  { icon: CalendarClock, title: "Simple Appointment Experience", desc: "Patients book online; doctors see every appointment in one dashboard." },
  { icon: FolderKanban, title: "Centralized Information", desc: "Clinic details, services, patients, prescriptions, and billing in one place." },
  { icon: Users2, title: "Doctor-Patient Convenience", desc: "Fewer phone calls, clearer communication, easier follow-ups." },
  { icon: Smartphone, title: "Works on Any Device", desc: "The doctor's website and admin panel both work on desktop and mobile." },
  { icon: TrendingUp, title: "Room to Grow", desc: "Add staff accounts and expand capabilities as the practice grows." },
];

const ReasonCard = ({ r }: { r: Reason }) => (
  <div className="h-full rounded-xl bg-secondary/50 border border-border p-5">
    <div className="w-10 h-10 rounded-lg bg-royal/10 text-royal flex items-center justify-center mb-3">
      <r.icon className="h-5 w-5" />
    </div>
    <h3 className="font-heading font-semibold text-primary text-sm md:text-base">{r.title}</h3>
    <p className="text-xs md:text-sm text-muted-foreground mt-1.5 leading-relaxed">{r.desc}</p>
  </div>
);

const WhyDoctylia = () => (
  <section className="py-14 md:py-20 bg-white">
    <div className="container mx-auto px-4">
      <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
        <span className="text-xs md:text-sm font-semibold text-accent uppercase tracking-wider">Why Doctylia</span>
        <h2 className="font-heading font-bold text-2xl sm:text-3xl md:text-4xl text-primary mt-2">
          Why Doctors Choose Doctylia
        </h2>
      </div>

      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 max-w-5xl mx-auto">
        {reasons.map((r) => <ReasonCard key={r.title} r={r} />)}
      </div>
      <MobileCardCarousel items={reasons} renderItem={(r) => <ReasonCard r={r} />} />
    </div>
  </section>
);

export default WhyDoctylia;
