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
      <div className="mx-auto grid max-w-[1280px] gap-6 sm:gap-8 md:grid-cols-[1.05fr_1.35fr] md:items-start md:gap-10 lg:gap-12">
        <div className="min-w-0 pt-1 md:pt-3">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent sm:text-sm md:text-[13px]">
            FAQ
          </span>
          <h2 className="mt-2 max-w-[420px] font-heading text-[2.8rem] font-extrabold leading-[0.9] tracking-[-0.05em] text-primary sm:text-[3.5rem] md:mt-3 md:text-[5rem] lg:text-[5.25rem]">
            Frequently
            <br />
            Asked
            <br />
            Questions
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base md:mt-6 md:text-lg md:text-[1.05rem]">
            Can't find the answer you're looking for? <a href="#contact" className="font-medium text-royal hover:underline">Contact our team</a>.
          </p>
          <div className="mt-5 overflow-hidden rounded-[22px] border border-border shadow-md sm:mt-6 md:mt-8 md:shadow-[0_10px_24px_rgba(31,74,136,0.12)]">
            <img
              src="https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400&h=280&fit=crop&q=80"
              alt="Doctor consulting with patient"
              className="h-[230px] w-full object-cover sm:h-52 md:h-[310px] lg:h-[340px]"
              loading="lazy"
            />
          </div>
        </div>

        <div className="min-w-0 md:pt-2">
          <Accordion type="single" collapsible className="space-y-2 sm:space-y-3 md:space-y-3">
            {faqs.map((f, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="rounded-[18px] border border-[#cfe1f8] bg-[#edf5ff] px-3 transition-all data-[state=open]:border-[#9ec1ef] data-[state=open]:bg-white data-[state=open]:shadow-[0_10px_18px_rgba(38,94,167,0.12)] sm:px-5 md:rounded-[18px] md:border-[#cfe1f8] md:bg-[#edf5ff] md:px-5 md:shadow-none md:data-[state=open]:border-[#9ec1ef] md:data-[state=open]:bg-white md:data-[state=open]:shadow-[0_10px_18px_rgba(38,94,167,0.12)]"
              >
                <AccordionTrigger className="gap-2 py-3 text-left font-heading text-sm font-semibold text-primary transition-all hover:no-underline sm:py-4 sm:text-base md:py-5 md:text-[1.05rem] md:font-semibold md:leading-6 md:text-[#1a3d6e] [&>svg]:h-4 [&>svg]:w-4 md:[&>svg]:h-5 md:[&>svg]:w-5 [&>svg]:text-primary md:[&>svg]:text-[#1a6ac6] [&[data-state=open]>svg]:rotate-180">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="pb-3 text-sm leading-relaxed text-muted-foreground sm:pb-4 md:pb-4 md:pr-10 md:text-[0.96rem] md:leading-7 md:text-[#49607c]">
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
