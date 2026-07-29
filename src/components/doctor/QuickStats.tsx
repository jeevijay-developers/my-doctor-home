import { Clock, Award, Star, Stethoscope, IndianRupee, Users } from "lucide-react";
import { useDoctorData } from "@/contexts/DoctorContext";

const QuickStats = () => {
  const { profile, reviews, services } = useDoctorData();

  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
      : null;

  const minFee = services.length > 0
    ? Math.min(...services.map((s: any) => Number(s.price) || 0).filter((n) => n > 0))
    : null;

  const stats = [
    profile?.experience_years && { icon: Clock, value: `${profile.experience_years}+`, label: "Years Experience" },
    profile?.qualifications && { icon: Award, value: profile.qualifications, label: "Qualification", small: true },
    profile?.specialization && { icon: Stethoscope, value: profile.specialization, label: "Specialization", small: true },
    services.length > 0 && { icon: Users, value: `${services.length}`, label: "Services Offered" },
    minFee && { icon: IndianRupee, value: `₹${minFee.toLocaleString()}`, label: "From (Consultation)" },
    avgRating && { icon: Star, value: avgRating, label: `${reviews.length} Patient Review${reviews.length !== 1 ? "s" : ""}` },
  ].filter(Boolean) as any[];

  if (stats.length === 0) return null;

  return (
    <section className="relative -mt-6 md:-mt-10 z-10">
      <div className="container mx-auto px-4">
        <div className="bg-card rounded-2xl shadow-lg border border-border p-4 md:p-6">
          <div className="flex md:grid md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory">
            {stats.map((s, i) => (
              <div
                key={i}
                className="snap-start shrink-0 md:shrink w-[180px] md:w-auto flex items-start gap-3 p-3 rounded-xl bg-secondary/60 hover:bg-secondary transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-royal/10 flex items-center justify-center shrink-0">
                  <s.icon size={18} className="text-royal" />
                </div>
                <div className="min-w-0">
                  <p
                    className={`font-heading font-bold text-primary ${
                      s.small ? "text-sm leading-snug line-clamp-2" : "text-lg"
                    }`}
                  >
                    {s.value}
                  </p>
                  <p className="text-xs text-text-gray mt-0.5">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default QuickStats;
