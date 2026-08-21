import { Calendar, ChevronRight, Clock, HeartHandshake, HeartPulse, MapPin, Phone, ShieldCheck, Sparkles, Users } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useDoctorData } from "@/contexts/DoctorContext";
import { type CardColor } from "@/lib/cardColor";
import { getStatIconComponent, resolveStatValue, type QuickStatItem } from "@/lib/quickStats";
import { scrollToSection } from "@/lib/scrollToSection";
import { formatClinicLocation } from "@/lib/formatClinicLocation";

const PRIMARY = "#3C83FC";
const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatTime12h = (time: string) => {
  const [hourString, minuteString] = time.split(":");
  let hour = Number.parseInt(hourString, 10);
  if (Number.isNaN(hour)) return time;
  const period = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minuteString} ${period}`;
};

const summarizeHours = (workingHours: { day_of_week: number; is_open: boolean; start_time: string | null; end_time: string | null }[]) => {
  const openDays = [...workingHours].filter((day) => day.is_open).sort((a, b) => a.day_of_week - b.day_of_week);
  if (openDays.length === 0) return null;

  const firstDay = openDays[0];
  const lastDay = openDays[openDays.length - 1];
  const isContiguous = lastDay.day_of_week - firstDay.day_of_week === openDays.length - 1;
  const dayLabel = openDays.length === 1
    ? DAY_ABBR[firstDay.day_of_week]
    : isContiguous
      ? `${DAY_ABBR[firstDay.day_of_week]} - ${DAY_ABBR[lastDay.day_of_week]}`
      : openDays.map((day) => DAY_ABBR[day.day_of_week]).join(", ");
  const timeLabel = firstDay.start_time && firstDay.end_time
    ? `${formatTime12h(firstDay.start_time)} - ${formatTime12h(firstDay.end_time)}`
    : null;

  return timeLabel ? `${dayLabel}: ${timeLabel}` : dayLabel;
};

const HeroBanner = ({ cardColor = "secondary" }: { cardColor?: CardColor }) => {
  const { profile, reviews, settings, workingHours } = useDoctorData();
  const reduceMotion = useReducedMotion();

  const fadeUp = (delay = 0) => ({
    initial: reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduceMotion ? 0 : 0.55, delay: reduceMotion ? 0 : delay, ease: "easeOut" },
  });

  const averageRating = reviews.length > 0
    ? (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1)
    : "5.0";

  const defaultStats: QuickStatItem[] = [
    { id: "patients", label: "Patient Consultations", value: "5,000+", icon: "Users", active: true },
    { id: "experience", label: "Years of Experience", value: "", icon: "Award", active: true },
    { id: "rating", label: "Patient Rating", value: `${averageRating}/5`, icon: "Star", active: true },
    { id: "booking", label: "Appointment Requests", value: "24/7", icon: "Headset", active: true },
  ];

  const configuredStats: QuickStatItem[] = (() => {
    if (settings?.quick_stats && Array.isArray(settings.quick_stats) && settings.quick_stats.length > 0) {
      return settings.quick_stats;
    }
    if (settings?.seo_keywords) {
      try {
        const parsed = JSON.parse(settings.seo_keywords);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {
        // seo_keywords may contain plain-text keywords on older profiles.
      }
    }
    return defaultStats;
  })();

  const stats = configuredStats.filter((stat) => stat.active !== false);
  const patientStat = stats.find((stat) => stat.id === "patients" || stat.icon === "Users");
  const patientCount = patientStat ? resolveStatValue(patientStat, profile) : "2,000+";
  const heroPhotoSrc = settings?.hero_photo_url || profile?.profile_photo_url || null;
  const headlineLine1 = settings?.hero_headline_line1 || "Trusted Care for";
  const headlineLine2 = settings?.hero_headline_line2 || "You & Your Family";
  const heroDescription = settings?.hero_description || "Compassionate, personalized and professional healthcare for a better tomorrow.";
  const locationLabel = settings?.hero_location_label || "Clinic Location";
  const hoursLabel = settings?.hero_hours_label || "Consultation";
  const locationValue = formatClinicLocation(profile?.address, profile?.city, profile?.state) || profile?.clinic_name || null;
  const hoursSummary = summarizeHours(workingHours || []);
  const mapsQuery = [profile?.clinic_name, profile?.address, profile?.city, profile?.state].filter(Boolean).join(", ");
  const directionsUrl = mapsQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}` : null;
  const primaryButtonLabel = settings?.hero_primary_button_label || "Book Appointment";
  const secondaryButtonLabel = settings?.hero_secondary_button_label || "Call Now";
  const showHeroStatBadge = settings?.show_hero_stat_badge !== false;
  const HeroStatIcon = getStatIconComponent(settings?.hero_stat_icon || "Award");
  const experienceValue = profile?.experience_years ? `${profile.experience_years}+ Years` : "15+ Years";
  const heroStatText = settings?.hero_stat_text?.trim() || experienceValue;
  const statsGridCols =
    stats.length === 1 ? "grid-cols-1 max-w-xs mx-auto"
    : stats.length === 2 ? "grid-cols-2 max-w-xl mx-auto"
    : stats.length === 3 ? "grid-cols-1 sm:grid-cols-3"
    : "grid-cols-2 sm:grid-cols-4";

  const mobileInfoCardClass = "flex min-h-[76px] w-full items-center gap-4 rounded-2xl border border-blue-100 bg-white px-4 py-3 text-left shadow-[0_10px_28px_rgba(60,131,252,0.10)] dark:border-blue-900/60 dark:bg-gray-900";

  return (
    <section className="overflow-hidden bg-white dark:bg-gray-950">
      <div id="hero-card">
        <div className="relative overflow-hidden bg-gradient-to-b from-blue-50/70 via-white to-white px-5 pb-10 pt-8 dark:from-blue-950/20 dark:via-gray-950 dark:to-gray-950 md:hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_50%_0%,rgba(60,131,252,0.14),transparent_68%)]" />
          <div className="relative mx-auto max-w-md">
            <motion.div {...fadeUp(0)} className="text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 shadow-[0_8px_24px_rgba(60,131,252,0.14)] dark:border-blue-900 dark:bg-gray-900 dark:text-slate-300">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-white">
                  <Sparkles className="h-3 w-3 fill-white" aria-hidden="true" />
                </span>
                <span>Trusted by <strong style={{ color: PRIMARY }}>{patientCount}</strong> patients</span>
              </div>

              <h1 className="mt-7 font-heading text-[2.25rem] font-extrabold leading-[1.12] tracking-[-0.04em] text-[#092b50] dark:text-white">
                <span className="block">{headlineLine1}</span>
                <span className="mt-1 block" style={{ color: PRIMARY }}>{headlineLine2}</span>
              </h1>

              <div className="mx-auto mt-5 flex max-w-[240px] items-center gap-3 text-blue-200">
                <span className="h-px flex-1 bg-blue-100 dark:bg-blue-900" />
                <HeartPulse className="h-6 w-6" style={{ color: PRIMARY }} />
                <span className="h-px flex-1 bg-blue-100 dark:bg-blue-900" />
              </div>

              <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-300">
                {heroDescription}
              </p>
            </motion.div>

            <motion.div {...fadeUp(0.12)} className="mt-6 space-y-3">
              {locationValue && (
                directionsUrl ? (
                  <a href={directionsUrl} target="_blank" rel="noreferrer" className={mobileInfoCardClass}>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50" style={{ color: PRIMARY }}>
                      <MapPin className="h-6 w-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">{locationLabel}</span>
                      <span className="mt-1 block truncate text-sm font-bold text-[#092b50] dark:text-white">{locationValue}</span>
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0" style={{ color: PRIMARY }} />
                  </a>
                ) : (
                  <div className={mobileInfoCardClass}>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50" style={{ color: PRIMARY }}>
                      <MapPin className="h-6 w-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">{locationLabel}</span>
                      <span className="mt-1 block truncate text-sm font-bold text-[#092b50] dark:text-white">{locationValue}</span>
                    </span>
                  </div>
                )
              )}

              {hoursSummary && (
                <button type="button" onClick={() => scrollToSection("booking")} className={mobileInfoCardClass}>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50" style={{ color: PRIMARY }}>
                    <Clock className="h-6 w-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">{hoursLabel}</span>
                    <span className="mt-1 block truncate text-sm font-bold text-[#092b50] dark:text-white">{hoursSummary}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0" style={{ color: PRIMARY }} />
                </button>
              )}
            </motion.div>

            <motion.div {...fadeUp(0.2)} className="mt-5 space-y-3">
              {profile?.phone && (
                <a
                  href={`tel:${profile.phone}`}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white shadow-[0_10px_25px_rgba(60,131,252,0.28)] transition-transform active:scale-[0.98]"
                  style={{ backgroundColor: PRIMARY }}
                >
                  <Phone className="h-5 w-5" />
                  {secondaryButtonLabel}
                </a>
              )}
              <button
                type="button"
                onClick={() => scrollToSection("booking")}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 bg-white text-sm font-bold transition-colors hover:bg-blue-50 active:scale-[0.98] dark:bg-gray-950 dark:hover:bg-blue-950/30"
                style={{ borderColor: PRIMARY, color: PRIMARY }}
              >
                <Calendar className="h-5 w-5" />
                {primaryButtonLabel}
              </button>
            </motion.div>

            <motion.div {...fadeUp(0.28)} className="relative mt-5 overflow-hidden rounded-[1.75rem] border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-blue-100 shadow-[0_18px_38px_rgba(60,131,252,0.16)] dark:border-blue-900/60 dark:from-gray-900 dark:via-gray-900 dark:to-blue-950/40">
              <div className="pointer-events-none absolute -right-12 top-24 h-52 w-52 rounded-full bg-blue-200/45" />
              <div className="pointer-events-none absolute left-5 top-5 text-4xl font-light text-blue-100">+</div>
              <div className="relative aspect-[4/4.25] overflow-hidden">
                {heroPhotoSrc ? (
                  <img src={heroPhotoSrc} alt={`Dr. ${profile?.full_name || "Doctor"}`} className="h-full w-full object-cover object-top" />
                ) : (
                  <div className="flex h-full items-center justify-center font-heading text-7xl font-bold text-blue-200">
                    {profile?.full_name?.charAt(0) || "D"}
                  </div>
                )}
              </div>

              {showHeroStatBadge && (
                <div className="absolute left-5 top-16 flex h-[92px] w-[92px] flex-col items-center justify-center rounded-full border border-white/80 bg-white/90 text-center shadow-xl backdrop-blur dark:border-white/10 dark:bg-gray-900/90">
                  <span className="mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-blue-50" style={{ color: PRIMARY }}>
                    <HeroStatIcon className="h-4 w-4" />
                  </span>
                  <span className="max-w-[74px] truncate text-xs font-extrabold" style={{ color: PRIMARY }}>{heroStatText}</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Experience</span>
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 grid grid-cols-3 divide-x divide-blue-100 rounded-2xl border-t border-blue-100 bg-white/95 px-1 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur dark:divide-blue-900 dark:border-blue-900 dark:bg-gray-900/95">
                <div className="flex items-center justify-center gap-1.5 px-1">
                  <Users className="h-5 w-5 shrink-0" style={{ color: PRIMARY }} />
                  <span><strong className="block text-[11px] text-[#092b50] dark:text-white">{patientCount}</strong><span className="block text-[9px] text-slate-500">Happy Patients</span></span>
                </div>
                <div className="flex items-center justify-center gap-1.5 px-1">
                  <ShieldCheck className="h-5 w-5 shrink-0" style={{ color: PRIMARY }} />
                  <span><strong className="block text-[10px] text-[#092b50] dark:text-white">Quality</strong><span className="block text-[9px] text-slate-500">Healthcare</span></span>
                </div>
                <div className="flex items-center justify-center gap-1.5 px-1">
                  <HeartHandshake className="h-5 w-5 shrink-0" style={{ color: PRIMARY }} />
                  <span><strong className="block text-[10px] text-[#092b50] dark:text-white">Personalized</strong><span className="block text-[9px] text-slate-500">Care</span></span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        <div className="hidden md:block">
          <div className="mx-auto max-w-7xl px-8 pb-14 pt-14 lg:px-12 lg:pb-20 lg:pt-16">
            <div className="grid items-center gap-12 md:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)] lg:gap-20 xl:gap-28">
              <motion.div {...fadeUp(0)} className="mx-auto w-full max-w-2xl text-left md:mx-0">
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3.5 py-2 text-sm font-semibold text-blue-700 shadow-sm dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200">
                  <Sparkles className="h-4 w-4 fill-yellow-300 text-yellow-500" aria-hidden="true" />
                  <span>Trusted by {patientCount} patients</span>
                </div>

                <motion.h1 {...fadeUp(0.08)} className="font-heading text-5xl font-extrabold leading-[1.04] tracking-[-0.04em] text-[#082d57] dark:text-white lg:text-6xl">
                  <span className="block">{headlineLine1}</span>
                  <span className="mt-1 block" style={{ color: PRIMARY }}>{headlineLine2}</span>
                </motion.h1>

                <motion.p {...fadeUp(0.16)} className="mt-6 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300 lg:text-lg lg:leading-8">
                  {heroDescription}
                </motion.p>

                {(locationValue || hoursSummary) && (
                  <motion.div {...fadeUp(0.22)} className="mt-7 grid max-w-xl gap-3 sm:grid-cols-2">
                    {locationValue && (
                      <div className="flex min-w-0 items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 dark:border-blue-900 dark:bg-blue-950/20">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100" style={{ color: PRIMARY }}><MapPin className="h-4 w-4" /></span>
                        <span className="min-w-0"><span className="block text-xs font-medium text-slate-500 dark:text-slate-400">{locationLabel}</span><span className="mt-0.5 block truncate text-sm font-semibold text-[#082d57] dark:text-white">{locationValue}</span></span>
                      </div>
                    )}
                    {hoursSummary && (
                      <div className="flex min-w-0 items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 dark:border-blue-900 dark:bg-blue-950/20">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100" style={{ color: PRIMARY }}><Clock className="h-4 w-4" /></span>
                        <span className="min-w-0"><span className="block text-xs font-medium text-slate-500 dark:text-slate-400">{hoursLabel}</span><span className="mt-0.5 block truncate text-sm font-semibold text-[#082d57] dark:text-white">{hoursSummary}</span></span>
                      </div>
                    )}
                  </motion.div>
                )}

                <motion.div {...fadeUp(0.28)} className="mt-7 flex flex-wrap gap-3">
                  <Button onClick={() => scrollToSection("booking")} className="h-12 rounded-xl px-7 font-semibold text-white shadow-[0_10px_24px_rgba(60,131,252,0.24)]" style={{ backgroundColor: PRIMARY }}>
                    <Calendar className="mr-2 h-4 w-4" />{primaryButtonLabel}
                  </Button>
                  {profile?.phone && (
                    <Button asChild variant="outline" className="h-12 rounded-xl border-blue-200 bg-white px-7 font-semibold text-[#082d57] hover:bg-blue-50 dark:border-blue-900 dark:bg-gray-900 dark:text-white">
                      <a href={`tel:${profile.phone}`}><Phone className="mr-2 h-4 w-4" />{secondaryButtonLabel}</a>
                    </Button>
                  )}
                </motion.div>
              </motion.div>

              <motion.div {...fadeUp(0.14)} className="relative mx-auto w-full max-w-[430px] px-5 pb-5 md:justify-self-end">
                <div className="absolute -inset-8 -z-10 rounded-full bg-blue-100/60 blur-3xl dark:bg-blue-900/20" />
                <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] border border-blue-100 bg-gradient-to-br from-blue-50 to-slate-100 shadow-[0_28px_55px_-24px_rgba(60,131,252,0.38)] dark:border-blue-900 dark:from-gray-800 dark:to-gray-900">
                  {heroPhotoSrc ? (
                    <img src={heroPhotoSrc} alt={`Dr. ${profile?.full_name || "Doctor"}`} className="h-full w-full object-cover object-top" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center font-heading text-7xl font-bold text-blue-200">{profile?.full_name?.charAt(0) || "D"}</div>
                  )}
                  {showHeroStatBadge && (
                    <div className="absolute bottom-5 left-5 right-5 flex items-center gap-3 rounded-2xl border border-white/70 bg-white/95 px-4 py-3.5 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-gray-900/90">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ backgroundColor: PRIMARY }}><HeroStatIcon className="h-5 w-5" /></span>
                      <span className="min-w-0 text-left"><span className="block truncate text-base font-bold text-[#082d57] dark:text-white">{heroStatText}</span><span className="block text-sm font-medium text-slate-500 dark:text-slate-400">Clinical Experience</span></span>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>

            {settings.show_quick_stats !== false && stats.length > 0 && (
              <motion.div {...fadeUp(0.18)} className={`mt-16 overflow-hidden rounded-2xl border border-blue-100 bg-blue-50/40 shadow-sm dark:border-blue-900 ${cardColor === "secondary" ? "dark:bg-gray-900" : "dark:bg-card"}`}>
                <div className={`grid ${statsGridCols} divide-x divide-blue-100 dark:divide-blue-900`}>
                  {stats.map((stat, index) => {
                    const StatIcon = getStatIconComponent(stat.icon);
                    return (
                      <div key={stat.id || index} className="px-3 py-6 text-center">
                        <StatIcon className="mx-auto mb-2 h-5 w-5" style={{ color: PRIMARY }} strokeWidth={2} />
                        <p className="font-heading text-2xl font-extrabold text-[#082d57] dark:text-white">{resolveStatValue(stat, profile)}</p>
                        <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">{stat.label}</p>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroBanner;
