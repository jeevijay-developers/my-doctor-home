import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Calculator,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Minus,
  Receipt,
  Sparkles,
  Star,
  User,
  Zap,
} from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { usePlanPrices } from "@/hooks/usePlanPrices";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { DEFAULT_APPOINTMENT_CAP, getTierFeatures } from "@/lib/planFeatures";
import { CUSTOM_PLAN_COPY, CUSTOM_PLAN_FEATURES } from "@/lib/customPlanMarketing";

const ANNUAL_DISCOUNT = 0.2;
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

type Cell = boolean | string;
const COMPARE: { group: string; rows: { label: string; pro: Cell; premium: Cell; custom: Cell }[] }[] = [
  {
    group: "Website & Appointments",
    rows: [
      { label: "Your branded website", pro: true, premium: true, custom: true },
      { label: "Online appointment booking", pro: true, premium: true, custom: true },
      { label: "Monthly appointments", pro: `Up to ${DEFAULT_APPOINTMENT_CAP}`, premium: "Unlimited", custom: "Set per plan" },
      { label: "Basic analytics", pro: true, premium: true, custom: true },
    ],
  },
  {
    group: "Clinical Workflow",
    rows: [
      { label: "AI blog writer", pro: true, premium: true, custom: true },
      { label: "Online consultation", pro: false, premium: true, custom: "Per plan" },
      { label: "Patient records", pro: false, premium: true, custom: "Per plan" },
      { label: "Regular checkup alert", pro: false, premium: true, custom: "Per plan" },
    ],
  },
  {
    group: "Billing & Team",
    rows: [
      { label: "Billing & invoices", pro: true, premium: true, custom: true },
      { label: "Staff roles & access", pro: false, premium: true, custom: "Per plan" },
    ],
  },
];

const FAQS: { q: string; a: (commission: number | null) => React.ReactNode }[] = [
  {
    q: "Do you take any commission on my consultation fees?",
    a: (c) => (
      <>
        <strong className="text-navy">Only on online payments.</strong> Your subscription is a flat monthly price with
        no per-booking fee. When a patient pays online through the platform, a service charge
        {c != null ? ` (currently ${c}% by default)` : ""} is deducted and the rest is routed to your linked bank
        account. Pay-at-clinic bookings carry no platform charge.
      </>
    ),
  },
  {
    q: "What happens after the 7-day free trial ends?",
    a: () => (
      <>
        Your 7-day trial gives you access to the platform with no credit card required. When it finishes, you choose
        Pro or Premium from your admin panel to continue.
      </>
    ),
  },
  {
    q: "Is GST included in the advertised price?",
    a: () => <>Check the amount shown at checkout before you pay; the price on this page is the plan price per month.</>,
  },
  {
    q: "Can I switch plans later?",
    a: () => (
      <>
        Yes. You can upgrade between Pro and Premium from the Subscription section of your admin panel at any time.
        Annual billing is not available at checkout yet, so plans are billed monthly.
      </>
    ),
  },
  {
    q: "Can I get a plan tailored to my practice?",
    a: () => (
      <>
        Yes. Doctors on Pro or Premium can send a custom plan request from the admin panel with the features and
        appointment limit they need. Once approved, the negotiated price and features apply on top of your plan.
      </>
    ),
  },
];

