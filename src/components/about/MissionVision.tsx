import { Target, Telescope } from "lucide-react";

const MissionVision = () => (
  <section className="py-14 md:py-20 bg-secondary/40">
    <div className="container mx-auto px-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6 max-w-4xl mx-auto items-stretch">
        <div className="rounded-2xl bg-white border border-border p-6 md:p-8 shadow-sm">
          <div className="w-11 h-11 rounded-xl bg-royal/10 text-royal flex items-center justify-center mb-4">
            <Target className="h-5 w-5" />
          </div>
          <h3 className="font-heading font-bold text-xl md:text-2xl text-primary">Our Mission</h3>
          <p className="text-sm md:text-base text-muted-foreground mt-3 leading-relaxed">
            To make healthcare access more convenient by helping every doctor build a professional digital
            presence, simplifying how appointments are booked and managed, and making it easier for
            patients to reach the right doctor with the information they need.
          </p>
        </div>
        <div className="rounded-2xl bg-white border border-border p-6 md:p-8 shadow-sm">
          <div className="w-11 h-11 rounded-xl bg-teal/10 text-teal flex items-center justify-center mb-4">
            <Telescope className="h-5 w-5" />
          </div>
          <h3 className="font-heading font-bold text-xl md:text-2xl text-primary">Our Vision</h3>
          <p className="text-sm md:text-base text-muted-foreground mt-3 leading-relaxed">
            A future where every doctor and clinic — solo practice or growing team — has the same digital
            tools as a large hospital chain, and every patient can find, book, and consult a doctor as
            easily as ordering anything else online.
          </p>
        </div>
      </div>
    </div>
  </section>
);

export default MissionVision;
