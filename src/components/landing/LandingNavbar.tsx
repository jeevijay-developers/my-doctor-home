import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";

const LandingNavbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLinks = [
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Pricing", href: "#pricing" },
    { label: "FAQ", href: "#faq" },
    { label: "Contact", href: "#contact" },
  ];

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? "bg-white/60 shadow-lg backdrop-blur-2xl border-b border-border/30" : "bg-transparent"}`}>
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <Link to="/" className="flex items-center">
          <img src="/doctylia-logo.png" alt="Doctylia" className="h-9" />
        </Link>

        <div className="hidden md:flex items-center gap-7">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm font-medium text-muted-foreground hover:text-royal transition-colors relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-0.5 after:bg-royal after:transition-all hover:after:w-full"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link to="/auth?mode=login">
            <Button variant="ghost" size="sm" className="text-primary font-medium">Login</Button>
          </Link>
          <Link to="/auth?mode=signup">
            <Button size="sm" className="bg-royal hover:bg-royal/90 text-white font-semibold shadow-sm">
              Start Free Trial
            </Button>
          </Link>
        </div>

        <button className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-border px-4 py-4 space-y-3 shadow-lg">
          {navLinks.map((link) => (
            <a key={link.label} href={link.href} className="block text-sm font-medium text-muted-foreground py-1" onClick={() => setMobileOpen(false)}>
              {link.label}
            </a>
          ))}
          <div className="flex gap-2 pt-3">
            <Link to="/auth?mode=login" className="flex-1">
              <Button variant="outline" className="w-full" size="sm">Login</Button>
            </Link>
            <Link to="/auth?mode=signup" className="flex-1">
              <Button className="w-full bg-royal text-white" size="sm">Start Free Trial</Button>
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
};

export default LandingNavbar;
