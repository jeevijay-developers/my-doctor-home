import { Clock, MapPin, Calendar, Phone, Navigation, Users, Award, ThumbsUp, Headset } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useDoctorData } from "@/contexts/DoctorContext";
import { cardColorClass, type CardColor } from "@/lib/cardColor";
import { getStatIconComponent, resolveStatValue, type QuickStatItem } from "@/lib/quickStats";
import { formatClinicLocation } from "@/lib/formatClinicLocation";
import { scrollToSection } from "@/lib/scrollToSection";

const DEFAULT_DOCTOR_PORTRAIT = "https://lh3.googleusercontent.com/aida-public/AB6AXuBaAxypuIOMq0rygPBq5vywZP1dfJ8xcEGY74WwCmuBwEwPNgMea0BOa5jpwiv_BDHBupYNlFSJP3lI0XDOGxNJjNZMuRsBAct6SGXuHO9DnZpaGSv4rhxr5t5xhMCklDyVhP4730ynnEfBhDkPR4JvfX-yoxdx5wV9NYRvXIAh0P_Izb2W-YEYu46QkkOzW21QvIrvLCWlLK8t5zpwYUKMbedNFIeLudodNYxsU5q10SozV7MmPgCh";

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatTime12h = (t: string) => {
  const [hStr, mStr] = t.split(":");
  let h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${mStr} ${ampm}`;
};

const summarizeHours = (workingHours: { day_of_week: number; is_open: boolean; start_time: string | null; end_time: string | null }[]) => {
  const open = [...workingHours].filter((w) => w.is_open).sort((a, b) => a.day_of_week - b.day_of_week);
  if (open.length === 0) return null;
  const first = open[0];
  const last = open[open.length - 1];
  const isContiguous = last.day_of_week - first.day_of_week === open.length - 1;
  const dayLabel = open.length === 1
    ? DAY_ABBR[first.day_of_week]
    : isContiguous
      ? `${DAY_ABBR[first.day_of_week]} - ${DAY_ABBR[last.day_of_week]}`
      : open.map((w) => DAY_ABBR[w.day_of_week]).join(", ");
  const timeLabel = first.start_time && first.end_time
    ? `${formatTime12h(first.start_time)} - ${formatTime12h(first.end_time)}`
    : null;
  return timeLabel ? `${dayLabel}: ${timeLabel}` : dayLabel;
};

const HeroBanner = ({ cardColor = "secondary" }: { cardColor?: CardColor }) => {
  const { profile, reviews, settings, workingHours } = useDoctorData();
  const reduce = useReducedMotion();
  const scrollTo = (id: string) => scrollToSection(id);

  const fadeUp = (delay = 0) => ({
    initial: reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduce ? 0 : 0.5, delay: reduce ? 0 : delay, ease: "easeOut" },
  });

  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : "5.0";

  const heroPhotoSrc = settings?.hero_photo_url || profile?.profile_photo_url || null;
  const heroStatText = settings?.hero_stat_text?.trim() || `${avgRating} Rating`;
  const heroStatIconName = settings?.hero_stat_icon || "Star";
  const HeroStatIcon = getStatIconComponent(heroStatIconName);
  const heroStatIconFill = heroStatIconName === "Star" ? "currentColor" : "none";

  const locationValue = formatClinicLocation(profile?.address, profile?.city, profile?.state) || profile?.clinic_name || null;
  const hoursSummary = summarizeHours(workingHours || []);
  const mapsQuery = [profile?.clinic_name, profile?.address, profile?.city, profile?.state].filter(Boolean).join(", ");
  const directionsUrl = mapsQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}` : null;

  const headlineLine1 = settings?.hero_headline_line1 || "Trusted Care for";
  const headlineLine2 = settings?.hero_headline_line2 || "You & Your Family";
  const heroDescription = settings?.hero_description || "Compassionate, personalized and professional healthcare for a better tomorrow.";
  const locationLabel = settings?.hero_location_label || "Clinic Location";
  const hoursLabel = settings?.hero_hours_label || "Consultation";
  const primaryButtonLabel = settings?.hero_primary_button_label || "Book Appointment";
  const secondaryButtonLabel = settings?.hero_secondary_button_label || "Call Now";
  const directionsLabel = settings?.hero_directions_label || "Get Directions";
  const showHeroStatBadge = settings?.show_hero_stat_badge !== false;

  const defaultStats: QuickStatItem[] = [
    { id: "patients", label: "Patient Consultations", value: "5,000+", icon: "Users", active: true },
    { id: "experience", label: "Years of Experience", value: "", icon: "Award", active: true },
    { id: "rating", label: "Patient Rating", value: `${avgRating}/5`, icon: "Star", active: true },
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
      } catch {}
    }
    return defaultStats;
  })();

  const stats = configuredStats.filter((s) => s.active !== false);
  const statsGridCols =
    stats.length === 1 ? "grid-cols-1 max-w-xs mx-auto"
    : stats.length === 2 ? "grid-cols-2 max-w-xl mx-auto"
    : stats.length === 3 ? "grid-cols-1 sm:grid-cols-3"
    : "grid-cols-2 sm:grid-cols-4";

  return (
    <>
      {/* MOBILE VIEW (md:hidden) — New HTML reference design */}
      <div className="md:hidden">
        <section className="bg-primary-50 dark:bg-gray-900/80 px-4 pt-6 pb-8 rounded-b-3xl relative overflow-hidden">
          <div className="relative z-10 flex flex-col gap-6 items-start">
            <div className="flex-1 w-full">
              <p className="text-sm font-medium text-text-dark dark:text-gray-300 mb-1">{headlineLine1}</p>
              <h2 className="text-2xl font-bold text-primary-600 dark:text-primary-400 mb-3 leading-tight">
                {headlineLine2}
              </h2>
              <p className="text-xs text-text-muted dark:text-gray-400 mb-4 leading-relaxed">
                {heroDescription}
              </p>

              <div className="flex items-center gap-4 text-xs text-text-dark dark:text-gray-200 mb-5 bg-white/60 dark:bg-gray-800/60 p-3 rounded-lg backdrop-blur-sm border border-white/40 dark:border-gray-700/40">
                <div className="flex items-start gap-2">
                  <MapPin size={16} className="text-primary-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-[10px] text-text-muted dark:text-gray-400">{locationLabel}</p>
                    <p className="font-semibold">{locationValue || "xyz, Kota"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock size={16} className="text-primary-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-[10px] text-text-muted dark:text-gray-400">{hoursLabel}</p>
                    <p className="font-semibold">{hoursSummary || "Mon - Sat: 9:00 AM - 1:00 PM"}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => scrollTo("booking")}
                  className="bg-primary-500 text-white text-xs font-semibold py-2.5 px-4 rounded-lg flex items-center gap-2 shadow-sm flex-1 justify-center"
                >
                  <Calendar size={14} /> Appointment
                </button>
                <button
                  onClick={() => profile?.phone ? window.location.href = `tel:${profile.phone}` : scrollTo("contact")}
                  className="bg-white dark:bg-gray-800 text-primary-600 dark:text-primary-400 border border-primary-100 dark:border-gray-700 text-xs font-semibold py-2.5 px-4 rounded-lg flex items-center gap-2 shadow-sm flex-1 justify-center"
                >
                  <Phone size={14} /> {secondaryButtonLabel}
                </button>
              </div>

              <a
                href={directionsUrl || "#"}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center text-xs text-primary-600 dark:text-primary-400 gap-1 font-medium cursor-pointer"
              >
                <Navigation size={12} /> {directionsLabel}
              </a>
            </div>

            <div className="relative mx-auto mt-4 shrink-0">
              <div className="w-32 h-40 bg-white dark:bg-gray-800 rounded-2xl p-1.5 shadow-md relative">
                <img
                  alt={`Dr. ${profile?.full_name || "Rajkumar"} Portrait`}
                  className="w-full h-full object-cover rounded-xl bg-gray-100 dark:bg-gray-700"
                  src={heroPhotoSrc || DEFAULT_DOCTOR_PORTRAIT}
                />
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-yellow-400 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border-2 border-white dark:border-gray-800 shadow-sm whitespace-nowrap">
                  <HeroStatIcon size={10} fill={heroStatIconFill} /> {heroStatText}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-6 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 border-b-0 grid grid-cols-2 divide-x divide-y divide-gray-100 dark:divide-gray-700">
            <div className="p-4 text-center">
              <Users size={22} className="text-primary-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-text-dark dark:text-foreground">5,000+</p>
              <p className="text-[10px] text-text-muted dark:text-muted-foreground">Patients Treated</p>
            </div>
            <div className="p-4 text-center">
              <Award size={22} className="text-primary-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-text-dark dark:text-foreground">
                {profile?.experience_years ? `${profile.experience_years}+` : "20+"}
              </p>
              <p className="text-[10px] text-text-muted dark:text-muted-foreground">Years Experience</p>
            </div>
            <div className="p-4 text-center">
              <ThumbsUp size={22} className="text-primary-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-text-dark dark:text-foreground">98%</p>
              <p className="text-[10px] text-text-muted dark:text-muted-foreground">Success Rate</p>
            </div>
            <div className="p-4 text-center">
              <Headset size={22} className="text-primary-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-text-dark dark:text-foreground">24/7</p>
              <p className="text-[10px] text-text-muted dark:text-muted-foreground">Online Booking</p>
            </div>
          </div>
        </section>
      </div>

      {/* DESKTOP VIEW (hidden md:block) — Original desktop card layout */}
      <div className="hidden md:block">
        <section className="relative pt-4 pb-0 md:pt-6 md:pb-0 overflow-hidden bg-secondary/30 dark:bg-black">
          <div className="px-[5px] md:px-5 relative z-10">
            <motion.div id="hero-card" {...fadeUp(0)} className={`relative flex flex-col justify-center rounded-2xl sm:rounded-[2.5rem] overflow-hidden border border-border/60 shadow-xl sm:shadow-2xl ${cardColorClass(cardColor)}`}>
              <div className="relative z-10 px-[5px] py-8 sm:py-14 md:px-12 md:py-20">
                <div className="flex items-center justify-center gap-2 sm:gap-6 lg:gap-[200px]">
                  <div className="space-y-1.5 sm:space-y-4 lg:space-y-6 min-w-0">
                    <motion.h1 {...fadeUp(0.08)} className="font-heading font-extrabold text-sm sm:text-3xl md:text-4xl lg:text-[52px] leading-tight text-foreground">
                      <span className="block">{headlineLine1}</span>
                      <span className="block text-royal mt-0.5 sm:mt-1.5 lg:mt-2">{headlineLine2}</span>
                    </motion.h1>
                    <motion.p {...fadeUp(0.16)} className="text-text-gray text-[8px] sm:text-base leading-snug sm:leading-relaxed max-w-md">
                      {heroDescription}
                    </motion.p>

                    {(locationValue || hoursSummary) && (
                      <motion.div {...fadeUp(0.22)} className="flex flex-wrap gap-2 sm:gap-6 pt-0.5 sm:pt-1">
                        {locationValue && (
                          <div className="flex items-start gap-1 sm:gap-2 min-w-0">
                            <span className="w-3.5 h-3.5 sm:w-8 sm:h-8 rounded-full bg-royal/10 flex items-center justify-center shrink-0"><MapPin className="h-2 w-2 sm:h-4 sm:w-4 text-royal" /></span>
                            <div className="min-w-0">
                              <p className="text-text-gray text-[6px] sm:text-xs font-medium">{locationLabel}</p>
                              <p className="text-foreground text-[7px] sm:text-sm font-semibold truncate">{locationValue}</p>
                            </div>
                          </div>
                        )}
                        {hoursSummary && (
                          <div className="flex items-start gap-1 sm:gap-2 min-w-0">
                            <span className="w-3.5 h-3.5 sm:w-8 sm:h-8 rounded-full bg-royal/10 flex items-center justify-center shrink-0"><Clock className="h-2 w-2 sm:h-4 sm:w-4 text-royal" /></span>
                            <div className="min-w-0">
                              <p className="text-text-gray text-[6px] sm:text-xs font-medium">{hoursLabel}</p>
                              <p className="text-foreground text-[7px] sm:text-sm font-semibold truncate">{hoursSummary}</p>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}

                    <motion.div {...fadeUp(0.28)} className="flex flex-row gap-1 sm:flex-wrap sm:gap-3 pt-1 sm:pt-2">
                      <Button variant="cta" className="font-heading font-semibold !min-h-0 h-6 px-1 gap-0.5 text-[7px] sm:h-11 sm:px-8 sm:gap-2 sm:text-sm flex-none sm:w-auto" onClick={() => scrollTo("booking")}>
                        <Calendar className="h-2 w-2 sm:h-[18px] sm:w-[18px] sm:mr-2 shrink-0" /> <span className="truncate">{primaryButtonLabel}</span>
                      </Button>
                      {profile?.phone && (
                        <Button
                          variant="cta-outline"
                          className="font-heading font-semibold !min-h-0 h-6 px-1 gap-0.5 text-[7px] sm:h-11 sm:px-8 sm:gap-2 sm:text-sm flex-none sm:w-auto"
                          asChild
                        >
                          <a href={`tel:${profile.phone}`}>
                            <Phone className="h-2 w-2 sm:h-[18px] sm:w-[18px] sm:mr-2 shrink-0" /> <span className="truncate">{secondaryButtonLabel}</span>
                          </a>
                        </Button>
                      )}
                    </motion.div>

                    {directionsUrl && (
                      <motion.a
                        {...fadeUp(0.34)}
                        href={directionsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 sm:gap-1.5 text-[7px] sm:text-sm text-royal hover:underline transition-colors pt-0.5 sm:pt-1"
                      >
                        <Navigation className="h-2 w-2 sm:h-3.5 sm:w-3.5" /> {directionsLabel}
                      </motion.a>
                    )}
                  </div>

                  <motion.div {...fadeUp(0.15)} className="relative shrink-0">
                    <div className="relative">
                      <div className="absolute -inset-1.5 sm:-inset-4 rounded-2xl sm:rounded-[2.5rem] bg-gradient-to-br from-royal/15 via-teal/10 to-transparent -z-10" />
                      <div className="w-[100px] h-[112px] sm:w-56 sm:h-64 md:w-80 md:h-96 rounded-xl sm:rounded-[2rem] overflow-hidden shadow-xl border-2 sm:border-4 border-border bg-card flex items-center justify-center">
                        {heroPhotoSrc ? (
                          <img src={heroPhotoSrc} alt={`Dr. ${profile?.full_name}`} className="w-full h-full object-contain" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xl sm:text-6xl font-heading font-bold text-royal/30">
                            {profile?.full_name?.charAt(0) || "D"}
                          </div>
                        )}
                      </div>
                      {showHeroStatBadge && (
                        <div className="absolute -bottom-2 sm:-bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-0.5 sm:gap-1.5 px-1.5 py-0.5 sm:px-4 sm:py-2 rounded-pill bg-card border border-border shadow-lg whitespace-nowrap">
                          <HeroStatIcon className="h-2 w-2 sm:h-3.5 sm:w-3.5 text-yellow-400" fill={heroStatIconFill} />
                          <span className="text-[6px] sm:text-sm font-heading font-bold text-yellow-400">{heroStatText}</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                </div>
              </div>
            </motion.div>

            {settings.show_quick_stats !== false && stats.length > 0 && (
              <motion.div {...fadeUp(0.1)} className={`relative rounded-2xl sm:rounded-[2rem] md:rounded-[2.5rem] overflow-hidden bg-white ${cardColor === "secondary" ? "dark:bg-secondary" : "dark:bg-card"} border border-border/60 border-b-0 shadow-xl sm:shadow-2xl mt-8 md:mt-12`}>
                <div className={`grid ${statsGridCols} divide-x divide-y sm:divide-y-0 divide-border`}>
                  {stats.map((s, i) => {
                    const IconComp = getStatIconComponent(s.icon);
                    const val = resolveStatValue(s, profile);
                    return (
                      <motion.div key={s.id || i} {...fadeUp(0.15 + i * 0.05)} className="text-center py-3 px-[5px] sm:py-6 md:px-3 space-y-0.5 sm:space-y-2">
                        <IconComp size={16} className="mx-auto text-royal sm:hidden" strokeWidth={2} />
                        <IconComp size={26} className="mx-auto text-royal hidden sm:block" strokeWidth={2} />
                        <p className="font-heading font-extrabold text-sm sm:text-3xl md:text-4xl text-gray-900 dark:text-foreground">{val}</p>
                        <p className="text-[7px] sm:text-sm text-gray-500 dark:text-text-gray font-medium">{s.label}</p>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </div>
        </section>
      </div>
    </>
  );
};

export default HeroBanner;
