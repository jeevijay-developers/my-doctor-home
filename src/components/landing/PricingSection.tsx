import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check, Sparkles } from "lucide-react";

const plans = [
  {
    name: "Pro",
    price: "₹1,499",
    period: "/month",
    desc: "Perfect for solo doctors going digital",
    features: [
      "Your branded website",
      "Online appointment booking",
      "Up to 100 appointments/month",
      "Basic analytics",
    ],
    popular: false,
  },
  {
    name: "Premium",
    price: "₹3,999",
    period: "/month",
    desc: "For growing practices that need everything",
    features: [
      "Unlimited appointments",
      "Online consultation",
      "AI blog writer",
      "Billing & invoices",
      "Patient records",
      "Regular checkup alert",
      "Staff roles & access",
    ],
    popular: true,
  },
];

const PricingSection = () => (
  <section id="pricing" className="py-16 md:py-20 bg-white">
    <div className="container mx-auto px-4">
      <div className="text-center max-w-2xl mx-auto mb-10 md:mb-12">
        <span className="text-xs md:text-sm font-semibold text-accent uppercase tracking-wider">Pricing</span>
        <h2 className="font-heading font-bold text-2xl sm:text-3xl md:text-4xl text-primary mt-2">
          Simple, Transparent Pricing
        </h2>
        <p className="text-sm md:text-base text-muted-foreground mt-3">
          All plans include a 7-day free trial. No credit card required.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-5 md:gap-6 max-w-3xl mx-auto items-stretch">
        {plans.map((p, i) => (
          <motion.div
            key={p.name}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.12 }}
            whileHover={{ y: -6 }}
            className="h-full"
          >
            <div
              className={`relative rounded-2xl border-2 p-4 sm:p-6 md:p-8 h-full flex flex-col transition-shadow ${
                p.popular
                  ? "border-royal shadow-xl shadow-royal/10 bg-white"
                  : "border-border bg-white hover:shadow-lg"
              }`}
            >
              {p.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-royal to-accent text-white text-xs font-bold px-4 py-1 rounded-full flex items-center gap-1 whitespace-nowrap">
                  <Sparkles className="h-3 w-3" /> Most Popular
                </span>
              )}

              <h3 className="font-heading font-bold text-base sm:text-lg md:text-xl text-primary">{p.name}</h3>
              <p className="text-[11px] sm:text-xs md:text-sm text-muted-foreground mt-1">{p.desc}</p>

              <div className="mt-3 sm:mt-4 md:mt-5">
                <span className="font-heading font-extrabold text-2xl sm:text-3xl md:text-4xl text-primary">{p.price}</span>
                <span className="text-muted-foreground text-xs sm:text-sm">{p.period}</span>
              </div>

              <ul className="mt-4 sm:mt-5 md:mt-6 space-y-2 sm:space-y-2.5 md:space-y-3 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 sm:gap-2 text-[11px] sm:text-xs md:text-sm text-foreground">
                    <Check className="h-3.5 w-3.5 md:h-4 md:w-4 text-success mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link to="/auth?mode=signup" className="block mt-4 sm:mt-6 md:mt-7">
                <Button
                  className={`w-full ${p.popular ? "bg-royal hover:bg-royal/90 text-white shadow-md shadow-royal/20" : ""}`}
                  variant={p.popular ? "default" : "outline"}
                >
                  Start Free Trial
                </Button>
              </Link>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

export default PricingSection;
