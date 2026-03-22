import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Shield, Headphones, Clock } from "lucide-react";

const trustItems = [
  { icon: Shield, label: "SSL Encrypted & Secure" },
  { icon: Headphones, label: "24/7 Support" },
  { icon: Clock, label: "99.9% Uptime" },
];

const CTABanner = () => (
  <section className="py-16 md:py-20 relative overflow-hidden">
    {/* Animated gradient background */}
    <motion.div
      animate={{
        background: [
          "linear-gradient(135deg, hsl(230 80% 20%), hsl(200 80% 30%))",
          "linear-gradient(135deg, hsl(200 80% 25%), hsl(170 70% 35%))",
          "linear-gradient(135deg, hsl(230 80% 20%), hsl(200 80% 30%))",
        ],
      }}
      transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      className="absolute inset-0"
    />
    <div className="absolute top-0 right-0 w-48 md:w-64 h-48 md:h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
    <div className="absolute bottom-0 left-0 w-36 md:w-48 h-36 md:h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
    {/* Floating particles */}
    <motion.div animate={{ y: [0, -15, 0] }} transition={{ duration: 4, repeat: Infinity }} className="absolute top-1/4 left-1/4 w-2 h-2 rounded-full bg-white/10" />
    <motion.div animate={{ y: [0, 12, 0] }} transition={{ duration: 5, repeat: Infinity, delay: 1 }} className="absolute top-1/3 right-1/3 w-3 h-3 rounded-full bg-white/5" />

    <div className="container mx-auto px-4 text-center relative">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className="inline-flex items-center gap-2 px-3 md:px-4 py-1.5 rounded-full bg-white/10 text-white/90 text-xs md:text-sm font-medium mb-5 md:mb-6 backdrop-blur-sm">
          <Sparkles className="h-3.5 w-3.5 md:h-4 md:w-4" /> Every day without Doctylia = patients lost to competitors
        </div>
        <h2 className="font-heading font-bold text-2xl sm:text-3xl md:text-5xl text-white max-w-3xl mx-auto leading-tight">
          Ready to Grow Your Practice?
        </h2>
        <p className="text-white/75 mt-3 md:mt-4 max-w-lg mx-auto text-sm md:text-lg">
          Start your free 7-day trial today. No credit card. No setup fees. Go live in minutes.
        </p>
        <p className="text-white/50 text-xs md:text-sm mt-2">
          Limited time: Get 30% off your first 3 months with annual plan
        </p>
        <Link to="/auth?mode=signup">
          <Button size="lg" className="mt-6 md:mt-8 bg-white text-primary hover:bg-white/90 gap-2 text-sm md:text-base px-8 md:px-10 shadow-xl font-semibold">
            Start Free Trial <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>

        {/* Trust badges */}
        <div className="flex flex-wrap items-center justify-center gap-4 md:gap-8 mt-8 md:mt-10">
          {trustItems.map((t) => (
            <div key={t.label} className="flex items-center gap-2 text-white/60 text-xs md:text-sm">
              <t.icon className="h-4 w-4" />
              <span>{t.label}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  </section>
);

export default CTABanner;
