import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
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

  // Clicking "Home" while already on "/" is a same-route Link, which React
  // Router treats as a no-op - nothing happens, not even a scroll. Scroll to
  // top ourselves in that case (mirrors LandingFooter's "About Us" handling
  // of the same same-route issue); from any other page the normal Link
  // navigation (plus ScrollToTop in App.tsx) already lands at the top.
  const handleHomeClick = (e: React.MouseEvent) => {
    if (location.pathname === "/") {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Tapping/clicking anywhere outside the open mobile/tablet menu closes it -
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

  const NAV_LINKS: { label: string; to: string; hash?: string }[] = [
    { label: "Features", to: "/features" },
    { label: "Pricing", to: "/pricing" },
    { label: "Blog", to: "/health-articles" },
    { label: "Find a Doctor", to: "/doctors" },
    { label: "FAQ", to: "/", hash: "#faq" },
  ];

  const linkClass =
    "text-sm font-semibold text-muted-foreground transition-colors hover:text-primary";
  const demoClass =
    "inline-flex items-center justify-center rounded-full bg-royal px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary active:scale-[0.98]";

  const renderLink = (link: (typeof NAV_LINKS)[number], className: string, onClick?: () => void) =>
    link.hash && onLandingPage ? (
      <a key={link.label} href={link.hash} className={className} onClick={onClick}>{link.label}</a>
    ) : (
      <Link key={link.label} to={link.hash ? `${link.to}${link.hash}` : link.to} className={className} onClick={onClick}>
        {link.label}
      </Link>
    );

  const renderDemo = (className: string, onClick?: () => void) =>
    onLandingPage ? (
      <a href="#contact" className={className} onClick={onClick}>Book Demo</a>
    ) : (
      <Link to="/#contact" className={className} onClick={onClick}>Book Demo</Link>
    );

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-border/40 bg-white/90 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 md:h-20 md:px-8">
        <div className="flex flex-shrink-0 items-center">
          <Link to="/" onClick={handleHomeClick} aria-label="Doctylia home" className="flex items-center">
            <img src="/doctylia-logo.webp" alt="Doctylia" className="h-8 w-auto md:h-9" />
          </Link>
        </div>

        <nav aria-label="Main" className="hidden items-center gap-6 lg:flex xl:gap-8">
          {NAV_LINKS.map((link) => renderLink(link, linkClass))}
        </nav>

        <div className="hidden flex-shrink-0 items-center gap-5 lg:flex">
          <Link to="/auth?mode=login" className="text-sm font-semibold text-navy transition-colors hover:text-primary">
            Doctor Login
          </Link>
          {renderDemo(demoClass)}
        </div>

        <button
          ref={mobileToggleRef}
          className="lg:hidden"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Always mounted so open and close transitions both animate; `fixed` keeps the
          off-screen panel from causing horizontal overflow. */}
      <div
        ref={mobileMenuRef}
        className={`fixed right-0 top-16 z-50 max-h-[calc(100vh-4rem)] w-3/4 max-w-xs space-y-3 overflow-y-auto border-l border-border bg-white px-4 pb-10 pt-4 shadow-lg transition-transform duration-300 ease-in-out lg:hidden ${
          mobileOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!mobileOpen}
      >
        {NAV_LINKS.map((link) => renderLink(link, "block py-1 text-sm font-semibold text-muted-foreground", () => setMobileOpen(false)))}
        <div className="flex gap-2 pt-3">
          <Link to="/auth?mode=login" className="flex-1" onClick={() => setMobileOpen(false)}>
            <span className="inline-flex w-full items-center justify-center rounded-full border border-border py-2 text-sm font-semibold text-navy">Doctor Login</span>
          </Link>
          {renderDemo("flex-1 inline-flex items-center justify-center rounded-full bg-royal py-2 text-sm font-semibold text-white", () => setMobileOpen(false))}
        </div>
      </div>
    </header>
  );
};

export default LandingNavbar;
