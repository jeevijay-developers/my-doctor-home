import { useMemo, useState } from "react";
import { format } from "date-fns";
import { formatIstDate } from "@/lib/istDate";
import { planTierName } from "@/lib/planSummary";
import { SlidersHorizontal, Clock, CheckCircle2, XCircle, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useCustomPlan } from "@/hooks/useCustomPlan";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { customPlanApplication, diffFeatureSelection, type PlanRequest } from "@/lib/customPlan";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const REJECTION_BANNER_DAYS = 7;

const CustomPlanSection = () => {
  const { profile } = useProfile();
  const { customPlan, pendingRequest, latestDecided, refetch } = useCustomPlan();
  const { rows } = useFeatureAccess();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const requestable = useMemo(() => rows.filter((r) => r.is_requestable !== false), [rows]);
  const labelFor = (key: string) => rows.find((r) => r.feature_key === key)?.label ?? key;

  const planStatus = profile?.plan_status || "trial";
  const currentTier = profile?.plan_tier || "free";
  const canRequest = planStatus === "active" && !pendingRequest && (currentTier === "pro" || currentTier === "premium");
  const application = customPlanApplication(customPlan, currentTier);
  const tierName = planTierName;

  const withdraw = async (req: PlanRequest) => {
    setBusy(true);
    const { error } = await supabase.rpc("withdraw_plan_request" as any, { _request_id: req.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Request withdrawn");
    refetch();
  };

  const cancelPlan = async () => {
    if (!profile?.id) return;
    setBusy(true);
    const { error } = await supabase.rpc("cancel_custom_plan" as any, { _doctor_id: profile.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("You're back on the standard plan");
    refetch();
  };

  const showRejection =
    !pendingRequest &&
    latestDecided?.status === "rejected" &&
    latestDecided.decided_at &&
    Date.now() - new Date(latestDecided.decided_at).getTime() < REJECTION_BANNER_DAYS * 86400000;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-border p-4">
        <div className="min-w-0">
          <h4 className="font-heading font-bold text-foreground flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-royal" /> Customize my plan
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {planStatus === "trial" || currentTier === "free"
              ? "Available once you're on the Pro or Premium plan."
              : "Ask for features to be added or removed. Our team reviews every request and sets the price."}
          </p>
        </div>
        <Button
          size="sm"
          className="bg-royal hover:bg-royal/90"
          disabled={!canRequest || rows.length === 0}
          onClick={() => setDialogOpen(true)}
        >
          {pendingRequest ? "Request under review" : "Customize plan"}
        </Button>
      </div>

      {customPlan && application === "tier_mismatch" && (
        <div role="status" className="rounded-xl border border-warning/50 bg-warning/10 p-4 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-warning" aria-hidden="true" />
              <span className="font-semibold text-sm text-foreground">Custom plan not applied</span>
              <Badge variant="outline" className="text-[10px]">₹{customPlan.monthly_price}/month</Badge>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={busy} className="text-xs h-8">Remove</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove this custom plan?</AlertDialogTitle>
                  <AlertDialogDescription>
                    It is not changing your price or features right now. You can send a new request any time.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction onClick={cancelPlan}>Remove</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <p className="text-xs text-muted-foreground">
            This custom plan was set up for the <strong>{tierName(customPlan.base_tier)}</strong> plan, but you are on the{" "}
            <strong>{tierName(currentTier)}</strong> plan, so its price and feature changes do not apply to you. You still pay
            the standard {tierName(currentTier)} price. Contact support to move it to your current plan.
          </p>
        </div>
      )}

      {customPlan && application === "applies" && (
        <div className="rounded-xl border border-success/40 bg-success/5 p-4 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
              <span className="font-semibold text-sm text-foreground">Custom plan active</span>
              <Badge variant="outline" className="text-[10px]">₹{customPlan.monthly_price}/month from your next payment</Badge>
              <Badge variant="outline" className="text-[10px]">{tierName(customPlan.base_tier)} plan</Badge>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={busy} className="text-xs h-8">Switch to standard plan</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Go back to the standard plan?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Your custom features and price end immediately. You'll have exactly what your {customPlan.base_tier} plan includes. You can send a new request any time.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep custom plan</AlertDialogCancel>
                  <AlertDialogAction onClick={cancelPlan}>Switch back</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <p className="text-xs text-muted-foreground">
            {`Active from ${formatIstDate(customPlan.valid_from)} `}
            {customPlan.valid_until
              ? `until ${formatIstDate(customPlan.valid_until)}. Payments made after that date use the standard price.`
              : "with no end date."}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {customPlan.extra_features.map((k) => (
              <Badge key={k} className="bg-success/15 text-success border-0 hover:bg-success/15 text-[11px]"><Plus className="h-3 w-3 mr-0.5" />{labelFor(k)}</Badge>
            ))}
            {customPlan.removed_features.map((k) => (
              <Badge key={k} className="bg-muted text-muted-foreground border-0 hover:bg-muted text-[11px]"><Minus className="h-3 w-3 mr-0.5" />{labelFor(k)}</Badge>
            ))}
          </div>
        </div>
      )}

      {pendingRequest && (
        <div className="rounded-xl border border-royal/30 bg-royal/5 p-4 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-royal" />
              <span className="font-semibold text-sm text-foreground">Request under review</span>
              <span className="text-xs text-muted-foreground">sent {format(new Date(pendingRequest.created_at), "MMM d")}</span>
            </div>
            <Button variant="outline" size="sm" className="text-xs h-8" disabled={busy} onClick={() => withdraw(pendingRequest)}>Withdraw</Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {pendingRequest.add_features.map((k) => (
              <Badge key={k} variant="outline" className="text-[11px]"><Plus className="h-3 w-3 mr-0.5" />{labelFor(k)}</Badge>
            ))}
            {pendingRequest.remove_features.map((k) => (
              <Badge key={k} variant="outline" className="text-[11px]"><Minus className="h-3 w-3 mr-0.5" />{labelFor(k)}</Badge>
            ))}
          </div>
        </div>
      )}

      {showRejection && latestDecided && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex gap-2">
          <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-foreground">Your last request wasn't approved</p>
            {latestDecided.reviewer_note && <p className="text-xs text-muted-foreground mt-0.5">{latestDecided.reviewer_note}</p>}
          </div>
        </div>
      )}

      <CustomizePlanDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        features={requestable.map((r) => ({ key: r.feature_key, label: r.label, description: r.description, enabled: r.effective_enabled }))}
        onSubmitted={refetch}
      />
    </div>
  );
};

type DialogFeature = { key: string; label: string; description: string; enabled: boolean };

export const CustomizePlanDialog = ({
  open, onOpenChange, features, onSubmitted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  features: DialogFeature[];
  onSubmitted: () => void;
}) => {
  const [desired, setDesired] = useState<Record<string, boolean> | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Seed from the current state each time the dialog opens.
  const state = desired ?? Object.fromEntries(features.map((f) => [f.key, f.enabled]));
  const current = new Set(features.filter((f) => f.enabled).map((f) => f.key));
  const wanted = new Set(Object.entries(state).filter(([, v]) => v).map(([k]) => k));
  const { add, remove } = diffFeatureSelection(current, wanted, features.map((f) => f.key));
  const unchanged = add.length + remove.length === 0;

  const close = (o: boolean) => {
    if (!o) { setDesired(null); setNote(""); }
    onOpenChange(o);
  };

  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("submit_plan_request" as any, { _add: add, _remove: remove, _note: note.trim() || null });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Request sent. We'll notify you once it's reviewed.");
    close(false);
    onSubmitted();
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Customize my plan</DialogTitle>
          <DialogDescription>
            Switch features on or off, then send it for review. Our team will set the price and how long it applies.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {features.map((f) => {
            const on = state[f.key] ?? false;
            const change = on === f.enabled ? null : on ? "add" : "remove";
            return (
              <div key={f.key} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{f.label}</span>
                    {change === "add" && <Badge className="text-[10px] bg-success/15 text-success border-0 hover:bg-success/15">Adding</Badge>}
                    {change === "remove" && <Badge className="text-[10px] bg-muted text-muted-foreground border-0 hover:bg-muted">Removing</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>
                </div>
                <Switch
                  checked={on}
                  onCheckedChange={(v) => setDesired({ ...state, [f.key]: v })}
                  aria-label={f.label}
                />
              </div>
            );
          })}
        </div>
        {remove.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Removing a feature hides it but never deletes your data. Anything you've already created stays safe.
          </p>
        )}
        <Textarea
          placeholder="Anything we should know? (optional)"
          value={note}
          maxLength={1000}
          onChange={(e) => setNote(e.target.value)}
          className="text-sm"
        />
        <Button onClick={submit} disabled={busy || unchanged} className="w-full bg-royal hover:bg-royal/90">
          {busy ? "Sending…" : unchanged ? "Change at least one feature" : "Send request"}
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default CustomPlanSection;
