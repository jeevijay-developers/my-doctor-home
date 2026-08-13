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
      <div className="container mx-auto px-3 sm:px-4 relative z-10">
        <div className="grid grid-cols-2 gap-2 sm:gap-8 lg:gap-12 items-center max-w-5xl mx-auto">
          <AnimatedItem className="relative flex justify-center lg:justify-start">
            <div className="relative">
              <div className="absolute -inset-1.5 sm:-inset-4 rounded-2xl sm:rounded-[2.5rem] bg-gradient-to-br from-teal/15 via-royal/10 to-transparent -z-10" />
              <div className="w-[100px] h-[100px] sm:w-56 sm:h-56 md:w-80 md:h-80 rounded-xl sm:rounded-[2rem] overflow-hidden shadow-xl border-2 sm:border-4 border-card bg-card">
                {profile?.profile_photo_url ? (
                  <img src={profile.profile_photo_url} alt={`Dr. ${profile.full_name}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-royal/5">
                    <User className="h-6 w-6 sm:h-20 sm:w-20 text-royal/30" />
                  </div>
                )}
              </div>
            </div>
          </AnimatedItem>

          <AnimatedItem index={1} className="space-y-1.5 sm:space-y-5 min-w-0">
            <span className="text-[7px] sm:text-xs font-heading font-bold tracking-wider text-royal uppercase">About the Doctor</span>
            <h2 className="font-heading font-bold text-xs sm:text-2xl md:text-3xl lg:text-4xl text-foreground leading-tight">
              About Dr. {profile?.full_name || "Doctor"}
            </h2>
            <p className="text-text-gray text-[8px] sm:text-base leading-snug sm:leading-relaxed">{summary}</p>
            <div className="space-y-1 sm:space-y-3 pt-0.5 sm:pt-1">
              {bullets.map((b, i) => (
                <div key={i} className="flex items-center gap-1 sm:gap-3">
                  <span className="w-3.5 h-3.5 sm:w-8 sm:h-8 rounded sm:rounded-lg bg-royal/10 flex items-center justify-center shrink-0">
                    <b.icon className="h-2 w-2 sm:h-4 sm:w-4 text-royal" />
                  </span>
                  <p className="text-foreground font-medium text-[8px] sm:text-base">{b.text}</p>
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
