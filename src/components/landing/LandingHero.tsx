import { Link } from "react-router-dom";
import DemoVideoDialog from "@/components/landing/DemoVideoDialog";
import { CheckCircle2, PlayCircle, Sparkles } from "lucide-react";

const heroChecks = ["No credit card required", "Set up in under 10 minutes", "Cancel or pause anytime"];

const LandingHero = () => (
  <section
    className="relative w-full overflow-hidden pb-16 pt-28 md:pb-24 md:pt-32"
    style={{
      backgroundImage:
        "linear-gradient(rgba(255,255,255,0.88) 0%, rgba(255,255,255,0.72) 35%, hsl(var(--background) / 0.94) 80%, hsl(var(--background)) 100%), url('/stitch/landing-13.jpg')",
      backgroundSize: "cover",
      backgroundPosition: "center top",
      backgroundRepeat: "no-repeat",
    }}
  >
    <div className="pointer-events-none absolute -top-32 left-1/2 h-[360px] w-[720px] max-w-full -translate-x-1/2 rounded-full bg-royal/10 blur-[120px]" />
    <div className="pointer-events-none absolute right-[-100px] top-48 h-[380px] w-[380px] rounded-full bg-teal/15 blur-[100px]" />

    <div className="relative z-10 mx-auto max-w-[1440px] px-4 md:px-8">
      {/* Announcement pill */}
      <div className="mb-6 flex justify-center">
        <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full bg-card px-4 py-1.5 text-[13px] font-semibold text-navy shadow-sm">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[12px] text-royal">⚡</span>
          <span className="text-royal">Doctylia 3.0 Live</span>
          <span className="text-border">•</span>
          <span className="font-medium text-muted-foreground">Built for Doctors &amp; Modern Clinic Practices</span>
        </div>
      </div>

      {/* Headline + copy */}
      <div className="mx-auto max-w-4xl space-y-6 text-center">
        <h1 className="font-heading text-[36px] font-bold leading-[44px] tracking-[-0.025em] text-navy md:text-[56px] md:leading-[64px] md:tracking-[-0.03em]">
          Grow Your Practice with Modern{" "}
          <span className="bg-gradient-to-r from-royal to-teal bg-clip-text text-transparent">Autonomous Clinical Care</span>
        </h1>
        <p className="mx-auto max-w-2xl !text-base leading-7 text-muted-foreground md:!text-lg md:leading-7">
          Replace fragmented paperwork, missed appointments, and manual billing. Doctylia equips modern physicians
          with automated 1-click GST invoicing, instant WhatsApp patient workflows, branded websites, and intelligent
          digital prescriptions.
        </p>

        <div className="flex flex-col items-center justify-center gap-4 pt-2 sm:flex-row">
          <Link
            to="/auth?mode=signup"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-royal px-7 py-3.5 font-heading text-base font-semibold text-white shadow-md transition-all hover:bg-primary active:scale-[0.98] sm:w-auto"
          >
            <Sparkles className="h-5 w-5" /> Start 7-Day Free Trial
          </Link>
          <DemoVideoDialog className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-card px-7 py-3.5 font-heading text-base font-semibold text-navy shadow-sm transition-all hover:bg-secondary sm:w-auto">
            <PlayCircle className="h-5 w-5 text-royal" /> Watch 4-Min Interactive Demo
          </DemoVideoDialog>
        </div>

        <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-2 text-[13px] font-semibold text-muted-foreground">
          {heroChecks.map((t) => (
            <li key={t} className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-[18px] w-[18px] text-success" /> {t}
            </li>
          ))}
        </ul>
      </div>

      {/* Product preview: image of the Doctylia admin dashboard (sample data) */}
      <div className="mx-auto mt-12 max-w-5xl md:mt-14">
        <div className="overflow-hidden rounded-2xl bg-card shadow-[0_20px_50px_-12px_hsl(var(--royal)/0.15),0_0_0_1px_hsl(var(--navy)/0.08)]">
          <div className="flex items-center justify-between border-b border-secondary px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-destructive/80" />
              <span className="inline-block h-3 w-3 rounded-full bg-warning/80" />
              <span className="inline-block h-3 w-3 rounded-full bg-success/70" />
              <span className="ml-4 hidden font-mono text-xs text-muted-foreground sm:inline">doctylia.com/admin/dashboard</span>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-royal">
              Live dashboard <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
            </span>
          </div>
          <img
            src="/stitch/hero-dashboard.webp"
            alt="The Doctylia dashboard showing appointments, patients, revenue, reviews, today's schedule and monthly revenue (sample data)"
            width={2880}
            height={1800}
            className="block h-auto w-full"
            fetchPriority="high"
          />
        </div>
      </div>

    </div>
  </section>
);

export default LandingHero;
