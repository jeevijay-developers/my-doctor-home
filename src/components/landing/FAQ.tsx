import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const faqs = [
  { q: "Is there really a free trial with no credit card?", a: "Yes! You get 7 days of full access to all features. No credit card required. No strings attached." },
  { q: "How quickly can I get my website live?", a: "Most doctors have their website live within 10 minutes. Our onboarding wizard walks you through every step." },
  { q: "Can patients book and pay online?", a: "Absolutely. Patients can book appointments, select services, and pay via UPI, card, or net banking — all from your website." },
  { q: "Do I need any technical knowledge?", a: "Not at all. If you can use WhatsApp, you can use Doctylia. Everything is designed for non-technical users." },
  { q: "Can I use my own domain like www.drname.com?", a: "Yes! Custom domains are available for ₹4,999/year one-time setup. Your Doctylia branding is completely removed." },
  { q: "Is my patient data secure?", a: "100%. We use enterprise-grade encryption, secure cloud hosting, and comply with Indian data protection standards." },
  { q: "What happens after the free trial ends?", a: "You can choose a plan that fits your needs. Your data, website, and settings are all preserved. If you don't subscribe, your website goes offline but data stays safe for 30 days." },
  { q: "Can I migrate my existing patient data?", a: "Yes! You can import patient records via CSV upload, or our support team can help you migrate from other platforms for free." },
  { q: "Do you offer support in Hindi / regional languages?", a: "Our support team speaks Hindi, English, and several regional languages. The AI blog writer also supports Hindi content generation (more languages coming soon)." },
];

const FAQ = () => (
  <section id="faq" className="bg-secondary py-12 sm:py-16 md:py-20">
    <div className="container mx-auto px-4 sm:px-5">
      <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-5 md:gap-8 lg:gap-10">
        <div className="min-w-0 md:col-span-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-accent sm:text-sm">FAQ</span>
          <h2 className="mt-2 font-heading text-3xl font-bold leading-tight text-primary sm:text-4xl md:text-5xl">
            Frequently Asked Questions
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Can't find the answer you're looking for? <a href="#contact" className="font-medium text-royal hover:underline">Contact our team</a>.
          </p>
          <div className="mt-5 overflow-hidden rounded-xl border border-border shadow-md sm:mt-6">
            <img
              src="https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400&h=280&fit=crop&q=80"
              alt="Doctor consulting with patient"
              className="h-40 w-full object-cover sm:h-48 md:h-52"
              loading="lazy"
            />
          </div>
        </div>

        <div className="min-w-0 md:col-span-3">
          <Accordion type="single" collapsible className="space-y-2 sm:space-y-3">
            {faqs.map((f, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="rounded-xl border border-border bg-white px-3 transition-all data-[state=open]:border-royal/30 data-[state=open]:shadow-sm sm:px-5"
              >
                <AccordionTrigger className="gap-2 py-3 text-left font-heading text-sm font-semibold text-primary sm:py-4 sm:text-base">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="pb-3 text-sm leading-relaxed text-muted-foreground sm:pb-4">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </div>
  </section>
);

export default FAQ;
