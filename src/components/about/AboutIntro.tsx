import { Globe, Users2, Target, Telescope, type LucideIcon } from "lucide-react";
import MobileCardCarousel from "./MobileCardCarousel";

type IntroCard = { icon: LucideIcon; color: string; title: string; desc: string };

const cards: IntroCard[] = [
  {
    icon: Globe,
    color: "bg-royal/10 text-royal",
    title: "For Doctors",
    desc: "A doctor can go live with a professional website, start accepting online bookings, and manage patients, prescriptions, and billing — without hiring a developer or IT team.",
  },
  {
    icon: Users2,
    color: "bg-teal/10 text-teal",
    title: "For Patients",
    desc: "A patient gets a clear view of the doctor's services and availability, and can book an appointment — in-clinic or online — in a few taps, instead of a phone call.",
  },
  {
    icon: Target,
    color: "bg-royal/10 text-royal",
    title: "Our Mission",
    desc: "To make healthcare access more convenient by helping every doctor build a professional digital presence, simplifying how appointments are booked and managed, and making it easier for patients to reach the right doctor with the information they need.",
  },
  {
    icon: Telescope,
    color: "bg-teal/10 text-teal",
    title: "Our Vision",
    desc: "A future where every doctor and clinic — solo practice or growing team — has the same digital tools as a large hospital chain, and every patient can find, book, and consult a doctor as easily as ordering anything else online.",
  },
];

const IntroCard = ({ c }: { c: IntroCard }) => (
  <div className="h-full rounded-2xl bg-white border border-border shadow-sm p-6 md:p-8">
    <div className={`w-11 h-11 rounded-xl ${c.color} flex items-center justify-center mb-4`}>
      <c.icon className="h-5 w-5" />
    </div>
    <h3 className="font-heading font-bold text-xl md:text-2xl text-primary">{c.title}</h3>
    <p className="text-sm md:text-base text-muted-foreground mt-3 leading-relaxed">{c.desc}</p>
  </div>
);

const AboutIntro = () => (
  <section className="py-14 md:py-20 bg-white">
    <div className="container mx-auto px-4">
      <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
        <span className="text-xs md:text-sm font-semibold text-accent uppercase tracking-wider">Who We Are</span>
        <h2 className="font-heading font-bold text-2xl sm:text-3xl md:text-4xl text-primary mt-2">
          What is Doctylia?
        </h2>
        <p className="text-sm md:text-base text-muted-foreground mt-3 leading-relaxed">
          Most independent doctors and small clinics in India still run on phone-call bookings, paper
          records, and word-of-mouth. Doctylia replaces that with a single platform: a branded website for
          the doctor, and a simple booking experience for the patient.
        </p>
      </div>

      <div className="hidden md:grid md:grid-cols-2 gap-5 md:gap-6 max-w-4xl mx-auto items-stretch">
        {cards.map((c) => <IntroCard key={c.title} c={c} />)}
      </div>
      <MobileCardCarousel items={cards} renderItem={(c) => <IntroCard c={c} />} />
    </div>
  </section>
);

export default AboutIntro;