const PricingPage = () => {
  const { proPrice, premiumPrice } = usePlanPrices();
  const { settings } = usePlatformSettings();
  const commission =
    settings.default_commission_percent != null && !Number.isNaN(Number(settings.default_commission_percent))
      ? Number(settings.default_commission_percent)
      : null;

  const [annual, setAnnual] = useState(false);
  const [patients, setPatients] = useState(25);
  const [fee, setFee] = useState(600);

  useEffect(() => {
    window.scrollTo(0, 0);
    const prevTitle = document.title;
    const desc = "Simple monthly plans for doctors on Doctylia. Start a 7-day free trial, then pick Pro or Premium, or request a custom plan.";
    document.title = "Pricing | Doctylia";
    const metaDesc = document.querySelector('meta[name="description"]');
    const prevDesc = metaDesc?.getAttribute("content") ?? null;
    metaDesc?.setAttribute("content", desc);
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const prevCanonical = canonical?.getAttribute("href") ?? null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", `${window.location.origin}/pricing`);
    const og = (p: string, v: string) => {
      const el = document.querySelector(`meta[property="${p}"]`);
      const prev = el?.getAttribute("content") ?? null;
      el?.setAttribute("content", v);
      return () => {
        if (el && prev !== null) el.setAttribute("content", prev);
      };
    };
    const restoreOg = [og("og:title", "Pricing | Doctylia"), og("og:description", desc), og("og:url", `${window.location.origin}/pricing`)];
    return () => {
      document.title = prevTitle;
      if (metaDesc && prevDesc !== null) metaDesc.setAttribute("content", prevDesc);
      if (canonical && prevCanonical !== null) canonical.setAttribute("href", prevCanonical);
      restoreOg.forEach((r) => r());
    };
  }, []);

  // Annual checkout does not exist yet: the toggle is a display of the offer only,
  // so prices always stay the real monthly prices.
  const planCards = [
    {
      key: "pro",
      label: "Starter & Independent",
      name: "Solo Practice (Pro)",
      desc: "Perfect for solo doctors going digital.",
      price: proPrice,
      icon: User,
      lead: "Included Essentials:",
      features: getTierFeatures("pro", DEFAULT_APPOINTMENT_CAP),
      cta: "Start 7-Day Free Trial",
      note: "No credit card required",
      featured: false,
    },
    {
      key: "premium",
      label: "High Volume & Multi-Staff",
      name: "Premium Clinic",
      desc: "For growing practices that need everything.",
      price: premiumPrice,
      icon: Building2,
      lead: "Everything in Pro, plus:",
      features: getTierFeatures("premium", DEFAULT_APPOINTMENT_CAP).slice(1),
      cta: "Upgrade to Premium",
      note: "7-day free trial on signup",
      featured: true,
    },
  ];

  // Monthly revenue is straight arithmetic from the two sliders:
  //   patients per day x fee = daily revenue, x working days = monthly revenue.
  // The no-show and hours-saved figures are illustrative; their assumptions are stated on the card.
  const workingDays = 26;
  const dailyRevenue = patients * fee;
  const monthlyRevenue = dailyRevenue * workingDays;
  const noShowsPrevented = Math.round(patients * workingDays * 0.04);
  const hoursSaved = Math.round((patients * workingDays * 3) / 60);
  const recoveredRevenue = noShowsPrevented * fee;
  const extraConsultsPerWeek = Math.round(noShowsPrevented / (workingDays / 6));

  return (
    <div className="min-h-screen overflow-x-hidden bg-background pt-16 md:pt-20">
      <LandingNavbar />
      <main>
        {/* Hero + billing switcher */}
        <section className="container mx-auto flex flex-col items-center px-4 pb-8 pt-12 text-center md:pt-16">
          <Badge variant="secondary" className="gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-royal">
            <BadgeCheck className="h-3.5 w-3.5" /> Doctor-friendly &amp; transparent pricing
          </Badge>
          <h1 className="mt-5 max-w-4xl font-heading text-3xl font-extrabold leading-tight tracking-tight text-navy sm:text-4xl md:text-5xl">
            Predictable, Scalable Plans for Every Practice Size
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-lg">
            No hidden setup fees and no per-booking subscription charge. Choose monthly flexibility or save 20% with annual
            billing. Every new account starts with a 7-day trial.
          </p>
          <div className="mt-4 inline-flex max-w-full items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-royal">
            <Receipt className="h-3.5 w-3.5 shrink-0" />
            <span>
              Flat monthly price, no commission on pay-at-clinic bookings
              {commission != null ? `; ${commission}% service charge on online payments` : ""}
            </span>
          </div>

          <div
            role="radiogroup"
            aria-label="Billing period"
            className="mt-8 flex items-center gap-1 rounded-full border border-border bg-muted p-1.5"
          >
            <button
              type="button"
              role="radio"
              aria-checked={!annual}
              onClick={() => setAnnual(false)}
              className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold transition-all sm:px-4 sm:text-sm ${
                !annual ? "bg-card text-royal shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly Billing
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={annual}
              onClick={() => setAnnual(true)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold transition-all sm:px-4 sm:text-sm ${
                annual ? "bg-card text-royal shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Annual Billing
              <span className="rounded-full bg-spark px-2 py-0.5 text-[10px] font-bold uppercase text-navy">Save 20%</span>
            </button>
          </div>
          {annual && (
            <p className="mt-3 max-w-md text-xs text-muted-foreground" role="status">
              Annual billing is coming soon. For now every plan is billed monthly at the price shown.
            </p>
          )}
        </section>

        {/* Plan cards */}
        <section className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3">
            {planCards.map((p) => (
              <div
                key={p.key}
                className={`relative flex flex-col justify-between rounded-xl border bg-card p-6 transition-shadow ${
                  p.featured ? "border-royal shadow-xl lg:-mt-3 lg:mb-3" : "border-border shadow-sm hover:shadow-md"
                }`}
              >
                {p.featured && (
                  <span className="absolute -top-3.5 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-royal px-4 py-1 text-[11px] font-bold uppercase text-white">
                    <Star className="h-3.5 w-3.5" /> Recommended for expanding practices
                  </span>
                )}
                <div>
                  <div className={`flex items-center justify-between pb-2 ${p.featured ? "mt-2" : ""}`}>
                    <span className={`text-[11px] font-semibold uppercase tracking-wider ${p.featured ? "text-royal" : "text-muted-foreground"}`}>
                      {p.label}
                    </span>
                    <span className={`rounded-lg p-2 ${p.featured ? "bg-royal/10 text-royal" : "bg-muted text-royal"}`}>
                      <p.icon className="h-5 w-5" />
                    </span>
                  </div>
                  <h3 className="mt-1 font-heading text-xl font-bold text-navy">{p.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
                  <div className="my-5">
                    <div className="flex items-baseline gap-1.5">
                      <span className={`font-heading text-4xl font-bold ${p.featured ? "text-royal" : "text-navy"}`}>{inr(p.price)}</span>
                      <span className="text-sm text-muted-foreground">/month</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {annual
                        ? `Annual plan (20% off) not yet available: billed monthly`
                        : "Billed monthly"}
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-navy">{p.lead}</div>
                    {p.features.map((f) => (
                      <div key={f} className="flex items-start gap-2.5">
                        {p.featured ? (
                          <BadgeCheck className="mt-0.5 h-[18px] w-[18px] shrink-0 text-royal" />
                        ) : (
                          <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-royal" />
                        )}
                        <span className="text-sm text-foreground">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pt-6">
                  <Button asChild className="w-full" variant={p.featured ? "default" : "outline"}>
                    <Link to="/auth?mode=signup">{p.cta}</Link>
                  </Button>
                  <p className="mt-2 text-center text-xs text-muted-foreground">{p.note}</p>
                </div>
              </div>
            ))}

            <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
              <div>
                <div className="flex items-center justify-between pb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{CUSTOM_PLAN_COPY.badge}</span>
                  <span className="rounded-lg bg-muted p-2 text-navy">
                    <Building2 className="h-5 w-5" />
                  </span>
                </div>
                <h3 className="mt-1 font-heading text-xl font-bold text-navy">{CUSTOM_PLAN_COPY.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{CUSTOM_PLAN_COPY.desc}</p>
                <div className="my-5">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-heading text-4xl font-bold text-navy">Custom</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{CUSTOM_PLAN_COPY.priceNote}</p>
                </div>
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-navy">Tailored to your practice:</div>
                  {CUSTOM_PLAN_FEATURES.map((f) => (
                    <div key={f} className="flex items-start gap-2.5">
                      <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-navy" />
                      <span className="text-sm text-foreground">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="pt-6">
                <Button asChild className="w-full" variant="secondary">
                  <Link to="/auth?mode=signup">Get Started</Link>
                </Button>
                <p className="mt-2 text-center text-xs text-muted-foreground">Request a plan from your admin panel</p>
              </div>
            </div>
          </div>
        </section>

        {/* Calculator */}
        <section className="container mx-auto px-4 py-8 md:py-12">
          <Card className="relative overflow-hidden rounded-2xl p-5 shadow-sm md:p-8">
            <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
              <div className="flex flex-col gap-4 lg:col-span-7">
                <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-royal">
                  <Calculator className="h-3.5 w-3.5" /> Practice financial impact calculator
                </div>
                <h2 className="font-heading text-2xl font-bold text-navy md:text-3xl">Calculate your clinic revenue &amp; time saved</h2>
                <p className="text-sm text-muted-foreground md:text-base">
                  See how automated appointment reminders and faster billing can give time and revenue back to your
                  practice each month.
                </p>
                <div className="space-y-6 pt-2">
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <label htmlFor="patients-range" className="text-sm font-semibold text-navy">Patients seen per day</label>
                      <span className="font-heading text-lg font-bold text-royal">{patients} patients</span>
                    </div>
                    <Slider id="patients-range" min={5} max={80} step={1} value={[patients]} onValueChange={(v) => setPatients(v[0])} />
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                      <span>5 / day (Chamber)</span>
                      <span>80 / day (Polyclinic)</span>
                    </div>
                  </div>
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <label htmlFor="fee-range" className="text-sm font-semibold text-navy">Average consultation fee</label>
                      <span className="font-heading text-lg font-bold text-royal">{inr(fee)}</span>
                    </div>
                    <Slider id="fee-range" min={200} max={2500} step={50} value={[fee]} onValueChange={(v) => setFee(v[0])} />
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                      <span>₹200</span>
                      <span>₹2,500</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4 rounded-xl bg-muted/60 p-4 md:p-6 lg:col-span-5">
                <div className="rounded-lg bg-card p-4 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your monthly clinic revenue</div>
                  <div className="mt-1 font-heading text-3xl font-bold text-royal md:text-4xl">{inr(monthlyRevenue)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {patients} patients × {inr(fee)} = {inr(dailyRevenue)} per day × {workingDays} working days
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Estimated upside with Doctylia</span>
                  <span className="rounded-full bg-spark px-2.5 py-0.5 text-[10px] font-bold uppercase text-navy">Illustrative</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-card p-3 shadow-sm">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-4 w-4 text-success" /> Staff hours saved
                    </div>
                    <div className="mt-1 font-heading text-2xl font-bold text-navy">{hoursSaved} hrs</div>
                    <div className="text-[11px] text-muted-foreground">on billing &amp; calls</div>
                  </div>
                  <div className="rounded-lg bg-card p-3 shadow-sm">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarCheck className="h-4 w-4 text-royal" /> No-shows prevented
                    </div>
                    <div className="mt-1 font-heading text-2xl font-bold text-navy">{noShowsPrevented} slots</div>
                    <div className="text-[11px] text-muted-foreground">via reminders</div>
                  </div>
                </div>
                <div className="rounded-lg bg-card p-4 shadow-sm">
                  <div className="text-xs text-muted-foreground">Revenue recovered from prevented no-shows</div>
                  <div className="mt-1 font-heading text-3xl font-bold text-success md:text-4xl">{inr(recoveredRevenue)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {noShowsPrevented} slots × {inr(fee)} per month, about {extraConsultsPerWeek} extra consultations a week without longer working hours.
                  </div>
                </div>
                <div className="flex items-center gap-4 pt-1">
                  <img src="/stitch/landing-09.png" alt="Clinic growth chart" className="h-auto w-20 shrink-0 object-contain sm:w-24" loading="lazy" />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Illustrative estimate only: assumes {workingDays} working days, 4% of visits recovered from no-shows
                    and 3 minutes of admin saved per patient. Your results will vary.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Invoice spotlight */}
        <section className="container mx-auto px-4 py-6">
          <div className="grid grid-cols-2 items-center gap-4 rounded-2xl bg-secondary p-5 sm:gap-8 md:p-10">
            <div className="flex flex-col gap-3">
              <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-royal sm:text-[11px]">
                <Receipt className="h-3.5 w-3.5" /> Built for Indian practices
              </div>
              <h3 className="font-heading text-lg font-bold text-navy sm:text-2xl md:text-3xl">Automated GST invoices &amp; online payments</h3>
              <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm md:text-base">
                Say goodbye to manual receipts. Doctylia creates GST invoices from the practice dashboard, right next to
                appointments and patient records, and accepts UPI and card payments through Razorpay.
              </p>
              <div className="hidden flex-wrap gap-2 pt-1 sm:flex">
                {["Invoice created when a visit is completed and paid", "Payment tracking in one place"].map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-card px-3 py-1 text-xs font-medium text-navy">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" /> {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-center">
              <img
                src="/stitch/landing-04.png"
                alt="GST invoice with QR code"
                className="h-auto w-full max-w-[320px] object-contain drop-shadow-xl transition-transform hover:scale-105"
                loading="lazy"
              />
            </div>
          </div>
        </section>

        {/* Comparison */}
        <section className="container mx-auto px-4 py-10 md:py-14">
          <div className="mx-auto mb-8 max-w-3xl text-center">
            <h2 className="font-heading text-2xl font-bold text-navy md:text-3xl">Compare All Capabilities Side-by-Side</h2>
            <p className="mt-2 text-sm text-muted-foreground md:text-base">
              Every detail built for Indian clinical workflows and high patient trust.
            </p>
          </div>

          <Card className="hidden overflow-hidden rounded-2xl shadow-sm md:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-muted/60 text-navy">
                  <th scope="col" className="w-2/5 p-4 font-heading text-sm font-semibold">Capability</th>
                  <th scope="col" className="w-1/5 p-4 text-center font-heading text-sm font-semibold">Pro</th>
                  <th scope="col" className="w-1/5 bg-secondary p-4 text-center font-heading text-sm font-semibold text-royal">Premium</th>
                  <th scope="col" className="w-1/5 p-4 text-center font-heading text-sm font-semibold">Custom Plan</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {COMPARE.map((g) => (
                  <Fragment key={g.group}>
                    <tr className="bg-muted text-navy">
                      <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider">{g.group}</td>
                    </tr>
                    {g.rows.map((r) => (
                      <tr key={r.label} className="border-t border-border transition-colors hover:bg-muted/40">
                        <td className="p-4 font-medium text-foreground">{r.label}</td>
                        <CompareCell value={r.pro} />
                        <CompareCell value={r.premium} highlight />
                        <CompareCell value={r.custom} />
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="space-y-2 md:hidden">
            {COMPARE.map((g) => (
              <div key={g.group} className="space-y-2">
                <div className="px-1 pt-2 text-xs font-semibold uppercase tracking-wider text-navy">{g.group}</div>
                {g.rows.map((r) => (
                  <Card key={r.label} className="p-3">
                    <div className="mb-2 text-sm font-medium text-foreground">{r.label}</div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      {([["Pro", r.pro], ["Premium", r.premium], ["Custom", r.custom]] as [string, Cell][]).map(([n, v]) => (
                        <div key={n} className={`rounded-md p-1.5 ${n === "Premium" ? "bg-secondary" : "bg-muted/50"}`}>
                          <div className="mb-1 text-[10px] uppercase text-muted-foreground">{n}</div>
                          <CellValue value={v} />
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="container mx-auto max-w-4xl px-4 py-10 md:py-14">
          <div className="mb-8 text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-royal">Clear Answers</span>
            <h2 className="mt-1 font-heading text-2xl font-bold text-navy md:text-3xl">Frequently Asked Pricing Questions</h2>
            <p className="mt-2 text-sm text-muted-foreground md:text-base">
              Everything upfront so you can make an informed decision for your practice.
            </p>
          </div>
          <Accordion type="single" collapsible className="space-y-3">
            {FAQS.map((f, i) => (
              <AccordionItem key={f.q} value={`faq-${i}`} className="rounded-xl border bg-card px-4 shadow-sm">
                <AccordionTrigger className="text-left font-heading text-sm font-semibold text-navy hover:no-underline md:text-base">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">{f.a(commission)}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* CTA */}
        <section className="container mx-auto px-4 pb-14 pt-4">
          <div className="relative overflow-hidden rounded-3xl bg-navy p-6 text-white shadow-xl md:p-10">
            <div className="pointer-events-none absolute -right-20 -top-20 h-96 w-96 rounded-full bg-royal/30 blur-3xl" />
            <div className="relative z-10 flex flex-col items-center justify-between gap-6 text-center lg:flex-row lg:text-left">
              <div className="max-w-2xl">
                <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase text-spark-bright">
                  <Zap className="h-3.5 w-3.5" /> Quick onboarding
                </div>
                <h2 className="font-heading text-2xl font-bold tracking-tight text-white md:text-3xl">
                  Ready to modernize your OPD operations today?
                </h2>
                <p className="mt-2 text-sm text-white/80 md:text-base">
                  Set up your branded website, booking and billing in one place, with GST-ready invoices.
                </p>
              </div>
              <div className="flex w-full shrink-0 flex-col items-center gap-3 sm:w-auto sm:flex-row">
                <Button asChild size="lg" className="w-full bg-royal text-white hover:bg-royal/90 sm:w-auto">
                  <Link to="/auth?mode=signup">
                    Start Free 7-Day Trial <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="ghost" className="w-full bg-white/10 text-white hover:bg-white/20 hover:text-white sm:w-auto">
                  <Link to="/features">
                    <Sparkles className="mr-1 h-4 w-4" /> Explore Features
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
};

const CellValue = ({ value }: { value: Cell }) =>
  value === true ? (
    <CheckCircle2 className="mx-auto h-5 w-5 text-success" aria-label="Included" />
  ) : value === false ? (
    <Minus className="mx-auto h-5 w-5 text-muted-foreground" aria-label="Not included" />
  ) : (
    <span className="font-semibold text-navy">{value}</span>
  );

const CompareCell = ({ value, highlight }: { value: Cell; highlight?: boolean }) => (
  <td className={`p-4 text-center ${highlight ? "bg-secondary/50" : ""}`}>
    <CellValue value={value} />
  </td>
);

export default PricingPage;
