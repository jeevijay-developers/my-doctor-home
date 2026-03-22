import { useState } from "react";
import { Globe, CalendarCheck, CreditCard, Sparkles, Check } from "lucide-react";

const tabs = [
  {
    id: "website",
    label: "Website",
    icon: Globe,
    title: "Your Own Professional Website",
    desc: "A beautiful, SEO-optimized website that puts your practice on Google and makes patients trust you instantly.",
    features: [
      "Mobile-responsive design that looks great everywhere",
      "SEO-optimized so patients find you on Google",
      "Custom domain support (www.drname.com)",
      "Service listing with pricing & booking",
      "Photo gallery of your clinic",
      "Patient reviews & testimonials section",
      "WhatsApp integration for instant contact",
    ],
  },
  {
    id: "appointments",
    label: "Appointments",
    icon: CalendarCheck,
    title: "Smart Appointment Booking",
    desc: "Let patients book 24/7. Auto-confirm, send reminders, manage your schedule — all on autopilot.",
    features: [
      "Online booking from your website",
      "Calendar view with drag & reschedule",
      "WhatsApp appointment reminders",
      "Token number system for walk-ins",
      "Working hours & slot management",
      "No-show tracking & analytics",
      "Clinic + Online consultation support",
    ],
  },
  {
    id: "billing",
    label: "Billing",
    icon: CreditCard,
    title: "Billing & Payment Tracking",
    desc: "Generate GST invoices, track payments, accept online payments — all from one place.",
    features: [
      "Auto-generate GST-compliant invoices",
      "Track paid, pending & refunded payments",
      "Online payment collection (UPI, cards)",
      "Revenue analytics & reports",
      "Payment reminders via WhatsApp",
      "Export transaction history (CSV)",
      "Multi-service billing in one visit",
    ],
  },
  {
    id: "ai",
    label: "AI Tools",
    icon: Sparkles,
    title: "AI-Powered Content & Insights",
    desc: "Let AI write SEO health blogs, generate patient education content, and surface smart insights.",
    features: [
      "AI blog writer — publish in 1 click",
      "SEO-optimized health articles",
      "Patient education content generator",
      "Smart analytics & growth insights",
      "Auto-tagging & categorization",
      "Content calendar suggestions",
      "Multi-language support (coming soon)",
    ],
  },
];

const DetailedFeatures = () => {
  const [active, setActive] = useState("website");
  const current = tabs.find((t) => t.id === active)!;

  return (
    <section className="py-14 md:py-20 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
          <span className="text-xs md:text-sm font-semibold text-accent uppercase tracking-wider">Everything You Need</span>
          <h2 className="font-heading font-bold text-2xl sm:text-3xl md:text-4xl text-primary mt-2">
            Deep Dive Into Features
          </h2>
          <p className="text-sm md:text-base text-muted-foreground mt-3">
            Every tool a modern doctor needs, built into one platform.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap justify-center gap-2 md:gap-3 mb-8 md:mb-10">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`flex items-center gap-2 px-4 md:px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                active === t.id
                  ? "bg-royal text-white shadow-md shadow-royal/20"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8 items-start">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-royal/10 flex items-center justify-center">
                <current.icon className="h-6 w-6 text-royal" />
              </div>
              <h3 className="font-heading font-bold text-xl text-primary">{current.title}</h3>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed mb-6">{current.desc}</p>
            <ul className="space-y-3">
              {current.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-foreground">
                  <Check className="h-4 w-4 text-success mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Visual mockup */}
          <div className="rounded-2xl border border-border bg-secondary/30 p-5">
            <div className="flex items-center gap-1.5 mb-4">
              <div className="w-2.5 h-2.5 rounded-full bg-destructive/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-warning/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-success/50" />
            </div>
            <div className="bg-white rounded-xl border border-border p-4 space-y-3">
              {active === "website" && (
                <>
                  <div className="h-20 rounded-lg bg-gradient-to-r from-royal/10 to-teal/10" />
                  <div className="grid grid-cols-3 gap-2">
                    <div className="h-8 rounded bg-royal/8" />
                    <div className="h-8 rounded bg-teal/8" />
                    <div className="h-8 rounded bg-ai-purple/8" />
                  </div>
                  <div className="h-3 w-3/4 bg-secondary rounded" />
                  <div className="h-3 w-1/2 bg-secondary rounded" />
                </>
              )}
              {active === "appointments" && (
                <>
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} className="text-center">
                        <div className="text-[9px] text-muted-foreground mb-1">{["M","T","W","T","F","S","S"][i]}</div>
                        <div className={`h-7 rounded text-[10px] flex items-center justify-center ${i === 2 ? "bg-royal text-white font-bold" : "bg-secondary"}`}>
                          {i + 15}
                        </div>
                      </div>
                    ))}
                  </div>
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/60">
                      <div className="w-6 h-6 rounded-full bg-royal/10" />
                      <div className="flex-1">
                        <div className="h-2.5 w-20 bg-foreground/10 rounded" />
                        <div className="h-2 w-14 bg-muted-foreground/10 rounded mt-1" />
                      </div>
                      <div className="h-5 w-14 rounded-full bg-success/10" />
                    </div>
                  ))}
                </>
              )}
              {active === "billing" && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {["₹24K", "₹8.2K", "₹3.1K"].map((v, i) => (
                      <div key={i} className="bg-secondary/60 rounded-lg p-2 text-center">
                        <div className="text-xs font-bold text-primary">{v}</div>
                        <div className="text-[9px] text-muted-foreground">{["Total", "Week", "Today"][i]}</div>
                      </div>
                    ))}
                  </div>
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="flex items-center justify-between p-2 rounded-lg bg-secondary/40">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded bg-success/10" />
                        <div className="h-2.5 w-24 bg-foreground/10 rounded" />
                      </div>
                      <div className="text-xs font-bold text-success">₹{n * 500}</div>
                    </div>
                  ))}
                </>
              )}
              {active === "ai" && (
                <>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-ai-purple/5">
                    <Sparkles className="h-4 w-4 text-ai-purple" />
                    <div className="h-2.5 w-32 bg-ai-purple/15 rounded" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 w-full bg-secondary rounded" />
                    <div className="h-3 w-5/6 bg-secondary rounded" />
                    <div className="h-3 w-4/6 bg-secondary rounded" />
                    <div className="h-3 w-full bg-secondary rounded" />
                    <div className="h-3 w-3/4 bg-secondary rounded" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <div className="h-7 w-20 rounded-lg bg-ai-purple/10" />
                    <div className="h-7 w-16 rounded-lg bg-success/10" />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DetailedFeatures;
