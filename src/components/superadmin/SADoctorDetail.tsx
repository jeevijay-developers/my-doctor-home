import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { logAdminAction } from "@/lib/adminAudit";
import { ArrowLeft, Ban, RotateCcw, CalendarPlus } from "lucide-react";

const SADoctorDetail = () => {
  const { id } = useParams();
  const [p, setP] = useState<any>(null);
  const [stats, setStats] = useState({ appts: 0, patients: 0, revenue: 0, last: null as string | null });
  const [newTrialEnd, setNewTrialEnd] = useState("");

  const load = async () => {
    if (!id) return;
    const [{ data: prof }, { count: appts }, { count: patients }, { data: inv }, { data: lastAppt }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
      supabase.from("appointments").select("*", { count: "exact", head: true }).eq("doctor_id", id),
      supabase.from("patients").select("*", { count: "exact", head: true }).eq("doctor_id", id),
      supabase.from("invoices").select("total_amount").eq("doctor_id", id),
      supabase.from("appointments").select("created_at").eq("doctor_id", id).order("created_at", { ascending: false }).limit(1),
    ]);
    setP(prof);
    setStats({
      appts: appts ?? 0,
      patients: patients ?? 0,
      revenue: (inv ?? []).reduce((s, r: any) => s + Number(r.total_amount || 0), 0),
      last: lastAppt?.[0]?.created_at ?? null,
    });
  };

  useEffect(() => { load(); }, [id]);

  const suspend = async () => {
    const next = p.plan_status === "cancelled" ? "active" : "cancelled";
    const { error } = await supabase.from("profiles").update({ plan_status: next }).eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    await logAdminAction(next === "cancelled" ? "suspend_doctor" : "reactivate_doctor", "profiles", id, { from: p.plan_status, to: next });
    toast({ title: next === "cancelled" ? "Doctor suspended" : "Doctor reactivated" });
    load();
  };

  const changeTier = async (tier: string) => {
    const { error } = await supabase.from("profiles").update({ plan_tier: tier }).eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    await logAdminAction("change_plan_tier", "profiles", id, { from: p.plan_tier, to: tier });
    toast({ title: "Plan tier updated" });
    load();
  };

  const extendTrial = async () => {
    if (!newTrialEnd) return;
    const { error } = await supabase.from("profiles").update({ trial_end: newTrialEnd, plan_status: "trial" }).eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    await logAdminAction("extend_trial", "profiles", id, { new_trial_end: newTrialEnd });
    toast({ title: "Trial extended" });
    setNewTrialEnd("");
    load();
  };

  if (!p) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <Link to="/superadmin/doctors" className="inline-flex items-center gap-1 text-sm text-royal hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to doctors
      </Link>

      <Card>
        <CardContent className="p-6 flex flex-col md:flex-row gap-6 items-start">
          {p.profile_photo_url ? (
            <img src={p.profile_photo_url} className="w-20 h-20 rounded-full object-cover border" alt="" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-royal/10 flex items-center justify-center text-2xl font-bold text-royal">
              {p.full_name?.[0] ?? "D"}
            </div>
          )}
          <div className="flex-1">
            <h1 className="font-heading font-bold text-2xl text-primary">{p.full_name}</h1>
            <p className="text-muted-foreground">{p.specialization} · {p.clinic_name}</p>
            <p className="text-xs text-muted-foreground">{p.city} · {p.phone}</p>
            <div className="flex gap-2 mt-2">
              <Badge variant="outline">{p.plan_status}</Badge>
              <Badge>{p.plan_tier || "free"}</Badge>
              {p.slug && <a className="text-xs text-royal hover:underline" href={`/dr/${p.slug}`} target="_blank" rel="noreferrer">/dr/{p.slug}</a>}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Appointments</div><div className="text-xl font-bold">{stats.appts}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Patients</div><div className="text-xl font-bold">{stats.patients}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Revenue processed</div><div className="text-xl font-bold">₹{stats.revenue.toLocaleString("en-IN")}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Last activity</div><div className="text-sm font-medium">{stats.last ? new Date(stats.last).toLocaleDateString() : "—"}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Admin actions</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          <div>
            <div className="text-xs font-medium mb-2">Status</div>
            <Button onClick={suspend} variant={p.plan_status === "cancelled" ? "default" : "destructive"} size="sm" className="w-full">
              {p.plan_status === "cancelled" ? <><RotateCcw className="h-4 w-4 mr-2" />Reactivate</> : <><Ban className="h-4 w-4 mr-2" />Suspend</>}
            </Button>
          </div>
          <div>
            <div className="text-xs font-medium mb-2">Plan tier</div>
            <Select value={p.plan_tier || "free"} onValueChange={changeTier}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-xs font-medium mb-2">Extend trial (current: {p.trial_end ? new Date(p.trial_end).toLocaleDateString() : "—"})</div>
            <div className="flex gap-2">
              <Input type="date" value={newTrialEnd} onChange={(e) => setNewTrialEnd(e.target.value)} className="h-9" />
              <Button onClick={extendTrial} size="sm" disabled={!newTrialEnd}><CalendarPlus className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SADoctorDetail;
