import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import {
  CalendarCheck, Users, CreditCard, Globe, Clock, ArrowRight,
  TrendingUp, Sparkles, ExternalLink, Pen, Eye, Settings,
  CheckCircle2, Circle, Stethoscope, UserPlus, FileText, Copy, BarChart3,
  Lightbulb, StickyNote, Plus, X, Send, Share2, Target
} from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  const [stats, setStats] = useState({ appointments: 0, patients: 0, revenue: 0, todayCount: 0, weekRevenue: 0, lastWeekAppts: 0 });
  const [todayAppointments, setTodayAppointments] = useState<any[]>([]);
  const [recentPatients, setRecentPatients] = useState<any[]>([]);
  const [servicesCount, setServicesCount] = useState(0);
  const [blogCount, setBlogCount] = useState(0);
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState("");
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    if (!profile) return;
    const id = profile.id;
    const today = format(new Date(), "yyyy-MM-dd");
    const weekAgo = format(new Date(Date.now() - 7 * 86400000), "yyyy-MM-dd");
    const twoWeeksAgo = format(new Date(Date.now() - 14 * 86400000), "yyyy-MM-dd");

    Promise.all([
      supabase.from("appointments").select("id", { count: "exact", head: true }).eq("doctor_id", id),
      supabase.from("patients").select("id", { count: "exact", head: true }).eq("doctor_id", id),
      supabase.from("appointments").select("amount").eq("doctor_id", id).eq("payment_status", "paid"),
      supabase.from("appointments").select("*").eq("doctor_id", id).eq("date", today).order("time_slot"),
      supabase.from("patients").select("*").eq("doctor_id", id).order("created_at", { ascending: false }).limit(5),
      supabase.from("services").select("id", { count: "exact", head: true }).eq("doctor_id", id).eq("active", true),
      supabase.from("blog_posts").select("id", { count: "exact", head: true }).eq("doctor_id", id).eq("is_published", true),
      supabase.from("appointments").select("amount").eq("doctor_id", id).eq("payment_status", "paid").gte("date", weekAgo),
      supabase.from("appointments").select("id", { count: "exact", head: true }).eq("doctor_id", id).gte("date", twoWeeksAgo).lt("date", weekAgo),
      supabase.from("doctor_notes").select("*").eq("doctor_id", id).order("created_at", { ascending: false }).limit(10),
    ]).then(([apptRes, patRes, revRes, todayRes, recentPat, svcRes, blogRes, weekRevRes, lastWeekRes, notesRes]) => {
      const revenue = (revRes.data || []).reduce((s, r) => s + (r.amount || 0), 0);
      const weekRevenue = (weekRevRes.data || []).reduce((s, r) => s + (r.amount || 0), 0);
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
      setRecentPatients((recentPat.data || []).slice(0, 4));
      setServicesCount(svcRes.count || 0);
      setBlogCount(blogRes.count || 0);
      setNotes(notesRes.data || []);
    });
  }, [profile]);

  // Rotate tips
  useEffect(() => {
    const timer = setInterval(() => setTipIndex((i) => (i + 1) % growthTips.length), 8000);
    return () => clearInterval(timer);
  }, []);

  const addNote = async () => {
    if (!newNote.trim() || !profile) return;
    const { data } = await supabase.from("doctor_notes").insert({ doctor_id: profile.id, content: newNote.trim() }).select().single();
    if (data) setNotes((prev) => [data, ...prev].slice(0, 10));
    setNewNote("");
  };

  const deleteNote = async (id: string) => {
    await supabase.from("doctor_notes").delete().eq("id", id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

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
    { icon: CalendarCheck, label: "Total Appointments", value: String(stats.appointments), bgClass: "bg-royal/10", iconClass: "text-royal", sub: `${stats.todayCount} today` },
    { icon: Users, label: "Total Patients", value: String(stats.patients), bgClass: "bg-teal/10", iconClass: "text-teal", sub: "All time" },
    { icon: CreditCard, label: "Revenue Earned", value: `₹${stats.revenue.toLocaleString("en-IN")}`, bgClass: "bg-success/10", iconClass: "text-success", sub: "Paid appointments" },
    { icon: Globe, label: "Website Status", value: profile?.onboarding_completed ? "Live" : "Draft", bgClass: "bg-ai-purple/10", iconClass: "text-ai-purple", sub: profile?.slug ? `/${profile.slug}` : "—" },
  ];

  const quickActions = [
    { icon: Pen, label: "Edit Website", desc: "Customize pages", href: "/admin/my-website", color: "text-royal" },
    { icon: Eye, label: "View Live", desc: "Patient view", href: profile?.slug ? `/dr/${profile.slug}` : "#", external: true, color: "text-teal" },
    { icon: CalendarCheck, label: "Appointments", desc: "Manage bookings", href: "/admin/appointments", color: "text-success" },
    { icon: UserPlus, label: "Patients", desc: "Patient records", href: "/admin/patients", color: "text-warning" },
    { icon: FileText, label: "Blog", desc: "Write articles", href: "/admin/blog", color: "text-ai-purple" },
    { icon: Settings, label: "Settings", desc: "Your account", href: "/admin/settings", color: "text-muted-foreground" },
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
              <span className="text-sm font-medium text-white/70">{format(new Date(), "EEEE, MMMM d, yyyy")}</span>
            </div>
            <h1 className="font-heading font-extrabold text-2xl md:text-3xl text-white">
              Welcome back, {profile?.full_name?.split(" ")[0] || "Doctor"} 👋
            </h1>
            <p className="text-white/60 mt-1 text-sm">Here's what's happening with your practice today.</p>
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
              <div className="text-[11px] text-muted-foreground/60 mt-1">{s.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Growth Tip Banner */}
      <Card className="border-spark/30 bg-spark/5 shadow-none">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-spark/20 flex items-center justify-center flex-shrink-0">
            <Lightbulb className="h-5 w-5 text-spark" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-spark/80 mb-0.5">GROWTH TIP</p>
            <p className="text-sm font-medium text-foreground">{currentTip.tip}</p>
          </div>
          {currentTip.action && (
            <Link to={currentTip.action}>
              <Button size="sm" variant="outline" className="text-xs border-spark/30 text-spark hover:bg-spark/10 flex-shrink-0">
                Do it <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Today's Schedule Timeline */}
        <Card className="lg:col-span-2 border-border/60 shadow-none">
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
          <CardContent>
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
                    {/* Timeline line */}
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
                      <div className="text-right flex items-center gap-2 flex-shrink-0">
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

        {/* Getting Started */}
        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Getting Started</CardTitle>
              <span className="text-xs font-semibold text-royal">{completedSteps}/{checklist.length}</span>
            </div>
            <Progress value={(completedSteps / checklist.length) * 100} className="h-2 mt-2 bg-secondary [&>div]:bg-royal" />
          </CardHeader>
          <CardContent className="space-y-1">
            {checklist.map((item) => (
              <Link key={item.label} to={item.href} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/60 transition-colors group">
                {item.done ? (
                  <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/30 flex-shrink-0 group-hover:text-royal" />
                )}
                <span className={`text-sm ${item.done ? "text-muted-foreground line-through" : "text-foreground font-medium"}`}>{item.label}</span>
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

      {/* Website + Revenue + Notes */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Website Preview */}
        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-4 w-4 text-royal" /> Your Website
              </CardTitle>
              <Badge variant={profile?.onboarding_completed ? "default" : "secondary"} className={profile?.onboarding_completed ? "bg-success text-white text-[10px]" : "text-[10px]"}>
                {profile?.onboarding_completed ? "Live" : "Draft"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {liveUrl ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-2 h-2 rounded-full bg-destructive/60" />
                    <div className="w-2 h-2 rounded-full bg-warning/60" />
                    <div className="w-2 h-2 rounded-full bg-success/60" />
                    <div className="flex-1 ml-2 bg-card rounded px-2 py-0.5 text-[10px] text-muted-foreground truncate border border-border">{liveUrl}</div>
                  </div>
                  <div className="bg-card rounded border border-border p-2.5 space-y-1.5">
                    <div className="h-2.5 w-20 bg-royal/20 rounded" />
                    <div className="h-1.5 w-full bg-secondary rounded" />
                    <div className="h-1.5 w-3/4 bg-secondary rounded" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={() => { navigator.clipboard.writeText(liveUrl); toast.success("URL copied!"); }}>
                    <Copy className="h-3 w-3 mr-1" /> Copy
                  </Button>
                  <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                    <Button variant="outline" size="sm" className="w-full text-xs h-8"><ExternalLink className="h-3 w-3 mr-1" /> Open</Button>
                  </a>
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <Globe className="h-8 w-8 text-royal/20 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Complete onboarding to go live</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Weekly Revenue */}
        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-success" /> This Week
              </CardTitle>
              <span className="text-sm font-bold text-success">₹{stats.weekRevenue.toLocaleString("en-IN")}</span>
            </div>
          </CardHeader>
          <CardContent>
            {stats.weekRevenue === 0 ? (
              <div className="text-center py-6">
                <BarChart3 className="h-8 w-8 text-success/20 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No revenue yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-end justify-between gap-1.5 h-28 px-1">
                  {weekDays.map((day, i) => (
                    <div key={day} className="flex flex-col items-center gap-1 flex-1">
                      <div className="w-full rounded-t-sm bg-gradient-to-t from-royal to-teal transition-all duration-500" style={{ height: `${barHeights[i]}%` }} />
                      <span className="text-[9px] text-muted-foreground">{day}</span>
                    </div>
                  ))}
                </div>
                <Link to="/admin/billing" className="text-xs text-royal font-medium hover:underline flex items-center gap-1 justify-center">
                  View Details <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Notes */}
        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <StickyNote className="h-4 w-4 text-warning" /> Quick Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-3">
              <Input
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Jot a quick note..."
                className="h-8 text-xs"
                onKeyDown={(e) => e.key === "Enter" && addNote()}
              />
              <Button size="sm" className="h-8 w-8 p-0 bg-royal hover:bg-royal/90" onClick={addNote}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
              {notes.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No notes yet</p>
              ) : notes.map((note) => (
                <div key={note.id} className="flex items-start gap-2 p-2 rounded-lg bg-secondary/60 group">
                  <p className="text-xs text-foreground flex-1">{note.content}</p>
                  <button onClick={() => deleteNote(note.id)} className="text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="font-heading font-semibold text-lg text-foreground mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickActions.map((a) =>
            a.external ? (
              <a key={a.label} href={a.href} target="_blank" rel="noopener noreferrer"
                className="group flex flex-col items-center text-center p-4 rounded-xl bg-card border border-border/60 hover:border-royal/30 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
                  <a.icon className={`h-5 w-5 ${a.color}`} />
                </div>
                <div className="text-sm font-medium text-foreground">{a.label}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{a.desc}</div>
              </a>
            ) : (
              <Link key={a.label} to={a.href}
                className="group flex flex-col items-center text-center p-4 rounded-xl bg-card border border-border/60 hover:border-royal/30 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
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
