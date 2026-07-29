import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { Menu, X, MessageCircle, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDoctorData } from "@/contexts/DoctorContext";
import { supabase } from "@/integrations/supabase/client";

const allNavLinks = [
  { label: "Home", target: "home", settingKey: null },
  { label: "About", target: "about", settingKey: "show_about" },
  { label: "Services", target: "services", settingKey: "show_services" },
  { label: "Reviews", target: "reviews", settingKey: "show_reviews" },
  { label: "Location", target: "contact", settingKey: null },
];

const Navbar = () => {
  const { profile, settings } = useDoctorData();
  const { slug } = useParams<{ slug: string }>();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hasPublishedBlog, setHasPublishedBlog] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!profile?.id) { setHasPublishedBlog(false); return; }
    supabase
      .from("blog_posts")
      .select("id", { count: "exact", head: true })
      .eq("doctor_id", profile.id)
      .eq("is_published", true)
      .then(({ count }) => setHasPublishedBlog((count ?? 0) > 0));
  }, [profile?.id]);

  const scrollTo = (id: string) => {
    document.getElementById(id.toLowerCase())?.scrollIntoView({ behavior: "smooth" });
    setMobileOpen(false);
  };

  const whatsappUrl = settings?.whatsapp_number
    ? `https://wa.me/${settings.whatsapp_number.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(settings.whatsapp_message || "")}`
    : "#";

  const showBlogLink = hasPublishedBlog && slug && settings?.show_blog === true;
  const navLinks = allNavLinks.filter((l) => !l.settingKey || settings?.[l.settingKey] !== false);

  return (
    <nav className="fixed top-3 sm:top-5 left-0 right-0 z-50 px-3 sm:px-6">
      <div
        className={`max-w-6xl mx-auto rounded-2xl border transition-all duration-300 ${
          scrolled
            ? "bg-card/80 backdrop-blur-xl border-border shadow-lg"
            : "bg-card/60 backdrop-blur-md border-white/40 shadow-md"
        }`}
      >
        <div className="flex items-center justify-between py-2.5 px-3 sm:px-5">
          <button onClick={() => scrollTo("home")} className="flex items-center gap-2.5 min-w-0">
            {profile?.profile_photo_url ? (
              <img src={profile.profile_photo_url} alt={profile.full_name} className="w-9 h-9 rounded-full object-cover ring-2 ring-royal/30" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-royal/10 flex items-center justify-center font-heading font-bold text-royal text-sm">
                {profile?.full_name?.charAt(0) || "D"}
              </div>
            )}
            <span className="font-heading font-bold text-primary text-sm sm:text-base truncate max-w-[140px] sm:max-w-none">
              Dr. {profile?.full_name || "Doctor"}
            </span>
          </button>

          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map((l) => (
              <button
                key={l.label}
                onClick={() => scrollTo(l.target)}
                className="px-3 py-1.5 rounded-full text-sm font-medium text-foreground/80 hover:text-royal hover:bg-royal/5 transition-colors"
              >
                {l.label}
              </button>
            ))}
            {showBlogLink && (
              <Link to={`/dr/${slug}/blog`} className="px-3 py-1.5 rounded-full text-sm font-medium text-foreground/80 hover:text-royal hover:bg-royal/5 transition-colors">
                Blog
              </Link>
            )}
            {slug && (
              <Link to={`/dr/${slug}/manage`} className="px-3 py-1.5 rounded-full text-sm font-medium text-foreground/80 hover:text-royal hover:bg-royal/5 transition-colors">
                My Appointment
              </Link>
            )}
          </div>

          <div className="flex items-center gap-2">
            {settings?.whatsapp_number && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Chat on WhatsApp"
                className="hidden sm:flex w-9 h-9 rounded-full bg-success/10 items-center justify-center text-success hover:bg-success hover:text-primary-foreground transition"
              >
                <MessageCircle size={17} />
              </a>
            )}
            <Button
              size="sm"
              className="hidden sm:inline-flex rounded-full bg-primary text-primary-foreground font-heading font-semibold shadow-sm hover:opacity-90"
              onClick={() => scrollTo("booking")}
            >
              <Calendar size={15} className="mr-1.5" /> Book
            </Button>
            <button
              className="lg:hidden p-2 rounded-full hover:bg-muted transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="lg:hidden border-t border-border px-3 pb-3 pt-2">
            {navLinks.map((l) => (
              <button
                key={l.label}
                onClick={() => scrollTo(l.target)}
                className="block w-full text-left py-2.5 px-2 text-foreground font-medium rounded-lg hover:bg-muted"
              >
                {l.label}
              </button>
            ))}
            {showBlogLink && (
              <Link to={`/dr/${slug}/blog`} onClick={() => setMobileOpen(false)} className="block w-full text-left py-2.5 px-2 text-foreground font-medium rounded-lg hover:bg-muted">
                Blog
              </Link>
            )}
            {slug && (
              <Link to={`/dr/${slug}/manage`} onClick={() => setMobileOpen(false)} className="block w-full text-left py-2.5 px-2 text-foreground font-medium rounded-lg hover:bg-muted">
                My Appointment
              </Link>
            )}
            <Button
              className="w-full mt-2 rounded-full bg-primary text-primary-foreground font-heading"
              onClick={() => scrollTo("booking")}
            >
              <Calendar size={15} className="mr-1.5" /> Book Appointment
            </Button>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
