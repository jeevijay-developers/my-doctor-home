import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check } from "lucide-react";
import heroDoctor from "@/assets/hero-doctor.png";

const points = [
  "A branded website for your practice",
  "Online booking, patients, and prescriptions in one place",
  "Built for solo doctors and growing clinics alike",
];

const AboutSummary = () => (
  <section className="py-14 md:py-20 bg-secondary/40">
    <div className="container mx-auto px-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-10 items-center max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="order-2 sm:order-1"
        >
          <span className="text-xs md:text-sm font-semibold text-accent uppercase tracking-wider">About Doctylia</span>
          <h2 className="font-heading font-bold text-2xl sm:text-3xl md:text-4xl text-primary mt-2">
            The Complete Doctor Platform
          </h2>
          <p className="text-sm md:text-base text-muted-foreground mt-3 leading-relaxed">
            Doctylia gives every doctor a professional online presence and gives every patient a simpler
            way to find, book, and consult them — all in one place.
          </p>
          <ul className="space-y-2 mt-4">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Check className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
          <Link to="/about" className="inline-block mt-5">
            <Button variant="outline" className="gap-2 border-2">
              Learn More About Doctylia <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="order-1 sm:order-2 flex justify-center"
        >
          <img
            src={heroDoctor}
            alt="Doctor using Doctylia"
            className="h-[220px] sm:h-[260px] md:h-[300px] w-auto rounded-[20px] object-cover object-center shadow-lg"
          />
        </motion.div>
      </div>
    </div>
  </section>
);

export default AboutSummary;
