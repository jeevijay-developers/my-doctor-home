import { useCallback, useEffect, useRef, useState } from "react";
import { Inbox, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSuperAdminAccess } from "@/contexts/SuperAdminAccessContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatIstDate } from "@/lib/istDate";

type Row = {
  id: string;
  doctor_id: string;
  requested_cap: number;
  doctor_note: string | null;
  patient_count: number;
  cap_at_request: number;
  status: "pending" | "approved" | "rejected";
  approved_cap: number | null;
  reviewer_note: string | null;
  decided_at: string | null;
  created_at: string;
  profiles: { full_name: string | null; clinic_name: string | null; plan_tier: string | null } | null;
};

/** The database column is a 32-bit integer; anything above this can never be stored. */
export const MAX_IMPORT_CAP = 2147483647;
const NOTE_MAX = 500;

const fmt = (v: number) => v.toLocaleString("en-IN");
const fmtDate = (iso: string | null) => (iso ? formatIstDate(iso) : "—");

/** "" for blank, otherwise the whole number, or null when it is zero or cannot be stored. */
const parseCap = (text: string): number | null => {
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) && n >= 1 && n <= MAX_IMPORT_CAP ? n : null;
};

const Who = ({ r }: { r: Row }) => (
  <div className="min-w-0">
    <div className="font-medium text-sm text-foreground truncate">{r.profiles?.full_name || "Unknown doctor"}</div>
    <div className="text-xs text-muted-foreground truncate">{[r.profiles?.clinic_name, r.profiles?.plan_tier].filter(Boolean).join(" · ") || "—"}</div>
  </div>
);

const Numbers = ({ r }: { r: Row }) => (
  <p className="text-xs text-muted-foreground">
    {fmt(r.patient_count)} patients now · limit {fmt(r.cap_at_request)} · asks for {fmt(r.requested_cap)}
  </p>
);

const outcome = (r: Row) => (r.status === "approved" ? `Approved ${fmt(r.approved_cap ?? 0)}` : "Declined");

const empty = (text: string) => (
  <Card><CardContent className="py-10 flex flex-col items-center gap-2 text-muted-foreground text-sm"><Inbox className="h-6 w-6" />{text}</CardContent></Card>
);

