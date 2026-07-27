import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Users, Sparkles, CheckCircle2, XCircle, CalendarCheck, IndianRupee, TrendingUp, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const SAOverview = () => {
  const [stats, setStats] = useState({ totalDoctors: 0, trials: 0, active: 0, expired: 0, appointments: 0, revenue: 0 });
  const [chart, setChart] = useState<{ month: string; count: number }[]>([]);
  const [trialsEnding, setTrialsEnding] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: profiles }, { count: apptCount }, { data: inv }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, clinic_name, plan_status, trial_end, created_at"),
        supabase.from("appointments").select("*", { count: "exact", head: true }),
        supabase.from("invoices").select("total_amount"),
      ]);
      const p = profiles ?? [];
      const revenue = (inv ?? []).reduce((s, r: any) => s + Number(r.total_amount || 0), 0);
      setStats({
        totalDoctors: p.length,
        trials: p.filter((x: any) => x.plan_status === "trial").length,
        active: p.filter((x: any) => x.plan_status === "active").length,
        expired: p.filter((x: any) => ["expired", "cancelled"].includes(x.plan_status)).length,
        appointments: apptCount ?? 0,
        revenue,
      });

      const byMonth = new Map<string, number>();
      p.forEach((x: any) => {
        const d = new Date(x.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        byMonth.set(key, (byMonth.get(key) || 0) + 1);
      });
      setChart(Array.from(byMonth.entries()).sort().map(([month, count]) => ({ month, count })));

      const in7 = new Date(); in7.setDate(in7.getDate() + 7);
      setTrialsEnding(p.filter((x: any) => x.plan_status === "trial" && x.trial_end && new Date(x.trial_end) <= in7).slice(0, 10));
    })();
  }, []);

  const statCards = [
    { label: "Doctors", value: stats.totalDoctors, icon: Users, tint: "bg-royal/10 text-royal", bar: "bg-royal" },
    { label: "Trials", value: stats.trials, icon: Sparkles, tint: "bg-pink/10 text-pink", bar: "bg-pink" },
    { label: "Active", value: stats.active, icon: CheckCircle2, tint: "bg-teal/10 text-teal", bar: "bg-teal" },
    { label: "Expired", value: stats.expired, icon: XCircle, tint: "bg-orange/10 text-orange", bar: "bg-orange" },
  ];

  const chartData = chart.length ? chart.slice(-8) : Array.from({ length: 8 }, (_, i) => ({ month: `M${i+1}`, count: 0 }));
  const activePct = stats.totalDoctors ? Math.round((stats.active / stats.totalDoctors) * 100) : 0;
  const donutData = [
    { name: "Active", value: stats.active || 1 },
    { name: "Trials", value: stats.trials || 1 },
    { name: "Expired", value: stats.expired || 1 },
  ];
  const donutColors = ["hsl(var(--royal))", "hsl(var(--teal))", "#E2E8F0"];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      {/* LEFT / MAIN COLUMN */}
      <div className="xl:col-span-2 space-y-5">
        {/* HERO CARD */}
        <Card className="rounded-2xl shadow-sm border-slate-100 overflow-hidden">
          <CardContent className="p-0">
            <div className="grid md:grid-cols-2 gap-0">
              <div className="p-6 md:p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-heading font-semibold text-slate-900">Revenue Report</h2>
                  <button className="text-xs text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50">
                    Filter
                  </button>
                </div>
                <div className="text-5xl md:text-6xl font-heading font-bold text-slate-900 tracking-tight">
                  ₹{stats.revenue.toLocaleString("en-IN")}
                </div>
                <div className="mt-5 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-teal/10 text-teal flex items-center justify-center">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Total platform earnings</div>
                    <div className="text-sm font-semibold text-teal">+{activePct}% active rate</div>
                  </div>
                </div>
                <p className="mt-6 text-xs text-slate-400">Update your payout method in Settings</p>
              </div>
              <div className="bg-royal p-6 md:p-8 flex items-end">
                <div className="w-full h-40">
                  <ResponsiveContainer>
                    <BarChart data={chartData}>
                      <XAxis dataKey="month" hide />
                      <YAxis hide />
                      <Tooltip cursor={{ fill: "rgba(255,255,255,0.1)" }} contentStyle={{ background: "#fff", border: "none", borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="count" fill="rgba(255,255,255,0.85)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* STAT CARDS */}
        <Card className="rounded-2xl shadow-sm border-slate-100">
          <CardContent className="p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
            {statCards.map((c) => (
              <div key={c.label}>
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${c.tint}`}>
                  <c.icon className="h-4 w-4" />
                </div>
                <div className="text-xs text-slate-500 mt-3">{c.label}</div>
                <div className="text-3xl font-heading font-bold text-slate-900 mt-1">{c.value}</div>
                <div className={`h-[3px] w-8 rounded-full mt-2 ${c.bar}`} />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* SIGNUPS CHART */}
        <Card className="rounded-2xl shadow-sm border-slate-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-semibold text-slate-900">Signups over time</h3>
              <span className="text-xs text-slate-400">Last 12 months</span>
            </div>
            <div className="h-56">
              <ResponsiveContainer>
                <LineChart data={chart}>
                  <XAxis dataKey="month" fontSize={11} stroke="#94A3B8" />
                  <YAxis fontSize={11} allowDecimals={false} stroke="#94A3B8" />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid #E2E8F0" }} />
                  <Line type="monotone" dataKey="count" stroke="hsl(var(--royal))" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* RIGHT COLUMN */}
      <div className="space-y-5">
        {/* DONUT */}
        <Card className="rounded-2xl shadow-sm border-slate-100">
          <CardContent className="p-6 text-center">
            <div className="h-40 relative">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={donutData} innerRadius={45} outerRadius={65} paddingAngle={2} dataKey="value">
                    {donutData.map((_, i) => <Cell key={i} fill={donutColors[i]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="text-xs text-slate-500 mt-1">Doctors by status</div>
            <div className="text-3xl font-heading font-bold text-slate-900">{stats.totalDoctors}</div>
            <p className="text-xs text-slate-400 mt-1">Update segmentation in Settings</p>
            <div className="flex items-center justify-center gap-4 mt-4 text-xs">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-royal" />Active</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-teal" />Trials</span>
            </div>
          </CardContent>
        </Card>

        {/* INCOME / APPOINTMENTS + CTA */}
        <Card className="rounded-2xl shadow-sm border-slate-100 overflow-hidden">
          <CardContent className="p-6 pb-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-semibold text-slate-900">Appointments</h3>
              <span className="text-2xl font-bold text-slate-900">{stats.appointments}</span>
            </div>
            <div className="h-32">
              <ResponsiveContainer>
                <BarChart data={chartData}>
                  <XAxis dataKey="month" fontSize={10} stroke="#94A3B8" />
                  <YAxis hide />
                  <Bar dataKey="count" fill="hsl(var(--royal))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
          <Button asChild className="w-full rounded-none h-12 bg-royal hover:bg-royal/90 text-white font-semibold">
            <Link to="/superadmin/billing">View Payouts</Link>
          </Button>
        </Card>

        {/* TRIALS ENDING */}
        <Card className="rounded-2xl shadow-sm border-slate-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-semibold text-slate-900">Trials ending</h3>
              <span className="text-xs bg-orange/10 text-orange px-2 py-1 rounded-full font-semibold">{trialsEnding.length}</span>
            </div>
            {trialsEnding.length === 0 ? (
              <p className="text-sm text-slate-400">No trials ending soon.</p>
            ) : (
              <ul className="space-y-3">
                {trialsEnding.slice(0, 5).map((t) => (
                  <li key={t.id}>
                    <Link to={`/superadmin/doctors/${t.id}`} className="flex items-center justify-between gap-2 hover:bg-slate-50 -mx-2 px-2 py-1.5 rounded-lg">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{t.full_name || "Unnamed"}</div>
                        <div className="text-xs text-slate-500 truncate">{t.clinic_name || "—"}</div>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-slate-400 flex-shrink-0">
                        <CalendarCheck className="h-3 w-3" />
                        {new Date(t.trial_end).toLocaleDateString()}
                        <ChevronRight className="h-3 w-3" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SAOverview;
