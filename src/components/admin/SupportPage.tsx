import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { LifeBuoy, Plus } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";

type Ticket = {
  id: string;
  subject: string;
  description: string | null;
  status: string;
  priority: string;
  category: string | null;
  reply: string | null;
  replied_at: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open", in_progress: "In Progress", resolved: "Resolved", closed: "Closed",
};

// Grounded in the actual admin panel sections rather than generic invented
// buckets ("Billing", "Technical Issue", ...) — a doctor's pick doubles as
// "which part of Doctylia this is about" for faster superadmin triage.
const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "dashboard", label: "Dashboard" },
  { value: "my-website", label: "My Website" },
  { value: "appointments", label: "Appointments" },
  { value: "patients", label: "Patients" },
  { value: "prescriptions", label: "Prescriptions" },
  { value: "reviews", label: "Reviews" },
  { value: "blog", label: "Blog" },
  { value: "billing", label: "Billing" },
  { value: "staff", label: "Staff Management" },
  { value: "settings", label: "Settings" },
  { value: "account", label: "Account / Login" },
  { value: "other", label: "Other" },
];
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORY_OPTIONS.map((c) => [c.value, c.label]));

// Full page rather than a modal — was previously ContactSupportDialog,
// opened two different ways (a sidebar-footer trigger, and a second,
// separately-controlled instance for the notification bell's click-through)
// that both rendered the exact same list/detail/form UI. Moving it to a
// route collapses that into one code path: both entry points now just link
// or navigate here instead of managing dialog-open state of their own.
//
// The list itself is the full page, full width. Both "New Request" and
// viewing an individual ticket's detail are card/dialog overlays on top of
// it, same as the original ContactSupportDialog.
const SupportPage = () => {
  const { profile, isStaff, staffName, authUserId } = useProfile();
  const [searchParams, setSearchParams] = useSearchParams();
  const ticketIdFromUrl = searchParams.get("ticket");

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [category, setCategory] = useState("other");
  const [busy, setBusy] = useState(false);

  // Staff see only the tickets they personally submitted (submitted_by_user_id);
  // a doctor sees every ticket under their clinic (doctor_id), including
  // ones their staff raised — matching what each role's RLS policy actually
  // permits. authUserId is the real logged-in person's own id, which for a
  // doctor session already equals their own doctor_id.
  const loadTickets = useCallback(async () => {
    if (!authUserId) return;
    setLoadingTickets(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("support_tickets")
      .select("id, subject, description, status, priority, category, reply, replied_at, created_at")
      .eq(isStaff ? "submitted_by_user_id" : "doctor_id", authUserId)
      .order("created_at", { ascending: false });
    if (error) {
      setLoadError(error.message);
      setLoadingTickets(false);
      return;
    }
    setTickets((data as unknown as Ticket[]) ?? []);
    setLoadingTickets(false);
  }, [authUserId, isStaff]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  // Resolve the "?ticket=" deep link (from the notification bell) to the
  // actual row once tickets have loaded, opening it in the same detail
  // dialog a manual click would. Falls back to the list if the id doesn't
  // match anything (stale link, or it belongs to another doctor).
  useEffect(() => {
    if (!ticketIdFromUrl || tickets.length === 0) return;
    const t = tickets.find((x) => x.id === ticketIdFromUrl);
    if (t) {
      setSelectedTicket(t);
      setDetailOpen(true);
    } else {
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketIdFromUrl, tickets]);

  const openTicket = (t: Ticket) => {
    setSelectedTicket(t);
    setDetailOpen(true);
    setSearchParams({ ticket: t.id }, { replace: true });
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setSelectedTicket(null);
    if (searchParams.get("ticket")) setSearchParams({}, { replace: true });
  };

  const submit = async () => {
    if (!subject.trim() || !profile || !authUserId) return;
    setBusy(true);
    const { error } = await supabase.from("support_tickets").insert({
      doctor_id: profile.id,
      submitted_by_user_id: authUserId,
      submitted_by_name: (isStaff ? staffName : profile.full_name) || "",
      subject, description, priority, category,
    });
    setBusy(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Support ticket raised", description: "Our team will get back to you soon." });
    setSubject(""); setDescription(""); setPriority("normal"); setCategory("other");
    setFormOpen(false);
    loadTickets();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
            <LifeBuoy className="h-6 w-6 text-royal" /> Support
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your support requests and Doctylia's replies.
          </p>
        </div>
        <Button className="bg-royal hover:bg-royal/90" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Request
        </Button>
      </div>

      {/* Full-width list — the whole page. Clicking a request, or "New
          Request" above, opens a card/dialog overlay on top of it, matching
          how this worked before the page conversion. */}
      <Card>
        <CardContent className="p-4 sm:p-5 space-y-2">
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
                  <Badge variant="secondary" className="text-[10px] shrink-0">{STATUS_LABEL[t.status] || t.status}</Badge>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                  {t.category && <Badge variant="outline" className="text-[10px]">{CATEGORY_LABEL[t.category] || t.category}</Badge>}
                  <Badge variant="outline" className="text-[10px]">{t.priority}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1.5">
                  {new Date(t.created_at).toLocaleDateString()}
                  {t.reply && <span className="text-success ml-2">● Replied</span>}
                </div>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      {/* New Request — a card/dialog overlay. */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What do you need help with?" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
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
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} />
            </div>
            <Button onClick={submit} disabled={!subject.trim() || busy} className="w-full">{busy ? "Sending…" : "Send"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ticket detail — a card/dialog overlay. */}
      <Dialog open={detailOpen} onOpenChange={(o) => !o && closeDetail()}>
        <DialogContent className="max-w-lg">
          {!selectedTicket ? (
            <p className="text-sm text-muted-foreground text-center py-10">Loading…</p>
          ) : (
            <div className="space-y-3">
              <DialogHeader>
                <DialogTitle>{selectedTicket.subject}</DialogTitle>
              </DialogHeader>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-[10px]">{STATUS_LABEL[selectedTicket.status] || selectedTicket.status}</Badge>
                <Badge variant="outline" className="text-[10px]">{selectedTicket.priority}</Badge>
                {selectedTicket.category && (
                  <Badge variant="outline" className="text-[10px]">{CATEGORY_LABEL[selectedTicket.category] || selectedTicket.category}</Badge>
                )}
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
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SupportPage;
