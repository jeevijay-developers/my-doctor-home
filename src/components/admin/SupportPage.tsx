import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

// Full page rather than a modal — was previously ContactSupportDialog,
// opened two different ways (a sidebar-footer trigger, and a second,
// separately-controlled instance for the notification bell's click-through)
// that both rendered the exact same list/detail/form UI. Moving it to a
// route collapses that into one code path: both entry points now just link
// or navigate here instead of managing dialog-open state of their own.
const SupportPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const ticketIdFromUrl = searchParams.get("ticket");

  const [view, setView] = useState<View>(ticketIdFromUrl ? "detail" : "list");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [busy, setBusy] = useState(false);

  const loadTickets = async () => {
    setLoadingTickets(true);
    setLoadError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoadingTickets(false); return; }
    const { data, error } = await supabase
      .from("support_tickets")
      .select("id, subject, description, status, priority, reply, replied_at, created_at")
      .eq("doctor_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      setLoadError(error.message);
      setLoadingTickets(false);
      return;
    }
    setTickets((data as unknown as Ticket[]) ?? []);
    setLoadingTickets(false);
  };

  useEffect(() => { loadTickets(); }, []);

  // Resolve the "?ticket=" deep link (from the notification bell) to the
  // actual row once tickets have loaded. Falls back to the list if the id
  // doesn't match anything (stale link, or it belongs to another doctor).
  useEffect(() => {
    if (!ticketIdFromUrl || tickets.length === 0) return;
    const t = tickets.find((x) => x.id === ticketIdFromUrl);
    if (t) {
      setSelectedTicket(t);
    } else {
      setView("list");
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketIdFromUrl, tickets]);

  const openTicket = (t: Ticket) => {
    setSelectedTicket(t);
    setView("detail");
    setSearchParams({ ticket: t.id }, { replace: true });
  };

  const backToList = () => {
    setSelectedTicket(null);
    setView("list");
    if (searchParams.get("ticket")) setSearchParams({}, { replace: true });
  };

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
    setSubject(""); setDescription(""); setPriority("normal");
    setView("list");
    loadTickets();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
            <LifeBuoy className="h-6 w-6 text-royal" /> Support
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your support requests and Doctylia's replies.
          </p>
        </div>
        {view === "list" && (
          <Button className="bg-royal hover:bg-royal/90" onClick={() => setView("form")}>
            <Plus className="h-4 w-4 mr-1" /> New Request
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6">
          {view === "list" && (
            <div className="space-y-2">
              {loadingTickets ? (
                <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>
              ) : loadError ? (
                <div className="text-center py-8">
                  <p className="text-sm text-destructive font-medium">Couldn't load your requests</p>
                  <p className="text-xs text-muted-foreground mt-1">{loadError}</p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={loadTickets}>Try again</Button>
                </div>
              ) : tickets.length === 0 ? (
                <div className="text-center py-8">
                  <LifeBuoy className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No requests yet.</p>
                </div>
              ) : (
                tickets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => openTicket(t)}
                    className="w-full text-left border border-border rounded-lg p-3 hover:bg-secondary/60 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-sm text-foreground truncate">{t.subject}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline" className="text-[10px]">{t.priority}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{STATUS_LABEL[t.status] || t.status}</Badge>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(t.created_at).toLocaleDateString()}
                      {t.reply && <span className="text-success ml-2">● Replied</span>}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {view === "detail" && !selectedTicket && (
            <p className="text-sm text-muted-foreground text-center py-10">Loading…</p>
          )}

          {view === "detail" && selectedTicket && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button onClick={backToList} className="text-muted-foreground hover:text-foreground" aria-label="Back to list">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h2 className="font-heading font-semibold text-foreground">{selectedTicket.subject}</h2>
              </div>
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
          )}

          {view === "form" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {tickets.length > 0 && (
                  <button onClick={backToList} className="text-muted-foreground hover:text-foreground" aria-label="Back to list">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                <h2 className="font-heading font-semibold text-foreground">New Request</h2>
              </div>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SupportPage;
