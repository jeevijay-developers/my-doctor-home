import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  Globe,
  Hourglass,
  IdCard,
  Headset,
  IndianRupee,
  Lock,
  MessageCircle,
  Minus,
  Receipt,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Brain,
  TrendingUp,
  Video,
  X,
  Zap,
  Pill,
  type LucideIcon,
} from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import AnimatedSection from "@/components/landing/AnimatedSection";
import { Button } from "@/components/ui/button";

const TITLE = "Features | Doctylia";
const DESCRIPTION =
  "Doctylia features: branded clinic website, WhatsApp reminders, GST invoices with UPI QR, digital Rx and EMR, AI blog writer, teleconsultation and analytics.";

type Tone = "primary" | "success" | "teal" | "spark" | "ai-purple" | "navy";

// Full class names so Tailwind can see them.
const TONES: Record<Tone, { text: string; glow: string }> = {
  primary: { text: "text-primary", glow: "from-primary/20 to-teal/20" },
  success: { text: "text-success", glow: "from-success/20 to-primary/15" },
  teal: { text: "text-teal", glow: "from-teal/20 to-primary/15" },
  spark: { text: "text-warning", glow: "from-spark/25 to-primary/10" },
  "ai-purple": { text: "text-ai-purple", glow: "from-ai-purple/20 to-primary/15" },
  navy: { text: "text-navy", glow: "from-navy/15 to-teal/15" },
};

interface Feature {
  id: string;
  nav: string;
  tag: string;
  tagIcon: LucideIcon;
  tone: Tone;
  title: string;
  lead: string;
  bullets: string[];
  badgeIcon: LucideIcon;
  badge: string;
  img: string;
  alt: string;
  contain?: boolean;
  browserUrl?: string;
}

