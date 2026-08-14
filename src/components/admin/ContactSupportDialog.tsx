import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, LifeBuoy, Plus } from "lucide-react";

type Ticket = {
  id: string;
  subject: string;
  description: string | null;
  status: string;
  priority: string;
  reply: string | null;
  replied_at: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open", in_progress: "In Progress", resolved: "Resolved", closed: "Closed",
};

type View = "list" | "detail" | "form";

const ContactSupportDialog = ({
  trigger,
  defaultSubject,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  initialTicketId,
}: {
  trigger?: React.ReactNode;
  defaultSubject?: string;
  /** Pass these two to drive the dialog externally (e.g. from a notification
   *  bell click-through) instead of the default self-contained trigger button. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Opens straight to this ticket's detail view instead of the list. */
  initialTicketId?: string;
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;

  const [view, setView] = useState<View>("list");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  const [subject, setSubject] = useState(defaultSubject ?? "");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [busy, setBusy] = useState(false);

  const loadTickets = async () => {
    setLoadingTickets(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoadingTickets(false); return; }
    const { data } = await supabase
      .from("support_tickets")
      .select("id, subject, description, status, priority, reply, replied_at, created_at")
      .eq("doctor_id", user.id)
      .order("created_at", { ascending: false });
    setTickets((data as unknown as Ticket[]) ?? []);
    setLoadingTickets(false);
  };

  useEffect(() => {
    if (!open) return;
    loadTickets();
    if (initialTicketId) {
      // Clear any previously-selected ticket so the "detail" view shows a
      // loading state instead of briefly flashing the wrong ticket's content
      // while the new one resolves below.
      setSelectedTicket(null);
      setView("detail");
    } else {
      setView("list");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTicketId]);

  // Once tickets load, resolve initialTicketId (from a bell click) to the actual row.
  useEffect(() => {
    if (initialTicketId && tickets.length > 0) {
      const t = tickets.find((x) => x.id === initialTicketId);
      if (t) setSelectedTicket(t);
    }
  }, [initialTicketId, tickets]);

  const submit = async () => {
    if (!subject.trim()) return;
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }
    const { error } = await supabase.from("support_tickets").insert({
      doctor_id: user.id, subject, description, priority,
    });
    setBusy(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Support ticket raised", description: "Our team will get back to you soon." });
    setSubject(defaultSubject ?? ""); setDescription(""); setPriority("normal");
    setView("list");
    loadTickets();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== null && (
        <DialogTrigger asChild>
          {trigger || (
            <button className="flex items-center gap-2 text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent text-sm font-medium w-full px-2 py-1.5 rounded-lg transition-colors">
              <LifeBuoy className="h-4 w-4" /> <span>Contact Support</span>
            </button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md">
        {view === "list" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between gap-2">
                My Support Requests
                <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => setView("form")}>
                  <Plus className="h-3.5 w-3.5" /> New Request
                </Button>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {loadingTickets ? (
                <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>
              ) : tickets.length === 0 ? (
                <div className="text-center py-8">
                  <LifeBuoy className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No requests yet.</p>
                </div>
              ) : (
                tickets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setSelectedTicket(t); setView("detail"); }}
                    className="w-full text-left border border-border rounded-lg p-3 hover:bg-secondary/60 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-sm text-foreground truncate">{t.subject}</span>
                      <Badge variant="secondary" className="text-[10px] shrink-0">{STATUS_LABEL[t.status] || t.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(t.created_at).toLocaleDateString()}
                      {t.reply && <span className="text-success ml-2">● Replied</span>}
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        )}

        {view === "detail" && !selectedTicket && (
          <p className="text-sm text-muted-foreground text-center py-10">Loading…</p>
        )}

        {view === "detail" && selectedTicket && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <button onClick={() => setView("list")} className="text-muted-foreground hover:text-foreground" aria-label="Back to list">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                {selectedTicket.subject}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">{STATUS_LABEL[selectedTicket.status] || selectedTicket.status}</Badge>
                <Badge variant="outline" className="text-[10px]">{selectedTicket.priority}</Badge>
                <span className="text-xs text-muted-foreground">{new Date(selectedTicket.created_at).toLocaleDateString()}</span>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedTicket.description || "No description."}</p>
              {selectedTicket.reply ? (
                <div className="bg-secondary rounded-lg p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-royal mb-1">Response from Doctylia</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{selectedTicket.reply}</p>
                  {selectedTicket.replied_at && (
                    <p className="text-[11px] text-muted-foreground mt-1.5">{new Date(selectedTicket.replied_at).toLocaleString()}</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No response yet — our team will get back to you soon.</p>
              )}
            </div>
          </>
        )}

        {view === "form" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {tickets.length > 0 && (
                  <button onClick={() => setView("list")} className="text-muted-foreground hover:text-foreground" aria-label="Back to list">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                Contact Support
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Subject</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What do you need help with?" />
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} />
              </div>
              <Button onClick={submit} disabled={!subject.trim() || busy} className="w-full">{busy ? "Sending…" : "Send"}</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ContactSupportDialog;
