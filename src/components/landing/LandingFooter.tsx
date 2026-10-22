import { Link, useLocation } from "react-router-dom";
import { Facebook, Instagram, Linkedin, Youtube, Twitter } from "lucide-react";

const SOCIAL_LINKS = [
  { Icon: Facebook, label: "Doctylia on Facebook", href: "https://facebook.com/doctylia" },
  { Icon: Instagram, label: "Doctylia on Instagram", href: "https://instagram.com/doctylia" },
  { Icon: Linkedin, label: "Doctylia on LinkedIn", href: "https://linkedin.com/company/doctylia" },
  { Icon: Youtube, label: "Doctylia on YouTube", href: "https://youtube.com/@doctylia" },
  { Icon: Twitter, label: "Doctylia on X", href: "https://x.com/doctylia" },
];

const LandingFooter = () => {
  const location = useLocation();
  const onLandingPage = location.pathname === "/";

  // Clicking "About Us" while already on "/about" is a same-route Link,
  // which React Router treats as a no-op - nothing happens, not even a
  // scroll. Scroll to top ourselves in that case; from any other page the
  // normal Link navigation (plus ScrollToTop in App.tsx) already lands at
  // the top of /about.
  const handleAboutUsClick = (e: React.MouseEvent) => {
    if (location.pathname === "/about") {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleHomeClick = (e: React.MouseEvent) => {
    if (onLandingPage) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const renderSectionLink = (hash: string, label: string) =>
    onLandingPage ? (
      <a href={hash} className="hover:text-white transition-colors">{label}</a>
    ) : (
      <Link to={`/${hash}`} className="hover:text-white transition-colors">{label}</Link>
    );

  return (
    <footer className="bg-primary pt-10 md:pt-14 pb-6 md:pb-8">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-3 md:grid-cols-4 gap-6 md:gap-8 pb-8 md:pb-10 border-b border-primary-foreground/10">
          {/* Brand */}
          <div className="col-span-3 md:col-span-1">
            <Link to="/" onClick={handleHomeClick} className="inline-block mb-3">
              <img src="/doctylia-logo.webp" alt="Doctylia" loading="lazy" decoding="async" className="h-8 brightness-0 invert" />
            </Link>
            <p className="text-sm text-primary-foreground/60 leading-relaxed">
              The Complete Doctor Platform. India's #1 AI-powered SaaS for medical practices.
            </p>
            <div className="flex gap-3 mt-4">
              {SOCIAL_LINKS.map(({ Icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="w-8 h-8 rounded-full bg-primary-foreground/10 flex items-center justify-center hover:bg-royal transition-colors"
                >
                  <Icon className="h-4 w-4 text-primary-foreground/70" />
                </a>
              ))}
            </div>
          </div>
          {/* Product */}
          <div>
            <h4 className="font-heading font-semibold text-white mb-3 md:mb-4 text-sm">Product</h4>
            <ul className="space-y-2 md:space-y-2.5 text-sm text-primary-foreground/60">
              <li>{renderSectionLink("#features", "Features")}</li>
              <li>{renderSectionLink("#pricing", "Pricing")}</li>
              <li>{renderSectionLink("#how-it-works", "How It Works")}</li>
              <li>{renderSectionLink("#faq", "FAQ")}</li>
            </ul>
          </div>
          {/* Company */}
          <div>
            <h4 className="font-heading font-semibold text-white mb-3 md:mb-4 text-sm">Company</h4>
            <ul className="space-y-2 md:space-y-2.5 text-sm text-primary-foreground/60">
              <li><Link to="/about" onClick={handleAboutUsClick} className="hover:text-white transition-colors">About Us</Link></li>
              <li>{renderSectionLink("#contact", "Contact")}</li>
            </ul>
          </div>
          {/* Legal */}
          <div>
            <h4 className="font-heading font-semibold text-white mb-3 md:mb-4 text-sm">Legal</h4>
            <ul className="space-y-2 md:space-y-2.5 text-sm text-primary-foreground/60">
              <li><Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
              <li><Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
              <li><Link to="/refund-policy" className="hover:text-white transition-colors">Refund Policy</Link></li>
            </ul>
          </div>
        </div>
        <div className="flex flex-col md:flex-row items-center justify-between mt-5 md:mt-6 gap-2 md:gap-3">
          <div className="text-xs md:text-sm text-primary-foreground/40 text-center md:text-left">
            © {new Date().getFullYear()} Doctylia by <a href="https://jeevijay.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors underline underline-offset-2">Jeevijay Technologies Pvt. Ltd.</a> All Rights Reserved.
          </div>
          <div className="flex items-center gap-1.5 text-xs md:text-sm text-primary-foreground/40">
            A product by <a href="https://jeevijay.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Jeevijay Technologies</a> · Made in India 🇮🇳
          </div>
        </div>
      </div>
    </footer>
  );
};

export default LandingFooter;
