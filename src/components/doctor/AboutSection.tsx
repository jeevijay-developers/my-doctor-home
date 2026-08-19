import { User, CheckCircle2 } from "lucide-react";
import { useDoctorData } from "@/contexts/DoctorContext";
import { Button } from "@/components/ui/button";
import AnimatedItem from "@/components/landing/AnimatedItem";
import { cardColorClass, type CardColor } from "@/lib/cardColor";
import { scrollToSection } from "@/lib/scrollToSection";

const DEFAULT_ABOUT_PHOTO = "https://lh3.googleusercontent.com/aida-public/AB6AXuA-b7rGJhpL90sVuTofZP2204Pf-uKvpds6_Qsr5bgoGyLgeU3Y9Q0Z6iXz_wgoaLbang5HXII_X0d8ZmmB0NDrOJD5R3YsosCbHdn1RYbyIbDXmR3hdzuTbqmCGmYmfjvrMlzhmToDKKa-JoUytz5CLGb9g6afrEdzliot52hZEfE6jht0NcSCwp_eUVrqYK_l5AZWirOYLvZKaQ_XwWt_QWEHukPRVdENr85rOY-VaJXV0XdnF4zu";

const AboutSection = ({ cardColor = "secondary" }: { cardColor?: CardColor }) => {
  const { profile } = useDoctorData();
  const scrollTo = (id: string) => scrollToSection(id);

  const qualLine = [profile?.qualifications, profile?.specialization].filter(Boolean).join(" - ") || "MBBS MD - General Physician";
  const expText = profile?.experience_years ? `${profile.experience_years}+ Years of Clinical Experience` : "20+ Years of Clinical Experience";
  const regText = profile?.registration_number ? `Reg. No.: ${profile.registration_number}` : "Reg. No.: MCI_3333";

  const bullets = [
    qualLine,
    expText,
    "Expert in Preventive & General Healthcare",
    "Chronic Disease Management",
    "Patient-Centered Approach",
    regText,
  ];

  const docName = profile?.full_name || "Rajkumar Prajapati";
  const photoSrc = profile?.profile_photo_url || DEFAULT_ABOUT_PHOTO;

  return (
    <>
      {/* MOBILE VIEW (md:hidden) */}
      <div className="md:hidden">
        <section id="about" className="bg-primary-50 dark:bg-gray-900/80 py-8 px-4 relative overflow-hidden my-4 rounded-3xl">
          <div className="absolute -right-10 top-0 w-32 h-32 bg-primary-100 dark:bg-primary-900/30 rounded-full opacity-50 blur-2xl pointer-events-none" />
          <div className="absolute -left-10 bottom-0 w-32 h-32 bg-primary-100 dark:bg-primary-900/30 rounded-full opacity-50 blur-2xl pointer-events-none" />
          
          <div className="relative z-10 flex flex-col gap-6 items-start">
            <div className="w-32 shrink-0 mx-auto">
              <div className="bg-white dark:bg-gray-800 p-1 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                <img
                  alt="Doctor Profile"
                  className="w-full h-auto rounded-xl object-cover bg-gray-100 dark:bg-gray-700"
                  src={photoSrc}
                />
                <div className="text-center mt-2 pb-1">
                  <p className="text-[10px] font-semibold text-text-dark dark:text-foreground">
                    {profile?.specialization || "General Physician"}
                  </p>
                  <p className="text-[8px] text-text-muted dark:text-muted-foreground">
                    {profile?.qualifications || "MBBS, MD"}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 w-full">
              <p className="text-[10px] font-bold text-primary-500 uppercase tracking-wider mb-1">
                ABOUT THE DOCTOR
              </p>
              <h3 className="text-lg font-bold text-text-dark dark:text-foreground mb-2">
                About <span className="text-primary-600 dark:text-primary-400">Dr. {docName}</span>
              </h3>
              <p className="text-xs text-text-muted dark:text-gray-300 leading-relaxed mb-4">
                I believe in treating every patient with compassion, respect and personalized care. My goal is to help you achieve better health and a better life.
              </p>

              <ul className="space-y-2">
                {bullets.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-text-dark dark:text-gray-200">
                    <CheckCircle2 size={14} className="text-primary-400 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>

      {/* DESKTOP VIEW (hidden md:block) */}
      <div className="hidden md:block">
        <section id="about-desktop" className={`relative overflow-hidden ${cardColorClass(cardColor)}`}>
          <div className="absolute -top-16 -left-24 w-72 h-72 rounded-full bg-teal/10 dark:bg-teal/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-16 w-80 h-80 rounded-full bg-royal/10 dark:bg-royal/20 blur-3xl pointer-events-none" />
          <div className="relative z-10 px-[5px] py-6 sm:py-10 md:px-12 md:py-14">
            <div className="grid grid-cols-2 gap-2 sm:gap-8 lg:gap-12 items-center max-w-5xl mx-auto">
              <AnimatedItem className="relative flex justify-center lg:justify-start">
                <div className="relative">
                  <div className="absolute -inset-1.5 sm:-inset-4 rounded-2xl sm:rounded-[2.5rem] bg-gradient-to-br from-teal/15 via-royal/10 to-transparent -z-10" />
                  <div className="w-[100px] h-[100px] sm:w-56 sm:h-56 md:w-72 md:h-72 rounded-xl sm:rounded-[2rem] overflow-hidden shadow-xl border-2 sm:border-4 border-border bg-card flex items-center justify-center">
                    {profile?.profile_photo_url ? (
                      <img src={profile.profile_photo_url} alt={`Dr. ${profile.full_name}`} className="w-full h-full object-contain" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <User className="h-6 w-6 sm:h-20 sm:w-20 text-royal/30" />
                      </div>
                    )}
                  </div>
                  {(profile?.specialization || profile?.qualifications) && (
                    <div className="mt-1.5 sm:mt-3 rounded-lg sm:rounded-xl bg-card border border-border px-[5px] py-1 sm:py-2.5 md:px-4 text-center">
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
                  className="hidden sm:inline-flex font-heading font-semibold h-7 px-2 text-[9px] sm:h-10 sm:px-6 sm:text-sm mt-1 sm:mt-2"
                  onClick={() => scrollTo("services")}
                >
                  Know More About Me
                </Button>
              </AnimatedItem>
            </div>
          </div>
        </section>
      </div>
    </>
  );
};

export default AboutSection;
