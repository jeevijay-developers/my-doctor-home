import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { logAdminAction } from "@/lib/adminAudit";
import { Link } from "react-router-dom";
import { Ban, ExternalLink, KeyRound, Loader2, MessageSquarePlus, Radio, Trash2 } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import BulkDeleteDoctorsDialog from "./BulkDeleteDoctorsDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSuperAdminAccess } from "@/contexts/SuperAdminAccessContext";
import { formatIstDate, istDayKey } from "@/lib/istDate";
import { classifyPlan } from "@/lib/subscriptionView";

type MessageTarget = { type: "single"; id: string; name: string } | { type: "broadcast" };

const DAY_MS = 24 * 60 * 60 * 1000;
// "Joined" presets. Each resolves to an inclusive IST day range; "custom"
// uses the two date inputs instead.
const JOINED_PRESETS: { value: string; label: string; days?: number }[] = [
  { value: "all", label: "Any time" },
  { value: "7", label: "Last 7 days", days: 7 },
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "90", label: "Last 90 days", days: 90 },
  { value: "custom", label: "Custom range…" },
];

const byName = (a: any, b: any) =>
  (a.full_name || "").trim().localeCompare((b.full_name || "").trim(), undefined, { sensitivity: "base" });

// plan_status "expired" only ever happens after a trial's end date passes
// without the doctor converting to a paid plan (converting flips plan_status
// straight to "active") — so it inherently means "never converted", no
// separate flag needed to distinguish that.
function PlanStatusBadge({ row }: { row: any }) {
  if (row.plan_status === "trial") {
    if (!row.trial_end) return null;
    const days = Math.max(0, differenceInCalendarDays(new Date(row.trial_end), new Date()));
    return (
      <Badge
        variant="outline"
        className={days <= 3 ? "border-warning/40 text-warning bg-warning/10" : "border-border text-muted-foreground"}
      >
        {days}d left
      </Badge>
    );
  }
  if (row.plan_status === "expired") {
    return <Badge className="bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/15">Trial expired</Badge>;
  }
  if (row.plan_status === "cancelled") {
    return <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">Suspended</Badge>;
  }
  if (row.plan_status === "active") {
    // Same rule as the Subscriptions page: "active" with a lapsed end date, or on the free tier
    // (which only exists during a trial), is not an active plan.
    if (classifyPlan(row).bucket !== "active_paid") {
      return <Badge className="bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/15">Expired</Badge>;
    }
    return <Badge className="bg-success/15 text-success border border-success/30 hover:bg-success/15">Active</Badge>;
  }
  return null;
}

