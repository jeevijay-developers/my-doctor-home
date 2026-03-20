import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle } from "lucide-react";

const LandingHero = () => {
  return (
    <section className="pt-28 pb-20 bg-gradient-to-br from-white via-secondary to-cloud-blue overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="space-y-6"
          >
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-pill bg-accent/10 text-accent text-sm font-semibold">
              ✨ AI-Powered Platform
            </span>
            <h1 className="font-heading font-extrabold text-4xl md:text-5xl lg:text-6xl text-primary leading-tight">
              India's #1 Platform
              <br />
              <span className="text-gradient">for Doctors</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-lg">
              Your own branded website, appointment booking, patient management, billing — all in one subscription. Start your 7-day free trial today.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link to="/auth?mode=signup">
                <Button size="lg" className="bg-royal hover:bg-royal/90 text-white gap-2 text-base px-8">
                  Start 7-Day Free Trial <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href="#how-it-works">
                <Button size="lg" variant="outline" className="text-base px-8">
                  See How It Works
                </Button>
              </a>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground pt-2">
              {["No credit card required", "Set up in 5 minutes", "Cancel anytime"].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-success" /> {t}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Right — Mockup */}
          <motion.div
            initial={{ opacity: 0, x: 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
            className="relative hidden lg:block"
          >
            <div className="relative bg-white rounded-2xl shadow-xl border border-border p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-destructive/60" />
                <div className="w-3 h-3 rounded-full bg-warning/60" />
                <div className="w-3 h-3 rounded-full bg-success/60" />
                <span className="ml-2 text-xs text-muted-foreground">drrahul.doctylia.com</span>
              </div>
              <div className="bg-secondary rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-royal/20 flex items-center justify-center text-2xl">👨‍⚕️</div>
                  <div>
                    <div className="font-heading font-bold text-primary">Dr. Rahul Sharma</div>
                    <div className="text-sm text-muted-foreground">Cardiologist · Mumbai</div>
                    <div className="text-xs text-warning font-medium">★★★★★ 4.9 (187 reviews)</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {["5,000+ Patients", "15 Years Exp", "98% Success"].map((s) => (
                    <div key={s} className="bg-white rounded-lg p-2 text-xs font-medium text-primary">{s}</div>
                  ))}
                </div>
                <div className="bg-royal text-white text-center rounded-lg py-2 text-sm font-semibold">
                  Book Appointment
                </div>
              </div>
            </div>
            {/* Floating cards */}
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -top-4 -right-4 bg-white rounded-xl shadow-lg px-4 py-2"
            >
              <span className="text-sm font-semibold text-success">✓ Next slot: Today 5:30 PM</span>
            </motion.div>
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 3, delay: 1, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -bottom-4 -left-4 bg-white rounded-xl shadow-lg px-4 py-2"
            >
              <span className="text-sm font-semibold text-royal">📊 40% more patients</span>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default LandingHero;
