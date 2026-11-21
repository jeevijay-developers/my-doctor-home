import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CalendarDays, Rocket } from "lucide-react";

const CTABanner = () => (
  <section id="trial" className="relative overflow-hidden bg-gradient-to-br from-navy via-primary to-navy py-16 text-white md:py-20">
    <div className="container mx-auto px-4">
      <div className="mx-auto max-w-4xl space-y-6 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur-md">
          <span className="h-2 w-2 rounded-full bg-teal" aria-hidden="true" />
          Start Modernizing Your Practice Today
        </span>
        <h2 className="font-heading text-2xl font-bold leading-tight text-white sm:text-3xl md:text-4xl">
          Reclaim 10+ Hours Every Week and Delight Your Patients
        </h2>
        <p className="mx-auto max-w-2xl text-white/80">
          Join over 2,500 doctors across India who switched from administrative chaos to effortless autonomous practice management with Doctylia.
        </p>
        <div className="flex flex-col items-center justify-center gap-4 pt-2 sm:flex-row">
          <Link to="/auth?mode=signup" className="w-full sm:w-auto">
            <Button size="lg" className="w-full gap-2 bg-white font-bold text-navy shadow-xl hover:bg-white/90 sm:w-auto">
              <Rocket className="h-5 w-5 text-primary" aria-hidden="true" /> Claim Your 7-Day Free Trial
            </Button>
          </Link>
          <Link
            to="/contact?topic=demo"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-white/10 px-8 text-sm font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/20 sm:w-auto"
          >
            <CalendarDays className="h-5 w-5" aria-hidden="true" /> Schedule Clinic Walkthrough
          </Link>
        </div>
        <div className="pt-2 text-sm text-white/70">
          ✓ No credit card required • Instant automated setup in 10 minutes • Dedicated phone onboarding support
        </div>
      </div>
    </div>
  </section>
);

export default CTABanner;
