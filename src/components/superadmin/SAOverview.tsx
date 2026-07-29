import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Users, Sparkles, CheckCircle2, XCircle, CalendarCheck, IndianRupee } from "lucide-react";
import { Link } from "react-router-dom";

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

  const cards = [
    { label: "Total Doctors", value: stats.totalDoctors, icon: Users, color: "text-royal bg-royal/10" },
    { label: "Active Trials", value: stats.trials, icon: Sparkles, color: "text-teal bg-teal/10" },
    { label: "Active Paid", value: stats.active, icon: CheckCircle2, color: "text-success bg-success/10" },
    { label: "Expired/Cancelled", value: stats.expired, icon: XCircle, color: "text-destructive bg-destructive/10" },
    { label: "Total Appointments", value: stats.appointments, icon: CalendarCheck, color: "text-primary bg-primary/10" },
    { label: "Patient Billing Volume", value: `₹${stats.revenue.toLocaleString("en-IN")}`, icon: IndianRupee, color: "text-spark bg-spark/20" },
  ];

  return (
    <div className="space-y-6 bg-background/60 -m-2 p-2 rounded-2xl">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((c) => (
          <Card key={c.label} className="rounded-2xl border-transparent bg-card shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${c.color}`}>
                <c.icon className="h-5 w-5" />
              </div>
              <div className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground">{c.label}</div>
              <div className="font-heading font-bold text-3xl text-foreground leading-tight mt-1">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-2xl border-transparent bg-card shadow-sm">
        <CardHeader><CardTitle className="text-lg font-heading font-semibold text-foreground">Signups over time</CardTitle></CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--royal))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>


      <Card className="rounded-2xl border-transparent bg-white shadow-sm">
        <CardHeader><CardTitle className="text-lg font-heading font-semibold text-primary">Trials ending in next 7 days ({trialsEnding.length})</CardTitle></CardHeader>
        <CardContent>
          {trialsEnding.length === 0 ? (
            <p className="text-sm text-muted-foreground">No trials ending soon.</p>
          ) : (
            <ul className="divide-y">
              {trialsEnding.map((t) => (
                <li key={t.id} className="py-2 flex items-center justify-between text-sm">
                  <div>
                    <Link to={`/superadmin/doctors/${t.id}`} className="font-medium text-primary hover:underline">
                      {t.full_name || "Unnamed"}
                    </Link>
                    <span className="text-muted-foreground"> · {t.clinic_name || "—"}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">Ends {new Date(t.trial_end).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SAOverview;
