import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";

const CTABanner = () => (
  <section className="py-20 gradient-navy-teal relative overflow-hidden">
    {/* Decorative circles */}
    <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
    <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

    <div className="container mx-auto px-4 text-center relative">
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 text-white/90 text-sm font-medium mb-6">
        <Sparkles className="h-4 w-4" /> Join 10,000+ doctors already on Doctylia
      </div>
      <h2 className="font-heading font-bold text-3xl md:text-5xl text-white max-w-3xl mx-auto leading-tight">
        Ready to Grow Your Practice?
      </h2>
      <p className="text-white/75 mt-4 max-w-lg mx-auto text-lg">
        Start your free 7-day trial today. No credit card. No setup fees. Go live in minutes.
      </p>
      <Link to="/auth?mode=signup">
        <Button size="lg" className="mt-8 bg-white text-primary hover:bg-white/90 gap-2 text-base px-10 shadow-xl font-semibold">
          Start Free Trial <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    </div>
  </section>
);

export default CTABanner;
