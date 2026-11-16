import { Link, useLocation } from "react-router-dom";
import { Facebook, Instagram, Linkedin, Twitter, Receipt, Lock } from "lucide-react";
import { DIRECTORY_HIDDEN } from "@/lib/siteSwitches";

const SOCIAL_LINKS = [
  { Icon: Facebook, label: "Doctylia on Facebook", href: "https://www.facebook.com/share/1K9HHgUwAP/" },
  { Icon: Instagram, label: "Doctylia on Instagram", href: "https://www.instagram.com/doctylia_official/" },
  { Icon: Linkedin, label: "Doctylia on LinkedIn", href: "https://www.linkedin.com/in/doctylia-smart-clinic-management-258576435" },
  { Icon: Twitter, label: "Doctylia on X", href: "https://x.com/smartclinisf" },
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
      <a href={hash} className="transition-colors hover:text-primary">{label}</a>
    ) : (
      <Link to={`/${hash}`} className="transition-colors hover:text-primary">{label}</Link>
    );

  const col = "mb-3 font-heading text-[15px] font-semibold text-navy";
  const list = "space-y-2.5 text-[13px] text-muted-foreground";
  const lnk = "transition-colors hover:text-primary";

  return (
    <footer className="w-full bg-secondary">
      <div className="mx-auto max-w-[1440px] px-4 pb-6 pt-10 md:px-8 md:pt-14">
        <div className="grid grid-cols-1 gap-10 pb-10 lg:grid-cols-12">
          <div className="flex flex-col gap-4 lg:col-span-5">
            <Link to="/" onClick={handleHomeClick} className="inline-block">
              <img src="/doctylia-logo.webp" alt="Doctylia" loading="lazy" decoding="async" className="h-7 w-auto" />
            </Link>
            <div className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              Empowering doctors with next-generation automated billing, scheduling, and patient management.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                <Receipt className="h-3.5 w-3.5 text-teal" /> GST Compliant
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                <Lock className="h-3.5 w-3.5 text-primary" /> 256-bit Encryption
              </span>
            </div>
            <div className="flex gap-3">
              {SOCIAL_LINKS.map(({ Icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-card transition-colors hover:bg-royal hover:text-white"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6 lg:col-span-7 lg:gap-8">
            <div>
              <h4 className={col}>Product</h4>
              <ul className={list}>
                <li><Link to="/features" className={lnk}>Features</Link></li>
                <li>{renderSectionLink("#specialties", "Specialties")}</li>
                <li><Link to="/pricing" className={lnk}>Pricing</Link></li>
                <li>{renderSectionLink("#how-it-works", "How It Works")}</li>
                <li>{renderSectionLink("#faq", "FAQ")}</li>
              </ul>
            </div>
            <div>
              <h4 className={col}>Company</h4>
              <ul className={list}>
                <li><Link to="/about" onClick={handleAboutUsClick} className={lnk}>About Us</Link></li>
                {!DIRECTORY_HIDDEN && <li><Link to="/doctors" className={lnk}>Find a Doctor</Link></li>}
                <li><Link to="/health-articles" className={lnk}>Blog</Link></li>
                <li>{renderSectionLink("#contact", "Contact")}</li>
              </ul>
            </div>
            <div>
              <h4 className={col}>Legal</h4>
              <ul className={list}>
                <li><Link to="/privacy" className={lnk}>Privacy Policy</Link></li>
                <li><Link to="/terms" className={lnk}>Terms of Service</Link></li>
                <li><Link to="/refund-policy" className={lnk}>Refund Policy</Link></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-2 border-t border-border pt-5 text-xs text-muted-foreground md:flex-row">
          <div className="text-center md:text-left">
            © {new Date().getFullYear()} Doctylia by <a href="https://jeevijay.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-primary">Jeevijay Technologies Pvt. Ltd.</a> All Rights Reserved.
          </div>
          <div>Made in India 🇮🇳</div>
        </div>
      </div>
    </footer>
  );
};

export default LandingFooter;
