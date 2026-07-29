import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { logAdminAction } from "@/lib/adminAudit";

const STATUSES = ["open", "in_progress", "resolved", "closed"];
const PRIORITIES = ["low", "normal", "high", "urgent"];

const SATickets = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [statusF, setStatusF] = useState("all");
  const [priorityF, setPriorityF] = useState("all");
  const [open, setOpen] = useState<any | null>(null);
  const [notes, setNotes] = useState("");

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

  const filtered = rows.filter((r) => (statusF === "all" || r.status === statusF) && (priorityF === "all" || r.priority === priorityF));

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Select value={statusF} onValueChange={setStatusF}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All statuses</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={priorityF} onValueChange={setPriorityF}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All priorities</SelectItem>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Subject</th>
                <th className="text-left p-3">Doctor</th>
                <th className="text-left p-3">Priority</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t cursor-pointer hover:bg-secondary/40" onClick={() => { setOpen(r); setNotes(r.notes || ""); }}>
                  <td className="p-3 font-medium">{r.subject}</td>
                  <td className="p-3 text-xs">{r.profiles?.full_name}<div className="text-muted-foreground">{r.profiles?.clinic_name}</div></td>
                  <td className="p-3"><Badge variant="outline">{r.priority}</Badge></td>
                  <td className="p-3"><Badge>{r.status}</Badge></td>
                  <td className="p-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No tickets.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-lg">
          {open && (
            <>
              <DialogHeader><DialogTitle>{open.subject}</DialogTitle></DialogHeader>
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
              <div>
                <label className="text-xs font-medium">Internal notes</label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
                <div className="flex flex-wrap gap-2 mt-2">
                  <Button size="sm" variant="outline" onClick={() => update(open.id, { notes }, "update_ticket_notes")}>Save notes</Button>
                  {open.status !== "resolved" && open.status !== "closed" && (
                    <Button
                      size="sm"
                      onClick={async () => {
                        await update(open.id, { notes, status: "resolved" }, "resolve_ticket");
                        setOpen(null);
                      }}
                    >
                      Save &amp; Mark Resolved
                    </Button>
                  )}
                  {open.status !== "closed" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={async () => {
                        await update(open.id, { notes, status: "closed" }, "close_ticket");
                        setOpen(null);
                      }}
                    >
                      Save &amp; Close Ticket
                    </Button>
                  )}
                </div>
              </div>

            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SATickets;
