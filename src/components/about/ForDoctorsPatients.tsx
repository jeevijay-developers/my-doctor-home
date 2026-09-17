import { Stethoscope, UserRound, Check } from "lucide-react";

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

const ForDoctorsPatients = () => (
  <section className="py-14 md:py-20 bg-secondary/40">
    <div className="container mx-auto px-4">
      <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
        <span className="text-xs md:text-sm font-semibold text-accent uppercase tracking-wider">Built For Both Sides</span>
        <h2 className="font-heading font-bold text-2xl sm:text-3xl md:text-4xl text-primary mt-2">
          Built for Doctors, Designed for Patients
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6 max-w-4xl mx-auto items-stretch">
        <div className="rounded-2xl bg-white border border-border p-6 md:p-8 shadow-sm">
          <div className="w-11 h-11 rounded-xl bg-royal/10 text-royal flex items-center justify-center">
            <Stethoscope className="h-5 w-5" />
          </div>
          <h3 className="font-heading font-bold text-lg md:text-xl text-primary mt-4">Built for Doctors</h3>
          <PointList points={doctorPoints} />
        </div>
        <div className="rounded-2xl bg-white border border-border p-6 md:p-8 shadow-sm">
          <div className="w-11 h-11 rounded-xl bg-teal/10 text-teal flex items-center justify-center">
            <UserRound className="h-5 w-5" />
          </div>
          <h3 className="font-heading font-bold text-lg md:text-xl text-primary mt-4">Designed for Patients</h3>
          <PointList points={patientPoints} />
        </div>
      </div>
    </div>
  </section>
);

export default ForDoctorsPatients;
