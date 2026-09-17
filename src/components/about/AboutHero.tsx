import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, HeartPulse, CheckCircle } from "lucide-react";
import heroDoctor from "@/assets/hero-doctor.png";

const AboutHero = () => (
  <section className="pt-24 pb-10 md:pt-32 md:pb-16 bg-gradient-to-br from-white via-secondary to-cloud-blue overflow-hidden relative">
    <motion.div
      animate={{ scale: [1, 1.2, 1], opacity: [0.05, 0.08, 0.05] }}
      transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      className="absolute top-10 right-10 w-48 md:w-72 h-48 md:h-72 bg-royal rounded-full blur-3xl"
    />

    <div className="container mx-auto px-4 relative">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-10 items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="space-y-4 md:space-y-5"
        >
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-ai-purple/10 text-ai-purple text-xs font-semibold">
            <HeartPulse className="h-3 w-3" /> About Us
          </span>
          <h1 className="font-heading font-extrabold text-3xl sm:text-4xl md:text-5xl leading-tight text-primary">
            The Complete <span className="text-gradient">Doctor Platform</span>
          </h1>
          <p className="text-sm md:text-lg text-muted-foreground max-w-lg leading-relaxed">
            Doctylia gives every doctor a professional online presence and gives every patient a simpler
            way to find, book, and consult them — all in one place.
          </p>
          <div className="flex flex-row gap-2 sm:gap-3 pt-1">
            <Link to="/auth?mode=signup" className="flex-1 min-w-0">
              <Button className="bg-royal hover:bg-royal/90 text-white gap-2 h-11 px-3 text-xs sm:text-sm sm:px-5 shadow-lg shadow-royal/20 w-full">
                Get Started <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href="#what-we-offer" className="flex-1 min-w-0">
              <Button variant="outline" className="h-11 px-3 text-xs sm:text-sm sm:px-5 border-2 w-full">
                Explore Features
              </Button>
            </a>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
          className="relative flex justify-center"
        >
          <img
            src={heroDoctor}
            alt="Doctor using Doctylia"
            className="h-[260px] sm:h-[320px] md:h-[380px] w-auto rounded-[24px] object-cover object-center drop-shadow-2xl"
          />

          {/* Floating stat cards — same style/copy as the homepage hero */}
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="hidden md:block absolute -top-1 right-0 bg-white rounded-xl shadow-lg px-3 py-2 border border-border"
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle className="h-3.5 w-3.5 text-success" />
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground leading-tight">Next Slot</div>
                <div className="text-xs font-bold text-primary leading-tight whitespace-nowrap">5:30 PM</div>
              </div>
            </div>
          </motion.div>
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 3, delay: 1, repeat: Infinity, ease: "easeInOut" }}
            className="hidden md:block absolute bottom-12 -left-4 bg-white rounded-xl shadow-lg px-3 py-2 border border-border"
          >
            <div className="text-[10px] text-muted-foreground leading-tight">Revenue</div>
            <div className="text-base font-bold text-success leading-tight whitespace-nowrap">₹1.24L ↑</div>
          </motion.div>
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 3, delay: 2, repeat: Infinity, ease: "easeInOut" }}
            className="hidden md:block absolute top-1/3 -right-2 bg-white rounded-xl shadow-lg px-3 py-2 border border-border"
          >
            <div className="text-[10px] text-muted-foreground leading-tight">Rating</div>
            <div className="text-xs font-bold text-warning leading-tight whitespace-nowrap">★ 4.9</div>
          </motion.div>

          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="md:hidden absolute right-2 top-3 rounded-[18px] bg-white/90 px-3 py-2 shadow-[0_10px_18px_rgba(27,37,54,0.12)] ring-1 ring-[#e8edf5]"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#dff7eb]">
                <CheckCircle className="h-4 w-4 text-[#1fa36c]" />
              </div>
              <div>
                <div className="text-[10px] text-[#5d6f83]">Next Slot</div>
                <div className="text-[13px] font-semibold text-[#1c2e3d]">5:30 PM</div>
              </div>
            </div>
          </motion.div>
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 3, delay: 1, repeat: Infinity, ease: "easeInOut" }}
            className="md:hidden absolute bottom-7 left-3 rounded-[18px] bg-white/90 px-3 py-2 shadow-[0_10px_18px_rgba(27,37,54,0.12)] ring-1 ring-[#e8edf5]"
          >
            <div className="text-[10px] text-[#5d6f83]">Revenue</div>
            <div className="text-[13px] font-semibold text-[#1fa36c]">₹1.24L ↑</div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  </section>
);

export default AboutHero;
