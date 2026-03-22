import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import {
  CalendarCheck, Users, CreditCard, Globe, Clock, ArrowRight,
  TrendingUp, Sparkles, ExternalLink, Pen, Eye, Settings,
  CheckCircle2, Circle, Stethoscope, UserPlus, FileText, Copy, BarChart3
} from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const DashboardHome = () => {
  const { profile } = useProfile();
  const [stats, setStats] = useState({ appointments: 0, patients: 0, revenue: 0, todayCount: 0, weekRevenue: 0 });
  const [todayAppointments, setTodayAppointments] = useState<any[]>([]);
  const [recentPatients, setRecentPatients] = useState<any[]>([]);
  const [servicesCount, setServicesCount] = useState(0);
  const [blogCount, setBlogCount] = useState(0);

  useEffect(() => {
    if (!profile) return;
    const id = profile.id;
    const today = format(new Date(), "yyyy-MM-dd");
    const weekAgo = format(new Date(Date.now() - 7 * 86400000), "yyyy-MM-dd");

    Promise.all([
      supabase.from("appointments").select("id", { count: "exact", head: true }).eq("doctor_id", id),
      supabase.from("patients").select("id", { count: "exact", head: true }).eq("doctor_id", id),
      supabase.from("appointments").select("amount").eq("doctor_id", id).eq("payment_status", "paid"),
      supabase.from("appointments").select("*").eq("doctor_id", id).eq("date", today).order("time_slot"),
      supabase.from("patients").select("*").eq("doctor_id", id).order("created_at", { ascending: false }).limit(5),
      supabase.from("services").select("id", { count: "exact", head: true }).eq("doctor_id", id).eq("active", true),
      supabase.from("blog_posts").select("id", { count: "exact", head: true }).eq("doctor_id", id).eq("is_published", true),
      supabase.from("appointments").select("amount").eq("doctor_id", id).eq("payment_status", "paid").gte("date", weekAgo),
    ]).then(([apptRes, patRes, revRes, todayRes, recentPat, svcRes, blogRes, weekRevRes]) => {
      const revenue = (revRes.data || []).reduce((s, r) => s + (r.amount || 0), 0);
      const weekRevenue = (weekRevRes.data || []).reduce((s, r) => s + (r.amount || 0), 0);
      const todayData = todayRes.data || [];
      setStats({
        appointments: apptRes.count || 0,
        patients: patRes.count || 0,
        revenue,
        todayCount: todayData.length,
        weekRevenue,
      });
      setTodayAppointments(todayData.slice(0, 5));
      setRecentPatients((recentPat.data || []).slice(0, 4));
      setServicesCount(svcRes.count || 0);
      setBlogCount(blogRes.count || 0);
    });
  }, [profile]);

  const daysLeft = profile?.trial_end
    ? Math.max(0, differenceInDays(new Date(profile.trial_end), new Date()))
    : 7;

  const trialProgress = ((7 - daysLeft) / 7) * 100;

  const checklist = [
    { label: "Complete your profile", done: !!profile?.full_name && !!profile?.specialization, href: "/admin/settings" },
    { label: "Add your services", done: servicesCount > 0, href: "/admin/my-website" },
    { label: "Set working hours", done: true, href: "/admin/my-website" },
    { label: "Publish your website", done: !!profile?.onboarding_completed, href: "/admin/my-website" },
    { label: "Write your first blog", done: blogCount > 0, href: "/admin/blog" },
  ];
  const completedSteps = checklist.filter((c) => c.done).length;

  const statCards = [
    { icon: CalendarCheck, label: "Total Appointments", value: String(stats.appointments), bgClass: "bg-royal/10", iconClass: "text-royal", change: `${stats.todayCount} today` },
    { icon: Users, label: "Total Patients", value: String(stats.patients), bgClass: "bg-teal/10", iconClass: "text-teal", change: "All time" },
    { icon: CreditCard, label: "Revenue Earned", value: `₹${stats.revenue.toLocaleString("en-IN")}`, bgClass: "bg-success/10", iconClass: "text-success", change: "Paid appointments" },
    { icon: Globe, label: "Website Status", value: profile?.onboarding_completed ? "Live" : "Draft", bgClass: "bg-ai-purple/10", iconClass: "text-ai-purple", change: profile?.slug ? `/${profile.slug}` : "—" },
  ];

  const quickActions = [
    { icon: Pen, label: "Edit Website", desc: "Customize your public page", href: "/admin/my-website", color: "text-royal" },
    { icon: Eye, label: "View Live Page", desc: "See what patients see", href: profile?.slug ? `/dr/${profile.slug}` : "#", external: true, color: "text-teal" },
    { icon: CalendarCheck, label: "Appointments", desc: "Manage your bookings", href: "/admin/appointments", color: "text-success" },
    { icon: UserPlus, label: "Patients", desc: "View patient records", href: "/admin/patients", color: "text-warning" },
    { icon: FileText, label: "Write Blog", desc: "Create health articles", href: "/admin/blog", color: "text-ai-purple" },
    { icon: Settings, label: "Settings", desc: "Manage your account", href: "/admin/settings", color: "text-muted-foreground" },
  ];

  const statusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "bg-success/10 text-success border-success/20";
      case "completed": return "bg-royal/10 text-royal border-royal/20";
      case "cancelled": return "bg-destructive/10 text-destructive border-destructive/20";
      default: return "bg-warning/10 text-warning border-warning/20";
    }
  };

  const liveUrl = profile?.slug ? `${window.location.origin}/dr/${profile.slug}` : null;

  // Simple week revenue bar chart data (mock distribution for visual)
  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const barHeights = [35, 55, 40, 70, 85, 60, 45];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl gradient-navy-teal p-6 md:p-8">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 right-10 w-32 h-32 rounded-full bg-white/20 blur-2xl" />
          <div className="absolute bottom-2 right-40 w-24 h-24 rounded-full bg-white/10 blur-xl" />
        </div>
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-5 w-5 text-spark" />
              <span className="text-sm font-medium text-white/70">
                {format(new Date(), "EEEE, MMMM d, yyyy")}
              </span>
            </div>
            <h1 className="font-heading font-extrabold text-2xl md:text-3xl text-white">
              Welcome back, {profile?.full_name?.split(" ")[0] || "Doctor"} 👋
            </h1>
            <p className="text-white/60 mt-1 text-sm md:text-base">
              Here's what's happening with your practice today.
            </p>
          </div>
          {profile?.plan_status === "trial" && (
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-4 min-w-[220px]">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-spark" />
                <span className="text-sm font-semibold text-white">Free Trial</span>
              </div>
              <Progress value={trialProgress} className="h-2 bg-white/20 mb-2 [&>div]:bg-spark" />
              <p className="text-xs text-white/60">
                <span className="text-white font-bold">{daysLeft} day{daysLeft !== 1 ? "s" : ""}</span> remaining
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.label} className="border-border/60 shadow-none hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className={`w-11 h-11 rounded-xl ${s.bgClass} flex items-center justify-center`}>
                  <s.icon className={`h-5 w-5 ${s.iconClass}`} />
                </div>
                <TrendingUp className="h-4 w-4 text-muted-foreground/40" />
              </div>
              <div className="font-heading font-bold text-2xl text-foreground">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
              <div className="text-[11px] text-muted-foreground/60 mt-1">{s.change}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Today's Appointments — 2 cols */}
        <Card className="lg:col-span-2 border-border/60 shadow-none">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Today's Appointments</CardTitle>
                {stats.todayCount > 0 && (
                  <Badge variant="secondary" className="text-xs font-semibold bg-royal/10 text-royal">
                    {stats.todayCount}
                  </Badge>
                )}
              </div>
              <Link to="/admin/appointments" className="text-sm text-royal flex items-center gap-1 hover:underline font-medium">
                View All <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {todayAppointments.length === 0 ? (
              <div className="text-center py-10">
                <div className="w-16 h-16 rounded-2xl bg-royal/5 flex items-center justify-center mx-auto mb-3">
                  <CalendarCheck className="h-8 w-8 text-royal/30" />
                </div>
                <p className="text-muted-foreground text-sm font-medium">No appointments for today</p>
                <p className="text-muted-foreground/60 text-xs mt-1">Your upcoming bookings will appear here</p>
                <Link to="/admin/appointments">
                  <Button variant="outline" size="sm" className="mt-4 text-xs">
                    View All Appointments
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {todayAppointments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between p-3.5 rounded-xl bg-secondary/60 hover:bg-secondary transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-royal/10 flex items-center justify-center text-sm font-bold text-royal">
                        {a.patient_name?.charAt(0)?.toUpperCase() || "P"}
                      </div>
                      <div>
                        <div className="font-medium text-sm text-foreground">{a.patient_name}</div>
                        <div className="text-xs text-muted-foreground">{a.service_name} · {a.appointment_type}</div>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <div className="text-sm font-semibold text-foreground">{a.time_slot?.slice(0, 5)}</div>
                      <Badge variant="outline" className={`text-[10px] capitalize ${statusColor(a.status)}`}>
                        {a.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Getting Started Checklist */}
        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Getting Started</CardTitle>
              <span className="text-xs font-semibold text-royal">{completedSteps}/{checklist.length}</span>
            </div>
            <Progress
              value={(completedSteps / checklist.length) * 100}
              className="h-2 mt-2 bg-secondary [&>div]:gradient-hero"
            />
          </CardHeader>
          <CardContent className="space-y-1">
            {checklist.map((item) => (
              <Link
                key={item.label}
                to={item.href}
                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/60 transition-colors group"
              >
                {item.done ? (
                  <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/30 flex-shrink-0 group-hover:text-royal" />
                )}
                <span className={`text-sm ${item.done ? "text-muted-foreground line-through" : "text-foreground font-medium"}`}>
                  {item.label}
                </span>
                {!item.done && <ArrowRight className="h-3 w-3 text-muted-foreground/40 ml-auto" />}
              </Link>
            ))}
            {completedSteps === checklist.length && (
              <div className="text-center pt-3">
                <Sparkles className="h-5 w-5 text-spark mx-auto mb-1" />
                <p className="text-xs font-medium text-success">All set! Your clinic is ready 🎉</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Website Preview + Weekly Revenue */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Website Preview Card */}
        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="h-5 w-5 text-royal" /> Your Website
              </CardTitle>
              <Badge variant={profile?.onboarding_completed ? "default" : "secondary"} className={profile?.onboarding_completed ? "bg-success text-white" : ""}>
                {profile?.onboarding_completed ? "Live" : "Draft"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {liveUrl ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-secondary/30 p-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-warning/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-success/60" />
                    <div className="flex-1 ml-2 bg-white rounded-md px-3 py-1 text-xs text-muted-foreground truncate border border-border">
                      {liveUrl}
                    </div>
                  </div>
                  {/* Mini site preview mockup */}
                  <div className="bg-white rounded-lg border border-border p-3 space-y-2">
                    <div className="h-3 w-24 bg-royal/20 rounded" />
                    <div className="h-2 w-full bg-secondary rounded" />
                    <div className="h-2 w-3/4 bg-secondary rounded" />
                    <div className="flex gap-2 mt-2">
                      <div className="h-6 w-20 bg-royal/10 rounded" />
                      <div className="h-6 w-16 bg-teal/10 rounded" />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => { navigator.clipboard.writeText(liveUrl); toast.success("URL copied!"); }}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy URL
                  </Button>
                  <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                    <Button variant="outline" size="sm" className="w-full text-xs">
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open
                    </Button>
                  </a>
                  <Link to="/admin/my-website" className="flex-1">
                    <Button size="sm" className="w-full text-xs bg-royal hover:bg-royal/90 text-white">
                      <Pen className="h-3.5 w-3.5 mr-1.5" /> Edit
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-14 h-14 rounded-2xl bg-royal/5 flex items-center justify-center mx-auto mb-3">
                  <Globe className="h-7 w-7 text-royal/30" />
                </div>
                <p className="text-sm text-muted-foreground font-medium">Complete onboarding to go live</p>
                <Link to="/admin/my-website">
                  <Button size="sm" className="mt-3 bg-royal hover:bg-royal/90 text-white text-xs">
                    Set Up Website
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Weekly Revenue Chart */}
        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-success" /> This Week's Revenue
              </CardTitle>
              <span className="text-sm font-bold text-success">₹{stats.weekRevenue.toLocaleString("en-IN")}</span>
            </div>
          </CardHeader>
          <CardContent>
            {stats.weekRevenue === 0 ? (
              <div className="text-center py-8">
                <div className="w-14 h-14 rounded-2xl bg-success/5 flex items-center justify-center mx-auto mb-3">
                  <BarChart3 className="h-7 w-7 text-success/30" />
                </div>
                <p className="text-sm text-muted-foreground font-medium">No revenue this week yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Revenue from paid appointments will show here</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* CSS Bar Chart */}
                <div className="flex items-end justify-between gap-2 h-32 px-2">
                  {weekDays.map((day, i) => (
                    <div key={day} className="flex flex-col items-center gap-1 flex-1">
                      <div
                        className="w-full rounded-t-md bg-gradient-to-t from-royal to-teal transition-all duration-500"
                        style={{ height: `${barHeights[i]}%` }}
                      />
                      <span className="text-[10px] text-muted-foreground font-medium">{day}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/60">
                  <span>Last 7 days</span>
                  <Link to="/admin/billing" className="text-royal font-medium hover:underline flex items-center gap-1">
                    View Details <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="font-heading font-semibold text-lg text-foreground mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickActions.map((a) =>
            a.external ? (
              <a
                key={a.label}
                href={a.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col items-center text-center p-4 rounded-xl bg-card border border-border/60 hover:border-royal/30 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
                  <a.icon className={`h-5 w-5 ${a.color}`} />
                </div>
                <div className="text-sm font-medium text-foreground">{a.label}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{a.desc}</div>
              </a>
            ) : (
              <Link
                key={a.label}
                to={a.href}
                className="group flex flex-col items-center text-center p-4 rounded-xl bg-card border border-border/60 hover:border-royal/30 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
                  <a.icon className={`h-5 w-5 ${a.color}`} />
                </div>
                <div className="text-sm font-medium text-foreground">{a.label}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{a.desc}</div>
              </Link>
            )
          )}
        </div>
      </div>

      {/* Recent Patients */}
      {recentPatients.length > 0 && (
        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Recent Patients</CardTitle>
              <Link to="/admin/patients" className="text-sm text-royal flex items-center gap-1 hover:underline font-medium">
                View All <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {recentPatients.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/60 hover:bg-secondary transition-colors">
                  <div className="w-10 h-10 rounded-full bg-teal/10 flex items-center justify-center text-sm font-bold text-teal">
                    {p.name?.charAt(0)?.toUpperCase() || "P"}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.phone}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DashboardHome;
