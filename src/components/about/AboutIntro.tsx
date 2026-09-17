import { Globe, Users2 } from "lucide-react";

const AboutIntro = () => (
  <section className="py-14 md:py-20 bg-white">
    <div className="container mx-auto px-4">
      <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
        <span className="text-xs md:text-sm font-semibold text-accent uppercase tracking-wider">Who We Are</span>
        <h2 className="font-heading font-bold text-2xl sm:text-3xl md:text-4xl text-primary mt-2">
          What is Doctylia?
        </h2>
        <p className="text-sm md:text-base text-muted-foreground mt-3 leading-relaxed">
          Most independent doctors and small clinics in India still run on phone-call bookings, paper
          records, and word-of-mouth. Doctylia replaces that with a single platform: a branded website for
          the doctor, and a simple booking experience for the patient.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 max-w-4xl mx-auto">
        <div className="rounded-xl bg-secondary/60 border border-border p-5 md:p-6">
          <div className="w-10 h-10 rounded-lg bg-royal/10 text-royal flex items-center justify-center mb-3">
            <Globe className="h-5 w-5" />
          </div>
          <h3 className="font-heading font-semibold text-primary text-base md:text-lg">For Doctors</h3>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
            A doctor can go live with a professional website, start accepting online bookings, and manage
            patients, prescriptions, and billing — without hiring a developer or IT team.
          </p>
        </div>
        <div className="rounded-xl bg-secondary/60 border border-border p-5 md:p-6">
          <div className="w-10 h-10 rounded-lg bg-teal/10 text-teal flex items-center justify-center mb-3">
            <Users2 className="h-5 w-5" />
          </div>
          <h3 className="font-heading font-semibold text-primary text-base md:text-lg">For Patients</h3>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
            A patient gets a clear view of the doctor's services and availability, and can book an
            appointment — in-clinic or online — in a few taps, instead of a phone call.
          </p>
        </div>
      </div>
    </div>
  </section>
);

export default AboutIntro;
