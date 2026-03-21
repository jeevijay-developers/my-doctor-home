import { Link } from "react-router-dom";
import { Facebook, Instagram, Linkedin, Youtube, Twitter } from "lucide-react";

const LandingFooter = () => (
  <footer className="bg-primary pt-14 pb-8">
    <div className="container mx-auto px-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-8 pb-10 border-b border-primary-foreground/10">
        {/* Brand */}
        <div className="col-span-2 md:col-span-1">
          <img src="/doctylia-logo.png" alt="Doctylia" className="h-8 brightness-0 invert mb-3" />
          <p className="text-sm text-primary-foreground/60 leading-relaxed">
            The Complete Doctor Platform. India's #1 AI-powered SaaS for medical practices.
          </p>
          <div className="flex gap-3 mt-4">
            {[Facebook, Instagram, Linkedin, Youtube, Twitter].map((Icon, i) => (
              <a key={i} href="#" className="w-8 h-8 rounded-full bg-primary-foreground/10 flex items-center justify-center hover:bg-royal transition-colors">
                <Icon className="h-4 w-4 text-primary-foreground/70" />
              </a>
            ))}
          </div>
        </div>
        {/* Product */}
        <div>
          <h4 className="font-heading font-semibold text-white mb-4 text-sm">Product</h4>
          <ul className="space-y-2.5 text-sm text-primary-foreground/60">
            <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
            <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
            <li><a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a></li>
            <li><a href="#faq" className="hover:text-white transition-colors">FAQ</a></li>
          </ul>
        </div>
        {/* Company */}
        <div>
          <h4 className="font-heading font-semibold text-white mb-4 text-sm">Company</h4>
          <ul className="space-y-2.5 text-sm text-primary-foreground/60">
            <li><span className="hover:text-white transition-colors cursor-pointer">About Us</span></li>
            <li><a href="#contact" className="hover:text-white transition-colors">Contact</a></li>
            <li><span className="hover:text-white transition-colors cursor-pointer">Careers</span></li>
            <li><span className="hover:text-white transition-colors cursor-pointer">Blog</span></li>
          </ul>
        </div>
        {/* Legal */}
        <div>
          <h4 className="font-heading font-semibold text-white mb-4 text-sm">Legal</h4>
          <ul className="space-y-2.5 text-sm text-primary-foreground/60">
            <li><span className="hover:text-white transition-colors cursor-pointer">Privacy Policy</span></li>
            <li><span className="hover:text-white transition-colors cursor-pointer">Terms of Service</span></li>
            <li><span className="hover:text-white transition-colors cursor-pointer">Refund Policy</span></li>
          </ul>
        </div>
        {/* Newsletter placeholder */}
        <div>
          <h4 className="font-heading font-semibold text-white mb-4 text-sm">Stay Updated</h4>
          <p className="text-xs text-primary-foreground/50 mb-3">Get tips on growing your practice.</p>
          <div className="flex">
            <input
              type="email"
              placeholder="Email"
              className="flex-1 bg-primary-foreground/10 border-none rounded-l-lg px-3 py-2 text-sm text-white placeholder:text-primary-foreground/40 outline-none"
            />
            <button className="bg-royal px-3 rounded-r-lg text-xs font-medium text-white hover:bg-royal/80 transition-colors">→</button>
          </div>
        </div>
      </div>
      <div className="flex flex-col md:flex-row items-center justify-between mt-6 gap-2">
        <div className="text-sm text-primary-foreground/40">
          © {new Date().getFullYear()} Doctylia. All Rights Reserved.
        </div>
        <div className="flex items-center gap-1.5 text-sm text-primary-foreground/40">
          Made with ❤️ in India 🇮🇳
        </div>
      </div>
    </div>
  </footer>
);

export default LandingFooter;
