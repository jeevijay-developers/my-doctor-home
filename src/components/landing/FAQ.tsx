import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const LANDING_FAQS: { q: string; a: string }[] = [
  {
    q: "Can I link my own existing clinic domain (e.g., drarunsharma.com)?",
    a: "Yes. On the Pro and Premium plans you can connect your own custom domain (for example www.drname.com), or stay on your free doctylia.com/dr/ address.",
  },
  {
    q: "Is patient medical record data compliant and encrypted?",
    a: "Your patient data is encrypted in transit and stored on secure cloud infrastructure with strict access controls. Your patient records remain your confidential property and are never shared or mined.",
  },
  {
    q: "How fast can my clinic actually start accepting bookings?",
    a: "Most doctors are live within 10 minutes. Enter your qualifications, OPD schedule and consultation fee, and the onboarding wizard sets up your clinic website and online booking page.",
  },
  {
    q: "Can my receptionist handle billing without seeing confidential EMR notes?",
    a: "Yes. Staff accounts use role-based access: you choose which sections (patients, appointments, billing and more) each team member can open, so a receptionist can work on the front desk without access to the sections you keep to yourself.",
  },
  {
    q: "Can I import my past patient records and contacts from Excel?",
    a: "Yes. You can import your existing patient records with a CSV upload, and our support team can help you migrate from other platforms.",
  },
];

const FAQ = () => (
  <section id="faq" className="bg-secondary/40 py-14 md:py-20" aria-labelledby="faq-heading">
    <div className="container mx-auto px-4">
      <div className="mx-auto mb-10 max-w-3xl text-center md:mb-14">
        <span className="inline-block rounded-full bg-secondary px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-primary md:text-sm">
          Frequently Answered Questions
        </span>
        <h2 id="faq-heading" className="mt-3 font-heading text-2xl font-bold text-navy sm:text-3xl md:text-4xl">
          Everything you need to know about Doctylia
        </h2>
        <p className="mt-3 text-muted-foreground">
          Simple answers to common questions asked by doctors and clinic directors.
        </p>
      </div>

      <Accordion type="single" collapsible className="mx-auto max-w-3xl space-y-3 md:space-y-4">
        {LANDING_FAQS.map((f, i) => (
          <AccordionItem
            key={f.q}
            value={`faq-${i}`}
            className="rounded-xl border border-border bg-card px-4 shadow-sm data-[state=open]:border-royal/40 md:px-5"
          >
            <AccordionTrigger className="gap-3 py-4 text-left font-heading text-sm font-semibold text-navy hover:no-underline sm:text-base [&>svg]:text-primary">
              {f.q}
            </AccordionTrigger>
            <AccordionContent className="border-t border-border pt-3 text-sm leading-relaxed text-muted-foreground">
              {f.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  </section>
);

export default FAQ;
