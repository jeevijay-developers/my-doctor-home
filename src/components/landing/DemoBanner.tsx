import { Zap, Stethoscope, HelpCircle, CalendarDays, Check } from "lucide-react";

const pills = [
  { icon: Zap, label: "15-Min Tailored Session" },
  { icon: Stethoscope, label: "Customized to your Specialty" },
  { icon: HelpCircle, label: "Direct Q&A with Clinical Engineers" },
];

const DemoBanner = () => (
  <section id="demo" className="w-full py-8 md:py-12 bg-background">
    <div className="container mx-auto px-4">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy via-primary to-navy text-white p-6 md:p-12 shadow-xl border border-white/10">
        <div className="absolute -top-20 -left-20 w-80 h-80 bg-white/10 blur-[100px] pointer-events-none rounded-full" />
        <div className="absolute -bottom-24 -right-20 w-96 h-96 bg-teal/30 blur-[120px] pointer-events-none rounded-full" />
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="inline-flex flex-wrap items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-white text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-spark-bright animate-pulse" />
              <span>Live 1-on-1 Practice Consultation</span>
              <span className="text-white/60">•</span>
              <span className="text-teal-bright">Zero Commitment</span>
            </div>
            <h2 className="font-heading font-extrabold text-2xl sm:text-3xl md:text-4xl leading-tight text-white">
              See Doctylia in Action with a Tailored 15-Minute Clinic Walkthrough
            </h2>
            <p className="text-white/80 max-w-xl leading-relaxed">
              Experience how autonomous WhatsApp queue sync, instant 1-click GST invoices, and specialty templates operate in real time for your OPD workflow.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {pills.map((p) => (
                <div key={p.label} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/10 backdrop-blur-md border border-white/10 text-white text-[11px] sm:text-xs">
                  <p.icon className="h-3.5 w-3.5 text-teal-bright" />
                  {p.label}
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col items-center lg:items-end justify-center">
            <div className="w-full max-w-md bg-white/10 backdrop-blur-xl p-5 md:p-6 rounded-2xl border border-white/15 shadow-lg text-center space-y-4">
              <div className="flex items-center justify-center gap-2">
                <div className="flex -space-x-2">
                  <span className="w-8 h-8 rounded-full bg-success flex items-center justify-center text-xs ring-2 ring-white/20">🩺</span>
                  <span className="w-8 h-8 rounded-full bg-royal flex items-center justify-center text-xs ring-2 ring-white/20">⚡</span>
                  <span className="w-8 h-8 rounded-full bg-teal flex items-center justify-center text-xs ring-2 ring-white/20">⭐</span>
                </div>
                <span className="text-[13px] font-semibold">450+ doctors booked this month</span>
              </div>
              <a
                href="#contact"
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-white text-navy font-heading text-base font-bold shadow-xl hover:bg-white/90 transition-all active:scale-[0.98]"
              >
                <CalendarDays className="h-5 w-5" />
                <span>Book a Live Clinic Demo</span>
              </a>
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-white/70 text-[11px]">
                <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" />100% Free Consultation</span>
                <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" />Zero Installation</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default DemoBanner;
