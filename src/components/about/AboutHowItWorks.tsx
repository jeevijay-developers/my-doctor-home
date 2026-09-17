import MobileCardCarousel from "./MobileCardCarousel";

const patientSteps = [
  "Open the doctor's website (via their shared link or QR code)",
  "Explore their profile, clinic details, and services",
  "Choose in-clinic or online consultation, where offered",
  "Pick an available date and time slot",
  "Enter patient details",
  "Book the appointment (pay online or at the clinic)",
  "Attend the consultation",
];

const doctorSteps = [
  "Sign up and create a professional profile",
  "Add clinic details, services, and availability",
  "Go live with a branded website",
  "Manage appointments and patients from the dashboard",
  "Record prescriptions and patient medical history",
  "Add staff with role-based access",
  "Grow your presence with blog posts and reviews",
];

type Flow = { title: string; steps: string[]; color: string };

const flows: Flow[] = [
  { title: "For Patients", steps: patientSteps, color: "from-royal to-teal" },
  { title: "For Doctors", steps: doctorSteps, color: "from-teal to-accent" },
];

const StepList = ({ title, steps, color }: Flow) => (
  <div className="h-full rounded-2xl bg-white border border-border p-6 md:p-8 shadow-sm">
    <h3 className="font-heading font-bold text-lg md:text-xl text-primary mb-5">{title}</h3>
    <ol className="space-y-4">
      {steps.map((s, i) => (
        <li key={s} className="flex items-start gap-3">
          <span
            className={`flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br ${color} text-white text-xs font-bold flex items-center justify-center mt-0.5`}
          >
            {i + 1}
          </span>
          <span className="text-sm text-muted-foreground leading-relaxed pt-0.5">{s}</span>
        </li>
      ))}
    </ol>
  </div>
);

const AboutHowItWorks = () => (
  <section className="py-14 md:py-20 bg-secondary/40">
    <div className="container mx-auto px-4">
      <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
        <span className="text-xs md:text-sm font-semibold text-accent uppercase tracking-wider">The Flow</span>
        <h2 className="font-heading font-bold text-2xl sm:text-3xl md:text-4xl text-primary mt-2">
          How Doctylia Works
        </h2>
      </div>

      <div className="hidden md:grid md:grid-cols-2 gap-5 md:gap-6 max-w-4xl mx-auto items-stretch">
        {flows.map((f) => <StepList key={f.title} {...f} />)}
      </div>
      <MobileCardCarousel items={flows} renderItem={(f) => <StepList {...f} />} itemClassName="basis-[90%]" />
    </div>
  </section>
);

export default AboutHowItWorks;
