import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2, Plus, Minus, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSuperAdminAccess } from "@/contexts/SuperAdminAccessContext";
import { usePlanPrices } from "@/hooks/usePlanPrices";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { CustomPlan, PlanRequest } from "@/lib/customPlan";
import { formatIstDate } from "@/lib/istDate";

type DoctorInfo = { full_name: string | null; clinic_name: string | null; plan_tier: string | null; plan_status: string | null; plan_end: string | null };
type RequestRow = PlanRequest & { profiles: DoctorInfo | null };
type PlanRow = CustomPlan & { profiles: DoctorInfo | null };
type FeatureRow = { key: string; label: string; is_requestable: boolean; is_active: boolean };
type AccessRow = { feature_key: string; effective_enabled: boolean };

const DOC_COLS = "profiles(full_name, clinic_name, plan_tier, plan_status, plan_end)";
const fmt = (d: string | null) => (d ? formatIstDate(d) : "—");
const istStart = (d: string) => new Date(`${d}T00:00:00+05:30`).toISOString();
const istEnd = (d: string) => new Date(`${d}T23:59:59+05:30`).toISOString();
// IST calendar date of an instant (a plain slice(0,10) gives the UTC date, a day early for evening-UTC ends).
const istDate = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
// Business timezone is IST: "today" for the date pickers is the IST calendar day.
const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

const statusBadge = (s: string) => {
  const cls: Record<string, string> = {
    pending: "bg-amber-500/15 text-amber-700",
    approved: "bg-success/15 text-success",
    rejected: "bg-destructive/15 text-destructive",
    withdrawn: "bg-muted text-muted-foreground",
    active: "bg-success/15 text-success",
    expired: "bg-muted text-muted-foreground",
    cancelled: "bg-muted text-muted-foreground",
  };
  return <Badge className={`capitalize text-[10px] border-0 hover:bg-transparent ${cls[s] ?? ""}`}>{s}</Badge>;
};

