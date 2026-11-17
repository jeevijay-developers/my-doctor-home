import { Link } from "react-router-dom";
import DemoVideoDialog from "@/components/landing/DemoVideoDialog";
import { CheckCircle2, PlayCircle, Sparkles } from "lucide-react";

const heroChecks = ["No credit card required", "Set up in under 10 minutes", "Cancel or pause anytime"];

/* Wordmarks for the "Trusted by" strip, as drawn in the Stitch design. */
const wordmark = { fontFamily: "'Plus Jakarta Sans', Inter, sans-serif", fontWeight: 800, letterSpacing: "-0.02em" } as const;

const TrustedLogos = () => (
  <div className="mx-auto mt-12 max-w-6xl px-4 md:mt-16">
    <div className="flex flex-col items-center justify-between gap-6 py-4 lg:flex-row lg:gap-10">
      <span className="flex-shrink-0 text-[15px] font-medium text-muted-foreground">Trusted by the best</span>
      <div className="flex w-full flex-wrap items-center justify-center gap-8 sm:gap-10 md:gap-12 lg:justify-between">
        <svg className="h-8 w-auto" viewBox="0 0 160 36" fill="none" role="img" aria-label="Apollo Clinic">
          <g transform="translate(0, 2)">
            <circle cx="16" cy="16" r="15" fill="#FFF5EA" stroke="#E47A22" strokeWidth="1.5" />
            <path d="M16 6v20M6 16h20" stroke="#E47A22" strokeLinecap="round" strokeWidth="3" />
            <circle cx="16" cy="16" r="4" fill="#006699" />
          </g>
          <text x="40" y="22" fill="#0E2A47" fontSize="17" style={wordmark}>
            Apollo<tspan fill="#E47A22" fontSize="14" fontWeight="600">CLINIC</tspan>
          </text>
        </svg>
        <svg className="h-8 w-auto" viewBox="0 0 148 36" fill="none" role="img" aria-label="Fortis">
          <g transform="translate(0, 3)">
            <path d="M15 4c-5.5 0-10 4.5-10 10 0 7 10 16 10 16s10-9 10-16c0-5.500-4.500-10-10-10z" fill="#E31C24" opacity="0.15" />
            <circle cx="15" cy="11" r="3.5" fill="#008A44" />
            <path d="M9 16c2-1 4.5-1.500 6-1.500s4 .5 6 1.500c-1 4.500-6 9.500-6 9.500s-5-5-6-9.500z" fill="#E31C24" />
            <path d="M12 18.500h6M15 15.500v6" stroke="#FFFFFF" strokeLinecap="round" strokeWidth="1.500" />
          </g>
          <text x="36" y="22" fill="#008A44" fontSize="17" style={wordmark}>
            Fortis<tspan fill="#E31C24" fontSize="18" fontWeight="900">+</tspan>
          </text>
        </svg>
        <svg className="h-8 w-auto" viewBox="0 0 165 36" fill="none" role="img" aria-label="Max Healthcare">
          <g transform="translate(0, 3)">
            <rect x="2" y="2" width="26" height="26" rx="6" fill="#DC2626" />
            <path d="M9 15h12M15 9v12" stroke="#FFFFFF" strokeLinecap="round" strokeWidth="3" />
            <circle cx="23" cy="7" r="3" fill="#0E2A47" />
          </g>
          <text x="38" y="22" fill="#0E2A47" fontSize="17" style={wordmark}>
            Max <tspan fill="#434655" fontSize="15" fontWeight="600">Healthcare</tspan>
          </text>
        </svg>
        <svg className="h-8 w-auto" viewBox="0 0 176 36" fill="none" role="img" aria-label="Manipal Hospitals">
          <g transform="translate(0, 3)">
            <circle cx="15" cy="15" r="14" stroke="#0072CE" strokeWidth="2" />
            <circle cx="15" cy="15" r="9" stroke="#F58220" strokeWidth="2" />
            <path d="M15 9v12M9 15h12" stroke="#0072CE" strokeLinecap="round" strokeWidth="2.200" />
          </g>
          <text x="38" y="22" fill="#0072CE" fontSize="16" style={wordmark}>
            Manipal<tspan fill="#F58220" fontSize="14" fontWeight="600">Hospitals</tspan>
          </text>
        </svg>
        <svg className="h-8 w-auto" viewBox="0 0 172 36" fill="none" role="img" aria-label="Medanta Medicity">
          <g transform="translate(0, 3)">
            <path d="M15 4c-5 0-9 4-9 9 0 7 9 14 9 14s9-7 9-14c0-5-4-9-9-9z" fill="#FF6B00" />
            <path d="M15 8v10M10 13h10" stroke="#FFFFFF" strokeLinecap="round" strokeWidth="2" />
          </g>
          <text x="36" y="22" fill="#0E2A47" fontSize="17" style={wordmark}>
            Medanta<tspan dx="2" fill="#FF6B00" fontSize="11" fontWeight="500">MEDICITY</tspan>
          </text>
        </svg>
      </div>
    </div>
  </div>
);

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

      <TrustedLogos />
    </div>
  </section>
);

export default LandingHero;
