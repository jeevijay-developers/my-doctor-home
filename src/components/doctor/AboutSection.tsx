import { GraduationCap, ShieldCheck } from "lucide-react";

const education = [
  { year: "2004", degree: "MBBS", institution: "AIIMS New Delhi" },
  { year: "2009", degree: "MD Cardiology", institution: "PGI Chandigarh" },
  { year: "2011", degree: "Fellowship Interventional Cardiology", institution: "Bombay Hospital" },
];

const specializations = ["Hypertension", "Cardiac Catheterization", "Echo", "Angioplasty", "Heart Failure", "ECG", "Pacemaker"];

const AboutSection = () => (
  <section id="about" className="py-16 md:py-24 bg-secondary/50">
    <div className="container mx-auto px-4">
      <h2 className="font-heading font-bold text-3xl md:text-4xl text-primary text-center mb-12">About Dr. Sharma</h2>
      <div className="grid lg:grid-cols-5 gap-10">
        {/* Timeline */}
        <div className="lg:col-span-2 space-y-0">
          <h3 className="font-heading font-semibold text-lg text-primary mb-6 flex items-center gap-2">
            <GraduationCap size={20} className="text-royal" /> Education
          </h3>
          <div className="relative border-l-2 border-royal/20 pl-6 space-y-8">
            {education.map((e, i) => (
              <div key={i} className="relative">
                <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-royal border-2 border-card" />
                <p className="text-xs text-text-gray font-medium">{e.year}</p>
                <p className="font-heading font-semibold text-foreground">{e.degree}</p>
                <p className="text-sm text-text-gray">{e.institution}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bio */}
        <div className="lg:col-span-3 space-y-6">
          <p className="text-foreground leading-relaxed">
            Dr. Rahul Sharma is a renowned cardiologist based in Mumbai with over 15 years of experience in interventional cardiology. A graduate of AIIMS New Delhi and PGI Chandigarh, he has performed 3,000+ cardiac procedures including angioplasties and pacemaker implantations. He is known for his patient-first approach, making complex heart conditions simple to understand.
          </p>
          <div>
            <h4 className="font-heading font-semibold text-foreground mb-3">Specializations</h4>
            <div className="flex flex-wrap gap-2">
              {specializations.map((s) => (
                <span key={s} className="px-3 py-1.5 rounded-pill bg-royal/10 text-royal text-sm font-medium">{s}</span>
              ))}
            </div>
          </div>
          <div>
            <h4 className="font-heading font-semibold text-foreground mb-2 flex items-center gap-2">
              <ShieldCheck size={16} className="text-success" /> Memberships & Registration
            </h4>
            <ul className="text-sm text-text-gray space-y-1">
              <li>• Indian Medical Association (IMA) — Life Member</li>
              <li>• Cardiology Society of India</li>
              <li>• NMC Registration: MH/2004/12345</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default AboutSection;
