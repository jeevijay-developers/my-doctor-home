import { motion } from "framer-motion";
import { Shield, CheckCircle } from "lucide-react";

const guarantees = [
  "7-Day Free Trial",
  "No Credit Card Required",
  "Cancel Anytime",
  "Full Data Export",
  "30-Day Money Back",
];

const Guarantee = () => (
  <section className="py-10 md:py-14 bg-secondary border-y border-border/50">
    <div className="container mx-auto px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="max-w-3xl mx-auto text-center"
      >
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-success/10 mb-4">
          <Shield className="h-8 w-8 text-success" />
        </div>
        <h3 className="font-heading font-bold text-xl md:text-2xl text-primary mb-2">
          100% Risk-Free Guarantee
        </h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-lg mx-auto">
          We're so confident you'll love Doctylia that we offer a no-questions-asked guarantee. Try everything free for 7 days.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 md:gap-5">
          {guarantees.map((g) => (
            <div key={g} className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <CheckCircle className="h-4 w-4 text-success shrink-0" />
              {g}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  </section>
);

export default Guarantee;
