import { Check, User } from "lucide-react";
import { useDoctorData } from "@/contexts/DoctorContext";
import AnimatedItem from "@/components/landing/AnimatedItem";
import { cardColorClass, type CardColor } from "@/lib/cardColor";
import { scrollToSection } from "@/lib/scrollToSection";

const PRIMARY = "#3C83FC";

const AboutSection = ({ cardColor = "secondary" }: { cardColor?: CardColor }) => {
  const { profile } = useDoctorData();

  const doctorName = profile?.full_name || "Doctor";
  const specialization = profile?.specialization || "General Physician";
  const qualifications = profile?.qualifications || "MBBS, MD";
  const experience = profile?.experience_years
    ? `${profile.experience_years}+ Years of Clinical Experience`
    : "Experienced Medical Professional";

  const highlights = [
    [qualifications, specialization].filter(Boolean).join(" - "),
    experience,
    `Expert care in ${specialization}`,
    "Evidence-Based Treatment",
    "Patient-Centered Approach",
    profile?.registration_number ? `Reg. No.: ${profile.registration_number}` : null,
  ].filter((item): item is string => Boolean(item));

  const photoSrc = profile?.profile_photo_url || null;

  return (
    <section id="about" className={`relative overflow-hidden ${cardColorClass(cardColor)}`}>
      <div className="pointer-events-none absolute -left-24 top-12 h-64 w-64 rounded-full bg-blue-100/50 blur-3xl dark:bg-blue-900/15" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-blue-100/40 blur-3xl dark:bg-blue-900/15" />

      <div className="relative mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16 lg:px-12 lg:py-20">
        <div className="grid items-center gap-10 md:grid-cols-[minmax(280px,0.88fr)_minmax(0,1.12fr)] md:gap-14 lg:gap-20">
          <AnimatedItem className="mx-auto w-full max-w-[430px]">
            <div className="relative rounded-[1.75rem] border border-blue-100 bg-white p-3 shadow-[0_24px_50px_-24px_rgba(15,43,80,0.35)] dark:border-blue-900/60 dark:bg-gray-900 sm:p-4">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[1.25rem] bg-gradient-to-br from-blue-50 to-slate-100 dark:from-gray-800 dark:to-blue-950/30 sm:rounded-2xl">
                {photoSrc ? (
                  <img
                    src={photoSrc}
                    alt={`Dr. ${doctorName}`}
                    className="h-full w-full object-cover object-top"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <User className="h-24 w-24 text-blue-200 dark:text-blue-800" strokeWidth={1.4} />
                  </div>
                )}

                <div className="absolute bottom-3 left-3 right-3 rounded-2xl border border-white/80 bg-white/95 px-4 py-3 text-center shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-gray-900/95 sm:bottom-4 sm:left-4 sm:right-4 sm:py-4">
                  <p className="truncate font-heading text-base font-extrabold text-[#092b50] dark:text-white sm:text-lg">
                    {specialization}
                  </p>
                  <p className="mt-0.5 truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                    {qualifications}
                  </p>
                </div>
              </div>
            </div>
          </AnimatedItem>

          <AnimatedItem index={1} className="min-w-0">
            <p className="font-heading text-xs font-extrabold uppercase tracking-[0.18em]" style={{ color: PRIMARY }}>
              About the Doctor
            </p>

            <h2 className="mt-3 font-heading text-3xl font-extrabold leading-tight tracking-[-0.035em] text-[#092b50] dark:text-white sm:text-4xl lg:text-5xl">
              Meet <span style={{ color: PRIMARY }}>Dr. {doctorName}</span>
            </h2>

            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base sm:leading-8">
              I believe in treating every patient with compassion, respect, and personalized care. My goal is to help you achieve better health, confidence, and quality of life through thoughtful, evidence-based treatment.
            </p>

            <div className="mt-7 grid gap-x-6 gap-y-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
              {highlights.map((highlight, index) => (
                <AnimatedItem key={highlight} index={index + 2} staggerMs={55}>
                  <div className="flex items-center gap-3 rounded-xl border border-transparent py-1.5 transition-colors hover:border-blue-100 hover:bg-blue-50/50 dark:hover:border-blue-900/60 dark:hover:bg-blue-950/20">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40" style={{ color: PRIMARY }}>
                      <Check className="h-4 w-4" strokeWidth={2.5} />
                    </span>
                    <span className="text-sm font-semibold leading-5 text-slate-800 dark:text-slate-100 sm:text-[15px]">
                      {highlight}
                    </span>
                  </div>
                </AnimatedItem>
              ))}
            </div>

            <button
              type="button"
              onClick={() => scrollToSection("services")}
              className="mt-8 inline-flex h-11 items-center justify-center rounded-xl border-2 bg-transparent px-7 text-sm font-bold transition-all hover:-translate-y-0.5 hover:bg-blue-50 hover:shadow-md dark:hover:bg-blue-950/30"
              style={{ borderColor: PRIMARY, color: PRIMARY }}
            >
              Know More About Me
            </button>
          </AnimatedItem>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
