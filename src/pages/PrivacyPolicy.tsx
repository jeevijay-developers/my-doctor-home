import { useEffect } from "react";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";

// LEGAL / COMPLIANCE DRAFT — NOT YET REVIEWED BY COUNSEL, specifically for
// Digital Personal Data Protection Act (DPDP Act), 2023 compliance. Do not
// treat this as final or publish it as binding without sign-off from a
// qualified lawyer: this platform collects patient-adjacent health data
// (appointments, prescriptions, clinical notes), doctor financial/payout
// details, and processes payments via Razorpay/RazorpayX. Content here was
// drafted directly against the current Supabase schema and edge functions
// (see the sections below) rather than assumed — but the DPDP Act concepts
// (Grievance Officer, consent, retention, breach notification) still need a
// real business/legal decision behind each bracketed placeholder before this
// page goes live. Companion document: src/pages/TermsOfService.tsx.
const LAST_UPDATED = "August 13, 2026";

const sections: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: "introduction",
    title: "1. Introduction",
    body: (
      <>
        <p>
          This Privacy Policy explains how Jeevijay Technologies Pvt. Ltd. ("Doctylia," "we," "us," or
          "our") collects, uses, shares, and protects personal data through the Doctylia platform —
          including the Doctylia website, the branded websites Doctylia generates for doctors, and the
          admin panel (collectively, the "Service"). It applies to three groups: <strong>Practitioners</strong>{" "}
          (doctors and clinics who subscribe to Doctylia), <strong>Staff</strong> (accounts a Practitioner
          creates to help run their practice), and <strong>Patients</strong> (people who book appointments
          through a Practitioner's Doctylia-hosted website).
        </p>
        <p>
          This Privacy Policy should be read together with our{" "}
          <Link to="/terms">Terms of Service</Link>, which covers usage rules and legal obligations. This
          document covers what data is collected and how it is handled. Effective date: {LAST_UPDATED}.
        </p>
      </>
    ),
  },
  {
    id: "information-we-collect",
    title: "2. What Information We Collect",
    body: (
      <>
        <p><strong>From Practitioners:</strong></p>
        <ul>
          <li>Account and profile information: name, email, clinic name, specialization, city, qualifications, experience, and profile photo.</li>
          <li>Subscription and billing information: plan tier, subscription payment history.</li>
          <li>
            Payout information: bank account holder name, account number, IFSC code, and/or UPI ID, used to
            settle consultation payments collected on the Practitioner's behalf. This is financial account
            information and is treated as sensitive.
          </li>
          <li>Content the Practitioner creates: website content, service and pricing listings, gallery photos, and blog posts (including AI-assisted blog content).</li>
          <li>Staff accounts the Practitioner creates: staff name, username, and the specific permissions granted to that staff member.</li>
        </ul>
        <p><strong>From Staff (accounts created by a Practitioner):</strong></p>
        <ul>
          <li>Login credentials and account status, and a record of the permissions the Practitioner has granted them.</li>
        </ul>
        <p><strong>From Patients:</strong></p>
        <ul>
          <li>Booking details: full name, mobile number (required), email (optional, used for booking confirmations), age, and gender.</li>
          <li>
            Medical data entered by the Practitioner or their staff in the course of care: appointment
            history, visit notes, prescriptions (diagnosis, medications, and clinical notes). This is the
            most sensitive category of data Doctylia processes.
          </li>
          <li>
            Payment records: a record that a consultation payment was made, its amount, and its status.
            Doctylia does not store raw card, UPI, or net-banking credentials — those are handled entirely
            by Razorpay, which is PCI-DSS compliant.
          </li>
        </ul>
        <p><strong>Automatically collected:</strong></p>
        <p>
          Doctylia does not currently run any analytics, advertising, or tracking scripts anywhere on the
          Service. The only browser storage used is functional: your logged-in session is kept in
          browser local storage so you stay signed in, and the admin panel sets one first-party cookie
          purely to remember whether you've collapsed the sidebar. Neither is used to track you across
          sites or for advertising.
        </p>
      </>
    ),
  },
  {
    id: "how-we-use",
    title: "3. How We Use Information",
    body: (
      <ul>
        <li>To provide the Service — operating a Practitioner's branded website, appointment booking, patient records, prescriptions, and billing.</li>
        <li>To process payments and payouts, via Razorpay and RazorpayX.</li>
        <li>To send appointment confirmations, reminders, and checkup follow-ups, by email, WhatsApp, or SMS depending on what the Practitioner has enabled and the patient's provided contact details.</li>
        <li>To operate account security and access control, including staff permission enforcement.</li>
        <li>To respond to support requests and, where a Practitioner reports it, to moderate blog content for policy compliance.</li>
        <li>To maintain and improve the reliability of the Service.</li>
      </ul>
    ),
  },
  {
    id: "legal-basis",
    title: "4. Legal Basis for Processing & Consent",
    body: (
      <>
        <p>
          Under India's Digital Personal Data Protection Act, 2023 (DPDP Act), personal data is generally
          processed on the basis of the data principal's explicit consent, or for specified legitimate
          uses. In Doctylia's model:
        </p>
        <ul>
          <li>A Practitioner consents to processing of their own account and financial data by registering for and using the Service.</li>
          <li>
            A patient's consent to Doctylia processing their booking details is obtained when they submit
            the booking form on a Practitioner's website. Where a patient's medical data (diagnosis,
            prescriptions, clinical notes) is entered by the Practitioner as part of providing care, that
            data is processed as part of the doctor-patient relationship, on the Practitioner's instruction
            — the Practitioner is responsible for obtaining any consent required directly from their
            patient for that clinical relationship, separate from Doctylia's role as the software processor.
          </li>
        </ul>
        <p>
          <em>
            [Placeholder — the current booking form does not yet present a standalone, explicit consent
            checkbox for medical data processing distinct from the general act of booking; whether the DPDP
            Act requires one in this two-party (Practitioner-collects-on-Doctylia's-platform) structure
            should be confirmed with counsel before publishing.]
          </em>
        </p>
      </>
    ),
  },
  {
    id: "how-shared",
    title: "5. How Information Is Shared",
    body: (
      <>
        <p>Doctylia shares personal data only as needed to operate the Service:</p>
        <ul>
          <li>
            <strong>With the Practitioner a patient books with</strong> — a patient's booking, contact, and
            medical details are visible to the Practitioner (and any staff the Practitioner has granted
            relevant permissions to) whose website the booking was made through.
          </li>
          <li>
            <strong>Razorpay / RazorpayX</strong> — to process consultation payments and Practitioner
            subscription billing, and to settle payouts to a Practitioner's bank account or UPI ID.
          </li>
          <li>
            <strong>Supabase</strong> — Doctylia's database, authentication, and file storage
            infrastructure provider, which hosts all of the data described in Section 2.
          </li>
          <li>
            <strong>A WhatsApp/SMS messaging provider</strong> — where a Practitioner enables appointment or
            checkup reminders, a patient's phone number and message content are shared with a third-party
            messaging provider to deliver that message.{" "}
            <em>[Placeholder — the specific messaging provider has not yet been finalized in the product;
            this section names the category of recipient rather than a specific company, and should be
            updated once a provider is selected.]</em>
          </li>
        </ul>
        <p>
          <strong>Doctylia does not sell personal data to third parties for advertising</strong>, and does
          not currently share data with any advertising or analytics network, because none is integrated
          into the Service (see Section 10).
        </p>
      </>
    ),
  },
  {
    id: "storage-security",
    title: "6. Data Storage & Security",
    body: (
      <>
        <p>
          All Service data is stored on Supabase's managed Postgres infrastructure.{" "}
          <em>[Placeholder — the specific hosting region has not been confirmed for this policy and should
          be filled in from the Supabase project settings.]</em> Data in transit is encrypted via HTTPS/TLS;
          data at rest is encrypted per Supabase's platform-level encryption.
        </p>
        <p>
          Access to patient and Practitioner data within the Service is controlled by row-level database
          security rules and, for staff accounts, by the specific permissions a Practitioner has granted
          them (for example, a staff member without billing access cannot view billing data, and a
          member without patient medical-record access cannot view prescriptions). Doctor bank/payout
          details are only accessible to the Practitioner who owns them and to Doctylia's platform
          administrators for the purpose of processing payouts.
        </p>
      </>
    ),
  },
  {
    id: "data-retention",
    title: "7. Data Retention",
    body: (
      <p>
        <em>
          [Placeholder — a formal data retention schedule for patient records, appointment history, and
          payment records has not yet been defined and requires a real business/legal decision rather than
          an invented figure. The one retention rule currently implemented in the product: when a
          Practitioner's subscription is cancelled or expires, their account data is retained for 30 days
          in case they resubscribe, after which it may be deleted (see Terms of Service, Section 4).]
        </em>
      </p>
    ),
  },
  {
    id: "patient-rights",
    title: "8. Patient Rights",
    body: (
      <>
        <p>
          Under the DPDP Act, individuals (data principals) generally have the right to access a summary
          of their personal data and its processing, request correction or erasure of their personal data,
          and withdraw previously given consent. A patient who wants to exercise these rights regarding
          data collected through Doctylia can do so by contacting either their Practitioner directly (who
          controls their own patient records) or Doctylia at the contact details in Section 16.
        </p>
        <p>
          <em>
            [Placeholder — self-service data access/export/deletion is not yet built into the product;
            requests are currently handled manually. This should be reflected accurately and revisited if
            a self-service flow is built.]
          </em>
        </p>
      </>
    ),
  },
  {
    id: "access-controls",
    title: "9. Doctor/Staff Access Controls",
    body: (
      <p>
        Doctylia's admin panel uses a permission system scoped to specific modules — for example,
        appointments, patients, prescriptions, billing, and staff management. A Practitioner decides which
        modules each staff account can view or edit when creating that account, and a staff member's
        access is limited to exactly what they've been granted, both in what the interface shows them and
        at the database level. See our <Link to="/terms">Terms of Service</Link> for how Practitioner and
        staff accounts relate.
      </p>
    ),
  },
  {
    id: "cookies-tracking",
    title: "10. Cookies & Tracking",
    body: (
      <p>
        Doctylia does not use advertising or analytics cookies, and no analytics, tracking, or advertising
        scripts of any kind are integrated into the Service today. The Service uses browser local storage
        to keep you signed in, and the admin panel sets a single first-party cookie to remember your
        sidebar's collapsed/expanded state — both are strictly functional and are not used for tracking or
        profiling. If this changes in the future, this section will be updated accordingly.
      </p>
    ),
  },
  {
    id: "childrens-data",
    title: "11. Children's Data",
    body: (
      <p>
        Doctylia's booking form does not restrict the age entered for a patient, so a parent or guardian
        may book and enter medical information on behalf of a minor. In that situation, Doctylia treats
        the adult submitting the booking as responsible for having the authority to provide that
        information on the minor's behalf, consistent with the DPDP Act's requirement of verifiable
        parental/guardian consent for processing a child's personal data.{" "}
        <em>[Placeholder — the product does not currently ask the booking party to confirm they are the
        patient's parent/guardian when the patient is a minor; whether an explicit confirmation step is
        required here should be confirmed with counsel.]</em>
      </p>
    ),
  },
  {
    id: "breach-notification",
    title: "12. Data Breach Notification",
    body: (
      <p>
        If Doctylia becomes aware of a personal data breach that is likely to affect Practitioners,
        staff, or patients, we will take reasonable steps to contain it and will notify affected users and
        the relevant authority as required under the DPDP Act.{" "}
        <em>[Placeholder — a specific breach-notification timeline and internal incident-response
        process should be defined with counsel rather than left generic before this page is published.]</em>
      </p>
    ),
  },
  {
    id: "grievance-officer",
    title: "13. Grievance Officer / Data Protection Contact",
    body: (
      <p>
        The DPDP Act requires a named contact for privacy-related grievances.{" "}
        <em>
          [Placeholder — a Grievance Officer has not yet been designated. This is a legal requirement, not
          optional copy, and must be filled in with a real named person or role (name, designation, and a
          direct contact email/address) before this page is published.]
        </em>{" "}
        Until then, privacy questions and complaints can be sent to{" "}
        <a href="mailto:support@doctylia.com">support@doctylia.com</a>.
      </p>
    ),
  },
  {
    id: "international-users",
    title: "14. International Users",
    body: (
      <p>
        Doctylia is built for doctors and patients in India, and this Privacy Policy is written with the
        DPDP Act, 2023 as its primary reference framework.{" "}
        <em>[Placeholder — if Doctylia serves or plans to serve users outside India, this section should
        be expanded to address the relevant regional data protection regime (e.g. GDPR); as of this draft
        the product and marketing content describe an India-focused service, so no such section has been
        included.]</em>
      </p>
    ),
  },
  {
    id: "changes",
    title: "15. Changes to This Policy",
    body: (
      <p>
        Doctylia may update this Privacy Policy from time to time. Material changes will be reflected by
        updating the "Last updated" date on this page. Continued use of the Service after changes take
        effect constitutes acceptance of the updated policy.
      </p>
    ),
  },
  {
    id: "contact",
    title: "16. Contact Us",
    body: (
      <p>
        Questions about this Privacy Policy, or requests relating to your personal data, can be directed
        to <a href="mailto:support@doctylia.com">support@doctylia.com</a>, or to Jeevijay Technologies Pvt.
        Ltd., 22, Second Floor, Aerodrome, Behind Modern Petrol Pump, Kota, Rajasthan. See also our{" "}
        <Link to="/terms">Terms of Service</Link>.
      </p>
    ),
  },
];

const PrivacyPolicy = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
    const prev = document.title;
    document.title = "Privacy Policy | Doctylia";
    return () => { document.title = prev; };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />

      <div className="pt-28 md:pt-32">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="font-heading font-bold text-3xl md:text-4xl text-primary">Privacy Policy</h1>
          <p className="text-muted-foreground mt-2 text-sm">Last updated: {LAST_UPDATED}</p>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-3xl pt-6 pb-10 md:pt-8">
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

export default PrivacyPolicy;
