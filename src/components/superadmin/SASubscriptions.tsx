import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { logAdminAction } from "@/lib/adminAudit";

const SASubscriptions = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [dates, setDates] = useState<Record<string, string>>({});

  const load = () => supabase.from("profiles").select("*").order("created_at", { ascending: false }).then(({ data }) => setRows(data ?? []));
  useEffect(() => { load(); }, []);

  const tiers = ["free", "pro", "premium"];
  const statuses = ["trial", "active", "expired", "cancelled"];
  const tierCounts = Object.fromEntries(tiers.map((t) => [t, rows.filter((r) => (r.plan_tier || "free") === t).length]));
  const statusCounts = Object.fromEntries(statuses.map((s) => [s, rows.filter((r) => r.plan_status === s).length]));

  const changeTier = async (id: string, tier: string, prev: string) => {
    const { error } = await supabase.from("profiles").update({ plan_tier: tier }).eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    await logAdminAction("change_plan_tier", "profiles", id, { from: prev, to: tier });
    toast({ title: "Tier updated" });
    load();
  };

  const extend = async (id: string) => {
    const d = dates[id];
    if (!d) return;
    const { error } = await supabase.from("profiles").update({ trial_end: d, plan_status: "trial" }).eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    await logAdminAction("extend_trial", "profiles", id, { new_trial_end: d });
    toast({ title: "Trial extended" });
    setDates((x) => ({ ...x, [id]: "" }));
    load();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tiers.map((t) => (
          <Card key={t}><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">{t}</div><div className="text-2xl font-bold text-primary">{tierCounts[t]}</div></CardContent></Card>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statuses.map((s) => (
          <Card key={s}><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">{s}</div><div className="text-2xl font-bold text-royal">{statusCounts[s]}</div></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Doctor</th>
                <th className="text-left p-3">Status &amp; Tier</th>
                <th className="text-left p-3">Change Tier</th>
                <th className="text-left p-3">Trial end</th>
                <th className="text-left p-3">Extend</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3"><div className="font-medium">{r.full_name}</div><div className="text-xs text-muted-foreground">{r.clinic_name}</div></td>
                  <td className="p-3">
                    <Badge className="bg-royal/10 text-royal hover:bg-royal/10 border-royal/20 capitalize">{r.plan_tier || "free"}</Badge>
                  </td>
                  <td className="p-3">
                    <Select value={r.plan_tier || "free"} onValueChange={(v) => changeTier(r.id, v, r.plan_tier || "free")}>
                      <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>{tiers.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="p-3 text-xs">{r.trial_end ? new Date(r.trial_end).toLocaleDateString() : "—"}</td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <Input type="date" className="h-8 w-36" value={dates[r.id] || ""} onChange={(e) => setDates((x) => ({ ...x, [r.id]: e.target.value }))} />
                      <Button size="sm" onClick={() => extend(r.id)} disabled={!dates[r.id]}>Set</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

    </div>
  );
};

export default SASubscriptions;
