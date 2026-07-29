import { GraduationCap, Award, Stethoscope, Building2, MapPin } from "lucide-react";
import { useDoctorData } from "@/contexts/DoctorContext";

const AboutSection = () => {
  const { profile } = useDoctorData();

  const items = [
    profile?.qualifications && { icon: GraduationCap, label: "Qualifications", value: profile.qualifications },
    profile?.specialization && { icon: Stethoscope, label: "Specialization", value: profile.specialization },
    profile?.experience_years && { icon: Award, label: "Experience", value: `${profile.experience_years}+ years` },
    profile?.clinic_name && { icon: Building2, label: "Practice", value: profile.clinic_name },
    profile?.city && { icon: MapPin, label: "Location", value: profile.city },
  ].filter(Boolean) as any[];

  return (
    <section id="about" className="py-16 md:py-24 bg-secondary">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-14 items-start">
          <div>
            <span className="inline-block px-3 py-1 rounded-full bg-royal/10 text-royal text-xs font-heading font-semibold uppercase tracking-wider">
              About
            </span>
            <h2 className="font-heading font-bold text-3xl md:text-4xl text-primary mt-3 mb-5 leading-tight">
              Meet Dr. {profile?.full_name || "Doctor"}
            </h2>
            {profile?.bio ? (
              <p className="text-foreground text-base md:text-lg leading-relaxed whitespace-pre-line">
                {profile.bio}
              </p>
            ) : (
              <p className="text-text-gray text-base md:text-lg leading-relaxed">
                {profile?.specialization
                  ? `${profile.specialization} providing compassionate, evidence-based care.`
                  : "Dedicated to providing compassionate, evidence-based medical care."}
                {profile?.experience_years && ` With over ${profile.experience_years} years of clinical experience,`}
                {" "}patient wellbeing is the highest priority.
              </p>
            )}
          </div>

          <div className="bg-card rounded-2xl border border-border shadow-sm p-5 md:p-7">
            <h3 className="font-heading font-semibold text-primary text-lg mb-5">Professional Overview</h3>
            <div className="space-y-4">
              {items.map((it, i) => (
                <div key={i} className="flex items-start gap-3 pb-4 border-b border-border last:border-0 last:pb-0">
                  <div className="w-10 h-10 rounded-xl bg-royal/10 flex items-center justify-center shrink-0">
                    <it.icon size={18} className="text-royal" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wider text-text-gray font-heading font-semibold">
                      {it.label}
                    </p>
                    <p className="text-foreground font-medium mt-0.5 break-words">{it.value}</p>
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <p className="text-text-gray text-sm">Details will appear here once added.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
