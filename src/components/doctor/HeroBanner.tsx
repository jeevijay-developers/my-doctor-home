import { Clock, MapPin, Star, Calendar, Video, Zap, GraduationCap } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useDoctorData } from "@/contexts/DoctorContext";
import { SparklesCore } from "@/components/ui/sparkles";
import { useIsDarkMode } from "@/hooks/useIsDarkMode";

const LIGHT_SPARKLE_COLOR = "hsl(217 91% 60%)";
const DARK_SPARKLE_COLOR = "#ffffff";

const HeroBanner = () => {
  const { profile, reviews } = useDoctorData();
  const reduce = useReducedMotion();
  const dark = useIsDarkMode();
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  const fadeUp = (delay = 0) => ({
    initial: reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduce ? 0 : 0.5, delay: reduce ? 0 : delay, ease: "easeOut" },
  });


  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : "5.0";

  return (
    <section className="relative pt-24 pb-16 md:pt-32 md:pb-24 overflow-hidden bg-secondary">
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `radial-gradient(circle at 2px 2px, hsl(var(--navy)) 1px, transparent 0)`,
        backgroundSize: "40px 40px"
      }} />
      <SparklesCore
        background="transparent"
        minSize={0.6}
        maxSize={1.6}
        particleDensity={70}
        speed={1}
        particleColor={dark ? DARK_SPARKLE_COLOR : LIGHT_SPARKLE_COLOR}
        className="absolute inset-0 pointer-events-none"
      />

      <div className="container mx-auto px-4 relative z-10">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-6">
            {profile?.experience_years ? (
              <motion.span {...fadeUp(0)} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-pill bg-royal/10 text-royal text-sm font-heading font-semibold">
                <Zap size={14} /> {profile.experience_years}+ Years Experience
              </motion.span>
            ) : profile?.specialization ? (
              <motion.span {...fadeUp(0)} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-pill bg-royal/10 text-royal text-sm font-heading font-semibold">
                <Zap size={14} /> {profile.specialization}
              </motion.span>
            ) : null}
            <motion.h1 {...fadeUp(0.08)} className="font-heading font-extrabold text-4xl md:text-5xl lg:text-[52px] leading-tight text-foreground">
              <span className="text-foreground">Dr. </span>
              <span className="text-royal">{profile?.full_name || "Doctor"}</span>
            </motion.h1>
            {(profile?.qualifications || profile?.specialization) && (
              <motion.div {...fadeUp(0.16)} className="space-y-0.5">
                {profile?.qualifications && (
                  <p className="text-foreground text-lg font-semibold">{profile.qualifications}</p>
                )}
                {profile?.specialization && (
                  <p className="text-text-gray text-base">{profile.specialization}</p>
                )}
              </motion.div>
            )}

            <motion.div {...fadeUp(0.22)} className="flex flex-wrap gap-3 text-sm">
              {profile?.qualifications && (
                <span className="flex items-center gap-2 pl-2 pr-3.5 py-1.5 rounded-pill bg-card border border-border shadow-sm text-foreground font-medium">
                  <span className="w-5 h-5 rounded-full bg-royal/10 flex items-center justify-center shrink-0"><GraduationCap size={12} className="text-royal" /></span>
                  {profile.qualifications}
                </span>
              )}
              {profile?.experience_years && (
                <span className="flex items-center gap-2 pl-2 pr-3.5 py-1.5 rounded-pill bg-card border border-border shadow-sm text-foreground font-medium">
                  <span className="w-5 h-5 rounded-full bg-royal/10 flex items-center justify-center shrink-0"><Clock size={12} className="text-royal" /></span>
                  {profile.experience_years}+ Years Experience
                </span>
              )}
              {profile?.clinic_name && (
                <span className="flex items-center gap-2 pl-2 pr-3.5 py-1.5 rounded-pill bg-card border border-border shadow-sm text-foreground font-medium">
                  <span className="w-5 h-5 rounded-full bg-royal/10 flex items-center justify-center shrink-0"><MapPin size={12} className="text-royal" /></span>
                  {profile.clinic_name}{profile.city ? `, ${profile.city}` : ""}
                </span>
              )}
            </motion.div>

            <motion.div {...fadeUp(0.28)} className="inline-flex items-center gap-2 px-4 py-2 rounded-pill bg-card border border-border shadow-sm">
              <div className="flex text-warning">
                {[...Array(5)].map((_, i) => <Star key={i} size={16} fill="currentColor" />)}
              </div>
              <span className="font-heading font-bold text-foreground">{avgRating}</span>
              <span className="text-text-gray text-sm">({reviews.length} Review{reviews.length !== 1 ? "s" : ""})</span>
            </motion.div>

            <motion.div {...fadeUp(0.34)} className="flex flex-wrap gap-3 pt-2">
              <Button size="lg" variant="cta" className="font-heading font-semibold" onClick={() => scrollTo("booking")}>
                <Calendar size={18} className="mr-2" /> Book Clinic Visit
              </Button>
              <Button size="lg" variant="cta-outline" className="font-heading font-semibold" onClick={() => scrollTo("online-consultation")}>
                <Video size={18} className="mr-2" /> Online Consultation
              </Button>
            </motion.div>
          </div>

          <motion.div {...fadeUp(0.15)} className="relative flex justify-center md:justify-end">
            <div className="relative">
              <div className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-br from-royal/15 via-teal/10 to-transparent -z-10" />
              <div className="w-72 h-80 md:w-80 md:h-96 rounded-[2rem] overflow-hidden shadow-xl border-4 border-card bg-secondary">
                {profile?.profile_photo_url ? (
                  <img src={profile.profile_photo_url} alt={`Dr. ${profile.full_name}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-6xl font-heading font-bold text-royal/30">
                    {profile?.full_name?.charAt(0) || "D"}
                  </div>
                )}
              </div>
              {reviews.length > 0 && (
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-2 rounded-pill bg-card shadow-lg border border-border">
                  <Star size={14} className="text-warning" fill="currentColor" />
                  <span className="text-sm font-heading font-bold text-foreground">{avgRating} Rating</span>
                </div>
              )}
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
};

export default HeroBanner;
