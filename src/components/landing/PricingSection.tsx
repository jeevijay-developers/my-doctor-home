import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Check, SlidersHorizontal, Star } from "lucide-react";
import { usePlanPrices } from "@/hooks/usePlanPrices";
import { DEFAULT_APPOINTMENT_CAP, getTierFeatures } from "@/lib/planFeatures";
import { CUSTOM_PLAN_COPY, CUSTOM_PLAN_FEATURES } from "@/lib/customPlanMarketing";

const PricingSection = () => {
  const { proPrice, premiumPrice } = usePlanPrices();

  const plans = [
    {
      key: "pro" as const,
      name: "Pro Practice",
      badge: "Solo Practitioner",
      desc: "Designed for solo doctors modernizing their private clinic or OPD chamber.",
      price: proPrice,
      cta: "Start Free 7-Day Trial",
      popular: false,
    },
    {
      key: "premium" as const,
      name: "Premium Clinic",
      badge: "Full Autopilot",
      desc: "Complete clinical control with staff roles, online consultation, and no appointment limits.",
      price: premiumPrice,
      cta: "Upgrade to Premium Clinic",
      popular: true,
    },
  ];

  return (
    <section id="pricing" className="bg-background py-14 md:py-20" aria-labelledby="pricing-heading">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-12 max-w-3xl text-center md:mb-14">
          <span className="inline-block rounded-full bg-secondary px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-primary md:text-sm">
            Simple, Doctor-Friendly Pricing
          </span>
          <h2 id="pricing-heading" className="mt-3 font-heading text-2xl font-bold text-navy sm:text-3xl md:text-4xl">
            Transparent plans that scale with your clinical practice
          </h2>
          <p className="mt-3 text-muted-foreground">
            All plans include our 7-day fully functional trial. No credit card required to start.
          </p>
        </div>

        <div className="mx-auto grid max-w-4xl grid-cols-2 items-stretch gap-3 sm:gap-6 md:gap-8 lg:max-w-6xl lg:grid-cols-3">
          {plans.map((p, i) => (
            <motion.div
              key={p.key}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.12 }}
              className="h-full"
            >
              <div
                className={`relative flex h-full flex-col justify-between rounded-2xl bg-card p-4 transition-shadow sm:p-6 md:p-8 ${
                  p.popular ? "shadow-xl ring-2 ring-primary" : "border border-border shadow-sm hover:shadow-md"
                }`}
              >
                {p.popular && (
                  <span className="absolute -top-3.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-md sm:px-4 sm:text-xs">
                    <Star className="h-3 w-3 fill-current" aria-hidden="true" /> Most Popular
                  </span>
                )}
                <div>
                  <div className="mb-3 flex flex-col items-start gap-2 md:mb-4 md:flex-row md:items-center md:justify-between">
                    <h3 className="font-heading text-base font-bold text-navy sm:text-lg md:text-xl">{p.name}</h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold sm:text-xs ${
                        p.popular ? "bg-royal/10 text-primary" : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {p.badge}
                    </span>
                  </div>
                  <div className="mb-4 text-xs text-muted-foreground sm:text-sm md:mb-6">{p.desc}</div>
                  <div className="mb-5 flex flex-wrap items-baseline gap-1 md:mb-8">
                    <span className="font-heading text-2xl font-extrabold text-navy sm:text-3xl md:text-4xl">
                      ₹{p.price.toLocaleString("en-IN")}
                    </span>
                    <span className="text-xs text-muted-foreground sm:text-sm">/ month</span>
                  </div>
                  <ul className="space-y-2 sm:space-y-3">
                    {getTierFeatures(p.key, DEFAULT_APPOINTMENT_CAP).map((f, fi) => (
                      <li
                        key={f}
                        className={`flex items-start gap-2 text-[11px] sm:text-sm md:items-center md:gap-3 ${
                          p.popular && fi === 1 ? "font-semibold text-navy" : "text-foreground"
                        }`}
                      >
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success md:mt-0 md:h-[18px] md:w-[18px]" aria-hidden="true" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Link
                  to="/auth?mode=signup"
                  className={`mt-6 inline-flex w-full items-center justify-center rounded-lg px-2 py-3 text-center text-xs font-semibold shadow-sm transition-colors sm:text-sm md:mt-8 md:py-3.5 ${
                    p.popular
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "bg-secondary text-navy hover:bg-secondary/70"
                  }`}
                >
                  {p.cta}
                </Link>
              </div>
            </motion.div>
          ))}

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: plans.length * 0.12 }}
            className="col-span-2 h-full lg:col-span-1"
          >
            <div className="relative flex h-full flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:p-6 md:p-8">
              <div>
                <div className="mb-3 flex flex-col items-start gap-2 md:mb-4 md:flex-row md:items-center md:justify-between">
                  <h3 className="font-heading text-base font-bold text-navy sm:text-lg md:text-xl">{CUSTOM_PLAN_COPY.name}</h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold text-muted-foreground sm:text-xs">
                    <SlidersHorizontal className="h-3 w-3" aria-hidden="true" /> {CUSTOM_PLAN_COPY.badge}
                  </span>
                </div>
                <div className="mb-4 text-xs text-muted-foreground sm:text-sm md:mb-6">{CUSTOM_PLAN_COPY.desc}</div>
                <div className="mb-5 md:mb-8">
                  <span className="font-heading text-2xl font-extrabold text-navy sm:text-3xl md:text-4xl">{CUSTOM_PLAN_COPY.priceLabel}</span>
                  <div className="mt-1 text-xs text-muted-foreground sm:text-sm">{CUSTOM_PLAN_COPY.priceNote}</div>
                </div>
                <ul className="space-y-2 sm:space-y-3">
                  {CUSTOM_PLAN_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[11px] text-foreground sm:text-sm md:items-center md:gap-3">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success md:mt-0 md:h-[18px] md:w-[18px]" aria-hidden="true" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-6 md:mt-8">
                <Link
                  to="/auth?mode=signup"
                  className="inline-flex w-full items-center justify-center rounded-lg bg-secondary px-2 py-3 text-center text-xs font-semibold text-navy shadow-sm transition-colors hover:bg-secondary/70 sm:text-sm md:py-3.5"
                >
                  {CUSTOM_PLAN_COPY.cta}
                </Link>
                <p className="mt-2 text-center text-xs text-muted-foreground">{CUSTOM_PLAN_COPY.ctaNote}</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
