import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  CheckCircle,
  Sparkles,
  PlayCircle,
  UserPlus,
  Receipt,
  MessageCircle,
  Printer,
  TrendingUp,
  Star,
} from "lucide-react";

const queue = [
  { token: "#A-14", patient: "Vikas Sengupta (42M)", visit: "Hypertension follow-up", status: "In consultation", tone: "bg-success/10 text-success" },
  { token: "#A-15", patient: "Mrs. Rekha V. (35F)", visit: "HbA1c report review", status: "Next in room", tone: "bg-royal/10 text-royal" },
  { token: "#T-04", patient: "Karan Mehra (29M)", visit: "Prescription renewal", status: "Waiting room", tone: "bg-warning/10 text-warning" },
];

const heroChecks = ["No credit card required", "Set up in under 10 minutes", "Cancel or pause anytime"];

/** Illustrative product preview. Names and figures are sample data, not real patients. */
const OpdPreview = () => (
  <div className="relative w-full min-w-0">
    <div className="rounded-2xl border border-border bg-card shadow-xl shadow-royal/10 overflow-hidden">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-secondary px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
        <span className="ml-2 truncate rounded-md bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
          doctylia.com/admin/queue
        </span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success" /> Live OPD
        </span>
      </div>

      <div className="space-y-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-heading text-sm font-bold text-navy">Dr. Arun Sharma, MD</div>
            <div className="truncate text-[11px] text-muted-foreground">Cardio-Diabetic Care Clinic</div>
          </div>
          <div className="flex gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-lg bg-royal px-2.5 py-1.5 text-[11px] font-semibold text-white">
              <UserPlus className="h-3 w-3" /> New patient
            </span>
            <span className="hidden items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-semibold text-navy sm:inline-flex">
              <Receipt className="h-3 w-3" /> GST bill
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border bg-secondary/50 p-2.5">
            <div className="text-[10px] text-muted-foreground">Today's appointments</div>
            <div className="font-heading text-xl font-bold text-navy">38</div>
            <div className="text-[10px] text-muted-foreground">8 teleconsults</div>
          </div>
          <div className="rounded-xl border border-border bg-secondary/50 p-2.5">
            <div className="text-[10px] text-muted-foreground">Live OPD waiting</div>
            <div className="font-heading text-xl font-bold text-navy">14</div>
            <div className="text-[10px] text-muted-foreground">Avg wait 9 min</div>
          </div>
          <div className="rounded-xl border border-border bg-secondary/50 p-2.5">
            <div className="text-[10px] text-muted-foreground">Net revenue (MTD)</div>
            <div className="flex items-center gap-1 font-heading text-xl font-bold text-navy">
              ₹1,75,250
            </div>
            <div className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-success">
              <TrendingUp className="h-3 w-3" /> +24.3%
            </div>
          </div>
          <div className="rounded-xl border border-border bg-secondary/50 p-2.5">
            <div className="text-[10px] text-muted-foreground">Patient satisfaction</div>
            <div className="font-heading text-xl font-bold text-navy">99.2%</div>
            <div className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <Star className="h-3 w-3 fill-warning text-warning" /> 4.9 rating
            </div>
          </div>
        </div>

        {/* Queue: list rows (the dense table would not fit this card at narrow widths) */}
        <div className="rounded-xl border border-border">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div className="text-xs font-semibold text-navy">Active consultation queue</div>
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <MessageCircle className="h-3 w-3 text-success" /> Synced with WhatsApp
            </span>
          </div>
          <ul className="divide-y divide-border">
            {queue.map((q) => (
              <li key={q.token} className="flex items-center gap-2 px-3 py-2">
                <span className="w-11 shrink-0 font-heading text-xs font-bold text-royal">{q.token}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-navy">{q.patient}</div>
                  <div className="truncate text-[10px] text-muted-foreground">{q.visit}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${q.tone}`}>{q.status}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>

    {/* Floating invoice card */}
    <motion.div
      animate={{ y: [0, -8, 0] }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      className="mt-3 w-full rounded-xl border border-border bg-card p-3 shadow-lg sm:absolute sm:-bottom-28 sm:-left-6 sm:mt-0 sm:w-52"
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">GST invoice · fast pay</div>
      <div className="mt-1.5 space-y-0.5 text-[11px] text-navy">
        <div className="flex justify-between"><span>Consultation</span><span>₹800</span></div>
        <div className="flex justify-between"><span>ECG</span><span>₹400</span></div>
        <div className="flex justify-between border-t border-border pt-1 font-bold"><span>Total</span><span>₹1,200</span></div>
      </div>
      <div className="mt-2 flex gap-1.5 text-[10px] font-semibold">
        <span className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-success/10 py-1 text-success">
          <MessageCircle className="h-3 w-3" /> WhatsApp
        </span>
        <span className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-secondary py-1 text-navy">
          <Printer className="h-3 w-3" /> Print
        </span>
      </div>
    </motion.div>
  </div>
);

const LandingHero = () => (
  <section className="relative overflow-hidden bg-gradient-to-br from-white via-secondary to-cloud-blue pt-20 pb-12 md:pt-28 md:pb-24">
    <motion.div
      animate={{ scale: [1, 1.2, 1], opacity: [0.05, 0.08, 0.05] }}
      transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      className="absolute right-10 top-20 h-48 w-48 rounded-full bg-royal blur-3xl md:h-72 md:w-72"
    />
    <motion.div
      animate={{ scale: [1, 1.3, 1], opacity: [0.05, 0.1, 0.05] }}
      transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      className="absolute bottom-10 left-10 h-36 w-36 rounded-full bg-teal blur-3xl md:h-56 md:w-56"
    />

    <div className="container relative mx-auto px-4">
      <div className="grid grid-cols-1 items-center gap-10 sm:grid-cols-2 sm:gap-8 lg:gap-14">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="min-w-0 space-y-4 md:space-y-6"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ai-purple/10 px-3 py-1 text-xs font-semibold text-ai-purple">
            <Sparkles className="h-3 w-3" /> Built for doctors &amp; modern clinics
          </span>

          <h1 className="font-heading text-[2.1rem] font-extrabold leading-[1.05] tracking-tight text-primary sm:text-4xl md:text-5xl lg:text-[56px]">
            Grow your practice with{" "}
            <span className="text-gradient">modern, automated clinical care</span>
          </h1>

          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground md:text-lg">
            Replace paperwork, missed appointments and manual billing. Doctylia gives you a branded website,
            online booking, 1-click GST invoices, WhatsApp patient workflows and digital prescriptions in one place.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <Link to="/auth?mode=signup" className="sm:flex-1">
              <Button className="h-11 w-full gap-2 bg-royal px-4 text-sm text-white shadow-lg shadow-royal/20 hover:bg-royal/90">
                Start 7-day free trial <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href="#demo" className="sm:flex-1">
              <Button variant="outline" className="h-11 w-full gap-2 border-2 px-4 text-sm">
                <PlayCircle className="h-4 w-4" /> See how it works
              </Button>
            </a>
          </div>

          <ul className="flex flex-col gap-y-1 pt-1 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-4">
            {heroChecks.map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 shrink-0 text-success" /> {t}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 30, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
          className="min-w-0 sm:pb-28"
          aria-label="Example of the Doctylia live OPD dashboard (sample data)"
        >
          <OpdPreview />
        </motion.div>
      </div>
    </div>
  </section>
);

export default LandingHero;
