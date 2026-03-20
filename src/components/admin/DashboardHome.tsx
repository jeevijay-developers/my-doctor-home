import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { CalendarCheck, Users, CreditCard, Globe, Clock, ArrowRight } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { Link } from "react-router-dom";

const DashboardHome = () => {
  const { profile } = useProfile();
  const [stats, setStats] = useState({ appointments: 0, patients: 0, revenue: 0 });
  const [todayAppointments, setTodayAppointments] = useState<any[]>([]);

  useEffect(() => {
    if (!profile) return;
    const id = profile.id;
    const today = format(new Date(), "yyyy-MM-dd");

    Promise.all([
      supabase.from("appointments").select("id", { count: "exact", head: true }).eq("doctor_id", id),
      supabase.from("patients").select("id", { count: "exact", head: true }).eq("doctor_id", id),
      supabase.from("appointments").select("amount").eq("doctor_id", id).eq("payment_status", "paid"),
      supabase.from("appointments").select("*").eq("doctor_id", id).eq("date", today).order("time_slot"),
    ]).then(([apptRes, patRes, revRes, todayRes]) => {
      const revenue = (revRes.data || []).reduce((s, r) => s + (r.amount || 0), 0);
      setStats({ appointments: apptRes.count || 0, patients: patRes.count || 0, revenue });
      setTodayAppointments((todayRes.data || []).slice(0, 5));
    });
  }, [profile]);

  const daysLeft = profile?.trial_end
    ? Math.max(0, differenceInDays(new Date(profile.trial_end), new Date()))
    : 7;

  const statCards = [
    { icon: CalendarCheck, label: "Appointments", value: String(stats.appointments), color: "text-royal" },
    { icon: Users, label: "Patients", value: String(stats.patients), color: "text-accent" },
    { icon: CreditCard, label: "Revenue", value: `₹${stats.revenue.toLocaleString("en-IN")}`, color: "text-success" },
    { icon: Globe, label: "Website Views", value: "—", color: "text-ai-purple" },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Welcome */}
      <div className="bg-card rounded-xl p-6 border border-border">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-heading font-bold text-2xl text-primary">
              Welcome, {profile?.full_name || "Doctor"} 👋
            </h1>
            <p className="text-muted-foreground mt-1">Here's an overview of your practice.</p>
          </div>
          {profile?.plan_status === "trial" && (
            <div className="flex items-center gap-2 px-4 py-2 bg-warning/10 rounded-lg">
              <Clock className="h-4 w-4 text-warning" />
              <span className="text-sm font-medium text-warning">
                {daysLeft} day{daysLeft !== 1 ? "s" : ""} left in free trial
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <div key={s.label} className="bg-card rounded-xl p-5 border border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">{s.label}</div>
                <div className="font-heading font-bold text-xl text-primary">{s.value}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Today's Appointments */}
      <div className="bg-card rounded-xl p-6 border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading font-semibold text-lg text-primary">Today's Appointments</h2>
          <Link to="/admin/appointments" className="text-sm text-royal flex items-center gap-1 hover:underline">
            View All <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {todayAppointments.length === 0 ? (
          <p className="text-muted-foreground text-sm">No appointments scheduled for today.</p>
        ) : (
          <div className="space-y-3">
            {todayAppointments.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary">
                <div>
                  <div className="font-medium text-primary">{a.patient_name}</div>
                  <div className="text-sm text-muted-foreground">{a.service_name} • {a.appointment_type}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-primary">{a.time_slot?.slice(0, 5)}</div>
                  <span className={`text-xs px-2 py-0.5 rounded-pill font-medium ${
                    a.status === "confirmed" ? "bg-success/10 text-success" :
                    a.status === "completed" ? "bg-royal/10 text-royal" :
                    a.status === "cancelled" ? "bg-destructive/10 text-destructive" :
                    "bg-warning/10 text-warning"
                  }`}>{a.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-card rounded-xl p-6 border border-border">
        <h2 className="font-heading font-semibold text-lg text-primary mb-4">Quick Actions</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { label: "Customize Website", desc: "Edit your public page", href: "/admin/my-website" },
            { label: "View My Website", desc: "See what patients see", href: profile?.slug ? `/dr/${profile.slug}` : "#", external: true },
            { label: "Manage Appointments", desc: "View and manage bookings", href: "/admin/appointments" },
          ].map((a) => (
            a.external ? (
              <a key={a.label} href={a.href} target="_blank" rel="noopener noreferrer"
                className="block p-4 rounded-xl border border-border hover:border-royal/30 hover:shadow-sm transition-all">
                <div className="font-medium text-primary">{a.label}</div>
                <div className="text-sm text-muted-foreground">{a.desc}</div>
              </a>
            ) : (
              <Link key={a.label} to={a.href}
                className="block p-4 rounded-xl border border-border hover:border-royal/30 hover:shadow-sm transition-all">
                <div className="font-medium text-primary">{a.label}</div>
                <div className="text-sm text-muted-foreground">{a.desc}</div>
              </Link>
            )
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardHome;
