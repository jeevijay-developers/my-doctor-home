import { motion } from "framer-motion";
import { LayoutDashboard, CalendarCheck, Users, CreditCard, Globe, TrendingUp, Bell, BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

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

      {/* Browser Frame Mockup */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7 }}
        className="max-w-5xl mx-auto"
      >
        <div className="rounded-xl md:rounded-2xl border border-border shadow-xl overflow-hidden bg-white">
          {/* Browser Top Bar */}
          <div className="bg-muted/50 border-b border-border px-3 md:px-4 py-2 md:py-3 flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-destructive/60" />
              <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-warning/60" />
              <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-success/60" />
            </div>
            <div className="flex-1 mx-2 md:mx-4">
              <div className="bg-white rounded-md px-3 py-1 text-[10px] md:text-xs text-muted-foreground text-center border border-border">
                doctylia.com/admin/dashboard
              </div>
            </div>
          </div>

          {/* Dashboard Content */}
          <div className="flex min-h-[320px] md:min-h-[420px]">
            {/* Sidebar */}
            <div className="hidden md:flex w-48 bg-primary flex-col py-4 shrink-0">
              <div className="px-2 md:px-4 mb-4 md:mb-6">
                <div className="w-6 h-6 md:w-8 md:h-8 rounded-lg bg-white/20 md:hidden" />
                <div className="hidden md:block text-white font-heading font-bold text-sm">Dr. Rahul Sharma</div>
                <div className="hidden md:block text-primary-foreground/50 text-[10px]">Cardiologist</div>
              </div>
              {[
                { icon: LayoutDashboard, label: "Dashboard", active: true },
                { icon: Globe, label: "My Website" },
                { icon: CalendarCheck, label: "Appointments" },
                { icon: Users, label: "Patients" },
                { icon: CreditCard, label: "Billing" },
                { icon: BarChart3, label: "Analytics" },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center gap-2 md:gap-3 px-2 md:px-4 py-2 md:py-2.5 mx-1 md:mx-2 rounded-lg text-xs md:text-sm transition-colors ${
                    item.active ? "bg-royal text-white" : "text-primary-foreground/60 hover:bg-white/5"
                  }`}
                >
                  <item.icon className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0" />
                  <span className="hidden md:inline">{item.label}</span>
                </div>
              ))}
            </div>

            {/* Main Content */}
            <div className="flex-1 p-3 md:p-6 bg-secondary/50 overflow-hidden">
              {/* Top Row */}
              <div className="flex items-center justify-between mb-3 md:mb-5">
                <div>
                  <div className="font-heading font-bold text-sm md:text-lg text-primary">Good Morning, Dr. Sharma! 👋</div>
                  <div className="text-[10px] md:text-xs text-muted-foreground">Here's your practice overview</div>
                </div>
                <div className="flex gap-1.5">
                  <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-white border border-border flex items-center justify-center">
                    <Bell className="h-3 w-3 md:h-3.5 md:w-3.5 text-muted-foreground" />
                  </div>
                </div>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3 mb-3 md:mb-5">
                {[
                  { label: "Today's Appointments", value: "12", change: "+3", color: "text-royal" },
                  { label: "New Patients", value: "8", change: "+2", color: "text-success" },
                  { label: "Revenue Today", value: "₹18,500", change: "+12%", color: "text-accent" },
                  { label: "Pending Reviews", value: "5", change: "New", color: "text-warning" },
                ].map((stat) => (
                  <div key={stat.label} className="bg-white rounded-lg md:rounded-xl p-2.5 md:p-4 border border-border">
                    <div className="text-[9px] md:text-xs text-muted-foreground">{stat.label}</div>
                    <div className={`font-heading font-bold text-lg md:text-2xl ${stat.color} mt-0.5`}>{stat.value}</div>
                    <div className="text-[9px] md:text-xs text-success font-medium">{stat.change}</div>
                  </div>
                ))}
              </div>

              {/* Appointments List */}
              <div className="bg-white rounded-lg md:rounded-xl border border-border p-2.5 md:p-4">
                <div className="font-heading font-semibold text-xs md:text-sm text-primary mb-2 md:mb-3">Today's Appointments</div>
                <div className="space-y-1.5 md:space-y-2">
                  {[
                    { name: "Priya Mehta", time: "10:00 AM", type: "Cardiac Consult", status: "Confirmed", statusColor: "bg-success/10 text-success" },
                    { name: "Amit Kumar", time: "10:30 AM", type: "ECG Report", status: "Checked In", statusColor: "bg-royal/10 text-royal" },
                    { name: "Sunita Rao", time: "11:00 AM", type: "Follow-up", status: "Pending", statusColor: "bg-warning/10 text-warning" },
                  ].map((apt) => (
                    <div key={apt.name} className="flex items-center justify-between py-1.5 md:py-2 border-b border-border last:border-0">
                      <div className="flex items-center gap-2 md:gap-3">
                        <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-secondary flex items-center justify-center text-[10px] md:text-xs font-semibold text-primary">
                          {apt.name.split(" ").map(n => n[0]).join("")}
                        </div>
                        <div>
                          <div className="text-[11px] md:text-sm font-medium text-primary">{apt.name}</div>
                          <div className="text-[9px] md:text-xs text-muted-foreground">{apt.time} · {apt.type}</div>
                        </div>
                      </div>
                      <span className={`text-[9px] md:text-xs font-medium px-1.5 md:px-2 py-0.5 rounded-full ${apt.statusColor}`}>
                        {apt.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
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
