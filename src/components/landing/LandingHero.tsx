import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import heroDoctor from "@/assets/hero-doctor.png";

const rotatingWords = ["Website Builder", "Appointment System", "Billing Tool", "AI Blog Writer", "Patient Manager"];

const LandingHero = () => {
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setWordIndex((prev) => (prev + 1) % rotatingWords.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="pt-20 pb-10 md:pt-28 md:pb-20 bg-gradient-to-br from-white via-secondary to-cloud-blue overflow-hidden relative">
      {/* Animated decorative blobs */}
      <motion.div
        animate={{ scale: [1, 1.2, 1], opacity: [0.05, 0.08, 0.05] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-20 right-10 w-48 md:w-72 h-48 md:h-72 bg-royal rounded-full blur-3xl"
      />
      <motion.div
        animate={{ scale: [1, 1.3, 1], opacity: [0.05, 0.1, 0.05] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        className="absolute bottom-10 left-10 w-36 md:w-56 h-36 md:h-56 bg-accent rounded-full blur-3xl"
      />
      {/* Floating particles — hidden on mobile */}
      <motion.div animate={{ y: [0, -20, 0], x: [0, 10, 0] }} transition={{ duration: 7, repeat: Infinity }} className="absolute top-1/3 left-[15%] w-3 h-3 rounded-full bg-royal/20 hidden md:block" />
      <motion.div animate={{ y: [0, 15, 0], x: [0, -8, 0] }} transition={{ duration: 5, repeat: Infinity, delay: 1 }} className="absolute top-1/4 right-[25%] w-2 h-2 rounded-full bg-teal/30 hidden md:block" />

      <div className="container mx-auto px-4 relative">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-6 lg:gap-10 items-center">
          {/* Left */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="space-y-4 md:space-y-6 min-w-0"
          >
            <div className="flex flex-wrap items-center gap-1 sm:gap-2">
              <motion.span
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-ai-purple/10 text-ai-purple text-xs font-semibold whitespace-nowrap"
              >
                <Sparkles className="h-3 w-3" /> AI-Powered
              </motion.span>
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-success/10 text-success text-xs font-semibold"
              >
                🔥 2,847 doctors joined
              </motion.span>
            </div>

            <h1 className="font-heading font-extrabold text-4xl sm:text-5xl md:text-5xl lg:text-[56px] text-primary leading-[1.1]">
              <motion.span initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                Grow Your Practice 3x
              </motion.span>
              <br />
              <motion.span initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="text-gradient">
                with India's #1
              </motion.span>
              <br />
              <span className="relative inline-block h-[1.5em] overflow-hidden align-bottom leading-[1.4]">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={wordIndex}
                    initial={{ y: 40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -40, opacity: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="text-gradient inline-block"
                  >
                    {rotatingWords[wordIndex]}
                  </motion.span>
                </AnimatePresence>
              </span>
            </h1>

            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="text-sm md:text-lg text-muted-foreground max-w-lg leading-relaxed">
              Join <strong className="text-foreground">10,000+ doctors</strong> who automated their practice. Branded website, booking, billing & patient management — all in one. <strong className="text-foreground">7-day free trial</strong>.
            </motion.p>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }} className="flex flex-col gap-3">
              <Link to="/auth?mode=signup">
                <Button className="bg-royal hover:bg-royal/90 text-white gap-2 h-11 px-6 text-sm shadow-lg shadow-royal/20 w-full sm:w-auto">
                  Start 7-Day Free Trial <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href="#how-it-works">
                <Button variant="outline" className="h-11 px-6 text-sm border-2 w-full sm:w-auto">
                  See How It Works
                </Button>
              </a>
            </motion.div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }} className="flex flex-col sm:flex-row sm:flex-wrap gap-y-1 sm:gap-x-4 sm:gap-y-1.5 text-xs text-muted-foreground pt-1">
              {["No credit card required", "Set up in 5 minutes", "Cancel anytime"].map((t, i) => (
                <span key={t} className="flex items-center gap-1 sm:gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5 text-success shrink-0" /> {t}
                </span>
              ))}
            </motion.div>
          </motion.div>

          {/* Right — Doctor Image + Floating cards */}
          <motion.div
            initial={{ opacity: 0, x: 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
            className="relative flex justify-center mt-0 md:mt-4 lg:mt-0"
          >
            <div className="relative">
              <img src={heroDoctor} alt="Doctor using Doctylia" className="w-[230px] sm:w-[280px] lg:w-[420px] h-auto drop-shadow-2xl" />
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="hidden md:block absolute -top-1 right-0 bg-white rounded-md sm:rounded-xl shadow-lg px-1 py-0.5 sm:px-3 sm:py-2 border border-border"
              >
                <div className="flex items-center gap-0.5 sm:gap-2">
                  <div className="hidden sm:flex w-7 h-7 rounded-full bg-success/10 items-center justify-center">
                    <CheckCircle className="h-3.5 w-3.5 text-success" />
                  </div>
                  <div>
                    <div className="text-[5px] sm:text-[10px] text-muted-foreground leading-tight">Next Slot</div>
                    <div className="text-[6px] sm:text-xs font-bold text-primary leading-tight whitespace-nowrap">5:30 PM</div>
                  </div>
                </div>
              </motion.div>
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 3, delay: 1, repeat: Infinity, ease: "easeInOut" }}
                className="hidden md:block absolute bottom-6 -left-2 sm:bottom-12 sm:-left-4 bg-white rounded-md sm:rounded-xl shadow-lg px-1 py-0.5 sm:px-3 sm:py-2 border border-border"
              >
                <div className="text-[5px] sm:text-[10px] text-muted-foreground leading-tight">Revenue</div>
                <div className="text-[6px] sm:text-base font-bold text-success leading-tight whitespace-nowrap">₹1.24L ↑</div>
              </motion.div>
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 3, delay: 2, repeat: Infinity, ease: "easeInOut" }}
                className="hidden md:block absolute top-1/3 -right-1 sm:-right-2 bg-white rounded-md sm:rounded-xl shadow-lg px-1 py-0.5 sm:px-3 sm:py-2 border border-border"
              >
                <div className="text-[5px] sm:text-[10px] text-muted-foreground leading-tight">Rating</div>
                <div className="text-[6px] sm:text-xs font-bold text-warning leading-tight whitespace-nowrap">★ 4.9</div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default LandingHero;
