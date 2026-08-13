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
  <section id="faq" className="py-20 bg-secondary">
    <div className="container mx-auto px-3 sm:px-4">
      <div className="grid grid-cols-5 gap-2 sm:gap-6 lg:gap-10 max-w-5xl mx-auto">
        <div className="col-span-2 min-w-0">
          <span className="text-[8px] sm:text-sm font-semibold text-accent uppercase tracking-wider">FAQ</span>
          <h2 className="font-heading font-bold text-xs sm:text-2xl md:text-3xl lg:text-4xl text-primary mt-1 sm:mt-2 leading-tight">
            Frequently Asked Questions
          </h2>
          <p className="text-[8px] sm:text-sm text-muted-foreground mt-1.5 sm:mt-3 leading-snug sm:leading-relaxed">
            Can't find the answer you're looking for? <a href="#contact" className="text-royal font-medium hover:underline">Contact our team</a>.
          </p>
          <div className="mt-2 sm:mt-6 rounded sm:rounded-xl overflow-hidden shadow-md border border-border">
            <img
              src="https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400&h=280&fit=crop&q=80"
              alt="Doctor consulting with patient"
              className="w-full h-16 sm:h-40 md:h-48 object-cover"
              loading="lazy"
            />
          </div>
        </div>
        <div className="col-span-3 min-w-0">
          <Accordion type="single" collapsible className="space-y-1.5 sm:space-y-3">
            {faqs.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border border-border rounded sm:rounded-xl px-1.5 sm:px-6 bg-white data-[state=open]:shadow-sm data-[state=open]:border-royal/30 transition-all">
                <AccordionTrigger className="font-heading font-semibold text-primary text-left text-[9px] sm:text-[15px] py-1.5 sm:py-4 gap-1">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-[8px] sm:text-sm leading-snug sm:leading-relaxed pb-1.5 sm:pb-4">
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
