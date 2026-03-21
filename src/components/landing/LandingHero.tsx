import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle, Sparkles } from "lucide-react";
import heroDoctor from "@/assets/hero-doctor.png";

const LandingHero = () => {
  return (
    <section className="pt-24 pb-16 md:pt-28 md:pb-20 bg-gradient-to-br from-white via-secondary to-cloud-blue overflow-hidden relative">
      {/* Decorative blobs */}
      <div className="absolute top-20 right-10 w-72 h-72 bg-royal/5 rounded-full blur-3xl" />
      <div className="absolute bottom-10 left-10 w-56 h-56 bg-accent/5 rounded-full blur-3xl" />

      <div className="container mx-auto px-4 relative">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          {/* Left */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="space-y-6"
          >
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-ai-purple/10 text-ai-purple text-sm font-semibold">
              <Sparkles className="h-4 w-4" /> AI-Powered Platform
            </span>
            <h1 className="font-heading font-extrabold text-4xl md:text-5xl lg:text-[56px] text-primary leading-[1.1]">
              India's #1 Platform
              <br />
              <span className="text-gradient">for Doctors</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-lg leading-relaxed">
              Your own branded website, appointment booking, patient management, billing — all in one subscription. Start your <strong className="text-foreground">7-day free trial</strong> today.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link to="/auth?mode=signup">
                <Button size="lg" className="bg-royal hover:bg-royal/90 text-white gap-2 text-base px-8 shadow-lg shadow-royal/20">
                  Start 7-Day Free Trial <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href="#how-it-works">
                <Button size="lg" variant="outline" className="text-base px-8 border-2">
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

          {/* Right — Doctor Image + Floating cards */}
          <motion.div
            initial={{ opacity: 0, x: 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
            className="relative hidden lg:flex justify-center"
          >
            <div className="relative">
              <img src={heroDoctor} alt="Doctor using Doctylia" className="w-[420px] h-auto drop-shadow-2xl" />
              {/* Floating stats cards */}
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -top-2 right-0 bg-white rounded-xl shadow-lg px-4 py-3 border border-border"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
                    <CheckCircle className="h-4 w-4 text-success" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Next Slot</div>
                    <div className="text-sm font-bold text-primary">Today 5:30 PM</div>
                  </div>
                </div>
              </motion.div>
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 3, delay: 1, repeat: Infinity, ease: "easeInOut" }}
                className="absolute bottom-16 -left-8 bg-white rounded-xl shadow-lg px-4 py-3 border border-border"
              >
                <div className="text-xs text-muted-foreground">Patients Growth</div>
                <div className="text-lg font-bold text-royal">+40% ↑</div>
              </motion.div>
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 3, delay: 2, repeat: Infinity, ease: "easeInOut" }}
                className="absolute top-1/3 -right-6 bg-white rounded-xl shadow-lg px-4 py-3 border border-border"
              >
                <div className="text-xs text-muted-foreground">Rating</div>
                <div className="text-sm font-bold text-warning">★★★★★ 4.9</div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default LandingHero;
