import { Fragment, useState, type ReactElement } from "react";
import {
  Stethoscope, Baby, Heart, Smile, Bone, Activity, ScanFace, MessageCircle,
  Camera, BadgeCheck, Pill, Wand2, HeartPulse, CalendarClock, BellRing,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import MobileCarousel from "./MobileCarousel";

type Tab = { value: string; label: string; icon: LucideIcon; card: number };

const tabs: Tab[] = [
  { value: "gp", label: "General Practice", icon: Stethoscope, card: 0 },
  { value: "derm", label: "Dermatology", icon: ScanFace, card: 1 },
  { value: "peds", label: "Pediatrics", icon: Baby, card: 0 },
  { value: "cardio", label: "Cardiology", icon: Heart, card: 2 },
  { value: "dental", label: "Dental Clinic", icon: Smile, card: 3 },
  { value: "ortho", label: "Orthopedics", icon: Bone, card: 2 },
  { value: "gyn", label: "Gynecology", icon: Activity, card: 4 },
];

const cardBase =
  "bg-card rounded-3xl p-5 md:p-6 border border-border shadow-sm hover:shadow-md transition-all flex flex-col justify-between";

// One workflow card per specialty group. The grid always shows three cards:
// the selected specialty's card first (highlighted), then the next two in order.
const cardRenderers: ((ringCls: string) => ReactElement)[] = [
  (ringCls: string) => (
    <div className={cn(cardBase, ringCls)}>
      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold inline-flex items-center gap-1.5">
            <Baby className="h-3.5 w-3.5" /> Pediatrics &amp; GP
          </span>
          <span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse" />
        </div>
        <h3 className="font-heading text-lg font-bold text-navy leading-snug mb-2">
          One-Tap Growth &amp; Vaccine Calendars
        </h3>
        <div className="text-[13px] text-muted-foreground leading-relaxed mb-5">
          Interactive milestone maps, WHO percentiles, and automated WhatsApp parent alerts on autopilot.
        </div>
        <div className="bg-gradient-to-b from-royal/5 to-teal/5 rounded-2xl p-4 border border-border mb-4 space-y-3">
          <div className="bg-card rounded-xl p-3 border border-border shadow-sm flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-sm">🍼</div>
              <div>
                <div className="text-xs font-bold text-navy leading-none">Aarav (9 Months)</div>
                <div className="text-[11px] text-success font-semibold mt-1">92nd Percentile • Healthy</div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-success/10 text-success font-mono text-[11px] font-bold whitespace-nowrap">8.9 kg</span>
          </div>
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-card/80 border border-border text-[11px]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-success" />
                <span>MMR Booster 1</span>
              </div>
              <span className="text-success font-semibold bg-success/10 px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap">Given ✓</span>
            </div>
            <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-card/80 border border-border text-[11px]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary" />
                <span>Typhoid Conjugate</span>
              </div>
              <span className="text-primary font-semibold bg-primary/10 px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap">Scheduled (12d)</span>
            </div>
          </div>
        </div>
      </div>
      <div className="pt-3.5 border-t border-border flex items-center justify-between text-primary text-sm">
        <span className="flex items-center gap-1.5 font-semibold">
          <MessageCircle className="h-4 w-4" /> Auto-WhatsApp Reminders
        </span>
      </div>
    </div>
  ),
  (ringCls: string) => (
    <div className={cn(cardBase, ringCls)}>
      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="px-3 py-1 rounded-full bg-destructive/10 text-destructive text-xs font-semibold inline-flex items-center gap-1.5">
            <ScanFace className="h-3.5 w-3.5" /> Dermatology &amp; Derma
          </span>
          <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
        </div>
        <h3 className="font-heading text-lg font-bold text-navy leading-snug mb-2">
          Visual Photo Timelines &amp; Derma Presets
        </h3>
        <div className="text-[13px] text-muted-foreground leading-relaxed mb-5">
          Compare skin lesion journeys side-by-side with 1-click cosmetic regimen prescription packs.
        </div>
        <div className="bg-gradient-to-b from-royal/5 to-teal/5 rounded-2xl p-4 border border-border mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-card rounded-xl p-2.5 border border-border shadow-sm text-center">
              <div className="w-full h-12 rounded-lg bg-muted flex items-center justify-center mb-1.5">
                <Camera className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="text-[10px] text-muted-foreground font-medium">Day 0 • Acne Vulgaris</div>
              <span className="text-[10px] font-bold text-destructive">Active Flare</span>
            </div>
            <div className="bg-card rounded-xl p-2.5 border border-border shadow-sm text-center">
              <div className="w-full h-12 rounded-lg bg-success/10 flex items-center justify-center mb-1.5">
                <BadgeCheck className="h-5 w-5 text-success" />
              </div>
              <div className="text-[10px] text-muted-foreground font-medium">Day 28 • Follow-up</div>
              <span className="text-[10px] font-bold text-success">85% Clear ✓</span>
            </div>
          </div>
          <div className="bg-card rounded-xl p-2.5 border border-border shadow-sm flex items-center justify-between gap-2 text-[11px]">
            <span className="flex items-center gap-1.5">
              <Pill className="h-3.5 w-3.5 text-primary flex-shrink-0" /> Adapalene + Niacinamide Kit
            </span>
            <span className="bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full text-[10px]">Nightly</span>
          </div>
        </div>
      </div>
      <div className="pt-3.5 border-t border-border flex items-center justify-between text-primary text-sm">
        <span className="flex items-center gap-1.5 font-semibold">
          <Wand2 className="h-4 w-4" /> Aesthetic Protocol Bundles
        </span>
      </div>
    </div>
  ),
  (ringCls: string) => (
    <div className={cn(cardBase, ringCls)}>
      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="px-3 py-1 rounded-full bg-success/10 text-success text-xs font-semibold inline-flex items-center gap-1.5">
            <HeartPulse className="h-3.5 w-3.5" /> Cardio &amp; Orthopedics
          </span>
          <span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse" />
        </div>
        <h3 className="font-heading text-lg font-bold text-navy leading-snug mb-2">
          Biomarker Curves &amp; Range Indicators
        </h3>
        <div className="text-[13px] text-muted-foreground leading-relaxed mb-5">
          Monitor longitudinal BP, lipid profiles, and orthopedic joint mobility scores with zero data-entry fuss.
        </div>
        <div className="bg-gradient-to-b from-royal/5 to-teal/5 rounded-2xl p-4 border border-border mb-4 space-y-3">
          <div className="bg-card rounded-xl p-3 border border-border shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-bold text-navy">Vascular Pressure Profile</span>
              <span className="text-[10px] font-bold text-success bg-success/10 px-2 py-0.5 rounded-full whitespace-nowrap">Target Reached</span>
            </div>
            <div className="w-full h-12 flex items-center justify-center text-success">
              <svg className="w-full h-full" viewBox="0 0 200 45" fill="none" aria-hidden="true">
                <line x1="0" y1="30" x2="200" y2="30" className="stroke-border" strokeWidth="1" strokeDasharray="2 2" />
                <path d="M 10 32 Q 40 32 60 22 T 110 24 T 150 14 L 190 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="190" cy="12" r="4" fill="currentColor" />
                <circle cx="190" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
              </svg>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-card rounded-lg p-2 border border-border flex items-center justify-between gap-1">
              <span className="text-muted-foreground">BP Avg:</span>
              <span className="font-bold text-navy">118/78</span>
            </div>
            <div className="bg-card rounded-lg p-2 border border-border flex items-center justify-between gap-1">
              <span className="text-muted-foreground">Pulse:</span>
              <span className="font-bold text-navy">72 bpm</span>
            </div>
          </div>
        </div>
      </div>
      <div className="pt-3.5 border-t border-border flex items-center justify-between text-primary text-sm">
        <span className="flex items-center gap-1.5 font-semibold">
          <Activity className="h-4 w-4" /> 1-Click Diagnostic Export
        </span>
      </div>
    </div>
  ),
  (ringCls: string) => (
    <div className={cn(cardBase, ringCls)}>
      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="px-3 py-1 rounded-full bg-teal/15 text-teal text-xs font-semibold inline-flex items-center gap-1.5">
            <Smile className="h-3.5 w-3.5" /> Dental Clinic
          </span>
          <span className="w-2.5 h-2.5 rounded-full bg-teal animate-pulse" />
        </div>
        <h3 className="font-heading text-lg font-bold text-navy leading-snug mb-2">
          Treatment Plans &amp; Recall Reminders
        </h3>
        <div className="text-[13px] text-muted-foreground leading-relaxed mb-5">
          Track multi-visit procedures from first sitting to final fitting, and bring patients back for check-ups with automated WhatsApp recalls.
        </div>
        <div className="bg-gradient-to-b from-royal/5 to-teal/5 rounded-2xl p-4 border border-border mb-4 space-y-3">
          <div className="bg-card rounded-xl p-3 border border-border shadow-sm flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Smile className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-navy leading-none">Rohan K. (34)</div>
                <div className="text-[11px] text-primary font-semibold mt-1">Root Canal • Visit 2 of 3</div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary font-mono text-[11px] font-bold whitespace-nowrap">Tooth 36</span>
          </div>
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-card/80 border border-border text-[11px]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-success" />
                <span>Scaling &amp; Polishing</span>
              </div>
              <span className="text-success font-semibold bg-success/10 px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap">Completed ✓</span>
            </div>
            <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-card/80 border border-border text-[11px]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary" />
                <span>Crown Fitting</span>
              </div>
              <span className="text-primary font-semibold bg-primary/10 px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap">Scheduled (5d)</span>
            </div>
          </div>
        </div>
      </div>
      <div className="pt-3.5 border-t border-border flex items-center justify-between text-primary text-sm">
        <span className="flex items-center gap-1.5 font-semibold">
          <CalendarClock className="h-4 w-4" /> 6-Month Recall Reminders
        </span>
      </div>
    </div>
  ),
  (ringCls: string) => (
    <div className={cn(cardBase, ringCls)}>
      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="px-3 py-1 rounded-full bg-ai-purple/10 text-ai-purple text-xs font-semibold inline-flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" /> Gynecology
          </span>
          <span className="w-2.5 h-2.5 rounded-full bg-ai-purple animate-pulse" />
        </div>
        <h3 className="font-heading text-lg font-bold text-navy leading-snug mb-2">
          Antenatal Visits &amp; Follow-up Schedules
        </h3>
        <div className="text-[13px] text-muted-foreground leading-relaxed mb-5">
          Plan trimester-wise check-ups, scans and lab tests, and keep patients on schedule with automated WhatsApp reminders.
        </div>
        <div className="bg-gradient-to-b from-royal/5 to-teal/5 rounded-2xl p-4 border border-border mb-4 space-y-3">
          <div className="bg-card rounded-xl p-3 border border-border shadow-sm flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-ai-purple/10 flex items-center justify-center text-ai-purple">
                <Activity className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-navy leading-none">Meera S. (28)</div>
                <div className="text-[11px] text-success font-semibold mt-1">24 Weeks • On Track</div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-ai-purple/10 text-ai-purple font-mono text-[11px] font-bold whitespace-nowrap">EDD 14 Feb</span>
          </div>
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-card/80 border border-border text-[11px]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-success" />
                <span>Anomaly Scan (Week 20)</span>
              </div>
              <span className="text-success font-semibold bg-success/10 px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap">Done ✓</span>
            </div>
            <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-card/80 border border-border text-[11px]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary" />
                <span>Glucose Tolerance Test</span>
              </div>
              <span className="text-primary font-semibold bg-primary/10 px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap">Scheduled (6d)</span>
            </div>
          </div>
        </div>
      </div>
      <div className="pt-3.5 border-t border-border flex items-center justify-between text-primary text-sm">
        <span className="flex items-center gap-1.5 font-semibold">
          <BellRing className="h-4 w-4" /> Visit &amp; Test Reminders
        </span>
      </div>
    </div>
  ),
];

const VISIBLE_CARDS = 3;

const Specialties = () => {
  const [active, setActive] = useState("gp");
  const activeCard = tabs.find((t) => t.value === active)?.card ?? 0;
  const visible = Array.from({ length: VISIBLE_CARDS }, (_, k) => (activeCard + k) % cardRenderers.length);

  return (
    <section id="specialties" className="w-full py-12 md:py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center mb-8 md:mb-12">
          <span className="inline-block px-3.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider">
            Specialized Clinical Workflows
          </span>
          <h2 className="font-heading font-extrabold text-2xl sm:text-3xl md:text-4xl text-navy mt-3">
            Engineered for your exact medical discipline
          </h2>
          <p className="text-muted-foreground mt-3">
            Pre-configured medical templates, clinical metrics, and diagnostic routines customized for every major practice.
          </p>
        </div>

        <div className="max-w-6xl mx-auto">
          <Tabs value={active} onValueChange={setActive}>
            <TabsList className="h-auto bg-transparent p-0 flex flex-wrap items-center justify-center gap-2 md:gap-2.5 pb-8 md:pb-10">
              {tabs.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="px-3 md:px-4 py-2 rounded-full bg-card text-navy border border-border shadow-sm gap-2 text-xs md:text-sm font-semibold hover:bg-primary/5 hover:scale-105 active:scale-95 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary"
                >
                  <t.icon className="h-4 w-4" />
                  <span>{t.label}</span>
                  {active === t.value && <span className="w-2 h-2 rounded-full bg-spark-bright" />}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div role="tabpanel" aria-live="polite">
            <MobileCarousel label="Specialty workflows" resetKey={active} desktopClassName="md:grid md:grid-cols-3 md:gap-6">
            {visible.map((cardIndex, position) => (
              <Fragment key={cardIndex}>{cardRenderers[cardIndex](position === 0 ? "ring-2 ring-primary" : "")}</Fragment>
            ))}
            </MobileCarousel>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Specialties;
