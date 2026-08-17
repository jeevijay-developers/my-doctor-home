import { useDoctorData } from "@/contexts/DoctorContext";
import AnimatedItem from "@/components/landing/AnimatedItem";
import { DEFAULT_QUICK_STATS, getStatIconComponent, resolveStatValue, QuickStatItem } from "@/lib/quickStats";

const QuickStats = () => {
  const { profile, settings } = useDoctorData();

  const customStats: QuickStatItem[] = (() => {
    if (settings?.quick_stats && Array.isArray(settings.quick_stats) && settings.quick_stats.length > 0) {
      return settings.quick_stats;
    }
    if (settings?.seo_keywords) {
      try {
        const parsed = JSON.parse(settings.seo_keywords);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        // not JSON string
      }
    }
    return DEFAULT_QUICK_STATS;
  })();

  const activeStats = customStats.filter((s) => s.active !== false);

  if (activeStats.length === 0) return null;

  return (
    <section className="bg-card border-t border-border py-10 md:py-12">
      <div className="container mx-auto px-4">
        <div
          className={`grid gap-6 md:divide-x md:divide-border ${
            activeStats.length === 1
              ? "grid-cols-1 max-w-xs mx-auto"
              : activeStats.length === 2
              ? "grid-cols-2 max-w-xl mx-auto"
              : activeStats.length === 3
              ? "grid-cols-1 sm:grid-cols-3"
              : "grid-cols-2 md:grid-cols-4"
          }`}
        >
          {activeStats.map((s, i) => {
            const IconComp = getStatIconComponent(s.icon);
            const val = resolveStatValue(s, profile);
            return (
              <AnimatedItem key={s.id || i} index={i} className="text-center space-y-2">
                <IconComp size={26} className="mx-auto text-royal" strokeWidth={2} />
                <p className="font-heading font-extrabold text-3xl md:text-4xl text-foreground">{val}</p>
                <p className="text-sm text-text-gray font-medium">{s.label}</p>
              </AnimatedItem>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default QuickStats;
