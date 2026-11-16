import { useEffect, useRef, useState } from "react";

const stats = [
  { number: 2500, suffix: "+", title: "Active Physicians", caption: "Managing clinics autonomously every single day." },
  { number: 50000, suffix: "+", title: "Monthly Consultations", caption: "Seamlessly booked and confirmed without phone calls." },
  { number: 200, suffix: "+", title: "Indian Cities & Towns", caption: "From Tier-1 metro medical hubs to regional clinic centers." },
  { number: 99.9, suffix: "%", title: "Cloud Reliability", caption: "End-to-end encrypted medical data with instant zero-loss backup." },
];

const formatNumber = (n: number) => {
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
  <section className="w-full py-8 md:py-12 bg-primary border-y border-white/10">
    <div className="container mx-auto px-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        {stats.map((s) => (
          <div key={s.title} className="p-4 md:p-6 rounded-2xl bg-white/10 backdrop-blur-md shadow-sm border border-white/15">
            <div className="font-heading font-extrabold text-2xl md:text-4xl text-white">
              <CountUp target={s.number} suffix={s.suffix} />
            </div>
            <div className="font-semibold text-sm md:text-lg text-white mt-1">{s.title}</div>
            <div className="text-xs md:text-sm text-white/80 mt-1">{s.caption}</div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default TrustBar;
