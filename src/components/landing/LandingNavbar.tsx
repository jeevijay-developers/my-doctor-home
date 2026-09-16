import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";

const LandingNavbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const onLandingPage = location.pathname === "/";
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Tapping/clicking anywhere outside the open mobile/tablet menu closes it —
  // except the toggle button, which already opens/closes it via its own
  // onClick (excluding it here avoids that same tap re-closing what it just
  // opened, or double-toggling on close).
  useEffect(() => {
    if (!mobileOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (mobileMenuRef.current?.contains(target)) return;
      if (mobileToggleRef.current?.contains(target)) return;
      setMobileOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [mobileOpen]);

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
          {navLinks.map((link) => {
            const linkClassName = "text-sm font-medium text-muted-foreground hover:text-royal transition-colors relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-0.5 after:bg-royal after:transition-all hover:after:w-full";
            return onLandingPage ? (
              <a key={link.label} href={link.href} className={linkClassName}>{link.label}</a>
            ) : (
              <Link key={link.label} to={`/${link.href}`} className={linkClassName}>{link.label}</Link>
            );
          })}
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

        <button ref={mobileToggleRef} className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/*
        Always mounted (not conditionally rendered) so both the open AND
        close transitions can actually play — a conditionally-rendered panel
        would unmount instantly on close with no time to animate. Visibility
        is driven purely by the translate-x transform; `fixed` positioning
        keeps it out of normal document flow so sliding it off-screen to the
        right never triggers horizontal page overflow.
      */}
      <div
        ref={mobileMenuRef}
        className={`md:hidden fixed top-16 right-0 z-50 w-3/4 max-w-xs max-h-[calc(100vh-4rem)] bg-white border-l border-border shadow-lg px-4 pt-4 pb-10 space-y-3 overflow-y-auto transition-transform duration-300 ease-in-out ${
          mobileOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!mobileOpen}
      >
        {navLinks.map((link) => {
          const mobileLinkClassName = "block text-sm font-medium text-muted-foreground py-1";
          return onLandingPage ? (
            <a key={link.label} href={link.href} className={mobileLinkClassName} onClick={() => setMobileOpen(false)}>{link.label}</a>
          ) : (
            <Link key={link.label} to={`/${link.href}`} className={mobileLinkClassName} onClick={() => setMobileOpen(false)}>{link.label}</Link>
          );
        })}
        <div className="flex gap-2 pt-3">
          <Link to="/auth?mode=login" className="flex-1">
            <Button variant="outline" className="w-full" size="sm">Login</Button>
          </Link>
          <Link to="/auth?mode=signup" className="flex-1">
            <Button className="w-full bg-royal text-white" size="sm">Start Free Trial</Button>
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default LandingNavbar;