const FEATURES: Feature[] = [
  {
    id: "feature-portal",
    nav: "1. Branded Clinic Site",
    tag: "Web & Online Presence",
    tagIcon: Globe,
    tone: "primary",
    title: "Instant Branded Clinic Website & SEO Portal",
    lead: "Launch a custom, mobile-optimized patient portal in under 10 minutes without writing a single line of code.",
    bullets: [
      "Custom domain or free clinic subdomain (e.g., drsharma.doctylia.com)",
      "Google Maps & local SEO indexation to capture neighborhood OPD searches",
      "Integrated appointment schedule with automatic slot locking and live tokens",
      "Doctor bio, verified medical council degrees, clinic timings, and photos",
    ],
    badgeIcon: Zap,
    badge: "10-minute setup • 3.2x online booking surge",
    img: "/stitch/landing-02.png",
    alt: "Modern clinic portal laptop interface",
    browserUrl: "drarorasurgery.doctylia.com",
  },
  {
    id: "feature-whatsapp",
    nav: "2. WhatsApp Engine",
    tag: "Patient Communication",
    tagIcon: MessageCircle,
    tone: "success",
    title: "Smart 24/7 WhatsApp Appointment & Reminder Engine",
    lead: "Cut missed appointments and phone tag by meeting patients directly where they are — on official WhatsApp.",
    bullets: [
      "Instant automated booking confirmations and clinic Google Maps directions",
      "24-hour and 2-hour pre-consultation reminder pings with 1-tap reschedule",
      "Automated token queue tracker: patients arrive just 10 mins before their turn",
      "Post-op routine care advisories and scheduled follow-up review prompts",
    ],
    badgeIcon: BadgeCheck,
    badge: "Reduces OPD no-shows by 48% • Zero manual phone calls",
    img: "/stitch/landing-03.png",
    alt: "Glossy WhatsApp Smartphone Notification Illustration",
    contain: true,
  },
  {
    id: "feature-gst",
    nav: "3. GST & UPI",
    tag: "Finance & Billing",
    tagIcon: IndianRupee,
    tone: "teal",
    title: "1-Click GST Invoices, Dynamic UPI QR & Financial Records",
    lead: "Compliant Indian healthcare taxation made instantaneous. Generate B2B/B2C GST receipts in under 10 seconds.",
    bullets: [
      "Dynamic UPI QR codes right on the invoice for fast contactless settlements",
      "Automated HSN/SAC code classification for consultations vs diagnostic tests",
      "Direct 1-tap WhatsApp invoice dispatch with print-ready downloadable PDF",
      "Ready-to-file monthly GST summary reports for your Chartered Accountant",
    ],
    badgeIcon: Receipt,
    badge: "10-second invoice generation • 100% GST & CA ready",
    img: "/stitch/landing-04.png",
    alt: "GST Invoice UI Illustration",
  },
  {
    id: "feature-emr",
    nav: "4. Digital Rx & EMR",
    tag: "Clinical Workflow",
    tagIcon: Pill,
    tone: "primary",
    title: "Fast-Tap Digital Rx & Smart Specialty EMR",
    lead: "Prescribe accurately in 20 seconds with curated Indian formulation bundles and lifetime patient records.",
    bullets: [
      "100,000+ Indian drug brand & generic database with dosage and frequency autofill",
      "1-click acute illness specialty bundles (Fever, URI, Gastritis, Post-op)",
      "Longitudinal tracking for vitals, HbA1c, BP, lipid profiles, and lab trends",
      "Instant WhatsApp PDF delivery or clean thermal / A4 clinic letterhead print",
    ],
    badgeIcon: Stethoscope,
    badge: "20s prescription drafting • Encrypted medical records",
    img: "/stitch/landing-05.png",
    alt: "Modern Blue Rx Prescription Interface",
  },
  {
    id: "feature-blog",
    nav: "5. AI Clinical Blog",
    tag: "Practice Growth",
    tagIcon: Sparkles,
    tone: "ai-purple",
    title: "AI-Powered Patient Education & Clinical Blog Writer",
    lead: "Establish clinical authority in your city with medically accurate, localized articles generated in minutes.",
    bullets: [
      "Generates evidence-based seasonal health advisories (Dengue, Flu, Skincare)",
      "Auto-publishes directly to your branded clinic website under your byline",
      "Multilingual translation: explain complex diagnosis in Hindi, Tamil, Telugu, and English",
      "Boosts Google search rankings for your clinic without paying expensive agencies",
    ],
    badgeIcon: Brain,
    badge: "1-click auto-publishing • Medically sound citations",
    img: "/stitch/landing-06.png",
    alt: "Pastel Purple Browser UI Mockup",
  },
  {
    id: "feature-teleconsult",
    nav: "6. Teleconsultation",
    tag: "Virtual Consultation",
    tagIcon: Video,
    tone: "success",
    title: "Zero-App HD Teleconsultation with Live In-Call Rx",
    lead: "No app downloads required for patients. Send a secure encrypted browser link and consult effortlessly.",
    bullets: [
      "Secure WebRTC end-to-end encrypted video and crystal-clear audio",
      "Simultaneous digital prescription drafting during the video call on one screen",
      "Instant screen sharing for reviewing diagnostic scans, X-rays, and MRI reports",
      "Automated payment collection gatekeeper before the consultation link activates",
    ],
    badgeIcon: ShieldCheck,
    badge: "Zero patient app install • Encrypted WebRTC",
    img: "/stitch/landing-07.png",
    alt: "Telemedicine Laptop Video Call",
  },
  {
    id: "feature-roles",
    nav: "7. Staff Permissions",
    tag: "Clinic Management",
    tagIcon: IdCard,
    tone: "spark",
    title: "Multi-Staff & Receptionist Portals with Role Permissions",
    lead: "Empower front-desk staff to handle queues and billing while safeguarding patient clinical confidentiality.",
    bullets: [
      "Receptionist access restricted strictly to patient intake, tokens, and billing",
      "Private clinical notes, EMR, and diagnoses accessible exclusively by doctors",
      "Petty cash register and automatic day-end payment collection reconciliation",
      "Multi-doctor polyclinic roster coordination and chamber/room allocation",
    ],
    badgeIcon: Lock,
    badge: "Granular role-based security • Multi-doctor support",
    img: "/stitch/landing-08.png",
    alt: "Pastel User Roles Dashboard",
  },
  {
    id: "feature-analytics",
    nav: "8. Practice Analytics",
    tag: "Executive Intelligence",
    tagIcon: BarChart3,
    tone: "navy",
    title: "Clinical & Financial Growth Intelligence Dashboard",
    lead: "Gain actionable visibility into patient retention, peak OPD rush hours, and procedure revenue.",
    bullets: [
      "Real-time revenue split across consultation, pharmacy, and diagnostic procedures",
      "Patient return rate and chronic care follow-up adherence metrics tracking",
      "Peak OPD rush hour heatmaps to optimize staff shifts and consultation hours",
      "Exportable CSV, Excel, and PDF reports for accounting audits and operations",
    ],
    badgeIcon: TrendingUp,
    badge: "Live financial ledger • Actionable retention insights",
    img: "/stitch/landing-09.png",
    alt: "Rising Analytics Dashboard Chart",
  },
];

