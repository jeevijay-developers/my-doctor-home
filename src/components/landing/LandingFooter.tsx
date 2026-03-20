import { Link } from "react-router-dom";

const LandingFooter = () => (
  <footer className="bg-primary py-12">
    <div className="container mx-auto px-4">
      <div className="grid md:grid-cols-4 gap-8">
        <div>
          <img src="/doctylia-logo.png" alt="Doctylia" className="h-8 brightness-0 invert mb-3" />
          <p className="text-sm text-primary-foreground/60">
            The Complete Doctor Platform. India's #1 AI-powered SaaS for medical practices.
          </p>
        </div>
        <div>
          <h4 className="font-heading font-semibold text-white mb-3">Product</h4>
          <ul className="space-y-2 text-sm text-primary-foreground/60">
            <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
            <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
            <li><a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a></li>
          </ul>
        </div>
        <div>
          <h4 className="font-heading font-semibold text-white mb-3">Company</h4>
          <ul className="space-y-2 text-sm text-primary-foreground/60">
            <li><span className="hover:text-white transition-colors cursor-pointer">About Us</span></li>
            <li><span className="hover:text-white transition-colors cursor-pointer">Contact</span></li>
            <li><span className="hover:text-white transition-colors cursor-pointer">Careers</span></li>
          </ul>
        </div>
        <div>
          <h4 className="font-heading font-semibold text-white mb-3">Legal</h4>
          <ul className="space-y-2 text-sm text-primary-foreground/60">
            <li><span className="hover:text-white transition-colors cursor-pointer">Privacy Policy</span></li>
            <li><span className="hover:text-white transition-colors cursor-pointer">Terms of Service</span></li>
            <li><span className="hover:text-white transition-colors cursor-pointer">Refund Policy</span></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-primary-foreground/10 mt-10 pt-6 text-center text-sm text-primary-foreground/40">
        © {new Date().getFullYear()} Doctylia. All Rights Reserved. Made with ❤️ in India.
      </div>
    </div>
  </footer>
);

export default LandingFooter;
