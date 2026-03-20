import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const CTABanner = () => (
  <section className="py-20 gradient-navy-teal">
    <div className="container mx-auto px-4 text-center">
      <h2 className="font-heading font-bold text-3xl md:text-4xl text-white">
        Ready to Grow Your Practice?
      </h2>
      <p className="text-white/80 mt-3 max-w-lg mx-auto">
        Join 10,000+ doctors who have already digitized their practice with Doctylia. Start your free 7-day trial today.
      </p>
      <Link to="/auth?mode=signup">
        <Button size="lg" className="mt-8 bg-white text-primary hover:bg-white/90 gap-2 text-base px-8">
          Start Free Trial <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    </div>
  </section>
);

export default CTABanner;
