import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";

const SADoctors = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  // Combined filter value. Uses prefixes to distinguish status vs tier.
  // "all" | "status:trial" | "tier:pro" etc.
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    supabase.from("profiles").select("*").order("created_at", { ascending: false }).then(({ data }) => setRows(data ?? []));
  }, []);

  const filtered = rows.filter((r) => {
    const t = q.toLowerCase();
    if (t && !`${r.full_name} ${r.clinic_name} ${r.city}`.toLowerCase().includes(t)) return false;
    if (filter.startsWith("status:") && r.plan_status !== filter.slice(7)) return false;
    if (filter.startsWith("tier:")) {
      if (r.plan_status !== "active") return false;
      if ((r.plan_tier || "free") !== filter.slice(5)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3">
        <Input placeholder="Search name, clinic, city…" value={q} onChange={(e) => setQ(e.target.value)} className="md:max-w-sm" />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="md:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectGroup>
              <SelectLabel>Status</SelectLabel>
              <SelectItem value="status:trial">Trial</SelectItem>
              <SelectItem value="status:active">Active</SelectItem>
              <SelectItem value="status:expired">Expired</SelectItem>
              <SelectItem value="status:cancelled">Cancelled/Suspended</SelectItem>
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Tier</SelectLabel>
              <SelectItem value="tier:free">Free</SelectItem>
              <SelectItem value="tier:pro">Pro</SelectItem>
              <SelectItem value="tier:premium">Premium</SelectItem>
            </SelectGroup>
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
                <th className="text-left p-3">Status</th>
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
                  <td className="p-3"><Badge variant="outline">{r.plan_status}</Badge></td>
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
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No doctors found.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};

export default SADoctors;
