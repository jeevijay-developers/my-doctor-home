import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";

const CTABanner = () => (
  <section className="py-16 md:py-20 gradient-navy-teal relative overflow-hidden">
    {/* Decorative circles */}
    <div className="absolute top-0 right-0 w-48 md:w-64 h-48 md:h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
    <div className="absolute bottom-0 left-0 w-36 md:w-48 h-36 md:h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

    <div className="container mx-auto px-4 text-center relative">
      <div className="inline-flex items-center gap-2 px-3 md:px-4 py-1.5 rounded-full bg-white/10 text-white/90 text-xs md:text-sm font-medium mb-5 md:mb-6">
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
    </div>
  </section>
);

export default CTABanner;
