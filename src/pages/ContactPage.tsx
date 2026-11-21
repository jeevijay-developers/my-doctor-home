import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, CalendarCheck, CheckCircle2, HelpCircle, Mail, MapPin, Phone, Sparkles } from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import MobileCarousel from "@/components/landing/MobileCarousel";
import ContactEnquiryForm from "@/components/contact/ContactEnquiryForm";
import { topicFromParam } from "@/components/contact/contactTopics";
import { useDocumentHead } from "@/hooks/useDocumentHead";
import { INDEXABLE } from "@/lib/seo/injectHead";
import { isSupportOnline, SUPPORT_HOURS_LABEL } from "@/lib/contactHours";

const EMAIL = "support@doctylia.com";
const PHONE_DISPLAY = "+91 86194 83010";
const PHONE_TEL = "+918619483010";
const ADDRESS = "22, Second Floor, Jeevijay Technologies Pvt. Ltd., Aerodrome, Behind Modern Petrol Pump, Kota, Rajasthan";

const CONTACT_ROWS = [
  { icon: Mail, label: "Email", value: EMAIL, href: `mailto:${EMAIL}` },
  { icon: Phone, label: "Phone", value: PHONE_DISPLAY, href: `tel:${PHONE_TEL}` },
  { icon: MapPin, label: "Office", value: ADDRESS, href: undefined },
];

const ContactPage = () => {
  const [params, setParams] = useSearchParams();
  const topic = topicFromParam(params.get("topic"));
  const online = isSupportOnline();

  // Braces matter: an effect must not return scrollTo's result, or React treats it as a cleanup function
  // and crashes with "destroy is not a function" when the visitor leaves the page.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  useDocumentHead({
    title: "Contact Us | Doctylia",
    description:
      "Contact the Doctylia team for a live demo, pricing help or support. Send an enquiry and we reply within 24 hours, Monday to Saturday.",
    canonical: `${window.location.origin}/contact`,
    robots: INDEXABLE,
  });

  const chooseDemo = () => {
    setParams({ topic: "demo" }, { replace: true });
    document.getElementById("enquiry-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const helpCards = [
    {
      icon: CalendarCheck,
      title: "Book a live demo",
      body: "See appointments, patient records and GST billing working together, with a walkthrough for your specialty.",
      cta: "Request a demo",
      onClick: chooseDemo,
    },
    {
      icon: HelpCircle,
      title: "Frequently asked questions",
      body: "Quick answers on plans, setup time, importing patients and staff access.",
      cta: "Read the FAQ",
      to: "/#faq",
    },
    {
      icon: Sparkles,
      title: "Explore the platform",
      body: "Learn how the branded booking website and the clinic management panel fit together.",
      cta: "View all features",
      to: "/features",
    },
  ];

  const ctaClass = "mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline";

  return (
    <div className="landing-page min-h-screen overflow-x-hidden bg-background font-body">
      <LandingNavbar />
      <main className="pt-20">
        {/* Hero */}
        <section className="container mx-auto px-4 pb-8 pt-10 text-center md:pt-14" aria-labelledby="contact-heading">
          <span className="inline-flex items-center gap-2 rounded-full bg-card px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-primary shadow-sm">
            <span className="h-2 w-2 rounded-full bg-spark" aria-hidden="true" /> We reply within 24 hours
          </span>
          <h1 id="contact-heading" className="mx-auto mt-4 max-w-3xl font-heading text-3xl font-extrabold tracking-tight text-navy sm:text-4xl md:text-5xl">
            Let's talk about your practice
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-lg">
            Questions about plans, a live demo or setting up your clinic? Send us a message and our team will get back to you.
          </p>
          <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs font-semibold text-muted-foreground sm:gap-x-6 sm:text-[13px]">
            {["No credit card required", "Set up in under 10 minutes"].map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" /> {t}
              </li>
            ))}
          </ul>
        </section>

        {/* Form + contact details. The form comes first on mobile. */}
        <section className="container mx-auto px-4 py-8">
          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-12 lg:gap-8">
            <div className="lg:order-2 lg:col-span-7">
              <ContactEnquiryForm initialTopic={topic} />
            </div>

            <aside
              aria-label="Contact details"
              className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy to-royal p-6 text-white shadow-xl sm:p-8 lg:order-1 lg:col-span-5"
            >
              <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-teal/20 blur-3xl" aria-hidden="true" />
              <div className="relative">
                <h2 className="font-heading text-2xl font-bold text-white">Get in touch</h2>
                <p className="mt-1 text-sm text-white/75">Reach the Doctylia team directly.</p>

                <ul className="mt-6 space-y-5">
                  {CONTACT_ROWS.map(({ icon: Icon, label, value, href }) => (
                    <li key={label} className="flex items-start gap-3.5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                        <Icon className="h-5 w-5 text-teal-bright" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-white/60">{label}</div>
                        {href ? (
                          <a href={href} className="break-words text-base font-semibold text-white hover:underline">
                            {value}
                          </a>
                        ) : (
                          <div className="break-words text-sm leading-relaxed text-white/90">{value}</div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="mt-7 rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-white/70">Support hours</span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        online ? "bg-success/20 text-white" : "bg-white/15 text-white/80"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-spark" : "bg-white/50"}`} aria-hidden="true" />
                      {online ? "Team online" : "Offline now"}
                    </span>
                  </div>
                  <p className="mt-1.5 text-base font-semibold text-white">{SUPPORT_HOURS_LABEL}</p>
                  {!online && <p className="mt-1 text-xs text-white/70">Messages sent now are answered on the next working day.</p>}
                </div>

                <div className="mt-7">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-white/70">What happens next</h3>
                  <ol className="mt-3 space-y-3">
                    {[
                      "You send us your details and what you need.",
                      "We reply by phone or email within 24 hours.",
                      "We answer your questions or set up a demo for your clinic.",
                    ].map((step, i) => (
                      <li key={step} className="flex items-start gap-3 text-sm text-white/90">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-bold text-white">
                          {i + 1}
                        </span>
                        <span className="pt-0.5">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="mt-7 grid grid-cols-2 gap-3">
                  <a
                    href={`tel:${PHONE_TEL}`}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-navy transition-colors hover:bg-white/90"
                  >
                    <Phone className="h-4 w-4" aria-hidden="true" /> Call us
                  </a>
                  <a
                    href={`mailto:${EMAIL}`}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white/15 text-sm font-semibold text-white transition-colors hover:bg-white/25"
                  >
                    <Mail className="h-4 w-4" aria-hidden="true" /> Email us
                  </a>
                </div>
              </div>
            </aside>
          </div>
        </section>

        {/* Other ways we can help */}
        <section className="container mx-auto px-4 pb-14 pt-6 md:pb-20" aria-labelledby="help-heading">
          <div className="mx-auto max-w-6xl">
            <h2 id="help-heading" className="mb-6 font-heading text-xl font-bold text-navy md:text-2xl">
              Other ways we can help
            </h2>
            <MobileCarousel label="Other ways we can help" desktopClassName="md:grid md:grid-cols-3 md:gap-6">
              {helpCards.map(({ icon: Icon, title, body, cta, onClick, to }) => (
                <div key={title} className="flex h-full flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
                  <div>
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-4 font-heading text-lg font-bold text-navy">{title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
                  </div>
                  {to ? (
                    <Link to={to} className={ctaClass}>
                      {cta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  ) : (
                    <button type="button" onClick={onClick} className={ctaClass}>
                      {cta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </MobileCarousel>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
};

export default ContactPage;