const SAPlanRequests = () => {
  const { can } = useSuperAdminAccess();
  const canManage = can("plan_requests.manage");
  const { proPrice, premiumPrice } = usePlanPrices();

  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [features, setFeatures] = useState<FeatureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<RequestRow | null>(null);
  const [editingPlan, setEditingPlan] = useState<PlanRow | null>(null);
  const [cancelling, setCancelling] = useState<PlanRow | null>(null);
  const [rebasing, setRebasing] = useState<PlanRow | null>(null);

  const labelFor = useCallback((key: string) => features.find((f) => f.key === key)?.label ?? key, [features]);

  const load = useCallback(async () => {
    const [reqRes, planRes, featRes] = await Promise.all([
      supabase.from("plan_requests" as any).select(`*, ${DOC_COLS}`).order("created_at", { ascending: false }).limit(200),
      supabase.from("doctor_custom_plans" as any).select(`*, ${DOC_COLS}`).order("updated_at", { ascending: false }),
      supabase.from("features" as any).select("key, label, is_requestable, is_active").order("sort_order"),
    ]);
    if (reqRes.error) toast({ title: "Failed to load requests", description: reqRes.error.message, variant: "destructive" });
    setRequests(((reqRes.data as unknown) as RequestRow[]) ?? []);
    setPlans(((planRes.data as unknown) as PlanRow[]) ?? []);
    setFeatures(((featRes.data as unknown) as FeatureRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("sa-plan-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "plan_requests" }, () => load())
      // A doctor cancelling, or a plan expiring, must drop out of "Active plans" live.
      .on("postgres_changes", { event: "*", schema: "public", table: "doctor_custom_plans" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const pending = requests.filter((r) => r.status === "pending");
  const history = requests.filter((r) => r.status !== "pending");
  const now = Date.now();
  // Inside its dates only: a plan that has not started yet is scheduled, not active.
  const activePlans = plans.filter((p) => p.status === "active" && new Date(p.valid_from).getTime() <= now && (!p.valid_until || new Date(p.valid_until).getTime() > now));

  const standardPrice = (tier: string | null) => (tier === "premium" ? premiumPrice : proPrice);
  const DoctorCell = ({ d }: { d: DoctorInfo | null }) => (
    <div className="min-w-0">
      <div className="font-medium text-sm truncate">{d?.full_name || "Unknown doctor"}</div>
      <div className="text-xs text-muted-foreground truncate">{d?.clinic_name || "—"} · {d?.plan_tier || "free"} / {d?.plan_status || "—"}</div>
    </div>
  );
  const Changes = ({ add, remove }: { add: string[]; remove: string[] }) => (
    <div className="flex flex-wrap gap-1">
      {add.map((k) => <Badge key={k} variant="outline" className="text-[10px]"><Plus className="h-3 w-3 mr-0.5" />{labelFor(k)}</Badge>)}
      {remove.map((k) => <Badge key={k} variant="outline" className="text-[10px]"><Minus className="h-3 w-3 mr-0.5" />{labelFor(k)}</Badge>)}
    </div>
  );

  const cancelPlan = async () => {
    if (!cancelling) return;
    const { error } = await supabase.rpc("cancel_custom_plan" as any, { _doctor_id: cancelling.doctor_id });
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else toast({ title: "Custom plan ended", description: "Doctor is back on the standard plan." });
    setCancelling(null);
    load();
  };

  // A plan only changes a doctor's price and features while they are on the tier it was built on.
  const doctorTier = (p: PlanRow) => p.profiles?.plan_tier ?? null;
  const isStuck = (p: PlanRow) => !!doctorTier(p) && doctorTier(p) !== p.base_tier;
  const canRebase = (p: PlanRow) => isStuck(p) && (doctorTier(p) === "pro" || doctorTier(p) === "premium") && p.profiles?.plan_status === "active";

  const rebasePlan = async () => {
    if (!rebasing) return;
    const { error } = await supabase.rpc("rebase_custom_plan" as any, { _doctor_id: rebasing.doctor_id });
    if (error) toast({ title: "Could not apply the plan", description: error.message, variant: "destructive" });
    else toast({ title: "Custom plan now applies", description: `Moved to the doctor's ${doctorTier(rebasing)} plan. The price is used from their next payment.` });
    setRebasing(null);
    load();
  };

  if (loading) {
    return <div className="py-16 flex justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  const empty = (text: string) => (
    <Card><CardContent className="py-12 flex flex-col items-center gap-2 text-muted-foreground text-sm"><Inbox className="h-6 w-6" />{text}</CardContent></Card>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading font-bold text-2xl text-primary">Plan Requests</h1>
        <p className="text-sm text-muted-foreground">Doctors ask for features; you decide the final features, price and how long it applies. Approvals take effect immediately.</p>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending">Pending{pending.length ? ` (${pending.length})` : ""}</TabsTrigger>
          <TabsTrigger value="active">Active plans{activePlans.length ? ` (${activePlans.length})` : ""}</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          {pending.length === 0 ? empty("No requests waiting for review.") : (
            <>
              <Card className="hidden md:block"><Table>
                <TableHeader><TableRow><TableHead>Doctor</TableHead><TableHead>Requested changes</TableHead><TableHead>Sent</TableHead><TableHead className="text-right"> </TableHead></TableRow></TableHeader>
                <TableBody>
                  {pending.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell><DoctorCell d={r.profiles} /></TableCell>
                      <TableCell><Changes add={r.add_features} remove={r.remove_features} />{r.doctor_note && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">“{r.doctor_note}”</p>}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmt(r.created_at)}</TableCell>
                      <TableCell className="text-right"><Button size="sm" onClick={() => setReviewing(r)}>Review</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table></Card>
              <div className="md:hidden space-y-2">
                {pending.map((r) => (
                  <Card key={r.id}><CardContent className="p-3 space-y-2">
                    <DoctorCell d={r.profiles} />
                    <Changes add={r.add_features} remove={r.remove_features} />
                    {r.doctor_note && <p className="text-xs text-muted-foreground">“{r.doctor_note}”</p>}
                    <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{fmt(r.created_at)}</span><Button size="sm" onClick={() => setReviewing(r)}>Review</Button></div>
                  </CardContent></Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="active">
          {activePlans.length === 0 ? empty("No active custom plans.") : (
            <>
              <Card className="hidden md:block"><Table>
                <TableHeader><TableRow><TableHead>Doctor</TableHead><TableHead>Changes</TableHead><TableHead>Price</TableHead><TableHead>Valid</TableHead><TableHead className="text-right"> </TableHead></TableRow></TableHeader>
                <TableBody>
                  {activePlans.map((p) => (
                    <TableRow key={p.doctor_id}>
                      <TableCell><DoctorCell d={p.profiles} /></TableCell>
                      <TableCell><Changes add={p.extra_features} remove={p.removed_features} /></TableCell>
                      <TableCell className="text-sm whitespace-nowrap">₹{p.monthly_price}<div className="text-[11px] text-muted-foreground">std ₹{standardPrice(p.base_tier)}</div></TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmt(p.valid_from)} → {p.valid_until ? fmt(p.valid_until) : "no end"}
                        {isStuck(p) && <div className="text-warning font-medium whitespace-normal max-w-[220px]">Not applied: built on {p.base_tier}, doctor is on {doctorTier(p)}. The doctor still pays the standard price.</div>}</TableCell>
                      <TableCell className="text-right space-x-1 whitespace-nowrap">
                        {canManage && canRebase(p) && <Button size="sm" onClick={() => setRebasing(p)}>Apply to {doctorTier(p)}</Button>}
                        {canManage && <><Button size="sm" variant="outline" onClick={() => setEditingPlan(p)}>Edit</Button>
                        <Button size="sm" variant="outline" className="text-destructive" onClick={() => setCancelling(p)}>End</Button></>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table></Card>
              <div className="md:hidden space-y-2">
                {activePlans.map((p) => (
                  <Card key={p.doctor_id}><CardContent className="p-3 space-y-2">
                    <DoctorCell d={p.profiles} />
                    <Changes add={p.extra_features} remove={p.removed_features} />
                    <div className="text-xs text-muted-foreground">₹{p.monthly_price}/month · {fmt(p.valid_from)} → {p.valid_until ? fmt(p.valid_until) : "no end"}</div>
                    {isStuck(p) && <div className="text-xs text-warning font-medium">Not applied: built on {p.base_tier}, doctor is on {doctorTier(p)}.</div>}
                    {canManage && <div className="flex gap-2 justify-end">{canRebase(p) && <Button size="sm" onClick={() => setRebasing(p)}>Apply to {doctorTier(p)}</Button>}<Button size="sm" variant="outline" onClick={() => setEditingPlan(p)}>Edit</Button><Button size="sm" variant="outline" className="text-destructive" onClick={() => setCancelling(p)}>End</Button></div>}
                  </CardContent></Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="history">
          {history.length === 0 ? empty("No decided requests yet.") : (
            <>
              <Card className="hidden md:block"><Table>
                <TableHeader><TableRow><TableHead>Doctor</TableHead><TableHead>Requested</TableHead><TableHead>Outcome</TableHead><TableHead>Decided</TableHead></TableRow></TableHeader>
                <TableBody>
                  {history.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell><DoctorCell d={r.profiles} /></TableCell>
                      <TableCell><Changes add={r.add_features} remove={r.remove_features} /></TableCell>
                      <TableCell className="text-xs space-y-1">{statusBadge(r.status)}
                        {r.status === "approved" && <div className="text-muted-foreground">₹{r.approved_price} · until {r.valid_until ? fmt(r.valid_until) : "no end"}</div>}
                        {r.reviewer_note && <div className="text-muted-foreground">“{r.reviewer_note}”</div>}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmt(r.decided_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table></Card>
              <div className="md:hidden space-y-2">
                {history.map((r) => (
                  <Card key={r.id}><CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2"><DoctorCell d={r.profiles} />{statusBadge(r.status)}</div>
                    <Changes add={r.add_features} remove={r.remove_features} />
                    {r.reviewer_note && <p className="text-xs text-muted-foreground">“{r.reviewer_note}”</p>}
                    <div className="text-xs text-muted-foreground">{fmt(r.decided_at)}</div>
                  </CardContent></Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {reviewing && (
        <ReviewDialog
          request={reviewing}
          features={features.filter((f) => f.is_active && f.is_requestable)}
          standardPrice={standardPrice(reviewing.profiles?.plan_tier ?? null)}
          canManage={canManage}
          onClose={() => setReviewing(null)}
          onDone={() => { setReviewing(null); load(); }}
        />
      )}
      {editingPlan && (
        <EditTermsDialog plan={editingPlan} onClose={() => setEditingPlan(null)} onDone={() => { setEditingPlan(null); load(); }} />
      )}
      <AlertDialog open={!!rebasing} onOpenChange={(o) => !o && setRebasing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply this custom plan to the doctor's current plan?</AlertDialogTitle>
            <AlertDialogDescription>
              It was built on the {rebasing?.base_tier} plan, but {rebasing?.profiles?.full_name || "the doctor"} is now on {rebasing ? doctorTier(rebasing) : ""}.
              The approved features, the price (₹{rebasing?.monthly_price}/month) and the dates stay the same; they will apply to the {rebasing ? doctorTier(rebasing) : ""} plan,
              and the doctor is notified. Check the price still makes sense for that plan first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <AlertDialogAction onClick={rebasePlan}>Apply</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this custom plan?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelling?.profiles?.full_name || "The doctor"} returns to the standard plan for their tier immediately, and the doctor is notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={cancelPlan} className="bg-destructive hover:bg-destructive/90 text-white">End plan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const ReviewDialog = ({
  request, features, standardPrice, canManage, onClose, onDone,
}: {
  request: RequestRow;
  features: FeatureRow[];
  standardPrice: number;
  canManage: boolean;
  onClose: () => void;
  onDone: () => void;
}) => {
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [current, setCurrent] = useState<Set<string>>(new Set());
  const [price, setPrice] = useState(String(standardPrice));
  const [from, setFrom] = useState("");
  // Blank on purpose: pre-filling the doctor's paid-until date would end the custom price on the
  // very day they need to renew, so it would never be charged.
  const [until, setUntil] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const paidUntil = request.profiles?.plan_end ?? null;
  const endsBeforeRenewal = !!until && !!paidUntil && new Date(istEnd(until)).getTime() <= new Date(paidUntil).getTime() + 86400000;
  // Only judge the tier when the doctor row actually loaded.
  const unsupportedTier = !!request.profiles && !["pro", "premium"].includes(request.profiles.plan_tier ?? "");

  useEffect(() => {
    supabase.rpc("get_doctor_feature_access", { _doctor_id: request.doctor_id }).then(({ data }) => {
      const cur = new Set(((data as AccessRow[]) ?? []).filter((r) => r.effective_enabled).map((r) => r.feature_key));
      setCurrent(cur);
      // Start from exactly what the doctor asked for.
      const start = new Set(cur);
      request.add_features.forEach((k) => start.add(k));
      request.remove_features.forEach((k) => start.delete(k));
      setSelected(start);
    });
  }, [request]);

  const toggle = (key: string, on: boolean) =>
    setSelected((s) => { const n = new Set(s ?? []); if (on) n.add(key); else n.delete(key); return n; });

  const decide = async (decision: "approve" | "reject") => {
    if (decision === "reject" && !note.trim()) {
      return toast({ title: "Add a reason", description: "The doctor sees this reason.", variant: "destructive" });
    }
    const priceNum = Number(price);
    if (decision === "approve") {
      if (price === "" || !Number.isFinite(priceNum) || priceNum < 0) {
        return toast({ title: "Enter a valid price", description: "Price must be zero or more.", variant: "destructive" });
      }
      if (until && istEnd(until) <= new Date().toISOString()) {
        return toast({ title: "End date must be in the future", variant: "destructive" });
      }
      if (from && until && until < from) {
        return toast({ title: "End date is before the start date", variant: "destructive" });
      }
    }
    setBusy(true);
    const { error } = await supabase.rpc("review_plan_request" as any, {
      _request_id: request.id,
      _decision: decision,
      _approved_features: decision === "approve" ? Array.from(selected ?? []) : null,
      _price: decision === "approve" ? priceNum : null,
      _valid_from: decision === "approve" && from && from > today() ? istStart(from) : null,
      _valid_until: decision === "approve" && until ? istEnd(until) : null,
      _note: note.trim() || null,
    });
    setBusy(false);
    if (error) {
      toast({ title: "Could not save decision", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: decision === "approve" ? "Approved — live for the doctor now" : "Request rejected" });
    onDone();
  };

  const d = request.profiles;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review request — {d?.full_name || "Doctor"}</DialogTitle>
          <DialogDescription>
            {d?.plan_tier || "free"} plan · {d?.plan_status}{d?.plan_end ? ` · paid until ${fmt(d.plan_end)}` : ""}. Standard price ₹{standardPrice}/month.
          </DialogDescription>
        </DialogHeader>

        {request.doctor_note && <p className="text-sm rounded-lg bg-secondary p-3">“{request.doctor_note}”</p>}
        {d?.plan_status === "trial" && (
          <p className="text-xs text-destructive">This doctor is still on a trial. Custom plans need a paid plan, so approval will be refused.</p>
        )}

        <div className="space-y-2">
          <Label className="text-xs uppercase text-muted-foreground">Final features (edit before approving)</Label>
          {features.map((f) => {
            const on = selected?.has(f.key) ?? false;
            const wasOn = current.has(f.key);
            const asked = request.add_features.includes(f.key) ? "add" : request.remove_features.includes(f.key) ? "remove" : null;
            return (
              <div key={f.key} className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5">
                <div className="min-w-0 text-sm">
                  <span className="font-medium">{f.label}</span>
                  <span className="ml-2 text-[11px] text-muted-foreground">
                    {asked === "add" ? "requested: add" : asked === "remove" ? "requested: remove" : wasOn ? "currently on" : "currently off"}
                  </span>
                </div>
                <Switch checked={on} disabled={!selected || !canManage} onCheckedChange={(v) => toggle(f.key, v)} aria-label={f.label} />
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label htmlFor="pr-price" className="text-xs">Monthly price (₹)</Label>
            <Input id="pr-price" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pr-from" className="text-xs">Starts (blank = now)</Label>
            <Input id="pr-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pr-until" className="text-xs">Ends (blank = no end)</Label>
            <Input id="pr-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground -mt-1 space-y-1">
          <p>
            Features change for the doctor the moment you approve. The price is used from their next payment; nothing is charged now.
            {Number(price) < standardPrice && price !== "" ? " This is below the standard price." : ""}
          </p>
          <p>
            <strong>Starts</strong> is when the custom price and features begin (leave blank to start now; a future date schedules it).{" "}
            <strong>Ends</strong> is the last day they apply: payments made after it use the standard price and the doctor goes back to the standard plan.
            This is separate from the doctor's <em>paid until</em> date{request.profiles?.plan_end ? ` (${fmt(request.profiles.plan_end)})` : ""}, which is how long they have already paid for.
          </p>
        </div>
        {endsBeforeRenewal && (
          <p role="alert" className="text-[11px] text-amber-700 bg-amber-500/10 rounded-md px-2 py-1.5">
            This ends on or within a day of the doctor's paid-until date ({fmt(request.profiles?.plan_end ?? null)}). They renew on or after that date,
            so the custom price would not be in force then and they would be charged the standard price. Set the end after their next renewal
            (for example a month past that date), or leave it blank.
          </p>
        )}
        {unsupportedTier && (
          <p role="alert" className="text-[11px] text-destructive bg-destructive/10 rounded-md px-2 py-1.5">
            This doctor is on the {request.profiles?.plan_tier || "free"} tier. A custom plan is priced against Pro or Premium, so change their plan first.
          </p>
        )}

        <Textarea placeholder="Note to the doctor (required when rejecting)" value={note} onChange={(e) => setNote(e.target.value)} className="text-sm" />

        <div className="flex gap-2 justify-end">
          <Button variant="outline" disabled={busy || !canManage} className="text-destructive" onClick={() => decide("reject")}>Reject</Button>
          <Button disabled={busy || !canManage || !selected || unsupportedTier} onClick={() => decide("approve")} className="bg-royal hover:bg-royal/90">
            {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Approve
          </Button>
        </div>
        {!canManage && <p className="text-xs text-muted-foreground text-right">You have view-only access to this module.</p>}
      </DialogContent>
    </Dialog>
  );
};

const EditTermsDialog = ({ plan, onClose, onDone }: { plan: PlanRow; onClose: () => void; onDone: () => void }) => {
  const [price, setPrice] = useState(String(plan.monthly_price));
  const [until, setUntil] = useState(plan.valid_until ? istDate(plan.valid_until) : "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const priceNum = Number(price);
    if (price === "" || !Number.isFinite(priceNum) || priceNum < 0) {
      return toast({ title: "Enter a valid price", variant: "destructive" });
    }
    setBusy(true);
    const { error } = await supabase.rpc("update_custom_plan_terms" as any, {
      _doctor_id: plan.doctor_id, _price: priceNum, _valid_until: until ? istEnd(until) : null,
    });
    setBusy(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Plan terms updated" });
    onDone();
  };

  const name = useMemo(() => plan.profiles?.full_name || "doctor", [plan]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Edit terms — {name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label className="text-xs">Monthly price (₹)</Label><Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Ends (blank = no end)</Label><Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></div>
          <Button onClick={save} disabled={busy} className="w-full">{busy ? "Saving…" : "Save"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SAPlanRequests;
