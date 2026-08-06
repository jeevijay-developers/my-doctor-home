import { Stethoscope, GraduationCap, Clock, MapPin, User } from "lucide-react";
import { useDoctorData } from "@/contexts/DoctorContext";
import AnimatedItem from "@/components/landing/AnimatedItem";

const AboutSection = () => {
  const { profile } = useDoctorData();

  const bullets = [
    profile?.specialization && { icon: Stethoscope, text: `Specializes in ${profile.specialization}` },
    profile?.qualifications && { icon: GraduationCap, text: profile.qualifications },
    profile?.experience_years && { icon: Clock, text: `${profile.experience_years}+ years of clinical experience` },
    profile?.clinic_name && { icon: MapPin, text: `Practices at ${profile.clinic_name}${profile.city ? `, ${profile.city}` : ""}` },
  ].filter(Boolean) as { icon: typeof Stethoscope; text: string }[];

  const summary = [
    `Dr. ${profile?.full_name || "Doctor"} is a`,
    profile?.specialization ? `${profile.specialization.toLowerCase()}` : "healthcare professional",
    profile?.experience_years ? `with ${profile.experience_years}+ years of experience` : "",
    profile?.clinic_name ? `, practicing at ${profile.clinic_name}${profile.city ? `, ${profile.city}` : ""}.` : ".",
  ].filter(Boolean).join(" ").replace(/\s+\./, ".").replace(/\s+,/, ",");

  return (
    <section id="about" className="relative py-16 md:py-24 bg-secondary overflow-hidden">
      <div className="absolute -top-16 -left-24 w-72 h-72 rounded-full bg-royal/10 dark:bg-royal/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-16 w-80 h-80 rounded-full bg-teal/10 dark:bg-teal/20 blur-3xl pointer-events-none" />
      <div className="container mx-auto px-4 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
          <AnimatedItem className="relative flex justify-center lg:justify-start order-2 lg:order-1">
            <div className="relative">
              <div className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-br from-teal/15 via-royal/10 to-transparent -z-10" />
              <div className="w-64 h-64 md:w-80 md:h-80 rounded-[2rem] overflow-hidden shadow-xl border-4 border-card bg-card">
                {profile?.profile_photo_url ? (
                  <img src={profile.profile_photo_url} alt={`Dr. ${profile.full_name}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-royal/5">
                    <User size={80} className="text-royal/30" />
                  </div>
                )}
              </div>
            </div>
          </AnimatedItem>

          <AnimatedItem index={1} className="space-y-5 order-1 lg:order-2">
            <span className="text-xs font-heading font-bold tracking-wider text-royal uppercase">About the Doctor</span>
            <h2 className="font-heading font-bold text-3xl md:text-4xl text-foreground">
              About Dr. {profile?.full_name || "Doctor"}
            </h2>
            <p className="text-text-gray leading-relaxed">{summary}</p>
            <div className="space-y-3 pt-1">
              {bullets.map((b, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-royal/10 flex items-center justify-center shrink-0">
                    <b.icon size={16} className="text-royal" />
                  </span>
                  <p className="text-foreground font-medium">{b.text}</p>
                </div>
              ))}
            </div>
          </AnimatedItem>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
