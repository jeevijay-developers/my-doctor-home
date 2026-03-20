import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const plans = [
  {
    name: "Starter",
    price: "₹999",
    period: "/month",
    desc: "Perfect for solo doctors starting digital",
    features: [
      "Your branded website",
      "Online appointment booking",
      "Up to 100 appointments/month",
      "WhatsApp reminders",
      "Basic analytics",
    ],
    popular: false,
  },
  {
    name: "Professional",
    price: "₹1,999",
    period: "/month",
    desc: "For growing practices that need everything",
    features: [
      "Everything in Starter",
      "Unlimited appointments",
      "Online consultation",
      "AI blog writer",
      "Billing & invoices",
      "Patient records",
      "Priority support",
    ],
    popular: true,
  },
  {
    name: "Premium",
    price: "₹3,999",
    period: "/month",
    desc: "Multi-doctor clinics & hospital departments",
    features: [
      "Everything in Professional",
      "Multi-doctor support",
      "Staff roles & access",
      "Custom domain (₹4,999 setup)",
      "API access",
      "Dedicated account manager",
      "White-label option",
    ],
    popular: false,
  },
];

const PricingSection = () => (
  <section id="pricing" className="py-20 bg-white">
    <div className="container mx-auto px-4">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <span className="text-sm font-semibold text-accent uppercase tracking-wider">Pricing</span>
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-primary mt-2">
          Simple, Transparent Pricing
        </h2>
        <p className="text-muted-foreground mt-3">
          All plans include a 7-day free trial. No credit card required.
        </p>
      </div>
      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {plans.map((p, i) => (
          <motion.div
            key={p.name}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.12 }}
            whileHover={{ y: -6 }}
            className={`relative rounded-2xl p-8 border-2 transition-all ${
              p.popular
                ? "border-royal bg-white shadow-xl scale-105"
                : "border-border bg-white hover:shadow-lg"
            }`}
          >
            {p.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-white text-xs font-bold px-4 py-1 rounded-pill">
                Most Popular
              </span>
            )}
            <h3 className="font-heading font-bold text-xl text-primary">{p.name}</h3>
            <p className="text-sm text-muted-foreground mt-1">{p.desc}</p>
            <div className="mt-5">
              <span className="font-heading font-extrabold text-4xl text-primary">{p.price}</span>
              <span className="text-muted-foreground">{p.period}</span>
            </div>
            <Link to="/auth?mode=signup">
              <Button
                className={`w-full mt-6 ${
                  p.popular ? "bg-royal hover:bg-royal/90 text-white" : ""
                }`}
                variant={p.popular ? "default" : "outline"}
              >
                Start Free Trial
              </Button>
            </Link>
            <ul className="mt-6 space-y-3">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                  <Check className="h-4 w-4 text-success mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

export default PricingSection;
