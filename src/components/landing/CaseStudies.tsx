import { Globe, MessageCircle, Receipt } from "lucide-react";
import { usePlanPrices } from "@/hooks/usePlanPrices";

const CaseStudies = () => {
  const { proPrice, premiumPrice } = usePlanPrices();
  const proLabel = `₹${proPrice.toLocaleString("en-IN")}/month`;
  const premiumLabel = `₹${premiumPrice.toLocaleString("en-IN")}/month`;

  const studies = [
    {
      icon: Globe,
      title: "How a single-doctor dermatology clinic uses Doctylia",
      points: [
        "Publishes a branded clinic website. The same onboarding path on this site is described as live within 10 minutes.",
        `Takes online bookings on that site. Razorpay checkout is available for paid appointments on the Pro plan (${proLabel}).`,
        "Patients choose a service, a date, and a time slot from the public booking page.",
      ],
    },
    {
      icon: Receipt,
      title: "How a clinic handles billing and reminders",
      points: [
        "Creates GST invoices from the practice dashboard, next to appointments and patient records.",
        "Collects consultation payments online through Razorpay. Card and UPI details stay with Razorpay.",
        "Sends WhatsApp booking reminders and follow-ups when the clinic turns those messages on.",
      ],
    },
    {
      icon: MessageCircle,
      title: "How a growing practice uses the Premium plan",
      points: [
        `Uses the published Premium plan (${premiumLabel}): unlimited appointments, online consultation, patient records, and staff roles.`,
        "Connects a custom domain on Pro or Premium, or stays on a free doctylia.com/dr/ address.",
        "Drafts patient articles with the AI blog writer, then edits and publishes them on the clinic site.",
      ],
    },
  ];

  return (
    <section id="case-studies" className="py-14 md:py-20 bg-secondary/40" aria-labelledby="case-studies-heading">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-8 md:mb-12">
          <span className="text-xs md:text-sm font-semibold text-accent uppercase tracking-wider">Results</span>
          <h2 id="case-studies-heading" className="font-heading font-bold text-2xl sm:text-3xl md:text-4xl text-primary mt-2">
            Case Studies
          </h2>
          <p className="text-sm md:text-base text-muted-foreground mt-3">
            Three ways clinics use the product as it works today. These are representative examples, not individual customer results.
          </p>
        </div>

        <div className="max-w-4xl mx-auto space-y-3 md:space-y-4">
          {studies.map((study) => (
            <article key={study.title} className="grid grid-cols-2 gap-3 sm:gap-6 items-start rounded-2xl border border-border bg-white p-3 sm:p-6">
              <div className="min-w-0">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-royal/10 text-royal flex items-center justify-center mb-2">
                  <study.icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
                </div>
                <h3 className="font-heading font-semibold text-xs sm:text-base md:text-lg text-primary leading-snug">
                  {study.title}
                </h3>
              </div>
              <ul className="min-w-0 space-y-2">
                {study.points.map((point) => (
                  <li key={point} className="text-[10px] sm:text-xs md:text-sm text-muted-foreground leading-relaxed">
                    {point}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default CaseStudies;
