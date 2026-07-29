import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";

const SADoctors = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");

  useEffect(() => {
    supabase.from("profiles").select("*").order("created_at", { ascending: false }).then(({ data }) => setRows(data ?? []));
  }, []);

  const filtered = rows.filter((r) => {
    const t = q.toLowerCase();
    if (t && !`${r.full_name} ${r.clinic_name} ${r.city}`.toLowerCase().includes(t)) return false;
    if (statusFilter !== "all" && r.plan_status !== statusFilter) return false;
    if (tierFilter !== "all" && (r.plan_tier || "free") !== tierFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3">
        <Input placeholder="Search name, clinic, city…" value={q} onChange={(e) => setQ(e.target.value)} className="md:max-w-sm" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="md:w-48"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="cancelled">Cancelled/Suspended</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="md:w-48"><SelectValue placeholder="All Tiers" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tiers</SelectItem>
            <SelectItem value="free">Free</SelectItem>
            <SelectItem value="pro">Pro</SelectItem>
            <SelectItem value="premium">Premium</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Doctor</th>
                <th className="text-left p-3">Clinic</th>
                <th className="text-left p-3">City</th>
                <th className="text-left p-3">Tier</th>
                <th className="text-left p-3">Joined</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t hover:bg-secondary/40">
                  <td className="p-3">
                    <Link to={`/superadmin/doctors/${r.id}`} className="font-medium text-primary hover:underline">
                      {r.full_name || "—"}
                    </Link>
                    <div className="text-xs text-muted-foreground">{r.specialization || "—"}</div>
                  </td>
                  <td className="p-3">{r.clinic_name || "—"}</td>
                  <td className="p-3">{r.city || "—"}</td>
                  <td className="p-3"><Badge>{r.plan_tier || "free"}</Badge></td>
                  <td className="p-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="p-3">
                    {r.slug && (
                      <a href={`/dr/${r.slug}`} target="_blank" rel="noreferrer" className="text-royal hover:underline inline-flex items-center gap-1 text-xs">
                        Site <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No doctors found.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};

export default SADoctors;