const SAImportRequests = ({ onChange }: { onChange?: () => void }) => {
  const { can } = useSuperAdminAccess();
  const canManage = can("plan_requests.manage");

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<Row | null>(null);
  const [cap, setCap] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("patient_import_requests" as any)
      .select("*, profiles:doctor_id(full_name, clinic_name, plan_tier)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      setLoadError(error.message || "Unknown error");
      toast({ title: "Failed to load requests", description: error.message, variant: "destructive" });
    } else {
      setLoadError(null);
      setRows((data as unknown as Row[]) ?? []);
    }
    setLoading(false);
  }, []);

  // Reload the list, and tell the parent so its pending count follows.
  const reload = useCallback(async () => {
    await load();
    onChange?.();
  }, [load, onChange]);

  useEffect(() => { void load(); }, [load]);

  const retry = () => { setLoading(true); void load(); };

  const open = (r: Row) => { setReviewing(r); setCap(String(r.requested_cap)); setNote(""); };

  const decide = async (decision: "approve" | "reject") => {
    if (!reviewing || savingRef.current || !canManage) return;
    let approvedCap: number | null = null;
    if (decision === "reject" && !note.trim()) {
      toast({ title: "Add a reason", description: "The doctor sees this reason.", variant: "destructive" });
      return;
    }
    if (decision === "approve") {
      approvedCap = parseCap(cap);
      if (approvedCap == null) {
        toast({
          title: "Enter a valid limit",
          description: `A whole number from 1 to ${fmt(MAX_IMPORT_CAP)}.`,
          variant: "destructive",
        });
        return;
      }
    }
    savingRef.current = true;
    setSaving(true);
    const { error } = await supabase.rpc("review_patient_import_request" as any, {
      _request_id: reviewing.id,
      _decision: decision,
      _approved_cap: approvedCap,
      _note: note.trim() || null,
    });
    savingRef.current = false;
    setSaving(false);
    if (error) {
      toast({ title: "Could not save decision", description: error.message, variant: "destructive" });
      // Someone else decided it first: the dialog is now pointless, show the real state.
      if (/already/i.test(error.message ?? "")) {
        setReviewing(null);
        void reload();
      }
      return;
    }
    toast({ title: decision === "approve" ? "Approved — live for the clinic now" : "Request declined" });
    setReviewing(null);
    void reload();
  };

  const pending = rows.filter((r) => r.status === "pending");
  const decided = rows.filter((r) => r.status !== "pending");

  if (loading) {
    return <div className="py-12 flex justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" /></div>;
  }

  if (loadError) {
    return (
      <Card><CardContent className="py-10 flex flex-col items-center gap-3 text-sm">
        <p role="alert" className="text-destructive">Could not load import limit requests: {loadError}</p>
        <Button size="sm" variant="outline" onClick={retry}>Try again</Button>
      </CardContent></Card>
    );
  }

  const capNumber = parseCap(cap);
  const belowCurrent = !!reviewing && capNumber != null && capNumber <= reviewing.cap_at_request;
  const capInvalid = cap !== "" && capNumber == null;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="font-heading font-semibold text-foreground">Waiting for review{pending.length ? ` (${pending.length})` : ""}</h2>
        {pending.length === 0 ? empty("No limit requests waiting.") : (
          <>
            <Card className="hidden md:block"><Table>
              <TableHeader><TableRow><TableHead>Doctor</TableHead><TableHead>Request</TableHead><TableHead>Sent</TableHead><TableHead className="text-right"> </TableHead></TableRow></TableHeader>
              <TableBody>
                {pending.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell><Who r={r} /></TableCell>
                    <TableCell>
                      <Numbers r={r} />
                      {r.doctor_note && <p className="text-xs text-muted-foreground mt-1 line-clamp-2 break-words">“{r.doctor_note}”</p>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.created_at)}</TableCell>
                    <TableCell className="text-right"><Button size="sm" onClick={() => open(r)}>Review</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table></Card>
            <div className="md:hidden space-y-2">
              {pending.map((r) => (
                <Card key={r.id}><CardContent className="p-3 space-y-2">
                  <Who r={r} />
                  <Numbers r={r} />
                  {r.doctor_note && <p className="text-xs text-muted-foreground break-words">“{r.doctor_note}”</p>}
                  <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{fmtDate(r.created_at)}</span><Button size="sm" onClick={() => open(r)}>Review</Button></div>
                </CardContent></Card>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-heading font-semibold text-foreground">Earlier decisions</h2>
        {decided.length === 0 ? empty("Nothing decided yet.") : (
          <>
            <Card className="hidden md:block"><Table>
              <TableHeader><TableRow><TableHead>Doctor</TableHead><TableHead>Asked for</TableHead><TableHead>Outcome</TableHead><TableHead>Decided</TableHead></TableRow></TableHeader>
              <TableBody>
                {decided.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell><Who r={r} /></TableCell>
                    <TableCell className="text-sm">{fmt(r.requested_cap)}</TableCell>
                    <TableCell className="text-xs space-y-1">
                      <Badge variant={r.status === "approved" ? "default" : "secondary"}>{outcome(r)}</Badge>
                      {r.reviewer_note && <div className="text-muted-foreground break-words">Note: {r.reviewer_note}</div>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.decided_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table></Card>
            <div className="md:hidden space-y-2">
              {decided.map((r) => (
                <Card key={r.id}><CardContent className="p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Who r={r} />
                    <Badge variant={r.status === "approved" ? "default" : "secondary"}>{outcome(r)}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Asked for {fmt(r.requested_cap)}{r.decided_at ? ` · decided ${fmtDate(r.decided_at)}` : ""}</p>
                  {r.reviewer_note && <p className="text-xs text-muted-foreground break-words">Note: {r.reviewer_note}</p>}
                </CardContent></Card>
              ))}
            </div>
          </>
        )}
      </section>

      <Dialog open={!!reviewing} onOpenChange={(o) => { if (!o && !saving) setReviewing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Review limit request</DialogTitle>
            <DialogDescription>
              {reviewing && `${reviewing.profiles?.full_name || "Unknown doctor"} has ${fmt(reviewing.patient_count)} patients and asks for ${fmt(reviewing.requested_cap)} (limit was ${fmt(reviewing.cap_at_request)}).`}
            </DialogDescription>
          </DialogHeader>
          {reviewing?.doctor_note && <p className="text-sm rounded-lg bg-secondary p-3 break-words">“{reviewing.doctor_note}”</p>}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sa-import-cap">Approved limit</Label>
              <Input
                id="sa-import-cap"
                inputMode="numeric"
                maxLength={10}
                value={cap}
                disabled={!canManage}
                aria-invalid={capInvalid || undefined}
                onChange={(e) => setCap(e.target.value.replace(/\D/g, "").slice(0, 10))}
              />
              {capInvalid && (
                <p role="alert" className="text-[11px] text-destructive">Enter a whole number from 1 to {fmt(MAX_IMPORT_CAP)}.</p>
              )}
              {belowCurrent && reviewing && (
                <p role="alert" className="text-[11px] text-amber-700">
                  This is not above the limit when asked ({fmt(reviewing.cap_at_request)}). The server refuses limits that are not above the clinic's current one.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sa-import-note">Note to the doctor (the doctor sees this; required to decline)</Label>
              <Textarea id="sa-import-note" rows={2} maxLength={NOTE_MAX} value={note} disabled={!canManage} onChange={(e) => setNote(e.target.value)} />
              <p className="text-[11px] text-muted-foreground text-right">{note.length}/{NOTE_MAX}</p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" disabled={saving || !canManage} onClick={() => decide("reject")}>Decline</Button>
            <Button disabled={saving || !canManage} onClick={() => decide("approve")}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Approve
            </Button>
          </DialogFooter>
          {!canManage && <p className="text-xs text-muted-foreground text-right">You have view-only access to this module.</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SAImportRequests;
