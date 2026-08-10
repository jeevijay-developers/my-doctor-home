import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { usePlanAccess } from "@/hooks/usePlanAccess";
import { toast } from "@/hooks/use-toast";
import { TIER_LABELS, hasNoActivePlan, getTierFeatures, DEFAULT_APPOINTMENT_CAP } from "@/lib/planFeatures";

const RequestUpgradeDialog = ({
  targetTier,
  trigger,
}: {
  targetTier: "pro" | "premium";
  trigger: React.ReactNode;
}) => {
  const { profile } = useProfile();
  const { appointmentsCap } = usePlanAccess();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const fromTier = profile?.plan_tier || "free";
  const fromStatus = profile?.plan_status || "trial";
  const noActivePlan = hasNoActivePlan(fromStatus);
  const toLabel = TIER_LABELS[targetTier];
  const subject = noActivePlan
    ? `Reactivation request: ${fromStatus} → ${toLabel}`
    : `Upgrade request: ${TIER_LABELS[fromTier]} → ${toLabel}`;
  const features = getTierFeatures(targetTier, appointmentsCap || DEFAULT_APPOINTMENT_CAP);

  const submit = async () => {
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }
    const { error } = await supabase.from("support_tickets").insert({
      doctor_id: user.id,
      subject,
      description: message,
      priority: "normal",
      metadata: { upgrade_request: { from_tier: fromTier, from_status: fromStatus, to_tier: targetTier } },
    } as any);
    setBusy(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Request sent", description: "Our team will reach out to arrange payment." });
    setMessage("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{noActivePlan ? `Reactivate on ${toLabel}` : `Request Upgrade to ${toLabel}`}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Nothing is billed automatically — a team member will reach out to arrange payment and
            switch your plan.
          </p>
          <div>
            <p className="text-xs font-medium mb-1.5">{toLabel} includes:</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {features.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-royal" />{f}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-1.5">
            <Label>Anything else we should know? (optional)</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
          </div>
          <Button onClick={submit} disabled={busy} className="w-full">
            {busy ? "Sending…" : "Send Request"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RequestUpgradeDialog;
