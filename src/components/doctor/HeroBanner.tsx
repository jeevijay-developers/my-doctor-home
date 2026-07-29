import { Clock, MapPin, Star, Calendar, Phone, BadgeCheck, Stethoscope } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useDoctorData } from "@/contexts/DoctorContext";

const HeroBanner = () => {
  const { profile, reviews, services } = useDoctorData();
  const reduce = useReducedMotion();
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  const fadeUp = (delay = 0) => ({
    initial: reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduce ? 0 : 0.55, delay: reduce ? 0 : delay, ease: "easeOut" as const },
  });

  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
      : null;

  const minFee = services.length > 0 ? Math.min(...services.map((s: any) => Number(s.price) || 0).filter((n) => n > 0)) : null;

  return (
    <section id="home" className="relative pt-28 md:pt-36 pb-14 md:pb-24 overflow-hidden">
      {/* Layered backdrop */}
      <div className="absolute inset-0 bg-gradient-to-b from-royal/5 via-secondary to-card" />
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, hsl(var(--navy)) 1px, transparent 0)`,
          backgroundSize: "40px 40px",
        }}
      />
      <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-royal/10 blur-3xl" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-teal/10 blur-3xl" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-16 items-center">
          {/* LEFT: Copy */}
          <div className="space-y-6">
            <motion.div {...fadeUp(0)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm text-xs font-heading font-semibold text-royal">
              <BadgeCheck size={14} /> Verified Medical Professional
            </motion.div>

            <motion.h1
              {...fadeUp(0.08)}
              className="font-heading font-extrabold text-4xl sm:text-5xl lg:text-[56px] leading-[1.05] text-primary tracking-tight"
            >
              Dr. {profile?.full_name || "Doctor"}
            </motion.h1>

            {profile?.specialization && (
              <motion.p {...fadeUp(0.14)} className="text-lg sm:text-xl text-royal font-heading font-semibold">
                {profile.specialization}
              </motion.p>
            )}

            {profile?.qualifications && (
              <motion.p {...fadeUp(0.2)} className="text-text-gray text-base sm:text-lg max-w-xl">
                {profile.qualifications}
              </motion.p>
            )}

            <motion.div {...fadeUp(0.26)} className="flex flex-wrap gap-2.5 text-sm">
              {profile?.experience_years && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card shadow-sm border border-border text-foreground">
                  <Clock size={14} className="text-royal" /> {profile.experience_years}+ Years
                </span>
              )}
              {profile?.clinic_name && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card shadow-sm border border-border text-foreground max-w-[260px] truncate">
                  <MapPin size={14} className="text-royal shrink-0" />
                  <span className="truncate">
                    {profile.clinic_name}
                    {profile.city ? `, ${profile.city}` : ""}
                  </span>
                </span>
              )}
              {avgRating && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card shadow-sm border border-border text-foreground">
                  <Star size={14} className="text-warning" fill="currentColor" /> {avgRating} · {reviews.length}
                </span>
              )}
            </motion.div>

            <motion.div {...fadeUp(0.32)} className="flex flex-wrap gap-3 pt-2">
              <Button
                size="lg"
                className="btn-pop bg-primary text-primary-foreground font-heading font-semibold shadow-md hover:opacity-90 rounded-full px-6"
                onClick={() => scrollTo("booking")}
              >
                <Calendar size={18} className="mr-2" /> Book Appointment
              </Button>
              {profile?.phone && (
                <Button
                  size="lg"
                  variant="outline"
                  className="btn-pop border-royal text-royal hover:bg-royal hover:text-primary-foreground font-heading font-semibold rounded-full px-6"
                  asChild
                >
                  <a href={`tel:${profile.phone}`}>
                    <Phone size={18} className="mr-2" /> Contact Doctor
                  </a>
                </Button>
              )}
            </motion.div>
          </div>

          {/* RIGHT: Visual */}
          <motion.div {...fadeUp(0.15)} className="relative flex justify-center lg:justify-end">
            <div className="relative w-full max-w-[420px]">
              {/* Decorative blob */}
              <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-royal/20 via-teal/10 to-transparent blur-2xl" />

              {/* Main portrait card */}
              <div className="relative rounded-[2rem] overflow-hidden aspect-[4/5] bg-secondary shadow-2xl ring-1 ring-black/5">
                {profile?.profile_photo_url ? (
                  <img
                    src={profile.profile_photo_url}
                    alt={`Dr. ${profile.full_name}`}
                    className="w-full h-full object-cover"
                    loading="eager"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-7xl font-heading font-bold text-royal/30">
                    {profile?.full_name?.charAt(0) || "D"}
                  </div>
                )}
                {/* Gradient bottom fade */}
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/40 to-transparent" />
                {/* Availability badge */}
                <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-card/95 backdrop-blur px-3 py-1.5 rounded-full shadow text-xs font-heading font-semibold">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
                  </span>
                  Accepting Patients
                </div>
              </div>

              {/* Floating experience card */}
              {profile?.experience_years && (
                <motion.div
                  {...fadeUp(0.35)}
                  className="hidden sm:flex absolute -left-6 top-10 items-center gap-3 bg-card rounded-2xl shadow-xl border border-border px-4 py-3"
                >
                  <div className="w-10 h-10 rounded-xl bg-royal/10 flex items-center justify-center">
                    <Stethoscope size={18} className="text-royal" />
                  </div>
                  <div>
                    <p className="font-heading font-extrabold text-primary text-lg leading-none">
                      {profile.experience_years}+
                    </p>
                    <p className="text-xs text-text-gray">Years Experience</p>
                  </div>
                </motion.div>
              )}

              {/* Floating consultation card */}
              {minFee !== null && minFee > 0 && (
                <motion.div
                  {...fadeUp(0.42)}
                  className="absolute -right-4 sm:-right-6 bottom-8 bg-card rounded-2xl shadow-xl border border-border px-4 py-3 min-w-[150px]"
                >
                  <p className="text-[10px] uppercase tracking-wider text-text-gray font-heading font-semibold">
                    From
                  </p>
                  <p className="font-heading font-extrabold text-primary text-xl leading-tight">
                    ₹{minFee.toLocaleString()}
                  </p>
                  <p className="text-xs text-text-gray">per consultation</p>
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HeroBanner;
