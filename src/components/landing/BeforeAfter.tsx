import MobileCarousel from "./MobileCarousel";
import { X, Check, XCircle, CheckCircle2, ArrowDown } from "lucide-react";

const without = [
  ["Overwhelmed Reception Desk:", "Hundreds of interrupted calls and WhatsApp messages for booking slots and fee queries."],
  ["Cluttered Paper Registers:", "Physical OPD registers prone to losing past patient history, allergies, and diagnostic records."],
  ["Manual GST Billing Headaches:", "Writing paper receipts or wrestling with complex non-medical accounting software."],
  ["High Patient No-Show Rates:", "Patients forget scheduled visits due to lack of timely, structured automated reminders."],
  ["Zero Online Presence:", "Losing valuable local neighborhood patients to commercial hospital conglomerates."],
];

const withDoctylia = [
  ["24/7 Automated Web & WhatsApp Booking:", "Patients select available time slots and pay consultation deposits online."],
  ["Centralized Digital EMR in 1-Click:", "Instant past visit timelines, attached scans, lab reports, and medication histories."],
  ["Fast 30-Second GST Invoices:", "Instant QR-based UPI collection with automatic tax breakup and digital WhatsApp delivery."],
  ["Autonomous Follow-up Engine:", "Routine test reminders, vaccine schedules, and Google review collection on complete autopilot."],
  ["High-Ranking Doctor Website:", "Establish commanding local authority with branded medical articles and patient reviews."],
];

const BeforeAfter = () => (
  <section className="w-full py-12 md:py-20 bg-muted">
    <div className="container mx-auto px-4">
      <div className="max-w-3xl mx-auto text-center mb-10 md:mb-14">
        <span className="inline-block px-3.5 py-1 rounded-full bg-card text-primary text-xs font-semibold uppercase tracking-wider border border-border">
          The Doctylia Difference
        </span>
        <h2 className="font-heading font-extrabold text-2xl sm:text-3xl md:text-4xl text-navy mt-3">
          From Daily Administrative Chaos to Seamless Autonomous Care
        </h2>
        <p className="text-muted-foreground mt-3">
          See how 2,500+ Indian practitioners streamlined their clinical workflow in under 10 days.
        </p>
      </div>

      {/* Mobile / tablet: each problem is paired with its fix so the contrast is read card by card. */}
      <div className="lg:hidden max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4 px-1">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-destructive">
            <X className="h-4 w-4" aria-hidden="true" /> Without Doctylia
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-success">
            <Check className="h-4 w-4" aria-hidden="true" /> With Doctylia
          </span>
        </div>
        <MobileCarousel label="Without versus with Doctylia" desktopClassName="md:grid md:grid-cols-2 md:gap-6">
          {without.map(([wt, wd], i) => {
            const [dt, dd] = withDoctylia[i];
            return (
              <div key={wt} className="relative flex flex-col rounded-2xl bg-card shadow-sm border border-border overflow-hidden">
                <div className="flex items-start gap-3 bg-destructive/5 p-4 pb-7">
                  <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="text-sm text-muted-foreground">
                    <span className="sr-only">Without Doctylia: </span>
                    <strong className="block text-foreground">{wt}</strong> {wd}
                  </div>
                </div>
                <span className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-4 ring-card" aria-hidden="true">
                  <ArrowDown className="h-4 w-4" />
                </span>
                <div className="flex flex-1 items-start gap-3 bg-success/10 p-4 pt-7 border-t-2 border-primary/20">
                  <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="text-sm text-foreground">
                    <span className="sr-only">With Doctylia: </span>
                    <strong className="block text-navy">{dt}</strong> {dd}
                  </div>
                </div>
              </div>
            );
          })}
        </MobileCarousel>
      </div>

      {/* Desktop: two side-by-side columns. */}
      <div className="hidden lg:grid grid-cols-2 gap-8 max-w-5xl mx-auto">
        <div className="p-6 md:p-8 rounded-2xl bg-card shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <span className="w-9 h-9 rounded-full bg-destructive/10 text-destructive flex items-center justify-center flex-shrink-0">
              <X className="h-5 w-5" />
            </span>
            <h3 className="font-heading font-bold text-xl text-navy">Without Doctylia</h3>
          </div>
          <ul className="space-y-4 text-muted-foreground">
            {without.map(([t, d]) => (
              <li key={t} className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <span><strong className="text-foreground">{t}</strong> {d}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-6 md:p-8 rounded-2xl bg-card shadow-lg ring-2 ring-primary">
          <div className="flex items-center justify-between gap-2 mb-6">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-success/10 text-success flex items-center justify-center flex-shrink-0">
                <Check className="h-5 w-5" />
              </span>
              <h3 className="font-heading font-bold text-xl text-navy">With Doctylia Autopilot</h3>
            </div>
            <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold whitespace-nowrap">
              10x Efficiency
            </span>
          </div>
          <ul className="space-y-4 text-foreground">
            {withDoctylia.map(([t, d]) => (
              <li key={t} className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                <span><strong>{t}</strong> {d}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  </section>
);

export default BeforeAfter;
