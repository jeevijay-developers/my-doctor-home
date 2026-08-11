import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "react-router-dom";
import { ExternalLink, Trash2, X } from "lucide-react";
import BulkDeleteDoctorsDialog from "./BulkDeleteDoctorsDialog";

// Bulk selection/delete mirrors the Doctor Side → Patients pattern
// (PatientsPage.tsx) exactly: a select-mode toggle, row checkboxes + a
// "Select all" text button (not a header checkbox), a floating bottom
// action bar, and an AlertDialog confirmation with a type-the-count gate
// at 10+ selected.
const SADoctors = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const load = () => {
    supabase.from("profiles").select("*").order("created_at", { ascending: false }).then(({ data }) => setRows(data ?? []));
  };

  useEffect(() => { load(); }, []);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const exitSelectMode = () => { setSelectMode(false); clearSelection(); };

  const filtered = rows.filter((r) => {
    const t = q.toLowerCase();
    if (t && !`${r.full_name} ${r.clinic_name} ${r.city}`.toLowerCase().includes(t)) return false;
    if (statusFilter !== "all" && r.plan_status !== statusFilter) return false;
    if (tierFilter !== "all" && (r.plan_tier || "free") !== tierFilter) return false;
    return true;
  });

  const bulkTargets = rows.filter((r) => selectedIds.has(r.id)).map((r) => ({ id: r.id, full_name: r.full_name }));

  return (
    <div className="space-y-4">
      <div className={`flex flex-col md:flex-row gap-3 transition-opacity ${selectMode ? "opacity-60 pointer-events-none" : ""}`}>
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

      {/* Select mode toggle */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {selectMode ? (
              <span>{selectedIds.size} of {filtered.length} selected</span>
            ) : (
              <span>{filtered.length} doctor{filtered.length === 1 ? "" : "s"}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectMode && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => {
                  if (selectedIds.size === filtered.length) clearSelection();
                  else setSelectedIds(new Set(filtered.map((r) => r.id)));
                }}
              >
                {selectedIds.size === filtered.length ? "Deselect all" : `Select all ${filtered.length}`}
              </Button>
            )}
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={selectMode ? "default" : "outline"}
                    className={`h-8 w-8 p-0 ${selectMode ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}`}
                    onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                    aria-pressed={selectMode}
                    aria-label={selectMode ? "Exit selection mode" : "Select items to delete"}
                  >
                    {selectMode ? <X className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{selectMode ? "Done" : "Select to delete"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase text-muted-foreground">
              <tr>
                {selectMode && <th className="pl-4 pr-2 py-3 w-10"></th>}
                <th className="text-left p-3">Doctor</th>
                <th className="text-left p-3">Clinic</th>
                <th className="text-left p-3">City</th>
                <th className="text-left p-3">Tier</th>
                <th className="text-left p-3">Joined</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const isSelected = selectedIds.has(r.id);
                return (
                  <tr
                    key={r.id}
                    className={`border-t transition-colors ${isSelected ? "bg-destructive/5" : "hover:bg-secondary/40"} ${selectMode ? "cursor-pointer" : ""}`}
                    onClick={selectMode ? () => toggleSelected(r.id) : undefined}
                  >
                    {selectMode && (
                      <td className="pl-4 pr-2 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelected(r.id)}
                          aria-label={`Select ${r.full_name || "doctor"}`}
                          className="h-5 w-5 rounded"
                        />
                      </td>
                    )}
                    <td className="p-3">
                      <Link to={`/superadmin/doctors/${r.id}`} className="font-medium text-primary hover:underline" onClick={(e) => selectMode && e.preventDefault()}>
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
                        <a href={`/dr/${r.slug}`} target="_blank" rel="noreferrer" className="text-royal hover:underline inline-flex items-center gap-1 text-xs" onClick={(e) => selectMode && e.preventDefault()}>
                          Site <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No doctors found.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Floating bulk action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] sm:w-auto max-w-md"
        >
          <div className="bg-background/90 backdrop-blur-md border shadow-lg rounded-full px-4 sm:px-6 py-3 flex items-center gap-3 sm:gap-4">
            <span className="text-sm font-medium text-foreground whitespace-nowrap">
              {selectedIds.size} doctor{selectedIds.size === 1 ? "" : "s"} selected
            </span>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearSelection}>
              Clear
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-full px-4"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete Selected
            </Button>
          </div>
        </div>
      )}

      {bulkDeleteOpen && (
        <BulkDeleteDoctorsDialog
          targets={bulkTargets}
          onClose={() => setBulkDeleteOpen(false)}
          onDeleted={() => { exitSelectMode(); load(); }}
        />
      )}
    </div>
  );
};

export default SADoctors;
