import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { HelpCircle } from "lucide-react";

const faqs = [
  { q: "Is there really a free trial with no credit card?", a: "Yes! You get 7 days of full access to all features. No credit card required. No strings attached." },
  { q: "How quickly can I get my website live?", a: "Most doctors have their website live within 10 minutes. Our onboarding wizard walks you through every step." },
  { q: "Can patients book and pay online?", a: "Absolutely. Patients can book appointments, select services, and pay via UPI, card, or net banking — all from your website." },
  { q: "Do I need any technical knowledge?", a: "Not at all. If you can use WhatsApp, you can use Doctylia. Everything is designed for non-technical users." },
  { q: "Can I use my own domain like www.drname.com?", a: "Yes! Custom domains are available for ₹4,999/year one-time setup. Your Doctylia branding is completely removed." },
  { q: "Is my patient data secure?", a: "100%. We use enterprise-grade encryption, secure cloud hosting, and comply with Indian data protection standards." },
];

const FAQ = () => (
  <section id="faq" className="py-20 bg-white">
    <div className="container mx-auto px-4">
      <div className="grid lg:grid-cols-5 gap-10 max-w-5xl mx-auto">
        {/* Left label */}
        <div className="lg:col-span-2">
          <span className="text-sm font-semibold text-accent uppercase tracking-wider">FAQ</span>
          <h2 className="font-heading font-bold text-3xl md:text-4xl text-primary mt-2">
            Frequently Asked Questions
          </h2>
          <p className="text-muted-foreground mt-3 leading-relaxed">
            Can't find the answer you're looking for? <a href="#contact" className="text-royal font-medium hover:underline">Contact our team</a>.
          </p>
          <div className="mt-8 hidden lg:block">
            <div className="w-24 h-24 rounded-2xl bg-royal/10 flex items-center justify-center">
              <HelpCircle className="h-12 w-12 text-royal" />
            </div>
          </div>
        </div>
        {/* Right — Accordion */}
        <div className="lg:col-span-3">
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border border-border rounded-xl px-6 data-[state=open]:shadow-sm data-[state=open]:border-royal/30 transition-all">
                <AccordionTrigger className="font-heading font-semibold text-primary text-left text-[15px]">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
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
