import { Clock, MapPin, Star, Calendar, Phone, Navigation, Users, Award, Headset } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useDoctorData } from "@/contexts/DoctorContext";
import { cardColorClass, type CardColor } from "@/lib/cardColor";

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatTime12h = (t: string) => {
  const [hStr, mStr] = t.split(":");
  let h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${mStr} ${ampm}`;
};

// Derives a compact "Mon - Sat: 9:00 AM - 7:00 PM"-style summary from the
// doctor's real per-day working_hours rows (not invented copy) — takes the
// first open day's hours as the representative time range and collapses a
// contiguous run of open days into a "First - Last" range.
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
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  const fadeUp = (delay = 0) => ({
    initial: reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduce ? 0 : 0.5, delay: reduce ? 0 : delay, ease: "easeOut" },
  });

  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : "5.0";

  const locationValue = [profile?.address, profile?.city].filter(Boolean).join(", ") || profile?.clinic_name || null;
  const hoursSummary = summarizeHours(workingHours || []);
  const mapsQuery = [profile?.clinic_name, profile?.address, profile?.city].filter(Boolean).join(", ");
  const directionsUrl = mapsQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}` : null;

  // Same stats previously rendered by the separate QuickStats section — now
  // folded directly into this card (see the reference design) so the two
  // visually read as one continuous card. Still respects the doctor's
  // "Quick Stats" show/hide toggle from My Website → Settings.
  const stats = [
    { icon: Users, value: "5,000+", label: "Patient Consultations" },
    { icon: Award, value: `${profile?.experience_years || 0}+`, label: "Years of Experience" },
    { icon: Star, value: `${avgRating}/5`, label: "Patient Rating" },
    { icon: Headset, value: "24/7", label: "Appointment Requests" },
  ];

  return (
    <section className="relative pt-24 pb-0 md:pt-32 md:pb-0 overflow-hidden bg-white dark:bg-black">
      <div className="px-5 relative z-10">
        <motion.div id="hero-card" {...fadeUp(0)} className={`relative flex flex-col justify-center rounded-2xl sm:rounded-[2rem] md:rounded-[2.5rem] overflow-hidden border border-border/60 shadow-xl sm:shadow-2xl ${cardColorClass(cardColor)}`}>
          <div className="relative z-10 px-3 py-5 sm:px-8 sm:py-10 md:px-12 md:py-14">
            {/* flex (not grid-cols-2) so text/photo size to their own
                content instead of stretching to fixed 50/50 columns —
                justify-center then centers the pair as a unit, turning
                unused leftover width into equal left/right breathing room
                instead of one large gap between them. */}
            <div className="flex items-center justify-center gap-2 sm:gap-6 lg:gap-[200px]">
              <div className="space-y-1.5 sm:space-y-4 lg:space-y-6 min-w-0">
                <motion.h1 {...fadeUp(0.08)} className="font-heading font-extrabold text-sm sm:text-3xl md:text-4xl lg:text-[52px] leading-tight text-foreground">
                  <span className="block">Trusted Care for</span>
                  <span className="block text-royal mt-0.5 sm:mt-1.5 lg:mt-2">You &amp; Your Family</span>
                </motion.h1>
                <motion.p {...fadeUp(0.16)} className="text-text-gray text-[8px] sm:text-base leading-snug sm:leading-relaxed max-w-md">
                  Compassionate, personalized and professional healthcare for a better tomorrow.
                </motion.p>

                {(locationValue || hoursSummary) && (
                  <motion.div {...fadeUp(0.22)} className="flex flex-wrap gap-2 sm:gap-6 pt-0.5 sm:pt-1">
                    {locationValue && (
                      <div className="flex items-start gap-1 sm:gap-2 min-w-0">
                        <span className="w-3.5 h-3.5 sm:w-8 sm:h-8 rounded-full bg-royal/10 flex items-center justify-center shrink-0"><MapPin className="h-2 w-2 sm:h-4 sm:w-4 text-royal" /></span>
                        <div className="min-w-0">
                          <p className="text-text-gray text-[6px] sm:text-xs font-medium">Clinic Location</p>
                          <p className="text-foreground text-[7px] sm:text-sm font-semibold truncate">{locationValue}</p>
                        </div>
                      </div>
                    )}
                    {hoursSummary && (
                      <div className="flex items-start gap-1 sm:gap-2 min-w-0">
                        <span className="w-3.5 h-3.5 sm:w-8 sm:h-8 rounded-full bg-royal/10 flex items-center justify-center shrink-0"><Clock className="h-2 w-2 sm:h-4 sm:w-4 text-royal" /></span>
                        <div className="min-w-0">
                          <p className="text-text-gray text-[6px] sm:text-xs font-medium">Consultation</p>
                          <p className="text-foreground text-[7px] sm:text-sm font-semibold truncate">{hoursSummary}</p>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                <motion.div {...fadeUp(0.28)} className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-3 pt-1 sm:pt-2">
                  <Button variant="cta" className="font-heading font-semibold h-7 px-2 text-[9px] sm:h-11 sm:px-8 sm:text-sm w-full sm:w-auto" onClick={() => scrollTo("booking")}>
                    <Calendar className="h-3 w-3 sm:h-[18px] sm:w-[18px] mr-1 sm:mr-2" /> Book Appointment
                  </Button>
                  {profile?.phone && (
                    <Button
                      variant="cta-outline"
                      className="font-heading font-semibold h-7 px-2 text-[9px] sm:h-11 sm:px-8 sm:text-sm w-full sm:w-auto"
                      asChild
                    >
                      <a href={`tel:${profile.phone}`}>
                        <Phone className="h-3 w-3 sm:h-[18px] sm:w-[18px] mr-1 sm:mr-2" /> Call Now
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
                    <Navigation className="h-2 w-2 sm:h-3.5 sm:w-3.5" /> Get Directions
                  </motion.a>
                )}
              </div>

              <motion.div {...fadeUp(0.15)} className="relative shrink-0">
                <div className="relative">
                  <div className="absolute -inset-1.5 sm:-inset-4 rounded-2xl sm:rounded-[2.5rem] bg-gradient-to-br from-royal/15 via-teal/10 to-transparent -z-10" />
                  <div className="w-[100px] h-[112px] sm:w-56 sm:h-64 md:w-80 md:h-96 rounded-xl sm:rounded-[2rem] overflow-hidden shadow-xl border-2 sm:border-4 border-border bg-card">
                    {profile?.profile_photo_url ? (
                      <img src={profile.profile_photo_url} alt={`Dr. ${profile.full_name}`} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xl sm:text-6xl font-heading font-bold text-royal/30">
                        {profile?.full_name?.charAt(0) || "D"}
                      </div>
                    )}
                  </div>
                  <div className="absolute -bottom-2 sm:-bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-0.5 sm:gap-1.5 px-1.5 py-0.5 sm:px-4 sm:py-2 rounded-pill bg-card border border-border shadow-lg whitespace-nowrap">
                    <Users className="h-2 w-2 sm:h-3.5 sm:w-3.5 text-royal" />
                    <span className="text-[6px] sm:text-sm font-heading font-bold text-foreground">5,000+ Patient Consultations</span>
                  </div>
                </div>
              </motion.div>

            </div>
          </div>
        </motion.div>

        {/* Separate card (not part of the hero card above) — same bg/border/
            shadow treatment so it still reads as belonging to the same
            design language, just its own distinct card underneath. Stays
            white in Light Mode, but in Dark Mode matches the About card's
            own dark background (via the dark: override below) instead of
            staying white — text switches to the theme-adaptive tokens only
            in Dark Mode too, so it stays legible against that darker card. */}
        {settings.show_quick_stats !== false && (
          <motion.div {...fadeUp(0.1)} className={`relative rounded-2xl sm:rounded-[2rem] md:rounded-[2.5rem] overflow-hidden bg-white ${cardColor === "secondary" ? "dark:bg-secondary" : "dark:bg-card"} border border-border/60 shadow-xl sm:shadow-2xl mt-8 md:mt-12`}>
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border">
              {stats.map((s, i) => (
                <motion.div key={i} {...fadeUp(0.15 + i * 0.05)} className="text-center py-3 px-1 sm:py-6 sm:px-3 space-y-0.5 sm:space-y-2">
                  <s.icon size={16} className="mx-auto text-royal sm:hidden" strokeWidth={2} />
                  <s.icon size={26} className="mx-auto text-royal hidden sm:block" strokeWidth={2} />
                  <p className="font-heading font-extrabold text-sm sm:text-3xl md:text-4xl text-gray-900 dark:text-foreground">{s.value}</p>
                  <p className="text-[7px] sm:text-sm text-gray-500 dark:text-text-gray font-medium">{s.label}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </section>
  );
};

export default HeroBanner;