const KPIS = [
  { value: "10 min", label: "Setup Velocity", color: "text-navy" },
  { value: "48%", label: "Fewer No-Shows", color: "text-primary" },
  { value: "100k+", label: "Formulary Drugs", color: "text-navy" },
  { value: "Zero", label: "Patient Apps", color: "text-success" },
];

const COMPARISON = [
  {
    icon: X,
    iconWrap: "bg-destructive/10 text-destructive",
    title: "Spreadsheets & Registers",
    desc: "Manual entry, high risk of GST discrepancies, and paper records lost over time.",
    points: [
      "3-4 hours daily lost to reconciliation",
      "OPD no-show rates above 35%",
      "Zero local patient search visibility",
    ],
    outcome: "Outcome: Burnout & Lost Revenue",
    highlight: false,
  },
  {
    icon: Hourglass,
    iconWrap: "bg-warning/15 text-warning",
    title: "Legacy Clinic Software",
    desc: "Built in 2010. Clunky desktop software that crashes and requires months of training.",
    points: [
      "Forces patients to download separate apps",
      "Zero WhatsApp or automated UPI integration",
      "High annual lock-in maintenance costs",
    ],
    outcome: "Outcome: Resistance from Reception",
    highlight: false,
  },
  {
    icon: BadgeCheck,
    iconWrap: "bg-white/15 text-white",
    title: "Doctylia Operating System",
    desc: "Instant cloud speed, frictionless WhatsApp flows, and 20-second digital prescribing.",
    points: [
      "Automated 1-tap WhatsApp notifications",
      "Dynamic GST invoices with UPI QR codes",
      "Instant branded doctor website & SEO",
    ],
    outcome: "Outcome: 2.5 Extra Hours Daily Saved",
    highlight: true,
  },
];

const FeatureSection = ({ f, flip }: { f: Feature; flip: boolean }) => {
  const tone = TONES[f.tone];
  const TagIcon = f.tagIcon;
  const BadgeIcon = f.badgeIcon;
  return (
    <section
      id={f.id}
      className="scroll-mt-32 grid grid-cols-2 lg:grid-cols-12 gap-4 sm:gap-8 lg:gap-12 items-center"
    >
      <AnimatedSection className={`lg:col-span-5 relative group ${flip ? "order-2" : "order-1"}`}>
        <div
          className={`absolute -inset-2 sm:-inset-4 bg-gradient-to-tr ${tone.glow} rounded-3xl blur-xl opacity-60 group-hover:opacity-90 transition duration-500`}
        />
        <div className="relative bg-card border border-border rounded-2xl sm:rounded-3xl p-2 sm:p-3 md:p-5 shadow-xl overflow-hidden flex flex-col">
          {f.browserUrl && (
            <div className="flex items-center justify-between pb-2 sm:pb-3 px-1 sm:px-2 gap-2">
              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                <span className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-destructive/80" />
                <span className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-warning/80" />
                <span className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-success/80" />
              </div>
              <span className="font-mono text-[9px] sm:text-xs text-muted-foreground bg-muted px-2 sm:px-3 py-0.5 rounded-md truncate">
                {f.browserUrl}
              </span>
              <Lock className="h-3 w-3 sm:h-4 sm:w-4 text-success shrink-0" />
            </div>
          )}
          <img
            src={f.img}
            alt={f.alt}
            loading="lazy"
            className={`w-full rounded-xl sm:rounded-2xl ${
              f.contain ? "max-h-[340px] object-contain" : "h-auto object-cover"
            }`}
          />
        </div>
      </AnimatedSection>

      <AnimatedSection className={`lg:col-span-7 flex flex-col min-w-0 ${flip ? "order-1" : "order-2"}`}>
        <div
          className={`inline-flex items-center gap-1.5 sm:gap-2 self-start px-2 sm:px-3 py-1 rounded-full bg-muted ${tone.text} text-[9px] sm:text-xs font-semibold uppercase tracking-wider`}
        >
          <TagIcon className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
          {f.tag}
        </div>
        <h2 className="mt-3 sm:mt-4 font-heading text-base sm:text-2xl lg:text-4xl font-bold text-navy tracking-tight leading-tight">
          {f.title}
        </h2>
        <p className="mt-2 sm:mt-3 text-[11px] sm:text-base lg:text-xl text-muted-foreground leading-relaxed">
          {f.lead}
        </p>
        <ul className="mt-4 sm:mt-6 space-y-2 sm:space-y-3.5">
          {f.bullets.map((b) => (
            <li key={b} className="flex items-start gap-2 sm:gap-3">
              <span
                className={`shrink-0 mt-0.5 w-4 h-4 sm:w-6 sm:h-6 rounded-full bg-muted flex items-center justify-center ${tone.text}`}
              >
                <Check className="h-2.5 w-2.5 sm:h-4 sm:w-4" />
              </span>
              <span className="text-[11px] sm:text-sm lg:text-lg text-navy font-medium leading-snug">{b}</span>
            </li>
          ))}
        </ul>
        <div
          className={`mt-5 sm:mt-8 self-start inline-flex items-start sm:items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-muted ${tone.text} text-[10px] sm:text-sm lg:text-base font-semibold`}
        >
          <BadgeIcon className="h-3.5 w-3.5 sm:h-[18px] sm:w-[18px] shrink-0 mt-px sm:mt-0" />
          <span>{f.badge}</span>
        </div>
      </AnimatedSection>
    </section>
  );
};

