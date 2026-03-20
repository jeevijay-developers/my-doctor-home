import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { CalendarCheck, Users, CreditCard, Globe, Clock } from "lucide-react";
import { differenceInDays } from "date-fns";

const AdminDashboard = () => {
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    supabase.from("profiles").select("*").single().then(({ data }) => {
      if (data) setProfile(data);
    });
  }, []);

  const daysLeft = profile?.trial_end
    ? Math.max(0, differenceInDays(new Date(profile.trial_end), new Date()))
    : 7;

  const stats = [
    { icon: CalendarCheck, label: "Appointments", value: "0", color: "text-royal" },
    { icon: Users, label: "Patients", value: "0", color: "text-accent" },
    { icon: CreditCard, label: "Revenue", value: "₹0", color: "text-success" },
    { icon: Globe, label: "Website Views", value: "0", color: "text-ai-purple" },
  ];

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Welcome */}
        <div className="bg-white rounded-xl p-6 border border-border">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="font-heading font-bold text-2xl text-primary">
                Welcome, {profile?.full_name || "Doctor"} 👋
              </h1>
              <p className="text-muted-foreground mt-1">Here's an overview of your practice.</p>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-warning/10 rounded-lg">
              <Clock className="h-4 w-4 text-warning" />
              <span className="text-sm font-medium text-warning">
                {daysLeft} day{daysLeft !== 1 ? "s" : ""} left in free trial
              </span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-white rounded-xl p-5 border border-border">
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

        {/* Quick Actions */}
        <div className="bg-white rounded-xl p-6 border border-border">
          <h2 className="font-heading font-semibold text-lg text-primary mb-4">Quick Actions</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { label: "Customize Website", desc: "Edit your public page", href: "/admin/my-website" },
              { label: "View My Website", desc: "See what patients see", href: profile?.slug ? `/dr/${profile.slug}` : "#" },
              { label: "Manage Appointments", desc: "View and manage bookings", href: "/admin/appointments" },
            ].map((a) => (
              <a
                key={a.label}
                href={a.href}
                className="block p-4 rounded-xl border border-border hover:border-royal/30 hover:shadow-sm transition-all"
              >
                <div className="font-medium text-primary">{a.label}</div>
                <div className="text-sm text-muted-foreground">{a.desc}</div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
