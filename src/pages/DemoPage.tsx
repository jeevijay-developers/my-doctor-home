import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, CheckCircle2, FileText, Globe, Mail, Phone, Receipt, Users } from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import DemoBookingForm from "@/components/demo/DemoBookingForm";
import { useDocumentHead } from "@/hooks/useDocumentHead";
import { INDEXABLE } from "@/lib/seo/injectHead";

const EMAIL = "support@doctylia.com";
const PHONE_DISPLAY = "+91 86194 83010";
const PHONE_TEL = "+918619483010";

// What the walkthrough covers: the product's own features, nothing promised beyond them.
const COVERS = [
  { icon: Globe, title: "Your branded booking website", body: "How patients find you and book online in under a minute." },
  { icon: CalendarDays, title: "Appointments and the live queue", body: "Bookings, walk-ins and the waiting-room queue on one screen." },
  { icon: Users, title: "Patient records", body: "History, documents and prescriptions for every visit." },
  { icon: Receipt, title: "Billing and payments", body: "GST invoices, UPI and online payments, and revenue reports." },
  { icon: FileText, title: "Your questions", body: "Setup, staff access, importing your existing patients and plans." },
];

const DemoPage = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  useDocumentHead({
    title: "Book a Demo | Doctylia",
    description:
      "Book a live demo of Doctylia: pick a date and any time from 10 AM to 7 PM IST and see the booking website, appointments, patient records and billing.",
    canonical: `${window.location.origin}/demo`,
    robots: INDEXABLE,
  });

  return (
    <div className="landing-page min-h-screen overflow-x-hidden bg-background font-body">
      <LandingNavbar />
      <main className="pt-20">
        <section className="container mx-auto px-4 pb-8 pt-10 text-center md:pt-14" aria-labelledby="demo-heading">
          <span className="inline-flex items-center gap-2 rounded-full bg-card px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-primary shadow-sm">
            <span className="h-2 w-2 rounded-full bg-spark" aria-hidden="true" /> Live walkthrough
          </span>
          <h1 id="demo-heading" className="mx-auto mt-4 max-w-3xl font-heading text-3xl font-extrabold tracking-tight text-navy sm:text-4xl md:text-5xl">
            Book a demo of Doctylia
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-lg">
            Pick a day and a time that suits you. We'll show you the platform working for a clinic like yours and answer your questions.
          </p>
          <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs font-semibold text-muted-foreground sm:gap-x-6 sm:text-[13px]">
            {["Any time, 10 AM to 7 PM IST", "No credit card required", "Free, no obligation"].map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" /> {t}
              </li>
            ))}
          </ul>
        </section>

        {/* Form first on mobile; the agenda beside it on large screens. */}
        <section className="container mx-auto px-4 pb-14 pt-4 md:pb-20">
          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-12 lg:gap-8">
            <div className="lg:order-2 lg:col-span-7">
              <DemoBookingForm />
            </div>

            <aside
              aria-label="What the demo covers"
              className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy to-royal p-6 text-white shadow-xl sm:p-8 lg:order-1 lg:col-span-5 lg:self-start"
            >
              <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-teal/20 blur-3xl" aria-hidden="true" />
              <div className="relative">
                <h2 className="font-heading text-2xl font-bold text-white">What you'll see</h2>
                <p className="mt-1 text-sm text-white/75">A guided tour of the parts that matter to your clinic.</p>
                <ul className="mt-6 space-y-5">
                  {COVERS.map(({ icon: Icon, title, body }) => (
                    <li key={title} className="flex items-start gap-3.5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                        <Icon className="h-5 w-5 text-teal-bright" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-white">{title}</h3>
                        <p className="text-sm leading-relaxed text-white/80">{body}</p>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="mt-7 rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/70">After you book</p>
                  <p className="mt-1.5 text-sm text-white/90">
                    Our team confirms your time by phone or email and sends you the call details.
                  </p>
                </div>

                <div className="mt-7 grid grid-cols-2 gap-3">
                  <a href={`tel:${PHONE_TEL}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-navy transition-colors hover:bg-white/90">
                    <Phone className="h-4 w-4" aria-hidden="true" /> {PHONE_DISPLAY}
                  </a>
                  <a href={`mailto:${EMAIL}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white/15 text-sm font-semibold text-white transition-colors hover:bg-white/25">
                    <Mail className="h-4 w-4" aria-hidden="true" /> Email us
                  </a>
                </div>
                <Link to="/contact" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-white/90 hover:text-white hover:underline">
                  Have a different question? Contact us <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </aside>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
};

export default DemoPage;
