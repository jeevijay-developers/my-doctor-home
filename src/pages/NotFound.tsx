import { useLocation, useNavigate, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Home, ArrowLeft, Stethoscope, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    const prevTitle = document.title;
    document.title = "Page Not Found (404) | Doctylia";
    const metaDesc = document.querySelector('meta[name="description"]');
    const prevDesc = metaDesc?.getAttribute("content") ?? null;
    if (metaDesc) {
      metaDesc.setAttribute(
        "content",
        "The page you are looking for could not be found on Doctylia. Return to the homepage or sign in to your clinic dashboard."
      );
    }
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => {
      document.title = prevTitle;
      if (metaDesc && prevDesc !== null) metaDesc.setAttribute("content", prevDesc);
      window.removeEventListener("scroll", onScroll);
    };
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col bg-background overflow-x-hidden">
      <LandingNavbar scrolled={scrolled} />
      <main className="flex-1 flex items-center justify-center px-4 py-20">
        <div className="max-w-lg w-full text-center space-y-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-royal/10 text-royal mx-auto">
            <Stethoscope className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-royal">Error 404</p>
            <h1 className="font-heading text-3xl sm:text-4xl font-extrabold text-primary">
              Oops! Page not found
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground max-w-md mx-auto">
              We couldn't find <code className="px-1.5 py-0.5 rounded bg-secondary text-foreground text-xs">{location.pathname}</code>. The link may have moved, expired, or been typed incorrectly.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button asChild className="bg-royal hover:bg-royal/90 text-white rounded-pill px-6">
              <Link to="/">
                <Home className="h-4 w-4 mr-2" /> Return to Home
              </Link>
            </Button>
            <Button variant="outline" className="rounded-pill px-5" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Go Back
            </Button>
          </div>
          <div className="pt-4 border-t border-border flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
            <Link to="/auth?mode=login" className="hover:text-royal transition-colors font-medium">
              Doctor Login
            </Link>
            <Link to="/about" className="hover:text-royal transition-colors font-medium">
              About Doctylia
            </Link>
            <Link to="/#contact" className="inline-flex items-center gap-1 hover:text-royal transition-colors font-medium">
              <HelpCircle className="h-3.5 w-3.5" /> Contact Support
            </Link>
          </div>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
};

export default NotFound;
