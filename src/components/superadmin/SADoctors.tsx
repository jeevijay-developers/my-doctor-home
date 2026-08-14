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
import { ExternalLink, MessageSquarePlus, Radio, Trash2, X } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import BulkDeleteDoctorsDialog from "./BulkDeleteDoctorsDialog";

type MessageTarget = { type: "single"; id: string; name: string } | { type: "broadcast" };

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
  return null;
}

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

  const [messageTarget, setMessageTarget] = useState<MessageTarget | null>(null);
  const [messageSubject, setMessageSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

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

  const closeMessageDialog = () => {
    setMessageTarget(null);
    setMessageSubject("");
    setMessageBody("");
  };

  // "Active" matches the same plan_status === "active" definition already
  // used by the status filter above — not a separately-invented notion.
  const activeDoctors = rows.filter((r) => r.plan_status === "active");

  const sendMessage = async () => {
    if (!messageTarget || !messageSubject.trim() || !messageBody.trim()) return;
    setSendingMessage(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (messageTarget.type === "single") {
      const { error } = await supabase.from("notifications" as any).insert({
        doctor_id: messageTarget.id,
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
        <Button
          variant="outline"
          className="md:ml-auto gap-1.5"
          onClick={() => setMessageTarget({ type: "broadcast" })}
        >
          <Radio className="h-4 w-4" /> Broadcast to Active ({activeDoctors.length})
        </Button>
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

      {/* Table — tablet/desktop */}
      <Card className="hidden md:block">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase text-muted-foreground">
              <tr>
                {selectMode && <th className="pl-4 pr-2 py-3 w-10"></th>}
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
                    <td className="p-3"><PlanStatusBadge row={r} /></td>
                    <td className="p-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        {r.slug && (
                          <a href={`/dr/${r.slug}`} target="_blank" rel="noreferrer" className="text-royal hover:underline inline-flex items-center gap-1 text-xs" onClick={(e) => selectMode && e.preventDefault()}>
                            Site <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              className="text-muted-foreground hover:text-royal transition-colors"
                              aria-label={`Message ${r.full_name || "doctor"}`}
                              onClick={() => { if (selectMode) return; setMessageTarget({ type: "single", id: r.id, name: r.full_name || "this doctor" }); }}
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
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No doctors found.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Cards — mobile */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-muted-foreground">No doctors found.</CardContent></Card>
        ) : (
          filtered.map((r) => {
            const isSelected = selectedIds.has(r.id);
            return (
              <Card
                key={r.id}
                className={`transition-colors ${isSelected ? "bg-destructive/5 border-destructive/30" : ""} ${selectMode ? "cursor-pointer" : ""}`}
                onClick={selectMode ? () => toggleSelected(r.id) : undefined}
              >
                <CardContent className="p-4 flex items-start gap-3">
                  {selectMode && (
                    <div onClick={(e) => e.stopPropagation()} className="pt-1">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelected(r.id)}
                        aria-label={`Select ${r.full_name || "doctor"}`}
                        className="h-5 w-5 rounded"
                      />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      {selectMode ? (
                        <span className="font-medium text-primary">{r.full_name || "—"}</span>
                      ) : (
                        <Link to={`/superadmin/doctors/${r.id}`} className="font-medium text-primary hover:underline">
                          {r.full_name || "—"}
                        </Link>
                      )}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <PlanStatusBadge row={r} />
                        <Badge>{r.plan_tier || "free"}</Badge>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{r.specialization || "—"}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {r.clinic_name || "—"}{r.city ? ` · ${r.city}` : ""} · Joined {new Date(r.created_at).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      {r.slug && (
                        <a href={`/dr/${r.slug}`} target="_blank" rel="noreferrer" className="text-royal hover:underline inline-flex items-center gap-1 text-xs" onClick={(e) => selectMode && e.preventDefault()}>
                          Site <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      <button
                        className="text-muted-foreground hover:text-royal transition-colors inline-flex items-center gap-1 text-xs"
                        onClick={(e) => { e.stopPropagation(); if (selectMode) return; setMessageTarget({ type: "single", id: r.id, name: r.full_name || "this doctor" }); }}
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
