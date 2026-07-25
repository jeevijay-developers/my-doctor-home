import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SAAuditLog = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [action, setAction] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    supabase.from("admin_audit_log").select("*").order("created_at", { ascending: false }).limit(500).then(({ data }) => setRows(data ?? []));
  }, []);

  const actions = Array.from(new Set(rows.map((r) => r.action))).sort();
  const filtered = rows.filter((r) => {
    if (action !== "all" && r.action !== action) return false;
    if (from && new Date(r.created_at) < new Date(from)) return false;
    if (to && new Date(r.created_at) > new Date(to + "T23:59:59")) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {actions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Time</th>
                <th className="text-left p-3">Admin</th>
                <th className="text-left p-3">Action</th>
                <th className="text-left p-3">Target</th>
                <th className="text-left p-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="p-3 text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="p-3 text-xs">{r.admin_user_id?.slice(0, 8)}…</td>
                  <td className="p-3 font-medium text-xs">{r.action}</td>
                  <td className="p-3 text-xs">{r.target_table}<div className="text-muted-foreground">{r.target_id?.slice(0, 8)}…</div></td>
                  <td className="p-3 text-xs"><pre className="whitespace-pre-wrap max-w-md">{r.details ? JSON.stringify(r.details, null, 0) : "—"}</pre></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No audit records.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};

export default SAAuditLog;