const FeaturesPage = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
    const prevTitle = document.title;
    document.title = TITLE;

    const metaDesc = document.querySelector('meta[name="description"]');
    const prevDesc = metaDesc?.getAttribute("content") ?? null;
    metaDesc?.setAttribute("content", DESCRIPTION);

    const url = `${window.location.origin}/features`;
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const createdCanonical = !canonical;
    const prevCanonical = canonical?.getAttribute("href") ?? null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", url);

    const og: Record<string, string> = {
      "og:title": TITLE,
      "og:description": DESCRIPTION,
      "og:url": url,
    };
    const prevOg: Record<string, string | null> = {};
    for (const [prop, value] of Object.entries(og)) {
      const el = document.querySelector(`meta[property="${prop}"]`);
      prevOg[prop] = el?.getAttribute("content") ?? null;
      el?.setAttribute("content", value);
    }

    return () => {
      document.title = prevTitle;
      if (metaDesc && prevDesc !== null) metaDesc.setAttribute("content", prevDesc);
      if (createdCanonical) canonical?.remove();
      else if (prevCanonical !== null) canonical?.setAttribute("href", prevCanonical);
      for (const [prop, prev] of Object.entries(prevOg)) {
        if (prev !== null) document.querySelector(`meta[property="${prop}"]`)?.setAttribute("content", prev);
      }
    };
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background font-body">
      <LandingNavbar />
      <main className="w-full pt-16 md:pt-20">
        {/* Hero */}
        <div className="relative w-full overflow-hidden">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[980px] max-w-full h-[480px] bg-gradient-to-b from-primary/10 via-teal/10 to-transparent blur-3xl pointer-events-none rounded-full" />
          <div className="absolute top-20 right-10 w-96 h-96 bg-success/10 blur-3xl pointer-events-none rounded-full" />
          <section className="relative z-10 max-w-[1440px] mx-auto px-4 md:px-8 pt-12 md:pt-16 pb-12">
            <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
              <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-muted shadow-sm text-primary">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
                <span className="text-xs tracking-wider uppercase font-semibold">Complete Platform Walkthrough</span>
              </div>
              <h1 className="mt-6 font-heading text-3xl sm:text-5xl lg:text-6xl font-extrabold text-navy tracking-tight max-w-3xl leading-[1.1]">
                Every Tool Your Practice Needs to Run on{" "}
                <span className="text-primary underline decoration-teal decoration-wavy decoration-2 underline-offset-8">
                  Autopilot
                </span>
              </h1>
              <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl leading-relaxed">
                Explore how Doctylia replaces disconnected spreadsheets, WhatsApp chaos, and manual billing registers with
                one unified, clinical-grade operating system.
              </p>
              <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 w-full max-w-3xl">
                {KPIS.map((k) => (
                  <div
                    key={k.label}
                    className="p-3 sm:p-4 rounded-xl bg-card border border-border shadow-sm flex flex-col items-center"
                  >
                    <span className={`font-heading text-2xl sm:text-3xl font-bold ${k.color}`}>{k.value}</span>
                    <span className="text-[10px] sm:text-xs text-muted-foreground mt-1 uppercase tracking-wider">
                      {k.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Sticky module nav */}
          <div className="sticky top-16 md:top-20 z-40 bg-card/95 backdrop-blur-md shadow-sm border-y border-border">
            <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-3 overflow-x-auto">
              <div className="flex items-center gap-2 min-w-max">
                <span className="text-xs text-muted-foreground uppercase tracking-wider px-2 font-bold flex items-center gap-1">
                  <Compass className="h-4 w-4 text-primary" /> Modules:
                </span>
                {FEATURES.map((f) => (
                  <a
                    key={f.id}
                    href={`#${f.id}`}
                    className="px-3.5 py-1.5 rounded-full text-sm font-medium bg-muted text-navy hover:bg-primary hover:text-primary-foreground transition-all"
                  >
                    {f.nav}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Deep-dive modules */}
        <div className="w-full max-w-[1440px] mx-auto px-4 md:px-8 py-14 flex flex-col gap-20 md:gap-32">
          {FEATURES.map((f, i) => (
            <FeatureSection key={f.id} f={f} flip={i % 2 === 1} />
          ))}
        </div>

        {/* Comparison */}
        <section className="py-14 md:py-20 bg-muted/40">
          <div className="max-w-[1440px] mx-auto px-4 md:px-8">
            <AnimatedSection className="text-center max-w-3xl mx-auto">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Comprehensive OS Comparison
              </span>
              <h2 className="mt-3 font-heading text-2xl sm:text-4xl font-bold text-navy tracking-tight">
                Why Indian Doctors Choose Doctylia Over Fragmented Tools
              </h2>
            </AnimatedSection>
            <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
              {COMPARISON.map((c) => {
                const Icon = c.icon;
                const PointIcon = c.highlight ? CheckCircle2 : Minus;
                return (
                  <div
                    key={c.title}
                    className={`rounded-2xl flex flex-col justify-between overflow-hidden ${
                      c.highlight
                        ? "gradient-brand text-white shadow-2xl md:-translate-y-2"
                        : "bg-card border border-border shadow-sm"
                    }`}
                  >
                    <div className="p-6 md:p-8">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.iconWrap}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className={`mt-5 font-heading text-xl font-bold ${c.highlight ? "text-white" : "text-navy"}`}>
                        {c.title}
                      </h3>
                      <p className={`mt-2 text-sm leading-relaxed ${c.highlight ? "text-white/85" : "text-muted-foreground"}`}>
                        {c.desc}
                      </p>
                      <ul className="mt-5 space-y-2.5">
                        {c.points.map((p) => (
                          <li
                            key={p}
                            className={`flex items-start gap-2 text-sm font-medium ${c.highlight ? "text-white" : "text-navy"}`}
                          >
                            <PointIcon
                              className={`h-4 w-4 mt-0.5 shrink-0 ${c.highlight ? "text-teal-bright" : "text-muted-foreground"}`}
                            />
                            {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div
                      className={`px-6 md:px-8 py-4 text-sm font-semibold ${
                        c.highlight ? "bg-white/15 text-white" : "bg-muted text-navy"
                      }`}
                    >
                      {c.outcome}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section id="cta" className="px-4 md:px-8 pb-16 md:pb-24 bg-muted/40">
          <div className="relative max-w-[1440px] mx-auto rounded-3xl bg-navy text-white overflow-hidden px-6 py-14 md:py-20 text-center">
            <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-primary/40 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full bg-teal/30 blur-3xl pointer-events-none" />
            <div className="relative z-10 max-w-3xl mx-auto flex flex-col items-center">
              <h2 className="font-heading text-2xl sm:text-4xl font-bold tracking-tight">
                Ready to Upgrade Your Practice to Autonomous Operations?
              </h2>
              <p className="mt-4 text-base sm:text-lg text-white/80 leading-relaxed">
                Join over 1,800+ physicians, pediatricians, dermatologists, and dentists transforming OPD operations today.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <Link to="/auth?mode=signup">
                  <Button size="lg" className="w-full gap-2 bg-white text-primary hover:bg-white/90 font-semibold shadow-xl">
                    Start 7-Day Free Trial <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/#contact">
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full gap-2 bg-transparent border-white/40 text-white hover:bg-white/10 hover:text-white font-semibold"
                  >
                    <Calendar className="h-4 w-4" /> Schedule 15-Min Walkthrough
                  </Button>
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-white/80">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-teal-bright" /> No credit card required
                </span>
                <span className="hidden sm:inline">•</span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-teal-bright" /> Instant 10-minute setup
                </span>
                <span className="hidden sm:inline">•</span>
                <span className="inline-flex items-center gap-1.5">
                  <Headset className="h-4 w-4 text-teal-bright" /> Dedicated doctor onboarding support
                </span>
              </div>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
};

export default FeaturesPage;
