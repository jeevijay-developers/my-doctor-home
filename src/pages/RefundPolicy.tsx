import { useEffect } from "react";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";

const LAST_UPDATED = "September 12, 2026";

const sections: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: "scope",
    title: "1. Scope of This Policy",
    body: (
      <p>
        This Refund Policy explains when refunds may be available for payments made through Doctylia. It
        applies to Practitioner subscriptions and to consultation payments made by patients through a
        Practitioner's Doctylia-hosted website.
      </p>
    ),
  },
  {
    id: "subscriptions",
    title: "2. Practitioner Subscription Fees",
    body: (
      <>
        <p>
          Practitioner subscription fees are billed in advance for the selected monthly plan. Subscription
          fees are generally non-refundable once a billing period has started, including where a Practitioner
          stops using the Service before the end of that period.
        </p>
        <p>
          A refund may be considered for a duplicate charge, an unauthorized charge reported promptly, or a
          material billing error made by Doctylia. Approved refunds are returned to the original payment
          method, subject to the payment provider's processing timelines.
        </p>
      </>
    ),
  },
  {
    id: "patient-payments",
    title: "3. Patient Consultation Payments",
    body: (
      <p>
        Consultation fees are set by and paid to the Practitioner. Doctylia does not decide whether a patient
        is entitled to a refund for a consultation. Patients should contact the Practitioner or clinic first
        to request a cancellation or refund. Where the Practitioner approves a refund, it is processed through
        the payment provider and returned to the original payment method when possible.
      </p>
    ),
  },
  {
    id: "eligibility",
    title: "4. Refund Requests",
    body: (
      <>
        <p>
          To request a refund for a Doctylia subscription payment, email{" "}
          <a href="mailto:support@doctylia.com">support@doctylia.com</a> with the account email, payment
          date, amount, and reason for the request. For a consultation payment, include the clinic name and
          appointment details after contacting the Practitioner.
        </p>
        <p>
          We may request additional information to verify the transaction. Submitting a request does not
          guarantee that a refund will be approved.
        </p>
      </>
    ),
  },
  {
    id: "processing",
    title: "5. Processing Time",
    body: (
      <p>
        Once approved, we will initiate the refund without undue delay. The time for the funds to appear in
        your account depends on the payment provider and your bank. Doctylia is not responsible for delays
        caused by a bank, card issuer, or payment provider.
      </p>
    ),
  },
  {
    id: "changes",
    title: "6. Changes to This Policy",
    body: (
      <p>
        We may update this Refund Policy from time to time. Changes will be reflected by updating the "Last
        updated" date on this page. The policy in effect when a payment was made will generally apply to that
        payment.
      </p>
    ),
  },
  {
    id: "contact",
    title: "7. Contact Information",
    body: (
      <p>
        Questions about this policy or a Doctylia subscription refund can be directed to{" "}
        <a href="mailto:support@doctylia.com">support@doctylia.com</a>, or to Jeevijay Technologies Pvt.
        Ltd., 22, Second Floor, Aerodrome, Behind Modern Petrol Pump, Kota, Rajasthan.
      </p>
    ),
  },
];

const RefundPolicy = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
    const prev = document.title;
    document.title = "Refund Policy | Doctylia";
    return () => { document.title = prev; };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />

      <div className="pt-28 md:pt-32">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="font-heading font-bold text-3xl md:text-4xl text-primary">Refund Policy</h1>
          <p className="text-muted-foreground mt-2 text-sm">Last updated: {LAST_UPDATED}</p>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-3xl pt-6 pb-10 md:pt-8">
        <nav aria-label="Table of contents" className="mb-10 rounded-xl border border-border bg-secondary p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">On this page</p>
          <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="text-royal hover:underline">{section.title}</a>
              </li>
            ))}
          </ul>
        </nav>

        <article className="prose prose-slate max-w-none leading-relaxed prose-headings:font-heading prose-headings:text-primary prose-a:text-royal prose-strong:text-foreground">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <h2>{section.title}</h2>
              {section.body}
            </section>
          ))}
        </article>

        <div className="mt-12 pt-8 border-t border-border flex items-center gap-4">
          <Link to="/" className="text-royal hover:underline font-medium">← Back to Doctylia</Link>
          <span className="text-border">·</span>
          <Link to="/terms" className="text-royal hover:underline font-medium">Terms of Service</Link>
        </div>
      </div>

      <LandingFooter />
    </div>
  );
};

export default RefundPolicy;