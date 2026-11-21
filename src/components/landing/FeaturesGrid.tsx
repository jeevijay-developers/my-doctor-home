import { Globe, MessageCircle, Receipt, FilePenLine, Brain, Video, Users, BarChart3 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import AnimatedItem from "./AnimatedItem";
import MobileCarousel from "./MobileCarousel";

type Feature = {
  icon: LucideIcon;
  title: string;
  desc: string;
  badge: string;
  img: string;
  iconBox: string;
  badgeColor: string;
};

const features: Feature[] = [
  { icon: Globe, title: "Instant Branded Clinic Site", desc: "Launch your mobile-ready clinic portal in under 10 minutes with custom domain support and verified doctor credentials.", badge: "SEO Optimized", img: "/stitch/landing-02.png", iconBox: "bg-royal/10 text-royal", badgeColor: "text-primary" },
  { icon: MessageCircle, title: "Smart WhatsApp Engine", desc: "Automated appointment booking, instant directions, and 24-hour reminder pings sent straight to your patient's WhatsApp.", badge: "Reduces No-Shows by 48%", img: "/stitch/landing-03.png", iconBox: "bg-success/10 text-success", badgeColor: "text-success" },
  { icon: Receipt, title: "1-Click GST Invoices & UPI", desc: "Instant GST-compliant invoices with QR codes for fast UPI, card, or cash payments. Directly calculate tax splits and export reports for your CA.", badge: "Instant Razorpay/UPI QR", img: "/stitch/landing-04.png", iconBox: "bg-teal/10 text-teal", badgeColor: "text-primary" },
  { icon: FilePenLine, title: "Digital Rx & Smart EMR", desc: "100,000+ Indian drug formulations database. Create customized Rx templates with dosage instructions, lab orders, and historical comparisons.", badge: "Print or WhatsApp PDF", img: "/stitch/landing-05.png", iconBox: "bg-navy/10 text-navy", badgeColor: "text-primary" },
  { icon: Brain, title: "AI Patient Education Blog", desc: "Draft localized clinical articles on health symptoms in seconds. Educate your community and build local doctor authority on autopilot.", badge: "1-Click Auto-Publish", img: "/stitch/landing-06.png", iconBox: "bg-ai-purple/10 text-ai-purple", badgeColor: "text-primary" },
  { icon: Video, title: "Zero-App HD Teleconsult", desc: "Patients join via browser link with zero installation required. Includes clinical screen sharing, real-time vital notes, and in-call prescription drafting.", badge: "Encrypted WebRTC", img: "/stitch/landing-07.png", iconBox: "bg-teal/10 text-teal", badgeColor: "text-primary" },
  { icon: Users, title: "Staff & Receptionist Portals", desc: "Provide receptionists with front-desk token queues and cash registers while keeping clinical diagnosis and confidential records doctor-restricted.", badge: "Role-Based Permissions", img: "/stitch/landing-08.png", iconBox: "bg-navy/10 text-navy", badgeColor: "text-primary" },
  { icon: BarChart3, title: "Clinical Growth Analytics", desc: "Monitor OPD volume trends, revenue streams by procedure, patient return rates, and peak consultation hours from one visual executive cockpit.", badge: "Live Financial Ledger", img: "/stitch/landing-09.png", iconBox: "bg-success/10 text-success", badgeColor: "text-success" },
];

const FeaturesGrid = () => (
  <section id="features" className="w-full py-12 md:py-20 bg-muted/40">
    <div className="container mx-auto px-4">
      <div className="max-w-3xl mx-auto text-center mb-10 md:mb-14">
        <span className="inline-block px-3.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider">
          Everything your practice needs
        </span>
        <h2 className="font-heading font-extrabold text-2xl sm:text-3xl md:text-4xl text-navy mt-4">
          Built specifically to simplify the clinical workday
        </h2>
        <p className="text-muted-foreground mt-4">
          One comprehensive clinical workstation. Zero clunky software, no multiple subscriptions.
        </p>
      </div>

      <div className="max-w-7xl mx-auto">
      <MobileCarousel label="Platform features" desktopClassName="md:grid md:grid-cols-2 lg:grid-cols-4 md:gap-6">
        {features.map((f, i) => (
          <AnimatedItem key={f.title} index={i % 4} staggerMs={80} className="h-full">
            <div className="h-full bg-card rounded-3xl p-5 md:p-6 border border-border shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div>
                <div className="bg-gradient-to-b from-royal/5 to-teal/5 rounded-2xl h-44 md:h-48 flex items-center justify-center p-3 mb-5 overflow-hidden">
                  <img
                    src={f.img}
                    alt={f.title}
                    loading="lazy"
                    className="w-full h-full max-h-40 object-contain drop-shadow-sm transition-transform duration-300 hover:scale-105"
                  />
                </div>
                <div className="flex items-center gap-2.5 mb-2">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${f.iconBox}`}>
                    <f.icon className="h-4 w-4" />
                  </span>
                  <h3 className="font-heading text-[17px] font-bold text-navy leading-tight">{f.title}</h3>
                </div>
                <div className="text-[13px] text-muted-foreground leading-relaxed">{f.desc}</div>
              </div>
              <div className={`mt-6 pt-4 border-t border-border flex items-center justify-between gap-2 text-sm font-semibold ${f.badgeColor}`}>
                <span>{f.badge}</span>
              </div>
            </div>
          </AnimatedItem>
        ))}
      </MobileCarousel>
      </div>
    </div>
  </section>
);

export default FeaturesGrid;
