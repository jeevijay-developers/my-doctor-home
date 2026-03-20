import { Users, Clock, TrendingUp, Award } from "lucide-react";

const stats = [
  { icon: Users, value: "5,000+", label: "Patients Treated" },
  { icon: Clock, value: "15+", label: "Years Experience" },
  { icon: TrendingUp, value: "98%", label: "Success Rate" },
  { icon: Award, value: "8", label: "Awards" },
];

const QuickStats = () => (
  <section className="bg-card border-t-2 border-royal/10 py-10">
    <div className="container mx-auto px-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {stats.map((s, i) => (
          <div key={i} className="text-center space-y-2">
            <s.icon size={28} className="mx-auto text-royal" />
            <p className="font-heading font-extrabold text-3xl text-primary">{s.value}</p>
            <p className="text-sm text-text-gray">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default QuickStats;
