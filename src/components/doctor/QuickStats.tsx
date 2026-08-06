import { Users, Award, ThumbsUp, Headset } from "lucide-react";
import { useDoctorData } from "@/contexts/DoctorContext";
import AnimatedItem from "@/components/landing/AnimatedItem";

const QuickStats = () => {
  const { profile } = useDoctorData();

  const stats = [
    { icon: Users, value: "5,000+", label: "Patients Treated" },
    { icon: Award, value: `${profile?.experience_years || 0}+`, label: "Years Experience" },
    { icon: ThumbsUp, value: "98%", label: "Success Rate" },
    { icon: Headset, value: "24/7", label: "Online Booking" },
  ];

  return (
    <section className="bg-card border-t border-border py-10 md:py-12">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:divide-x md:divide-border">
          {stats.map((s, i) => (
            <AnimatedItem key={i} index={i} className="text-center space-y-2">
              <s.icon size={26} className="mx-auto text-royal" strokeWidth={2} />
              <p className="font-heading font-extrabold text-3xl md:text-4xl text-foreground">{s.value}</p>
              <p className="text-sm text-text-gray font-medium">{s.label}</p>
            </AnimatedItem>
          ))}
        </div>
      </div>
    </section>
  );
};

export default QuickStats;
