import { Clock, MapPin, Star, Calendar, Video } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useDoctorData } from "@/contexts/DoctorContext";


const HeroBanner = () => {
  const { profile, reviews } = useDoctorData();
  const reduce = useReducedMotion();
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

      <div className="container mx-auto px-4 relative z-10">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div className="space-y-6">
            {profile?.specialization && (
              <motion.span {...fadeUp(0)} className="inline-block px-4 py-1.5 rounded-pill bg-teal text-primary-foreground text-sm font-heading font-semibold">
                {profile.specialization}
              </motion.span>
            )}
            <motion.h1 {...fadeUp(0.08)} className="font-heading font-extrabold text-4xl md:text-5xl lg:text-[52px] leading-tight text-primary">
              Dr. {profile?.full_name || "Doctor"}
            </motion.h1>
            {profile?.qualifications && (
              <motion.p {...fadeUp(0.16)} className="text-text-gray text-lg">{profile.qualifications}</motion.p>
            )}

            <motion.div {...fadeUp(0.22)} className="flex flex-wrap gap-3 text-sm">
              {profile?.experience_years && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card shadow-sm text-foreground">
                  <Clock size={14} className="text-royal" /> {profile.experience_years}+ Years Experience
                </span>
              )}
              {profile?.clinic_name && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card shadow-sm text-foreground">
                  <MapPin size={14} className="text-royal" /> {profile.clinic_name}{profile.city ? `, ${profile.city}` : ""}
                </span>
              )}
            </motion.div>

            <motion.div {...fadeUp(0.28)} className="flex items-center gap-2">
              <div className="flex text-warning">
                {[...Array(5)].map((_, i) => <Star key={i} size={18} fill="currentColor" />)}
              </div>
              <span className="font-heading font-bold text-foreground">{avgRating}</span>
              <span className="text-text-gray text-sm">· {reviews.length} review{reviews.length !== 1 ? "s" : ""}</span>
            </motion.div>

            <motion.div {...fadeUp(0.34)} className="flex flex-wrap gap-3 pt-2">
              <Button size="lg" className="btn-pop bg-primary text-primary-foreground font-heading font-semibold shadow-md hover:opacity-90" onClick={() => scrollTo("booking")}>
                <Calendar size={18} className="mr-2" /> Book Clinic Visit
              </Button>
              <Button size="lg" variant="outline" className="btn-pop border-teal text-teal hover:bg-teal hover:text-primary-foreground font-heading font-semibold" onClick={() => scrollTo("online-consultation")}>
                <Video size={18} className="mr-2" /> Online Consultation
              </Button>
            </motion.div>
          </div>

          <motion.div {...fadeUp(0.15)} className="relative flex justify-center lg:justify-end">

            <div className="relative">
              <div className="w-72 h-80 md:w-80 md:h-96 rounded-2xl overflow-hidden shadow-xl border-t-4 border-royal bg-secondary">
                {profile?.profile_photo_url ? (
                  <img src={profile.profile_photo_url} alt={`Dr. ${profile.full_name}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-6xl font-heading font-bold text-royal/30">
                    {profile?.full_name?.charAt(0) || "D"}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroBanner;
