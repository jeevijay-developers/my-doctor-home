import { UserPlus, Settings, Rocket } from "lucide-react";

const steps = [
  { icon: UserPlus, num: "01", title: "Sign Up Free", desc: "Create your account in 30 seconds. No credit card required. 7-day free trial starts instantly." },
  { icon: Settings, num: "02", title: "Set Up Your Clinic", desc: "Add your profile, services, pricing, clinic photos. Our onboarding wizard guides you step by step." },
  { icon: Rocket, num: "03", title: "Go Live & Grow", desc: "Your branded website is live! Patients can book appointments, pay online, and consult you 24/7." },
];

const HowItWorks = () => (
  <section id="how-it-works" className="py-20 bg-secondary">
    <div className="container mx-auto px-4">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <span className="text-sm font-semibold text-accent uppercase tracking-wider">How It Works</span>
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-primary mt-2">
          Live in 3 Simple Steps
        </h2>
      </div>
      <div className="grid md:grid-cols-3 gap-8 relative">
        {/* Connection line */}
        <div className="hidden md:block absolute top-10 left-[20%] right-[20%] h-0.5 border-t-2 border-dashed border-royal/20" />

        {steps.map((s, i) => (
          <div key={s.num} className="relative text-center group">
            <div className="w-20 h-20 rounded-full gradient-hero mx-auto flex items-center justify-center mb-5 shadow-lg shadow-royal/20 relative z-10 group-hover:scale-110 transition-transform">
              <s.icon className="h-8 w-8 text-white" />
            </div>
            <span className="font-heading font-extrabold text-6xl text-royal/[0.07] absolute top-0 left-1/2 -translate-x-1/2 -translate-y-3 select-none">{s.num}</span>
            <h3 className="font-heading font-bold text-xl text-primary">{s.title}</h3>
            <p className="text-muted-foreground mt-2 max-w-xs mx-auto leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default HowItWorks;
