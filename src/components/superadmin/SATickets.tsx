import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { logAdminAction } from "@/lib/adminAudit";
import { TIER_LABELS } from "@/lib/planFeatures";
import { Trash2, X } from "lucide-react";

const STATUSES = ["open", "in_progress", "resolved", "closed"];
const PRIORITIES = ["low", "normal", "high", "urgent"];

const SATickets = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [statusF, setStatusF] = useState("all");
  const [priorityF, setPriorityF] = useState("all");
  const [open, setOpen] = useState<any | null>(null);
  const [notes, setNotes] = useState("");
  const [reply, setReply] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  // Bulk selection/delete mirrors the Doctor Side → Patients pattern
  // (PatientsPage.tsx) exactly: select-mode toggle, row checkboxes + a
  // "Select all" text button, a floating bottom action bar, and an
  // AlertDialog confirmation. Ticket deletion uses sonner's toast (aliased
  // to sonnerToast here) to match Patients' exact success/error messages —
  // every other action on this page keeps the existing @/hooks/use-toast
  // convention unchanged.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("support_tickets").select("*, profiles:doctor_id(full_name, clinic_name)").order("created_at", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const update = async (id: string, patch: Record<string, any>, action: string) => {
    const { error } = await supabase.from("support_tickets").update(patch as any).eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    await logAdminAction(action, "support_tickets", id, patch);
    toast({ title: "Ticket updated" });
    load();
    if (open?.id === id) setOpen({ ...open, ...patch });
  };

  const sendReply = async () => {
    if (!open || !reply.trim()) return;
    setSendingReply(true);
    const { data: { user } } = await supabase.auth.getUser();
    const patch = { reply: reply.trim(), replied_at: new Date().toISOString(), replied_by: user?.id ?? null };
    const { error } = await supabase.from("support_tickets").update(patch as any).eq("id", open.id);
    if (error) { setSendingReply(false); return toast({ title: "Failed", description: error.message, variant: "destructive" }); }
    await supabase.from("notifications" as any).insert({
      doctor_id: open.doctor_id,
      source_type: "ticket_reply",
      title: `Re: ${open.subject}`,
      message: reply.trim(),
      ticket_id: open.id,
      sender_id: user?.id ?? null,
    } as any);
    await logAdminAction("reply_to_ticket", "support_tickets", open.id, { reply: reply.trim() });
    setSendingReply(false);
    toast({ title: "Reply sent" });
    setOpen({ ...open, ...patch });
    load();
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const exitSelectMode = () => { setSelectMode(false); clearSelection(); };

  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const { error } = await supabase.from("support_tickets").delete().in("id", ids);
    if (error) { sonnerToast.error("Could not delete tickets"); return; }
    await logAdminAction("bulk_delete_tickets", "support_tickets", undefined, { ids });
    sonnerToast.success(`${ids.length} ticket${ids.length === 1 ? "" : "s"} deleted`);
    setBulkDeleteOpen(false);
    if (open && ids.includes(open.id)) setOpen(null);
    exitSelectMode();
    load();
  };

  const filtered = rows.filter((r) => (statusF === "all" || r.status === statusF) && (priorityF === "all" || r.priority === priorityF));

  return (
    <div className="space-y-4">
      <div className={`flex gap-3 transition-opacity ${selectMode ? "opacity-60 pointer-events-none" : ""}`}>
        <Select value={statusF} onValueChange={setStatusF}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All statuses</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={priorityF} onValueChange={setPriorityF}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All priorities</SelectItem>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* Select mode toggle */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {selectMode ? (
              <span>{selectedIds.size} of {filtered.length} selected</span>
            ) : (
              <span>{filtered.length} ticket{filtered.length === 1 ? "" : "s"}</span>
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
                {selectMode && <th className="p-3 w-10"></th>}
                <th className="text-left p-3">Subject</th>
                <th className="text-left p-3">Doctor</th>
                <th className="text-left p-3">Priority</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const isSelected = selectedIds.has(r.id);
                return (
                  <tr
                    key={r.id}
                    className={`border-t cursor-pointer hover:bg-secondary/40 ${isSelected ? "bg-destructive/5" : ""}`}
                    onClick={selectMode ? () => toggleSelected(r.id) : () => { setOpen(r); setNotes(r.notes || ""); setReply(""); }}
                  >
                    {selectMode && (
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={isSelected} onCheckedChange={() => toggleSelected(r.id)} aria-label={`Select ticket: ${r.subject}`} />
                      </td>
                    )}
                    <td className="p-3 font-medium">{r.subject}</td>
                    <td className="p-3 text-xs">{r.profiles?.full_name}<div className="text-muted-foreground">{r.profiles?.clinic_name}</div></td>
                    <td className="p-3"><Badge variant="outline">{r.priority}</Badge></td>
                    <td className="p-3"><Badge>{r.status}</Badge></td>
                    <td className="p-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={selectMode ? 6 : 5} className="p-6 text-center text-muted-foreground">No tickets.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Cards — mobile */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-muted-foreground">No tickets.</CardContent></Card>
        ) : (
          filtered.map((r) => {
            const isSelected = selectedIds.has(r.id);
            return (
              <Card
                key={r.id}
                className={`cursor-pointer transition-colors ${isSelected ? "bg-destructive/5 border-destructive/30" : "hover:bg-secondary/40"}`}
                onClick={selectMode ? () => toggleSelected(r.id) : () => { setOpen(r); setNotes(r.notes || ""); setReply(""); }}
              >
                <CardContent className="p-4 flex items-start gap-3">
                  {selectMode && (
                    <div onClick={(e) => e.stopPropagation()} className="pt-1">
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleSelected(r.id)} aria-label={`Select ticket: ${r.subject}`} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground truncate">{r.subject}</div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {r.profiles?.full_name}{r.profiles?.clinic_name ? ` · ${r.profiles.clinic_name}` : ""}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mt-2">
                      <Badge variant="outline" className="text-[10px]">{r.priority}</Badge>
                      <Badge className="text-[10px]">{r.status}</Badge>
                      <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-lg">
          {open && (
            <>
              <DialogHeader><DialogTitle>{open.subject}</DialogTitle></DialogHeader>
              {open.metadata?.upgrade_request && (
                <div className="text-sm bg-secondary rounded-lg p-3">
                  {TIER_LABELS[open.metadata.upgrade_request.from_tier] || open.metadata.upgrade_request.from_tier}
                  {" "}({open.metadata.upgrade_request.from_status}) →{" "}
                  {TIER_LABELS[open.metadata.upgrade_request.to_tier] || open.metadata.upgrade_request.to_tier}
                </div>
              )}
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{open.description || "No description."}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">Status</label>
                  <Select value={open.status} onValueChange={(v) => update(open.id, { status: v }, "update_ticket_status")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium">Priority</label>
                  <Select value={open.priority} onValueChange={(v) => update(open.id, { priority: v }, "update_ticket_priority")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="border-t pt-3">
                <label className="text-xs font-medium">Reply to doctor</label>
                {open.reply && (
                  <div className="bg-secondary rounded-lg p-3 mt-1.5 mb-2 text-sm">
                    <p className="whitespace-pre-wrap">{open.reply}</p>
                    {open.replied_at && (
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        Sent {new Date(open.replied_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                  placeholder={open.reply ? "Send another reply — this replaces the one above." : "Write a reply the doctor will see…"}
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  <Button size="sm" disabled={!reply.trim() || sendingReply} onClick={sendReply}>
                    {sendingReply ? "Sending…" : "Send reply"}
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium">Internal notes</label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
                <div className="flex flex-wrap gap-2 mt-2">
                  <Button size="sm" variant="outline" onClick={async () => { await update(open.id, { notes }, "update_ticket_notes"); setOpen(null); }}>Save notes</Button>
                </div>
              </div>

            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Floating bulk action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] sm:w-auto max-w-md"
        >
          <div className="bg-background/90 backdrop-blur-md border shadow-lg rounded-full px-4 sm:px-6 py-3 flex items-center gap-3 sm:gap-4">
            <span className="text-sm font-medium text-foreground whitespace-nowrap">
              {selectedIds.size} ticket{selectedIds.size === 1 ? "" : "s"} selected
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

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={(o) => !o && setBulkDeleteOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} ticket{selectedIds.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The selected support tickets will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={(e) => { e.preventDefault(); bulkDelete(); }}
            >
              Delete {selectedIds.size}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SATickets;
