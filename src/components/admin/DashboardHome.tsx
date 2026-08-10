import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { usePlanAccess } from "@/hooks/usePlanAccess";
import {
  CalendarCheck, Users, CreditCard, Globe, Clock, ArrowRight,
  TrendingUp, Sparkles, ExternalLink, Copy, Eye, FileText,
  Stethoscope,
  Lightbulb, Send, Share2, IndianRupee
} from "lucide-react";
import { differenceInDays, format, subDays } from "date-fns";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { toast } from "sonner";

const growthTips = [
  { tip: "Add your services to get more bookings", icon: Stethoscope, action: "/admin/my-website" },
  { tip: "Write a blog post to boost your SEO ranking", icon: FileText, action: "/admin/blog" },
  { tip: "Upload clinic photos to build patient trust", icon: Eye, action: "/admin/my-website" },
  { tip: "Share your website link on WhatsApp groups", icon: Send, action: null },
  { tip: "Add your qualifications to increase credibility", icon: Sparkles, action: "/admin/settings" },
];

const DashboardHome = () => {
  const { profile } = useProfile();
  const { nearCap, appointmentsUsed, appointmentsCap } = usePlanAccess();
  const [stats, setStats] = useState({ appointments: 0, patients: 0, revenue: 0, todayCount: 0, weekRevenue: 0, lastWeekAppts: 0 });
  const [todayAppointments, setTodayAppointments] = useState<any[]>([]);
  const [tipIndex, setTipIndex] = useState(0);
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [revenueSeries, setRevenueSeries] = useState<{ day: string; value: number }[]>([]);

  const loadDashboard = () => {
    if (!profile) return;
    const id = profile.id;
    const today = format(new Date(), "yyyy-MM-dd");
    const weekAgo = format(new Date(Date.now() - 7 * 86400000), "yyyy-MM-dd");
    const twoWeeksAgo = format(new Date(Date.now() - 14 * 86400000), "yyyy-MM-dd");
    const thirtyDaysAgoDate = subDays(new Date(), 29);
    const thirtyDaysAgo = format(thirtyDaysAgoDate, "yyyy-MM-dd");

    Promise.all([
      supabase.from("appointments").select("id", { count: "exact", head: true }).eq("doctor_id", id),
      supabase.from("patients").select("id", { count: "exact", head: true }).eq("doctor_id", id),
      // Revenue is now sourced from the persisted invoices table so it survives
      // appointment / patient deletions.
      (supabase.from("invoices" as any) as any).select("amount").eq("doctor_id", id),
      supabase.from("appointments").select("*").eq("doctor_id", id).eq("date", today).order("time_slot"),
      (supabase.from("invoices" as any) as any).select("amount").eq("doctor_id", id).gte("created_at", `${weekAgo}T00:00:00`),
      supabase.from("appointments").select("id", { count: "exact", head: true }).eq("doctor_id", id).gte("date", twoWeeksAgo).lt("date", weekAgo),
      (supabase.from("invoices" as any) as any).select("amount, created_at").eq("doctor_id", id).gte("created_at", `${thirtyDaysAgo}T00:00:00`),
    ]).then(([apptRes, patRes, revRes, todayRes, weekRevRes, lastWeekRes, monthRevRes]) => {
      const revenue = (revRes.data || []).reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
      const weekRevenue = (weekRevRes.data || []).reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
      const todayData = todayRes.data || [];
      setStats({
        appointments: apptRes.count || 0,
        patients: patRes.count || 0,
        revenue,
        todayCount: todayData.length,
        weekRevenue,
        lastWeekAppts: lastWeekRes.count || 0,
      });
      setTodayAppointments(todayData.slice(0, 6));

      // Build a 30-day daily revenue series for the Monthly Revenue chart
      const buckets = new Map<string, number>();
      for (let i = 29; i >= 0; i--) {
        buckets.set(format(subDays(new Date(), i), "yyyy-MM-dd"), 0);
      }
      let monthTotal = 0;
      (monthRevRes.data || []).forEach((r: any) => {
        const key = format(new Date(r.created_at), "yyyy-MM-dd");
        const amt = Number(r.amount) || 0;
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + amt);
        monthTotal += amt;
      });
      setMonthlyRevenue(monthTotal);
      setRevenueSeries(Array.from(buckets.entries()).map(([day, value]) => ({ day: format(new Date(day), "MMM d"), value })));
    });
  };

  useEffect(() => { loadDashboard(); }, [profile]);

  // Realtime: refresh dashboard when appointments/patients/invoices change
  useEffect(() => {
    if (!profile) return;
    const channel = supabase.channel(`dash-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `doctor_id=eq.${profile.id}` }, () => loadDashboard())
      .on("postgres_changes", { event: "*", schema: "public", table: "patients", filter: `doctor_id=eq.${profile.id}` }, () => loadDashboard())
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices", filter: `doctor_id=eq.${profile.id}` }, () => loadDashboard())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // Rotate tips
  useEffect(() => {
    const timer = setInterval(() => setTipIndex((i) => (i + 1) % growthTips.length), 8000);
    return () => clearInterval(timer);
  }, []);




  const daysLeft = profile?.trial_end
    ? Math.max(0, differenceInDays(new Date(profile.trial_end), new Date()))
    : 7;
  const trialProgress = ((7 - daysLeft) / 7) * 100;

  const statCards = [
    { icon: CalendarCheck, label: "APPOINTMENTS", value: String(stats.appointments), bgClass: "bg-royal/15", iconClass: "text-royal", sub: `${stats.todayCount} today` },
    { icon: Users, label: "PATIENTS", value: String(stats.patients), bgClass: "bg-pink/15", iconClass: "text-pink", sub: "All time" },
    { icon: CreditCard, label: "REVENUE", value: `₹${stats.revenue.toLocaleString("en-IN")}`, bgClass: "bg-teal/15", iconClass: "text-teal", sub: "Paid appointments" },
    { icon: Globe, label: "WEBSITE", value: profile?.onboarding_completed ? "Live" : "Draft", bgClass: "bg-orange/15", iconClass: "text-orange", sub: profile?.slug ? `/${profile.slug}` : "—" },
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
  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const barHeights = [35, 55, 40, 70, 85, 60, 45];
  const currentTip = growthTips[tipIndex];

  return (
    <div className="max-w-7xl mx-auto w-full flex flex-col gap-2 lg:gap-2.5 xl:gap-3 lg:h-[calc(100dvh-3.5rem-2rem)] xl:h-[calc(100dvh-3.5rem-3rem)] lg:overflow-hidden">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl gradient-navy-teal p-4 md:p-5">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 right-10 w-32 h-32 rounded-full bg-white/20 blur-2xl" />
          <div className="absolute bottom-2 right-40 w-24 h-24 rounded-full bg-white/10 blur-xl" />
        </div>
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-5 w-5 text-spark" />
              <span className="text-sm font-medium text-white/70">{format(new Date(), "EEEE, MMMM d, yyyy")}</span>
            </div>
            <h1 className="font-heading font-extrabold text-xl md:text-2xl text-white">
              Welcome back, {profile?.full_name?.split(" ")[0] || "Doctor"} 👋
            </h1>
            <p className="text-white/60 mt-0.5 text-xs md:text-sm">Here's what's happening with your practice today.</p>
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

      {nearCap && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-foreground">
            You've used <strong>{appointmentsUsed}/{appointmentsCap}</strong> appointments this month — upgrade to Premium for unlimited.
          </p>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((s) => (
          <Card key={s.label} className="border-0 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 bg-card">
            <CardContent className="p-3 xl:p-4">
              <div className="flex items-center gap-2.5 mb-2">
                <div className={`w-9 h-9 rounded-xl ${s.bgClass} flex items-center justify-center flex-shrink-0`}>
                  <s.icon className={`h-4 w-4 ${s.iconClass}`} />
                </div>
                <div className="text-[10px] font-semibold text-muted-foreground tracking-wider">{s.label}</div>
              </div>
              <div className="font-heading font-bold text-xl xl:text-2xl text-foreground leading-tight">{s.value}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{s.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Growth Tip Banner */}
      <Card className="border-spark/30 bg-spark/5 shadow-none">
        <CardContent className="p-3 flex flex-row items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-spark/20 flex items-center justify-center flex-shrink-0">
            <Lightbulb className="h-4 w-4 text-spark" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-spark/80">GROWTH TIP</p>
            <p className="text-xs md:text-sm font-medium text-foreground truncate">{currentTip.tip}</p>
          </div>
          {currentTip.action && (
            <Link to={currentTip.action}>
              <Button size="sm" variant="outline" className="text-xs border-spark/30 text-spark hover:bg-spark/10 flex-shrink-0 h-8">
                Do it <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>

      {/* Main two-column layout:
          LEFT  = Today's Schedule (spans full height of right column)
          RIGHT = Monthly Revenue (top) + Share Your Website (bottom), equally split */}
      <div className="grid gap-3 lg:grid-cols-2 lg:flex-1 lg:min-h-0">
        {/* LEFT — Today's Schedule */}
        <Card className="border-0 rounded-2xl shadow-sm bg-card flex flex-col lg:min-h-0 lg:overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Today's Schedule</CardTitle>
                {stats.todayCount > 0 && (
                  <Badge variant="secondary" className="text-xs font-semibold bg-royal/10 text-royal">{stats.todayCount}</Badge>
                )}
              </div>
              <Link to="/admin/appointments" className="text-sm text-royal flex items-center gap-1 hover:underline font-medium">
                View All <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="flex-1 lg:min-h-0 lg:overflow-y-auto">
            {todayAppointments.length === 0 ? (
              <div className="text-center py-10">
                <div className="w-16 h-16 rounded-2xl bg-royal/5 flex items-center justify-center mx-auto mb-3">
                  <CalendarCheck className="h-8 w-8 text-royal/30" />
                </div>
                <p className="text-muted-foreground text-sm font-medium">No appointments for today</p>
                <p className="text-muted-foreground/60 text-xs mt-1">Your upcoming bookings will appear here</p>
              </div>
            ) : (
              <div className="space-y-1">
                {todayAppointments.map((a, i) => (
                  <div key={a.id} className="flex gap-4 group">
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                        a.status === "completed" ? "border-success bg-success" :
                        a.status === "confirmed" ? "border-royal bg-royal" :
                        "border-warning bg-warning"
                      }`} />
                      {i < todayAppointments.length - 1 && <div className="w-0.5 flex-1 bg-border min-h-[40px]" />}
                    </div>
                    <div className="flex-1 pb-4 flex items-start justify-between gap-3 p-3 -mt-1 rounded-xl group-hover:bg-secondary/60 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-royal/10 flex items-center justify-center text-sm font-bold text-royal flex-shrink-0">
                          {a.patient_name?.charAt(0)?.toUpperCase() || "P"}
                        </div>
                        <div>
                          <div className="font-medium text-sm text-foreground">{a.patient_name}</div>
                          <div className="text-xs text-muted-foreground">{a.service_name} · {a.appointment_type}</div>
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 flex-shrink-0">
                        <span className="text-sm font-semibold text-foreground">{a.time_slot?.slice(0, 5)}</span>
                        <Badge variant="outline" className={`text-[10px] capitalize ${statusColor(a.status)}`}>{a.status}</Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* RIGHT — Monthly Revenue + Share Your Website, stacked and equally sized
            so their combined height matches Today's Schedule on the left */}
        <div className="flex flex-col gap-3 lg:min-h-0">
          {/* Monthly Revenue */}
          <Card className="border-0 rounded-2xl shadow-sm bg-card flex flex-col flex-1 lg:min-h-0 lg:overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <IndianRupee className="h-4 w-4 text-teal" /> Monthly Revenue
                </CardTitle>
                <span className="text-sm font-heading font-bold text-foreground">
                  ₹{monthlyRevenue.toLocaleString("en-IN")}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">Last 30 days</p>
            </CardHeader>
            <CardContent className="flex-1 lg:min-h-0 pt-0 pb-3">
              <div className="w-full h-full min-h-[120px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueSeries} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} vertical={false} />
                    <XAxis dataKey="day" fontSize={10} interval="preserveStartEnd" tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      formatter={(v: any) => [`₹${Number(v).toLocaleString("en-IN")}`, "Revenue"]}
                      contentStyle={{ fontSize: 11, borderRadius: 8 }}
                    />
                    <Line
                      type="linear"
                      dataKey="value"
                      stroke="hsl(var(--teal))"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Share Your Website */}
          <Card className="border-0 rounded-2xl shadow-sm bg-card border-l-4 border-l-success flex flex-col flex-1 lg:min-h-0 lg:overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Share2 className="h-4 w-4 text-success" /> Share Your Website
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 lg:min-h-0 lg:overflow-y-auto">
              {liveUrl ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">Share your website with patients via WhatsApp to get more bookings!</p>
                  <div className="bg-secondary/60 rounded-lg p-3 text-xs text-foreground break-all">
                    🏥 Book your appointment online with {profile?.full_name || "Dr."} — {liveUrl}
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(`🏥 Book your appointment online with ${profile?.full_name || "Dr."}\n\n${liveUrl}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1"
                    >
                      <Button size="sm" className="w-full bg-success hover:bg-success/90 text-xs h-9">
                        <Send className="h-3 w-3 mr-1" /> Share on WhatsApp
                      </Button>
                    </a>
                    <Button variant="outline" size="sm" className="text-xs h-9" onClick={() => { navigator.clipboard.writeText(liveUrl); toast.success("Link copied!"); }}>
                      <Copy className="h-3 w-3 mr-1" /> Copy
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">Complete onboarding to share your website</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DashboardHome;
