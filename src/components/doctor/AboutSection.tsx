import { User, CheckCircle2 } from "lucide-react";
import { useDoctorData } from "@/contexts/DoctorContext";
import { Button } from "@/components/ui/button";
import AnimatedItem from "@/components/landing/AnimatedItem";
import { cardColorClass, type CardColor } from "@/lib/cardColor";

const AboutSection = ({ cardColor = "secondary" }: { cardColor?: CardColor }) => {
  const { profile } = useDoctorData();
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  // Real, doctor-specific facts (qualifications, specialization, experience,
  // registration number) stay dynamic; the three generic phrases below are
  // template copy — not tied to any per-doctor field — matching the
  // reference design's wording exactly.
  const qualLine = [profile?.qualifications, profile?.specialization].filter(Boolean).join(" - ");
  const bullets = [
    qualLine,
    profile?.experience_years ? `${profile.experience_years}+ Years of Clinical Experience` : null,
    "Expert in Preventive & General Healthcare",
    "Chronic Disease Management",
    "Patient-Centered Approach",
    profile?.registration_number ? `Reg. No.: ${profile.registration_number}` : null,
  ].filter(Boolean) as string[];

  return (
    <section id="about" className={`relative overflow-hidden ${cardColorClass(cardColor)}`}>
      <div className="absolute -top-16 -left-24 w-72 h-72 rounded-full bg-teal/10 dark:bg-teal/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-16 w-80 h-80 rounded-full bg-royal/10 dark:bg-royal/20 blur-3xl pointer-events-none" />
      <div className="relative z-10 px-3 py-6 sm:px-8 sm:py-10 md:px-12 md:py-14">
        <div className="grid grid-cols-2 gap-2 sm:gap-8 lg:gap-12 items-center max-w-5xl mx-auto">
          <AnimatedItem className="relative flex justify-center lg:justify-start">
            <div className="relative">
              <div className="absolute -inset-1.5 sm:-inset-4 rounded-2xl sm:rounded-[2.5rem] bg-gradient-to-br from-teal/15 via-royal/10 to-transparent -z-10" />
              <div className="w-[100px] h-[100px] sm:w-56 sm:h-56 md:w-72 md:h-72 rounded-xl sm:rounded-[2rem] overflow-hidden shadow-xl border-2 sm:border-4 border-border bg-card">
                {profile?.profile_photo_url ? (
                  <img src={profile.profile_photo_url} alt={`Dr. ${profile.full_name}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <User className="h-6 w-6 sm:h-20 sm:w-20 text-royal/30" />
                  </div>
                )}
              </div>
              {(profile?.specialization || profile?.qualifications) && (
                <div className="mt-1.5 sm:mt-3 rounded-lg sm:rounded-xl bg-card border border-border px-2 py-1 sm:px-4 sm:py-2.5 text-center">
                  {profile?.specialization && (
                    <p className="text-foreground text-[7px] sm:text-sm font-heading font-semibold truncate">{profile.specialization}</p>
                  )}
                  {profile?.qualifications && (
                    <p className="text-text-gray text-[6px] sm:text-xs truncate">{profile.qualifications}</p>
                  )}
                </div>
              )}
            </div>
          </AnimatedItem>

          <AnimatedItem index={1} className="space-y-1.5 sm:space-y-5 min-w-0">
            <span className="text-[7px] sm:text-xs font-heading font-bold tracking-wider text-teal uppercase">About the Doctor</span>
            <h2 className="font-heading font-bold text-xs sm:text-2xl md:text-3xl lg:text-4xl text-foreground leading-tight">
              About <span className="text-royal">Dr. {profile?.full_name || "Doctor"}</span>
            </h2>
            <p className="text-text-gray text-[8px] sm:text-base leading-snug sm:leading-relaxed">
              I believe in treating every patient with compassion, respect and personalized care. My goal is to help you achieve better health and a better life.
            </p>
            <div className="space-y-1 sm:space-y-3 pt-0.5 sm:pt-1">
              {bullets.map((text, i) => (
                <div key={i} className="flex items-center gap-1 sm:gap-3">
                  <span className="w-3.5 h-3.5 sm:w-8 sm:h-8 rounded sm:rounded-lg bg-royal/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-2 w-2 sm:h-4 sm:w-4 text-teal" />
                  </span>
                  <p className="text-foreground font-medium text-[8px] sm:text-base">{text}</p>
                </div>
              ))}
            </div>
            <Button
              variant="cta-outline"
              className="font-heading font-semibold h-7 px-2 text-[9px] sm:h-10 sm:px-6 sm:text-sm mt-1 sm:mt-2"
              onClick={() => scrollTo("services")}
            >
              Know More About Me
            </Button>
          </AnimatedItem>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