// Every row has its own checkbox (plus a select-all in the header); as soon as
// one is ticked a floating bar offers Suspend / Delete for the whole selection.
const SADoctors = () => {
  const { can } = useSuperAdminAccess();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 300);
  const [statusFilter, setStatusFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [joinedPreset, setJoinedPreset] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortBy, setSortBy] = useState<"joined_desc" | "name_asc" | "name_desc">("joined_desc");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkSuspendOpen, setBulkSuspendOpen] = useState(false);
  const [suspending, setSuspending] = useState(false);

  const [messageTarget, setMessageTarget] = useState<MessageTarget | null>(null);
  const [messageSubject, setMessageSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [pendingPlansMap, setPendingPlansMap] = useState<Record<string, any>>({});
  const [overriddenDoctorIds, setOverriddenDoctorIds] = useState<Set<string>>(new Set());

  const load = () => {
    supabase.from("profiles").select("*").order("created_at", { ascending: false }).then(({ data, error }) => {
      setRows(data ?? []);
      setLoadError(error ? error.message : null);
      setLoading(false);
    });
  };

  const loadOverrides = () => {
    supabase
      .from("doctor_feature_overrides")
      .select("doctor_id, expires_at")
      .then(({ data }) => {
        const now = Date.now();
        const active = (data || []).filter((r) => !r.expires_at || new Date(r.expires_at).getTime() > now);
        setOverriddenDoctorIds(new Set(active.map((r) => r.doctor_id)));
      });
  };

  const loadPendingPlans = () => {
    supabase
      .from("pending_plans" as any)
      .select("id, doctor_id, target_tier, activation_date")
      .then(({ data }) => {
        const map: Record<string, any> = {};
        (data || []).forEach((item: any) => {
          map[item.doctor_id] = item;
        });
        setPendingPlansMap(map);
      });
  };

  useEffect(() => { load(); loadPendingPlans(); loadOverrides(); }, []);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const closeMessageDialog = () => {
    setMessageTarget(null);
    setMessageSubject("");
    setMessageBody("");
  };

  // "Active" = a paid plan that is really running (same rule as the Subscriptions page).
  const activeDoctors = rows.filter((r) => classifyPlan(r).bucket === "active_paid");

  const sendMessage = async () => {
    if (!messageTarget || !messageSubject.trim() || !messageBody.trim()) return;
    setSendingMessage(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (messageTarget.type === "single") {
      const { error } = await supabase.from("notifications" as any).insert({
        doctor_id: messageTarget.id,
        recipient_user_id: messageTarget.id,
        source_type: "direct_message",
        title: messageSubject.trim(),
        message: messageBody.trim(),
        sender_id: user?.id ?? null,
      } as any);
      if (error) { setSendingMessage(false); return toast({ title: "Failed", description: error.message, variant: "destructive" }); }
      await logAdminAction("send_direct_message", "profiles", messageTarget.id, { subject: messageSubject.trim() });
      toast({ title: `Message sent to ${messageTarget.name}` });
    } else {
      // One notification row per recipient — simplest model consistent with
      // the per-doctor read/unread state, and fine at this doctor count.
      const recipients = activeDoctors.map((d) => ({
        doctor_id: d.id,
        recipient_user_id: d.id,
        source_type: "broadcast",
        title: messageSubject.trim(),
        message: messageBody.trim(),
        sender_id: user?.id ?? null,
      }));
      if (recipients.length === 0) { setSendingMessage(false); return toast({ title: "No active doctors to message", variant: "destructive" }); }
      const { error } = await supabase.from("notifications" as any).insert(recipients as any);
      if (error) { setSendingMessage(false); return toast({ title: "Failed", description: error.message, variant: "destructive" }); }
      await logAdminAction("send_broadcast_message", "profiles", undefined, { subject: messageSubject.trim(), recipient_count: recipients.length });
      toast({ title: `Broadcast sent to ${recipients.length} doctor${recipients.length === 1 ? "" : "s"}` });
    }
    setSendingMessage(false);
    closeMessageDialog();
  };

  // Joined range as inclusive IST calendar days ("YYYY-MM-DD" compares as text).
  const preset = JOINED_PRESETS.find((p) => p.value === joinedPreset);
  const joinedFrom = preset?.days ? istDayKey(new Date(Date.now() - (preset.days - 1) * DAY_MS)) : joinedPreset === "custom" ? fromDate : "";
  const joinedTo = joinedPreset === "custom" ? toDate : "";

  const filtered = rows
    .filter((r) => {
      const t = debouncedQ.toLowerCase();
      if (t && !`${r.full_name} ${r.clinic_name} ${r.city}`.toLowerCase().includes(t)) return false;
      if (statusFilter !== "all" && r.plan_status !== statusFilter) return false;
      if (tierFilter !== "all" && (r.plan_tier || "free") !== tierFilter) return false;
      if (joinedFrom || joinedTo) {
        const day = r.created_at ? istDayKey(new Date(r.created_at)) : "";
        if (!day) return false;
        if (joinedFrom && day < joinedFrom) return false;
        if (joinedTo && day > joinedTo) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "name_asc") return byName(a, b);
      if (sortBy === "name_desc") return byName(b, a);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const filtersActive =
    !!debouncedQ || statusFilter !== "all" || tierFilter !== "all" || joinedPreset !== "all" || sortBy !== "joined_desc";
  const resetFilters = () => {
    setQ(""); setStatusFilter("all"); setTierFilter("all");
    setJoinedPreset("all"); setFromDate(""); setToDate(""); setSortBy("joined_desc");
  };

  // Only rows currently on screen count as selected, so a bulk action can
  // never touch a doctor the admin can no longer see (e.g. after filtering).
  const selectedRows = filtered.filter((r) => selectedIds.has(r.id));
  const allSelected = filtered.length > 0 && selectedRows.length === filtered.length;
  const someSelected = selectedRows.length > 0 && !allSelected;
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(filtered.map((r) => r.id)));

  const bulkTargets = selectedRows.map((r) => ({ id: r.id, full_name: r.full_name }));
  const suspendTargets = selectedRows.filter((r) => r.plan_status !== "cancelled");
  const alreadySuspended = selectedRows.length - suspendTargets.length;

  const confirmBulkSuspend = async () => {
    if (suspendTargets.length === 0) return;
    setSuspending(true);
    const ids = suspendTargets.map((r) => r.id);
    const { error } = await supabase.from("profiles").update({ plan_status: "cancelled" }).in("id", ids);
    if (error) {
      setSuspending(false);
      return toast({ title: "Could not suspend doctors", description: error.message, variant: "destructive" });
    }
    await logAdminAction("bulk_suspend_doctors", "profiles", undefined, {
      ids, from: Object.fromEntries(suspendTargets.map((r) => [r.id, r.plan_status])),
    });
    setSuspending(false);
    setBulkSuspendOpen(false);
    clearSelection();
    toast({ title: `${ids.length} doctor${ids.length === 1 ? "" : "s"} suspended` });
    load();
  };

  const emptyMessage = loadError
    ? `Could not load doctors: ${loadError}`
    : filtersActive || joinedPreset !== "all" ? "No doctors match these filters." : "No doctors found.";

  const joinedLabel =(r: any) => (r.created_at ? formatIstDate(r.created_at) : "—");

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:flex-wrap gap-3">
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
        <Select value={joinedPreset} onValueChange={setJoinedPreset}>
          <SelectTrigger className="md:w-44" aria-label="Joined date"><SelectValue placeholder="Joined" /></SelectTrigger>
          <SelectContent>
            {JOINED_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.value === "all" ? "Joined: any time" : p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {joinedPreset === "custom" && (
          <div className="flex items-center gap-2">
            <Input type="date" aria-label="Joined from" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} className="md:w-40" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" aria-label="Joined to" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className="md:w-40" />
          </div>
        )}
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="md:w-44" aria-label="Sort"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="joined_desc">Newest joined first</SelectItem>
            <SelectItem value="name_asc">Name: A → Z</SelectItem>
            <SelectItem value="name_desc">Name: Z → A</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          className="md:ml-auto gap-1.5"
          onClick={() => setMessageTarget({ type: "broadcast" })}
          disabled={loading}
        >
          <Radio className="h-4 w-4" /> Broadcast to Active ({activeDoctors.length})
        </Button>
      </div>

      {/* Count + select-all + reset */}
      {!loading && (
        <div className="flex items-center justify-between gap-3 min-h-8">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {filtered.length > 0 && (
              <label className="flex items-center gap-2 cursor-pointer md:hidden">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="Select all doctors"
                  className="h-5 w-5 rounded"
                />
                Select all
              </label>
            )}
            <span>
              {selectedRows.length > 0
                ? `${selectedRows.length} of ${filtered.length} selected`
                : `${filtered.length} doctor${filtered.length === 1 ? "" : "s"}${filtered.length !== rows.length ? ` (of ${rows.length})` : ""}`}
            </span>
          </div>
          {filtersActive && (
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={resetFilters}>Reset filters</Button>
          )}
        </div>
      )}

      {/* Table — tablet/desktop */}
      <Card className="hidden md:block">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase text-muted-foreground">
              <tr>
                <th className="pl-4 pr-2 py-3 w-10">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={toggleAll}
                    disabled={loading || filtered.length === 0}
                    aria-label="Select all doctors"
                    className="h-5 w-5 rounded"
                  />
                </th>
                <th className="text-left p-3">Doctor</th>
                <th className="text-left p-3">Clinic</th>
                <th className="text-left p-3">City</th>
                <th className="text-left p-3">Tier</th>
                <th className="text-left p-3">Plan Status</th>
                <th className="text-left p-3">Joined</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-t" aria-hidden="true">
                  <td className="pl-4 pr-2 py-4"><Skeleton className="h-5 w-5 rounded" /></td>
                  <td className="p-3"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-24 mt-2" /></td>
                  <td className="p-3"><Skeleton className="h-4 w-28" /></td>
                  <td className="p-3"><Skeleton className="h-4 w-20" /></td>
                  <td className="p-3"><Skeleton className="h-5 w-14 rounded-full" /></td>
                  <td className="p-3"><Skeleton className="h-5 w-20 rounded-full" /></td>
                  <td className="p-3"><Skeleton className="h-4 w-20" /></td>
                  <td className="p-3"><Skeleton className="h-4 w-16" /></td>
                </tr>
              ))}
              {!loading && filtered.map((r) => {
                const isSelected = selectedIds.has(r.id);
                return (
                  <tr
                    key={r.id}
                    className={`border-t transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-secondary/40"}`}
                  >
                    <td className="pl-4 pr-2 py-3 w-10">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelected(r.id)}
                        aria-label={`Select ${r.full_name || "doctor"}`}
                        className="h-5 w-5 rounded"
                      />
                    </td>
                    <td className="p-3">
                      <Link to={`/superadmin/doctors/${r.id}`} className="font-medium text-primary hover:underline">
                        {r.full_name || "—"}
                      </Link>
                      <div className="text-xs text-muted-foreground">{r.specialization || "—"}</div>
                    </td>
                    <td className="p-3">{r.clinic_name || "—"}</td>
                    <td className="p-3">{r.city || "—"}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge>{r.plan_tier || "free"}</Badge>
                        {overriddenDoctorIds.has(r.id) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="text-[10px] bg-amber-500/10 border-amber-500/30 text-amber-700">
                                <KeyRound className="h-2.5 w-2.5 mr-1" /> Overrides
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>Has an active per-feature access override</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      {pendingPlansMap[r.id] && (
                        <div className="mt-1">
                          <Badge variant="outline" className="bg-royal/5 border-royal/30 text-[10px] text-royal font-medium">
                            Scheduled: {pendingPlansMap[r.id].target_tier} ({new Date(pendingPlansMap[r.id].activation_date).toLocaleDateString()})
                          </Badge>
                        </div>
                      )}
                    </td>
                    <td className="p-3"><PlanStatusBadge row={r} /></td>
                    <td className="p-3 text-xs text-muted-foreground">{joinedLabel(r)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        {r.slug && (
                          <a href={`/dr/${r.slug}`} target="_blank" rel="noreferrer" className="text-royal hover:underline inline-flex items-center gap-1 text-xs">
                            Site <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              className="text-muted-foreground hover:text-royal transition-colors"
                              aria-label={`Message ${r.full_name || "doctor"}`}
                              onClick={() => setMessageTarget({ type: "single", id: r.id, name: r.full_name || "this doctor" })}
                            >
                              <MessageSquarePlus className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Send message</TooltipContent>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">{emptyMessage}</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Cards — mobile */}
      <div className="md:hidden space-y-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={`sk-${i}`} aria-hidden="true">
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-52" />
              </CardContent>
            </Card>
          ))
        ) : filtered.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-muted-foreground">{emptyMessage}</CardContent></Card>
        ) : (
          filtered.map((r) => {
            const isSelected = selectedIds.has(r.id);
            return (
              <Card
                key={r.id}
                className={`transition-colors ${isSelected ? "bg-primary/5 border-primary/30" : ""}`}
              >
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="pt-1">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelected(r.id)}
                      aria-label={`Select ${r.full_name || "doctor"}`}
                      className="h-5 w-5 rounded"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <Link to={`/superadmin/doctors/${r.id}`} className="font-medium text-primary hover:underline">
                        {r.full_name || "—"}
                      </Link>
                      <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                        <PlanStatusBadge row={r} />
                        <Badge>{r.plan_tier || "free"}</Badge>
                        {overriddenDoctorIds.has(r.id) && (
                          <Badge variant="outline" className="text-[10px] bg-amber-500/10 border-amber-500/30 text-amber-700">
                            <KeyRound className="h-2.5 w-2.5 mr-1" /> Overrides
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{r.specialization || "—"}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {r.clinic_name || "—"}{r.city ? ` · ${r.city}` : ""} · Joined {joinedLabel(r)}
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      {r.slug && (
                        <a href={`/dr/${r.slug}`} target="_blank" rel="noreferrer" className="text-royal hover:underline inline-flex items-center gap-1 text-xs">
                          Site <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      <button
                        className="text-muted-foreground hover:text-royal transition-colors inline-flex items-center gap-1 text-xs"
                        onClick={() => setMessageTarget({ type: "single", id: r.id, name: r.full_name || "this doctor" })}
                      >
                        <MessageSquarePlus className="h-3.5 w-3.5" /> Message
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Floating bulk action bar */}
      {selectedRows.length > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] sm:w-auto max-w-lg"
        >
          <div className="bg-background/90 backdrop-blur-md border shadow-lg rounded-full px-4 sm:px-6 py-3 flex items-center justify-center flex-wrap gap-2 sm:gap-3">
            <span className="text-sm font-medium text-foreground whitespace-nowrap">
              {selectedRows.length} doctor{selectedRows.length === 1 ? "" : "s"} selected
            </span>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearSelection}>
              Clear
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs rounded-full px-4"
              onClick={() => setBulkSuspendOpen(true)}
              disabled={!can("doctors.edit") || suspendTargets.length === 0}
              title={
                !can("doctors.edit") ? "You don't have permission to suspend doctors"
                : suspendTargets.length === 0 ? "All selected doctors are already suspended"
                : undefined
              }
            >
              <Ban className="h-3.5 w-3.5 mr-1.5" /> Suspend Selected
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-full px-4"
              onClick={() => setBulkDeleteOpen(true)}
              disabled={!can("doctors.delete")}
              title={can("doctors.delete") ? undefined : "You don't have permission to delete doctors"}
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
          onDeleted={() => { clearSelection(); load(); }}
        />
      )}

      <AlertDialog open={bulkSuspendOpen} onOpenChange={(o) => !suspending && setBulkSuspendOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Suspend {suspendTargets.length} doctor{suspendTargets.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Their accounts are marked as suspended. Nothing is deleted, and each doctor can be reactivated
              later from their detail page.
              {alreadySuspended > 0 && ` ${alreadySuspended} selected doctor${alreadySuspended === 1 ? " is" : "s are"} already suspended and will be skipped.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={suspending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={suspending || suspendTargets.length === 0}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={(e) => { e.preventDefault(); confirmBulkSuspend(); }}
            >
              {suspending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Suspending…</> : "Suspend"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!messageTarget} onOpenChange={(v) => !v && closeMessageDialog()}>
        <DialogContent className="max-w-md">
          {messageTarget && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {messageTarget.type === "single" ? `Message ${messageTarget.name}` : "Broadcast to active doctors"}
                </DialogTitle>
                <DialogDescription>
                  {messageTarget.type === "single"
                    ? "Delivered to this doctor's notification bell in the admin panel."
                    : `Delivered to all ${activeDoctors.length} doctor${activeDoctors.length === 1 ? "" : "s"} with an active plan.`}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Subject</Label>
                  <Input value={messageSubject} onChange={(e) => setMessageSubject(e.target.value)} placeholder="What's this about?" />
                </div>
                <div className="space-y-1.5">
                  <Label>Message</Label>
                  <Textarea value={messageBody} onChange={(e) => setMessageBody(e.target.value)} rows={5} />
                </div>
                <Button
                  className="w-full"
                  disabled={!messageSubject.trim() || !messageBody.trim() || sendingMessage}
                  onClick={sendMessage}
                >
                  {sendingMessage ? "Sending…" : messageTarget.type === "single" ? "Send message" : `Send to ${activeDoctors.length} doctors`}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SADoctors;
