import { motion } from "framer-motion";
import { X, Check, ArrowRight, TrendingUp, IndianRupee } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const withoutItems = [
  "Missed calls = lost patients",
  "Paper records pile up & get lost",
  "No online presence on Google",
  "Manual billing with GST headaches",
  "Patients forget appointments",
  "No way to collect reviews",
];

const withItems = [
  "24/7 online booking — never miss a patient",
  "Digital patient records, searchable & secure",
  "Branded website ranking on Google",
  "Auto-generated GST invoices & payment tracking",
  "WhatsApp reminders reduce no-shows by 70%",
  "Collect & showcase 5-star reviews automatically",
];

const BeforeAfter = () => (
  <section className="py-14 md:py-20 bg-secondary">
    <div className="container mx-auto px-4">
      <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
        <span className="text-xs md:text-sm font-semibold text-accent uppercase tracking-wider">The Difference</span>
        <h2 className="font-heading font-bold text-2xl sm:text-3xl md:text-4xl text-primary mt-2">
          See the Transformation
        </h2>
        <p className="text-sm md:text-base text-muted-foreground mt-3">
          Thousands of doctors have switched from chaos to clarity. Here's what changes.
        </p>
      </div>

      {/* ROI stats callout row */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        className="max-w-2xl mx-auto mb-8 md:mb-10 grid grid-cols-1 sm:grid-cols-3 gap-3"
      >
        <div className="bg-white rounded-xl p-4 flex items-center gap-3 border border-border shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-royal/10 flex items-center justify-center shrink-0">
            <TrendingUp className="h-5 w-5 text-royal" />
          </div>
          <div>
            <div className="font-heading font-extrabold text-lg text-primary">14 hrs/week</div>
            <div className="text-xs text-muted-foreground">Time saved per doctor</div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 flex items-center gap-3 border border-border shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
            <IndianRupee className="h-5 w-5 text-success" />
          </div>
          <div>
            <div className="font-heading font-extrabold text-lg text-primary">₹2.4 Cr+</div>
            <div className="text-xs text-muted-foreground">Revenue generated</div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 flex items-center gap-3 border border-border shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-teal/10 flex items-center justify-center shrink-0">
            <Check className="h-5 w-5 text-teal" />
          </div>
          <div>
            <div className="font-heading font-extrabold text-lg text-primary">98%</div>
            <div className="text-xs text-muted-foreground">Satisfaction rate</div>
          </div>
        </div>
      </motion.div>

      <div className="grid md:grid-cols-2 gap-5 md:gap-6 max-w-4xl mx-auto">
        {/* Without */}
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="rounded-2xl border-2 border-destructive/20 bg-white p-6 md:p-8 hover:shadow-lg transition-shadow"
        >
          <div className="rounded-xl overflow-hidden mb-5 h-32">
            <img
              src="https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=500&h=200&fit=crop&q=80"
              alt="Cluttered desk with papers"
              className="w-full h-full object-cover opacity-80"
              loading="lazy"
            />
          </div>
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center">
              <X className="h-4 w-4 text-destructive" />
            </div>
            <h3 className="font-heading font-bold text-lg text-destructive">Without Doctylia</h3>
          </div>
          <ul className="space-y-3.5">
            {withoutItems.map((item, i) => (
              <motion.li
                key={item}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="flex items-start gap-3 text-sm text-muted-foreground"
              >
                <X className="h-4 w-4 text-destructive/60 mt-0.5 shrink-0" />
                {item}
              </motion.li>
            ))}
          </ul>
        </motion.div>

        {/* With */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="rounded-2xl border-2 border-success/20 bg-white p-6 md:p-8 hover:shadow-lg transition-shadow"
        >
          <div className="rounded-xl overflow-hidden mb-5 h-32">
            <img
              src="https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=500&h=200&fit=crop&q=80"
              alt="Clean digital dashboard"
              className="w-full h-full object-cover opacity-80"
              loading="lazy"
            />
          </div>
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
              <Check className="h-4 w-4 text-success" />
            </div>
            <h3 className="font-heading font-bold text-lg text-success">With Doctylia</h3>
          </div>
          <ul className="space-y-3.5">
            {withItems.map((item, i) => (
              <motion.li
                key={item}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="flex items-start gap-3 text-sm text-foreground font-medium"
              >
                <Check className="h-4 w-4 text-success mt-0.5 shrink-0" />
                {item}
              </motion.li>
            ))}
          </ul>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mt-8"
      >
        <Link to="/auth?mode=signup">
          <Button className="bg-royal hover:bg-royal/90 text-white gap-2 shadow-md shadow-royal/20">
            Make the Switch Today <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </motion.div>
    </div>
  </section>
);

export default BeforeAfter;
