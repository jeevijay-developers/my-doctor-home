import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { AmountInput } from "@/components/ui/amount-input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { logAdminAction } from "@/lib/adminAudit";
import { ArrowLeft, Ban, RotateCcw, CalendarPlus, Percent } from "lucide-react";
import SAFeatureAccess from "./SAFeatureAccess";

const TIER_LABELS: Record<string, string> = { free: "Free", pro: "Pro", premium: "Premium" };

const SADoctorDetail = () => {
  const { id } = useParams();
  const [p, setP] = useState<any>(null);
  const [stats, setStats] = useState({ appts: 0, patients: 0, revenue: 0, last: null as string | null });
  const [newTrialEnd, setNewTrialEnd] = useState("");
  const [pendingTier, setPendingTier] = useState<string | null>(null);
  const [commissionInput, setCommissionInput] = useState<string>("");
  const [defaultCommission, setDefaultCommission] = useState<number>(10);
  const [savingCommission, setSavingCommission] = useState(false);

  const load = async () => {
    if (!id) return;
    const [{ data: prof }, { count: appts }, { count: patients }, { data: inv }, { data: lastAppt }, { data: defaultCommRow }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
      supabase.from("appointments").select("*", { count: "exact", head: true }).eq("doctor_id", id),
      supabase.from("patients").select("*", { count: "exact", head: true }).eq("doctor_id", id)
        .or("auto_created.eq.false,total_visits.gt.0"),
      supabase.from("invoices").select("total_amount").eq("doctor_id", id),
      supabase.from("appointments").select("created_at").eq("doctor_id", id).order("created_at", { ascending: false }).limit(1),
      supabase.from("platform_settings").select("value").eq("key", "default_commission_percent").maybeSingle(),
    ]);
    setP(prof);
    setCommissionInput(prof?.commission_percent != null ? String(prof.commission_percent) : "");
    if (defaultCommRow?.value != null && Number.isFinite(Number(defaultCommRow.value))) {
      setDefaultCommission(Number(defaultCommRow.value));
    }
    setStats({
      appts: appts ?? 0,
      patients: patients ?? 0,
      revenue: (inv ?? []).reduce((s, r: any) => s + Number(r.total_amount || 0), 0),
      last: lastAppt?.[0]?.created_at ?? null,
    });
  };

  useEffect(() => { load(); }, [id]);

  // Lifting a suspension must put the doctor back where they were, not
  // blindly on "active": a suspended trial doctor returns to their trial, and
  // someone whose paid period ran out meanwhile returns to "expired".
  const statusAfterReactivation = (): "trial" | "active" | "expired" => {
    const now = Date.now();
    if (p.plan_tier === "free" && p.trial_end && new Date(p.trial_end).getTime() > now) return "trial";
    if (p.plan_tier !== "free" && (!p.plan_end || new Date(p.plan_end).getTime() > now)) return "active";
    return "expired";
  };

  const suspend = async () => {
    const next = p.plan_status === "cancelled" ? statusAfterReactivation() : "cancelled";
    const { error } = await supabase.from("profiles").update({ plan_status: next }).eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    await logAdminAction(next === "cancelled" ? "suspend_doctor" : "reactivate_doctor", "profiles", id, { from: p.plan_status, to: next });
    toast({
      title: next === "cancelled" ? "Doctor suspended" : "Doctor reactivated",
      description: next === "expired" ? "Their plan had already run out, so the account is back as expired." : undefined,
    });
    load();
  };

  const changeTier = async (tier: string) => {
    const wasTrial = p.plan_status === "trial";
    // Changing the tier of a suspended account must not lift the suspension.
    const keepSuspended = p.plan_status === "cancelled";
    const { error } = await supabase
      .from("profiles")
      .update({ plan_tier: tier, ...(keepSuspended ? {} : { plan_status: "active", trial_end: null }) })
      .eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    await logAdminAction("change_plan_tier", "profiles", id, { from: p.plan_tier, to: tier, ended_trial: wasTrial });
    toast({
      title: "Plan tier updated",
      description: keepSuspended ? "The account is still suspended." : wasTrial ? "Trial ended — new tier applied immediately." : undefined,
    });
    load();
  };

  // A trial can only be extended for someone who is not on a paid plan, and
  // never in the past. A suspended account stays suspended.
  const canExtendTrial = p?.plan_status !== "active";
  const extendTrial = async () => {
    if (!newTrialEnd || !canExtendTrial) return;
    const newEnd = new Date(`${newTrialEnd}T23:59:59+05:30`);
    if (newEnd.getTime() <= Date.now()) {
      return toast({ title: "Pick a future date", variant: "destructive" });
    }
    const patch: Record<string, string> = { trial_end: newEnd.toISOString() };
    if (p.plan_status !== "cancelled") patch.plan_status = "trial";
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    await logAdminAction("extend_trial", "profiles", id, { new_trial_end: patch.trial_end });
    toast({ title: "Trial extended", description: p.plan_status === "cancelled" ? "The account is still suspended." : undefined });
    setNewTrialEnd("");
    load();
  };

  const updateCommissionOverride = async (nextVal: number | null) => {
    if (!id) return;
    if (nextVal !== null && (!Number.isFinite(nextVal) || nextVal < 0 || nextVal > 100)) {
      toast({
        title: "Invalid percentage",
        description: "Platform charge override must be between 0% and 100%.",
        variant: "destructive",
      });
      return;
    }
    setSavingCommission(true);
    const { error } = await supabase
      .from("profiles")
      .update({ commission_percent: nextVal } as any)
      .eq("id", id);
    setSavingCommission(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    await logAdminAction("update_doctor_commission", "profiles", id, {
      from: p.commission_percent,
      to: nextVal,
    });
    toast({
      title: nextVal === null ? "Reverted to platform default" : "Doctor commission override saved",
      description:
        nextVal === null
          ? `Using platform default (${defaultCommission}%).`
          : `Custom platform charge set to ${nextVal}% for this doctor.`,
    });
    load();
  };

  if (!p) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <Link to="/superadmin/doctors" className="inline-flex items-center gap-1 text-sm text-royal hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to doctors
      </Link>

      <Card>
        <CardContent className="p-6 flex flex-col md:flex-row gap-6 items-start">
          {p.profile_photo_url ? (
            <img src={p.profile_photo_url} className="w-20 h-20 rounded-full object-cover border" alt={p.full_name || "Doctor"} loading="lazy" decoding="async" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-royal/10 flex items-center justify-center text-2xl font-bold text-royal">
              {p.full_name?.[0] ?? "D"}
            </div>
          )}
          <div className="flex-1">
            <h1 className="font-heading font-bold text-2xl text-primary">{p.full_name}</h1>
            <p className="text-muted-foreground">{p.specialization} · {p.clinic_name}</p>
            <p className="text-xs text-muted-foreground">
              {p.city}
              {p.phone && (
                <>
                  {" · "}
                  <a href={`tel:${p.phone}`} className="text-royal hover:underline">{p.phone}</a>
                </>
              )}
            </p>
            <div className="flex gap-2 mt-2">
              <Badge variant="outline">{p.plan_status}</Badge>
              <Badge>{p.plan_tier || "free"}</Badge>
              {p.slug && <a className="text-xs text-royal hover:underline" href={`/dr/${p.slug}`} target="_blank" rel="noreferrer">/dr/{p.slug}</a>}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Appointments</div><div className="text-xl font-bold">{stats.appts}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Patients</div><div className="text-xl font-bold">{stats.patients}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Revenue processed</div><div className="text-xl font-bold">₹{stats.revenue.toLocaleString("en-IN")}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Last activity</div><div className="text-sm font-medium">{stats.last ? new Date(stats.last).toLocaleDateString() : "—"}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Admin actions</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <div className="text-xs font-medium mb-2">Status</div>
            <Button onClick={suspend} variant={p.plan_status === "cancelled" ? "default" : "destructive"} size="sm" className="w-full">
              {p.plan_status === "cancelled" ? <><RotateCcw className="h-4 w-4 mr-2" />Reactivate</> : <><Ban className="h-4 w-4 mr-2" />Suspend</>}
            </Button>
          </div>
          <div>
            <div className="text-xs font-medium mb-2">Plan tier</div>
            <Select value={p.plan_tier || "free"} onValueChange={setPendingTier}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-xs font-medium mb-2">Extend trial (current: {p.trial_end ? new Date(p.trial_end).toLocaleDateString() : "—"})</div>
            <div className="flex gap-2">
              <Input type="date" value={newTrialEnd} onChange={(e) => setNewTrialEnd(e.target.value)} className="h-9" />
              <Button onClick={extendTrial} size="sm" disabled={!newTrialEnd || !canExtendTrial}><CalendarPlus className="h-4 w-4" /></Button>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium mb-2 flex items-center gap-1">
              <Percent className="h-3.5 w-3.5 text-royal" />
              Platform Charge Override (%)
            </div>
            <div className="flex gap-2">
              <AmountInput
                placeholder={`Default (${defaultCommission}%)`}
                value={commissionInput}
                onChange={(e) => setCommissionInput(e.target.value)}
                maxLength={6}
                className="h-9"
              />
              <Button
                size="sm"
                disabled={savingCommission || commissionInput.trim() === ""}
                onClick={() => updateCommissionOverride(Math.round(Number(commissionInput) * 100) / 100)}
              >
                Save
              </Button>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {p.commission_percent != null
                  ? `Custom override: ${p.commission_percent}%`
                  : `Using platform default (${defaultCommission}%)`}
              </span>
              {p.commission_percent != null && (
                <button
                  type="button"
                  disabled={savingCommission}
                  onClick={() => updateCommissionOverride(null)}
                  className="text-royal hover:underline font-medium"
                >
                  Use Platform Default
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <SAFeatureAccess doctorId={id!} />

      <AlertDialog open={pendingTier !== null} onOpenChange={(open) => !open && setPendingTier(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change plan tier to {pendingTier ? TIER_LABELS[pendingTier] : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              {p.plan_status === "trial"
                ? `This doctor is currently on a trial. Changing their plan tier will end the trial immediately and apply ${pendingTier ? TIER_LABELS[pendingTier] : "the new"} tier's features right away.`
                : `This will apply the ${pendingTier ? TIER_LABELS[pendingTier] : "new"} tier's features immediately.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pendingTier) changeTier(pendingTier); setPendingTier(null); }}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SADoctorDetail;
