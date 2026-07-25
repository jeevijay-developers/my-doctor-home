import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { logAdminAction } from "@/lib/adminAudit";

const STATUSES = ["new", "contacted", "converted", "lost"];

const SALeads = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");

  const load = () => supabase.from("enquiries").select("*").order("created_at", { ascending: false }).then(({ data }) => setRows(data ?? []));
  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: string, prev: string) => {
    const { error } = await supabase.from("enquiries").update({ status }).eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    await logAdminAction("update_lead_status", "enquiries", id, { from: prev, to: status });
    toast({ title: "Lead updated" });
    load();
  };

  const filtered = filter === "all" ? rows : rows.filter((r) => (r.status || "new") === filter);

  return (
    <div className="space-y-4">
      <Select value={filter} onValueChange={setFilter}>
        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All leads</SelectItem>
          {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
        </SelectContent>
      </Select>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Clinic</th>
                <th className="text-left p-3">City</th>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Phone</th>
                <th className="text-left p-3">Message</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="p-3 font-medium">{r.name}</td>
                  <td className="p-3">{r.clinic_name || "—"}</td>
                  <td className="p-3">{r.city || "—"}</td>
                  <td className="p-3 text-xs">{r.email || "—"}</td>
                  <td className="p-3 text-xs">{r.phone || "—"}</td>
                  <td className="p-3 text-xs max-w-xs truncate">{r.message || "—"}</td>
                  <td className="p-3">
                    <Select value={r.status || "new"} onValueChange={(v) => updateStatus(r.id, v, r.status || "new")}>
                      <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No leads.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};

export default SALeads;
