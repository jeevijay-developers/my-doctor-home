import { Stethoscope, UserRound, Check, type LucideIcon } from "lucide-react";
import MobileCardCarousel from "./MobileCardCarousel";

const doctorPoints = [
  "A professional online presence with your own branded website",
  "Clinic information and services patients can browse anytime",
  "Online appointment booking, with in-clinic or video consultation",
  "Patient management, medical records, and prescriptions",
  "Health articles/blog to attract patients from search",
  "Staff accounts with roles scoped to what they should access",
  "Billing and invoices for consultations",
];

const patientPoints = [
  "Clear doctor and clinic information in one place",
  "Services offered by the doctor, at a glance",
  "Book an appointment without a phone call",
  "Choose in-clinic or online consultation, where offered",
  "Pick an available date and time slot",
  "Review appointment details after booking",
  "Read health articles published by the doctor",
];

type SideCard = { icon: LucideIcon; color: string; title: string; points: string[] };

const sides: SideCard[] = [
  { icon: Stethoscope, color: "bg-royal/10 text-royal", title: "Built for Doctors", points: doctorPoints },
  { icon: UserRound, color: "bg-teal/10 text-teal", title: "Designed for Patients", points: patientPoints },
];

const PointList = ({ points }: { points: string[] }) => (
  <ul className="space-y-2.5 mt-4">
    {points.map((p) => (
      <li key={p} className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
        <Check className="h-4 w-4 text-success shrink-0 mt-0.5" />
        <span>{p}</span>
      </li>
    ))}
  </ul>
);

const SideCard = ({ s }: { s: SideCard }) => (
  <div className="h-full rounded-2xl bg-white border border-border p-6 md:p-8 shadow-sm">
    <div className={`w-11 h-11 rounded-xl ${s.color} flex items-center justify-center`}>
      <s.icon className="h-5 w-5" />
    </div>
    <h3 className="font-heading font-bold text-lg md:text-xl text-primary mt-4">{s.title}</h3>
    <PointList points={s.points} />
  </div>
);

const ForDoctorsPatients = () => (
  <section className="py-14 md:py-20 bg-secondary/40">
    <div className="container mx-auto px-4">
      <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
        <span className="text-xs md:text-sm font-semibold text-accent uppercase tracking-wider">Built For Both Sides</span>
        <h2 className="font-heading font-bold text-2xl sm:text-3xl md:text-4xl text-primary mt-2">
          Built for Doctors, Designed for Patients
        </h2>
      </div>

      <div className="hidden md:grid md:grid-cols-2 gap-5 md:gap-6 max-w-4xl mx-auto items-stretch">
        {sides.map((s) => <SideCard key={s.title} s={s} />)}
      </div>
      <MobileCardCarousel items={sides} renderItem={(s) => <SideCard s={s} />} itemClassName="basis-[90%]" />
    </div>
  </section>
);

export default ForDoctorsPatients;
