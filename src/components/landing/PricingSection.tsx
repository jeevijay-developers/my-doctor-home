import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check, Sparkles } from "lucide-react";

const plans = [
  {
    name: "Starter",
    monthly: "₹999",
    yearly: "₹799",
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
    monthly: "₹1,999",
    yearly: "₹1,599",
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
    monthly: "₹3,999",
    yearly: "₹3,199",
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

const PricingSection = () => {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="py-20 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-sm font-semibold text-accent uppercase tracking-wider">Pricing</span>
          <h2 className="font-heading font-bold text-3xl md:text-4xl text-primary mt-2">
            Simple, Transparent Pricing
          </h2>
          <p className="text-muted-foreground mt-3">
            All plans include a 7-day free trial. No credit card required.
          </p>
          {/* Toggle */}
          <div className="flex items-center justify-center gap-3 mt-6">
            <span className={`text-sm font-medium ${!annual ? "text-primary" : "text-muted-foreground"}`}>Monthly</span>
            <button
              onClick={() => setAnnual(!annual)}
              className={`relative w-12 h-6 rounded-full transition-colors ${annual ? "bg-royal" : "bg-border"}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${annual ? "translate-x-6" : "translate-x-0.5"}`} />
            </button>
            <span className={`text-sm font-medium ${annual ? "text-primary" : "text-muted-foreground"}`}>
              Annual <span className="text-success text-xs font-bold ml-1">Save 20%</span>
            </span>
          </div>
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
              className={`relative rounded-2xl p-8 transition-all ${
                p.popular
                  ? "bg-white shadow-xl border-2 border-transparent bg-clip-padding"
                  : "border-2 border-border bg-white hover:shadow-lg"
              }`}
              style={p.popular ? { borderImage: "linear-gradient(135deg, hsl(213 79% 54%), hsl(187 100% 38%)) 1" } : undefined}
            >
              {p.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-royal to-accent text-white text-xs font-bold px-4 py-1 rounded-full flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Most Popular
                </span>
              )}
              <h3 className="font-heading font-bold text-xl text-primary">{p.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{p.desc}</p>
              <div className="mt-5">
                <span className="font-heading font-extrabold text-4xl text-primary">{annual ? p.yearly : p.monthly}</span>
                <span className="text-muted-foreground">{p.period}</span>
              </div>
              {annual && (
                <div className="text-xs text-success font-medium mt-1">Billed annually</div>
              )}
              <Link to="/auth?mode=signup">
                <Button
                  className={`w-full mt-6 ${
                    p.popular ? "bg-royal hover:bg-royal/90 text-white shadow-md shadow-royal/20" : ""
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
};

export default PricingSection;
