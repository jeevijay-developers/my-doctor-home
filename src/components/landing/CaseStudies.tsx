import { CheckCircle2, MapPin, Clock, Star, TrendingUp, Timer, Syringe, IndianRupee } from "lucide-react";
import type { ReactNode } from "react";
import MobileCarousel from "./MobileCarousel";

const Chip = ({ children, className }: { children: ReactNode; className: string }) => (
  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>{children}</span>
);

const ChartShell = ({ icon, label, badge, children }: { icon: ReactNode; label: string; badge: string; children: ReactNode }) => (
  <div className="mb-4 rounded-2xl border border-border bg-secondary/50 p-4">
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 text-primary">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wider text-navy">{label}</span>
      </div>
      <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-bold text-success">{badge}</span>
    </div>
    <div className="h-28 w-full">{children}</div>
  </div>
);

const Footer = ({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: string }) => (
  <div className="flex items-center justify-between rounded-xl border-t border-border bg-secondary/50 px-3.5 py-2.5">
    <div className="flex items-center gap-2.5">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone}`}>{icon}</div>
      <div>
        <div className="text-[11px] font-medium leading-none text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-[13px] font-bold text-navy">{value}</div>
      </div>
    </div>
    <CheckCircle2 className="h-[18px] w-[18px] text-success" aria-hidden="true" />
  </div>
);

const CardHead = ({ tag, tagClass, city, title, desc }: { tag: string; tagClass: string; city: string; title: string; desc: string }) => (
  <>
    <div className="mb-3.5 flex items-center justify-between gap-2">
      <Chip className={tagClass}>{tag}</Chip>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
        {city}
      </span>
    </div>
    <h3 className="mb-2 font-heading text-lg font-bold leading-snug text-navy">{title}</h3>
    <div className="mb-5 text-[13px] leading-relaxed text-muted-foreground">{desc}</div>
  </>
);

const cardClass = "flex flex-col justify-between rounded-3xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md md:p-7";

const CaseStudies = () => (
  <section id="case-studies" className="bg-secondary/40 py-14 md:py-20" aria-labelledby="case-studies-heading">
    <div className="container mx-auto px-4">
      <div className="mx-auto mb-10 max-w-3xl text-center md:mb-14">
        <span className="inline-block rounded-full bg-secondary px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-primary md:text-sm">
          Real Practice Case Studies
        </span>
        <h2 id="case-studies-heading" className="mt-3 font-heading text-2xl font-bold text-navy sm:text-3xl md:text-4xl">
          Measurable Clinical &amp; Financial Impact
        </h2>
        <p className="mt-3 text-muted-foreground">
          How independent physicians and specialty polyclinics scaled with Doctylia.
        </p>
      </div>

      <div className="mx-auto max-w-6xl">
      <MobileCarousel label="Case studies" desktopClassName="md:grid md:grid-cols-3 md:gap-6">
        {/* 1. Dermatology */}
        <article className={cardClass}>
          <div>
            <CardHead
              tag="Dermatology Clinic"
              tagClass="bg-royal/10 text-primary"
              city="South Delhi"
              title="3.2x Surge in Online Consultations"
              desc="Automated WhatsApp booking packages for aesthetic procedures converted inquiries autonomously."
            />
            <ChartShell icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />} label="Monthly Inflow" badge="+225% Growth">
              <svg className="h-full w-full overflow-visible" viewBox="0 0 260 90" fill="none" role="img" aria-label="Monthly consultations grew from 120 to 390">
                <defs>
                  <linearGradient id="cs-derm" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" className="[stop-color:hsl(var(--royal))]" stopOpacity="0.22" />
                    <stop offset="100%" className="[stop-color:hsl(var(--royal))]" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <line x1="15" y1="20" x2="245" y2="20" className="stroke-border" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="15" y1="65" x2="245" y2="65" className="stroke-border" strokeWidth="1" strokeDasharray="3 3" />
                <path d="M 20 68 C 70 65, 110 58, 150 42 C 190 26, 210 18, 240 14 L 240 85 L 20 85 Z" fill="url(#cs-derm)" />
                <path d="M 20 68 C 70 65, 110 58, 150 42 C 190 26, 210 18, 240 14" className="stroke-royal" strokeWidth="3" strokeLinecap="round" />
                <circle cx="20" cy="68" r="5" className="fill-card stroke-muted-foreground" strokeWidth="2.5" />
                <text x="20" y="84" fontSize="10" fontWeight="600" className="fill-muted-foreground" textAnchor="middle">120</text>
                <circle cx="150" cy="42" r="4" className="fill-card stroke-teal" strokeWidth="2" />
                <circle cx="240" cy="14" r="6" className="fill-royal" />
                <circle cx="240" cy="14" r="11" className="stroke-royal" strokeOpacity="0.3" strokeWidth="2" />
                <rect x="205" y="-2" width="34" height="16" rx="4" className="fill-navy" />
                <text x="222" y="9.5" fontSize="10" fontWeight="700" className="fill-white" textAnchor="middle">390</text>
              </svg>
            </ChartShell>
          </div>
          <Footer icon={<Clock className="h-[18px] w-[18px]" aria-hidden="true" />} label="Desk Calls Reclaimed" value="9 hrs / week saved" tone="bg-success/15 text-success" />
        </article>

        {/* 2. Orthopedic */}
        <article className={cardClass}>
          <div>
            <CardHead
              tag="Orthopedic Polyclinic"
              tagClass="bg-teal/15 text-teal"
              city="Bengaluru"
              title="65% Reduction in Waiting Overcrowding"
              desc="Live WhatsApp queue trackers notify patients to walk in 10 minutes prior to turn."
            />
            <ChartShell icon={<Timer className="h-4 w-4" aria-hidden="true" />} label="Average Wait Time" badge="-65% Drop">
              <svg className="h-full w-full overflow-visible" viewBox="0 0 260 90" fill="none" role="img" aria-label="Average wait fell from 42 minutes to 14 minutes">
                <text x="10" y="26" fontSize="11" fontWeight="500" className="fill-muted-foreground">Before</text>
                <rect x="65" y="16" width="155" height="14" rx="7" className="fill-destructive" fillOpacity="0.2" />
                <circle cx="220" cy="23" r="5" className="fill-destructive" />
                <text x="228" y="27" fontSize="11" fontWeight="700" className="fill-destructive">42m</text>
                <path d="M 130 38 L 130 46 M 126 43 L 130 47 L 134 43" className="stroke-success" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                <text x="10" y="68" fontSize="11" fontWeight="600" className="fill-navy">With Doctylia</text>
                <rect x="85" y="58" width="52" height="14" rx="7" className="fill-success" />
                <circle cx="137" cy="65" r="5" className="fill-navy" />
                <text x="145" y="69" fontSize="11" fontWeight="700" className="fill-navy">14m</text>
                <rect x="182" y="57" width="68" height="16" rx="4" className="fill-secondary" />
                <text x="216" y="68.5" fontSize="9.5" fontWeight="600" className="fill-primary" textAnchor="middle">28m Faster</text>
              </svg>
            </ChartShell>
          </div>
          <Footer icon={<Star className="h-[18px] w-[18px]" aria-hidden="true" />} label="Google 5-Star Reviews" value="+220 reviews in 60 days" tone="bg-warning/15 text-warning" />
        </article>

        {/* 3. Pediatric */}
        <article className={cardClass}>
          <div>
            <CardHead
              tag="Pediatric Care Center"
              tagClass="bg-success/15 text-success"
              city="Pune"
              title="₹85,000 Recovered via Vaccine Triggers"
              desc="Automated milestone pings alert parents 7 days ahead, drastically boosting compliance."
            />
            <ChartShell icon={<Syringe className="h-4 w-4" aria-hidden="true" />} label="Missed Vaccine Rate" badge="31% → 4%">
              <svg className="h-full w-full overflow-visible" viewBox="0 0 260 90" fill="none" role="img" aria-label="Missed vaccine rate fell from 31% to 4%, adding 85 thousand rupees a month">
                <defs>
                  <linearGradient id="cs-rev" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" className="[stop-color:hsl(var(--success))]" stopOpacity="0.3" />
                    <stop offset="100%" className="[stop-color:hsl(var(--success))]" />
                  </linearGradient>
                </defs>
                <rect x="22" y="58" width="28" height="22" rx="5" className="fill-royal" fillOpacity="0.2" />
                <text x="36" y="73" fontSize="9" fontWeight="600" className="fill-primary" textAnchor="middle">W1</text>
                <rect x="62" y="46" width="28" height="34" rx="5" className="fill-royal" fillOpacity="0.35" />
                <text x="76" y="65" fontSize="9" fontWeight="600" className="fill-primary" textAnchor="middle">W2</text>
                <rect x="102" y="32" width="28" height="48" rx="5" className="fill-teal" fillOpacity="0.6" />
                <text x="116" y="58" fontSize="9" fontWeight="600" className="fill-navy" textAnchor="middle">W3</text>
                <rect x="142" y="16" width="32" height="64" rx="6" fill="url(#cs-rev)" />
                <text x="158" y="50" fontSize="9" fontWeight="700" className="fill-white" textAnchor="middle">W4</text>
                <circle cx="158" cy="16" r="4" className="fill-navy" />
                <rect x="186" y="18" width="68" height="44" rx="8" className="fill-card stroke-border" strokeWidth="1" />
                <text x="220" y="32" fontSize="8.5" fontWeight="600" className="fill-muted-foreground" textAnchor="middle">LIFT / MO</text>
                <text x="220" y="48" fontSize="12" fontWeight="800" className="fill-navy" textAnchor="middle">+₹85K</text>
                <path d="M 174 20 L 186 24" className="stroke-success" strokeWidth="1.5" strokeDasharray="2 2" />
              </svg>
            </ChartShell>
          </div>
          <Footer icon={<IndianRupee className="h-[18px] w-[18px]" aria-hidden="true" />} label="Recurring Revenue Gain" value="+₹85,000 / month" tone="bg-success/15 text-success" />
        </article>
      </MobileCarousel>
      </div>

      <div className="mx-auto mt-6 max-w-3xl text-center text-xs text-muted-foreground">
        Representative examples of what clinics use the product for, not individual customer results.
      </div>
    </div>
  </section>
);

export default CaseStudies;
