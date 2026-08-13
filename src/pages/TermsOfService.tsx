import { useEffect } from "react";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";

// LEGAL DRAFT — NOT YET REVIEWED BY COUNSEL. Do not treat this as final or
// publish it as binding without sign-off from a qualified lawyer, given that
// the platform handles patient-adjacent health data, processes payments via
// Razorpay/RazorpayX, and operates in India (DPDP Act 2023 + potential
// healthcare-data-specific obligations apply). See the on-page notice below
// and the PR description for the same disclaimer.
const LAST_UPDATED = "August 13, 2026";

const sections: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: "acceptance",
    title: "1. Acceptance of Terms",
    body: (
      <>
        <p>
          These Terms of Service ("Terms") govern access to and use of Doctylia, a practice-management
          and patient-booking platform operated by Jeevijay Technologies Pvt. Ltd. ("Doctylia," "we," "us,"
          or "our"), including the Doctylia website, the branded websites Doctylia generates for doctors,
          the admin panel, and all related services (collectively, the "Service").
        </p>
        <p>
          By creating an account, subscribing to a plan, booking an appointment through a Doctylia-hosted
          website, or otherwise using the Service, you agree to be bound by these Terms. If you do not
          agree, do not use the Service.
        </p>
      </>
    ),
  },
  {
    id: "description",
    title: "2. Description of Service",
    body: (
      <>
        <p>
          Doctylia provides two distinct groups of users with different functionality:
        </p>
        <ul>
          <li>
            <strong>Doctors and Clinics ("Practitioners")</strong> subscribe to a paid plan and receive a
            branded website, an online appointment booking system, patient records, prescriptions, billing
            and invoicing, an AI-assisted blog writer, WhatsApp notifications, and practice analytics.
          </li>
          <li>
            <strong>Patients</strong> use a Practitioner's Doctylia-hosted website to book appointments, pay
            consultation fees online, and receive prescriptions and records made available to them by the
            Practitioner.
          </li>
        </ul>
        <p>
          Doctylia is a software platform. It does not employ, supervise, or exercise control over the
          medical judgment of any Practitioner (see Section 7, Medical Disclaimer).
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "3. User Accounts & Registration",
    body: (
      <>
        <p>
          <strong>Practitioner accounts</strong> are created by the doctor and are used to access the admin
          panel and manage the Practitioner's branded website. The Practitioner is responsible for the
          accuracy of their profile, qualifications, and clinic information, and for maintaining the
          confidentiality of their login credentials.
        </p>
        <p>
          <strong>Staff accounts</strong> may be created by a Practitioner to delegate day-to-day
          administration to employees or assistants. Staff accounts are scoped to specific permissions set
          by the Practitioner (for example, viewing appointments without access to billing) and act on the
          Practitioner's behalf. The Practitioner remains responsible for actions taken by staff accounts
          they create.
        </p>
        <p>
          <strong>Patients</strong> are not required to create a persistent account to book an appointment;
          bookings are tied to the contact details a patient provides at the time of booking.
        </p>
      </>
    ),
  },
  {
    id: "billing",
    title: "4. Subscription Plans, Billing & Cancellation",
    body: (
      <>
        <p>Doctylia currently offers the following Practitioner subscription tiers:</p>
        <ul>
          <li><strong>Pro</strong> — ₹1,499/month.</li>
          <li><strong>Premium</strong> — ₹3,999/month.</li>
        </ul>
        <p>
          New Practitioners receive a 7-day free trial with no credit card required. At the end of the
          trial, continued access to paid features requires selecting and paying for a subscription plan.
          Subscriptions are billed on a recurring monthly basis through Razorpay and renew automatically
          until cancelled.
        </p>
        <p>
          A Practitioner may cancel their subscription at any time from the admin panel. Upon cancellation
          or expiry, the Practitioner's branded website is taken offline, but their data is retained for a
          period of 30 days in case the Practitioner chooses to resubscribe, after which it may be deleted.
        </p>
        <p>
          <em>
            [Placeholder — refund policy for subscription fees (e.g. pro-rata refunds, no-refund policy on
            partial months) is not yet finalized in the product and must be confirmed before publishing.]
          </em>
        </p>
      </>
    ),
  },
  {
    id: "payments-payouts",
    title: "5. Patient Payments & Practitioner Payouts",
    body: (
      <>
        <p>
          Where a Practitioner enables online payment for consultations, patient payments are processed
          through Razorpay. <strong>Doctylia does not charge any commission on patient consultation
          payments</strong> — the Practitioner receives the full amount the patient pays. Doctylia's revenue
          comes solely from Practitioner subscription fees described in Section 4, not from a per-transaction
          cut of patient payments.
        </p>
        <p>
          Collected patient payments are settled to Practitioners as payouts via RazorpayX, calculated on a
          monthly rollup of that Practitioner's confirmed, paid appointments for the period. A Practitioner
          must complete bank account verification before payouts can be released to them.
        </p>
        <p>
          <em>
            [Placeholder — exact payout settlement timing/SLA and the refund process for a patient who
            cancels or disputes a paid appointment are not yet finalized in the product and must be confirmed
            before publishing.]
          </em>
        </p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "6. Acceptable Use Policy",
    body: (
      <>
        <p>Practitioners and staff accounts agree not to:</p>
        <ul>
          <li>Create fraudulent, impersonating, or misleading practitioner or clinic listings.</li>
          <li>
            Use patient data collected through the Service for any purpose other than providing care and
            operating the practice — including selling, renting, or disclosing patient data to third parties
            without a lawful basis or patient consent.
          </li>
          <li>
            Publish blog content (including content generated with Doctylia's AI blog writer) that is
            false, misleading, defamatory, infringing, or that constitutes unauthorized medical advice
            presented as fact. Published content is subject to review and may be removed under Doctylia's
            content moderation policy.
          </li>
          <li>Attempt to circumvent staff permission scoping or access another Practitioner's account or data.</li>
          <li>Interfere with, reverse-engineer, or overburden the Service's infrastructure.</li>
        </ul>
      </>
    ),
  },
  {
    id: "medical-disclaimer",
    title: "7. Medical Disclaimer",
    body: (
      <>
        <p>
          <strong>
            Doctylia is a practice-management and booking software platform. Doctylia is not a healthcare
            provider, does not practice medicine, and does not review, endorse, or take responsibility for
            the medical advice, diagnosis, treatment, or care provided by any Practitioner using the Service.
          </strong>
        </p>
        <p>
          Any medical advice, prescription, or treatment a patient receives is solely the responsibility of
          the treating Practitioner. Doctylia is not a party to, and assumes no liability arising from, the
          doctor-patient relationship or the quality of care delivered.
        </p>
      </>
    ),
  },
  {
    id: "data-privacy",
    title: "8. Data & Privacy",
    body: (
      <>
        <p>
          Doctylia processes personal data — including patient names, contact details, appointment history,
          prescriptions, and medical records — as described in our Privacy Policy.
        </p>
        <p>
          <em>
            [Placeholder — a separate Privacy Policy page does not yet exist on the site and should be
            created before this Terms of Service page is published, since Terms and a Privacy Policy are
            ordinarily separate documents. This link will need to be updated once that page exists.]
          </em>{" "}
          Until then, refer to this section as a placeholder pointer only.
        </p>
      </>
    ),
  },
  {
    id: "ip",
    title: "9. Intellectual Property",
    body: (
      <>
        <p>
          Doctylia retains all rights, title, and interest in the Doctylia platform, software, and branding.
          A Practitioner retains ownership of the content they upload to their branded website — including
          their clinic description, service listings, gallery photos, and blog posts — and grants Doctylia a
          license to host, display, and (where the AI blog writer is used) generate that content solely to
          operate the Service on the Practitioner's behalf.
        </p>
      </>
    ),
  },
  {
    id: "termination",
    title: "10. Termination",
    body: (
      <>
        <p>
          Doctylia may suspend or terminate a Practitioner's or staff account's access to the Service for
          violation of these Terms, non-payment of subscription fees, fraudulent activity, or misuse of
          patient data. A Practitioner may terminate their own account at any time by cancelling their
          subscription and requesting account deletion.
        </p>
      </>
    ),
  },
  {
    id: "liability",
    title: "11. Limitation of Liability",
    body: (
      <>
        <p>
          To the maximum extent permitted by law, Doctylia shall not be liable for any indirect, incidental,
          or consequential damages arising from use of the Service, including damages arising from the
          medical care a Practitioner provides (see Section 7), payment processing delays caused by
          third-party providers (Razorpay/RazorpayX), or loss of data.
        </p>
        <p>
          <em>[Placeholder — a specific liability cap (e.g. fees paid in the preceding 12 months) should be set with counsel.]</em>
        </p>
      </>
    ),
  },
  {
    id: "governing-law",
    title: "12. Governing Law & Jurisdiction",
    body: (
      <p>
        These Terms are governed by the laws of India. Subject to confirmation by counsel, disputes are
        intended to be subject to the exclusive jurisdiction of the courts at{" "}
        <em>[Jurisdiction — inferred from Doctylia's registered address in Kota, Rajasthan; not yet confirmed by counsel]</em>.
      </p>
    ),
  },
  {
    id: "changes",
    title: "13. Changes to Terms",
    body: (
      <p>
        Doctylia may update these Terms from time to time. Material changes will be reflected by updating
        the "Last updated" date on this page. Continued use of the Service after changes take effect
        constitutes acceptance of the updated Terms.
      </p>
    ),
  },
  {
    id: "contact",
    title: "14. Contact Information",
    body: (
      <p>
        Questions about these Terms can be directed to{" "}
        <a href="mailto:support@doctylia.com">support@doctylia.com</a>, or to Jeevijay Technologies Pvt.
        Ltd., 22, Second Floor, Aerodrome, Behind Modern Petrol Pump, Kota, Rajasthan.
      </p>
    ),
  },
];

const TermsOfService = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
    const prev = document.title;
    document.title = "Terms of Service | Doctylia";
    return () => { document.title = prev; };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />

      <div className="bg-primary text-primary-foreground pt-28 pb-10 md:pt-32 md:pb-14">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="font-heading font-bold text-3xl md:text-4xl">Terms of Service</h1>
          <p className="text-primary-foreground/70 mt-2 text-sm">Last updated: {LAST_UPDATED}</p>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-3xl py-10">
        <nav aria-label="Table of contents" className="mb-10 rounded-xl border border-border bg-secondary p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">On this page</p>
          <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-royal hover:underline">{s.title}</a>
              </li>
            ))}
          </ul>
        </nav>

        <article className="prose prose-slate max-w-none leading-relaxed prose-headings:font-heading prose-headings:text-primary prose-a:text-royal prose-strong:text-foreground">
          {sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2>{s.title}</h2>
              {s.body}
            </section>
          ))}
        </article>

        <div className="mt-12 pt-8 border-t border-border">
          <Link to="/" className="text-royal hover:underline font-medium">← Back to Doctylia</Link>
        </div>
      </div>

      <LandingFooter />
    </div>
  );
};

export default TermsOfService;
