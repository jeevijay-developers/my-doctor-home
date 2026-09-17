import {
  Globe, CalendarCheck, ClipboardList, CreditCard, Video, Users,
  FileText, Newspaper, MessageSquareText, ShieldCheck, BarChart3, type LucideIcon,
} from "lucide-react";
import MobileCardCarousel from "./MobileCardCarousel";

type Offering = { icon: LucideIcon; title: string; desc: string };

const offerings: Offering[] = [
  { icon: Globe, title: "Branded Website", desc: "A professional website for the doctor's own practice." },
  { icon: CalendarCheck, title: "Online Appointment Booking", desc: "Patients book directly, without a phone call." },
  { icon: ClipboardList, title: "Appointment Management", desc: "Track, confirm, and manage bookings from one dashboard." },
  { icon: Video, title: "Online Consultation", desc: "Video consultations for patients who can't visit in person." },
  { icon: Users, title: "Patient Management", desc: "A searchable record of every patient the practice has seen." },
  { icon: FileText, title: "Medical Records & Prescriptions", desc: "Digital history, medications, and structured prescriptions." },
  { icon: CreditCard, title: "Billing & Invoices", desc: "Generate invoices and keep a record of payments." },
  { icon: Newspaper, title: "Health Articles & Blog", desc: "AI-assisted blog writing to publish on the doctor's site." },
  { icon: MessageSquareText, title: "Patient Communication", desc: "Automated checkup reminders over SMS/WhatsApp." },
  { icon: ShieldCheck, title: "Staff Access & Roles", desc: "Add clinic staff with permissions scoped to their role." },
  { icon: BarChart3, title: "Analytics", desc: "A dashboard view of appointments, patients, and revenue." },
];

const OfferingCard = ({ o }: { o: Offering }) => (
  <div className="h-full rounded-xl bg-white border border-border hover:border-royal/30 hover:shadow-lg transition-all duration-300 p-4 md:p-5">
    <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg bg-royal/10 text-royal flex items-center justify-center mb-3">
      <o.icon className="h-4 w-4 md:h-5 md:w-5" />
    </div>
    <h3 className="font-heading font-semibold text-primary text-xs sm:text-sm md:text-base">{o.title}</h3>
    <p className="text-[11px] sm:text-xs md:text-sm text-muted-foreground mt-1 leading-relaxed">{o.desc}</p>
  </div>
);

const WhatWeOffer = () => (
  <section id="what-we-offer" className="py-14 md:py-20 bg-white">
    <div className="container mx-auto px-4">
      <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
        <span className="text-xs md:text-sm font-semibold text-accent uppercase tracking-wider">Platform</span>
        <h2 className="font-heading font-bold text-2xl sm:text-3xl md:text-4xl text-primary mt-2">
          What Doctylia Offers
        </h2>
        <p className="text-sm md:text-base text-muted-foreground mt-3">
          Everything needed to run a modern medical practice, in one platform.
        </p>
      </div>

      <div className="hidden md:grid md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
        {offerings.map((o) => <OfferingCard key={o.title} o={o} />)}
      </div>
      <MobileCardCarousel items={offerings} renderItem={(o) => <OfferingCard o={o} />} />
    </div>
  </section>
);

export default WhatWeOffer;
