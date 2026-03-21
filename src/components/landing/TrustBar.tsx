import { useEffect, useRef, useState } from "react";
import { Shield, Award, Clock, MapPin } from "lucide-react";

const stats = [
  { number: 10000, suffix: "+", label: "Doctors Trust Us", icon: Shield },
  { number: 500000, suffix: "+", label: "Appointments Booked", icon: Clock },
  { number: 200, suffix: "+", label: "Cities in India", icon: MapPin },
  { number: 99.9, suffix: "%", label: "Uptime", icon: Award },
];

const formatNumber = (n: number) => {
  if (n >= 100000) return (n / 100000).toFixed(0) + ",00,000";
  if (n >= 1000) return n.toLocaleString("en-IN");
  if (n % 1 !== 0) return n.toFixed(1);
  return n.toString();
};

const CountUp = ({ target, suffix }: { target: number; suffix: string }) => {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        let start = 0;
        const duration = 1500;
        const step = (timestamp: number) => {
          if (!start) start = timestamp;
          const progress = Math.min((timestamp - start) / duration, 1);
          setCount(Math.floor(progress * target * 10) / 10);
          if (progress < 1) requestAnimationFrame(step);
          else setCount(target);
        };
        requestAnimationFrame(step);
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);

  return <div ref={ref}>{formatNumber(count)}{suffix}</div>;
};

const TrustBar = () => (
  <section className="py-12 bg-primary relative overflow-hidden">
    <div className="absolute inset-0 bg-gradient-to-r from-primary via-royal/30 to-primary opacity-50" />
    <div className="container mx-auto px-4 relative">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <s.icon className="h-5 w-5 text-accent hidden md:block" />
              <div className="font-heading font-extrabold text-2xl md:text-3xl text-white">
                <CountUp target={s.number} suffix={s.suffix} />
              </div>
            </div>
            <div className="text-sm text-primary-foreground/70">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default TrustBar;
