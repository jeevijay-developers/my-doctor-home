import { motion } from "framer-motion";
import { Globe, TrendingUp, BarChart3, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import dashboardImg from "@/assets/command-center-dashboard.png";

const DashboardPreview = () => (
  <section className="py-14 md:py-20 bg-white overflow-hidden">
    <div className="container mx-auto px-4">
      <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
        <span className="text-xs md:text-sm font-semibold text-accent uppercase tracking-wider">Your Command Center</span>
        <h2 className="font-heading font-bold text-2xl sm:text-3xl md:text-4xl text-primary mt-2">
          A Powerful Dashboard Built for Doctors
        </h2>
        <p className="text-sm md:text-base text-muted-foreground mt-3">
          Manage your entire practice from one beautiful, intuitive panel. No tech skills needed.
        </p>
      </div>

      {/* Dashboard Preview Image */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7 }}
        className="max-w-5xl mx-auto"
      >
        <div className="rounded-xl md:rounded-2xl border border-border shadow-xl md:shadow-2xl overflow-hidden bg-white">
          <img
            src={dashboardImg}
            alt="Doctylia Command Center Dashboard"
            className="w-full h-auto object-contain block"
          />
        </div>
      </motion.div>

      {/* Feature highlights below */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 max-w-3xl mx-auto mt-8 md:mt-12">
        {[
          { icon: TrendingUp, title: "Real-time Analytics", desc: "Track revenue, patients & growth instantly" },
          { icon: Globe, title: "One-Click Publishing", desc: "Update your website live in seconds" },
          { icon: BarChart3, title: "AI-Powered Insights", desc: "Smart suggestions to grow your practice" },
        ].map((f) => (
          <div key={f.title} className="text-center">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl gradient-hero mx-auto flex items-center justify-center mb-2 md:mb-3">
              <f.icon className="h-5 w-5 md:h-6 md:w-6 text-white" />
            </div>
            <h4 className="font-heading font-semibold text-sm md:text-base text-primary">{f.title}</h4>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">{f.desc}</p>
          </div>
        ))}
      </div>

      <div className="text-center mt-8 md:mt-10">
        <Link to="/auth?mode=signup">
          <Button size="lg" className="bg-royal hover:bg-royal/90 text-white gap-2 shadow-lg shadow-royal/20">
            Try the Dashboard Free <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  </section>
);

export default DashboardPreview;
