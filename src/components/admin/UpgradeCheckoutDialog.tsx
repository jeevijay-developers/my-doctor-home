import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { usePlanAccess } from "@/hooks/usePlanAccess";
import { usePaymentMode } from "@/hooks/usePaymentMode";
import { toast } from "sonner";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import { loadRazorpayCheckout } from "@/lib/razorpayCheckout";
import { TIER_LABELS, TIER_PRICES, hasNoActivePlan, getTierFeatures, getDoctorTierPrice, DEFAULT_APPOINTMENT_CAP } from "@/lib/planFeatures";
import MockCheckoutModal from "@/components/doctor/MockCheckoutModal";
import TestModeBadge from "@/components/shared/TestModeBadge";
import { formatDistanceToNow, parseISO } from "date-fns";

type Order = { order_id: string; key_id: string; amount: number; currency: string; payment_id: string; mode: "mock" | "live" };
type CheckoutResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };

const UpgradeCheckoutDialog = ({
  targetTier,
  trigger,
}: {
  targetTier: "pro" | "premium";
  trigger: React.ReactNode;
}) => {
  const { profile } = useProfile();
  const { appointmentsCap } = usePlanAccess();
  const { isMock } = usePaymentMode();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [mockOpen, setMockOpen] = useState(false);

  const fromStatus = profile?.plan_status || "trial";
  const noActivePlan = hasNoActivePlan(fromStatus);
  const toLabel = TIER_LABELS[targetTier];
  const features = getTierFeatures(targetTier, appointmentsCap || DEFAULT_APPOINTMENT_CAP);
  const price = getDoctorTierPrice(targetTier, profile);

  // Check if plan will be scheduled or activated immediately
  const planEnd = profile?.plan_end ? parseISO(profile.plan_end) : null;
  const willBeScheduled = fromStatus === "active" && planEnd;
  const schedulingMessage = willBeScheduled 
    ? `Plan will activate in ${formatDistanceToNow(planEnd)} when your current plan expires.`
    : "Your plan updates immediately after payment.";

  const handleResult = async (o: Order, response: CheckoutResponse) => {
    const { data, error } = await supabase.functions.invoke("verify-plan-upgrade-payment", {
      body: {
        payment_id: o.payment_id,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      },
    });
    if (error || !data?.ok) {
      const message = await edgeFunctionErrorMessage(error, "Payment verification failed. Please contact support with your payment ID.");
      toast.error(message);
      setMockOpen(false);
      setBusy(false);
      return;
    }
    
    if (data?.scheduled) {
      const activationDate = data?.activation_date ? new Date(data.activation_date) : new Date();
      toast.success(`Your ${toLabel} plan is scheduled to activate on ${activationDate.toLocaleDateString()} when your current plan expires.`);
    } else {
      toast.success(`You're now on ${toLabel}!`);
    }
    
    setMockOpen(false);
    setOrder(null);
    setOpen(false);
    // useProfile() has no shared state across components — each caller
    // fetches its own independent copy, so refetching this dialog's own
    // profile wouldn't unlock the page it's rendered on top of (that page
    // has its own separate useProfile()/usePlanAccess() instances). A full
    // reload is this codebase's existing pattern for reflecting a plan-tier
    // change (see e2e/plan-gating.spec.ts's downgrade test, which reloads
    // rather than expecting live propagation). Brief delay so the success
    // toast is visible before the reload.
    setTimeout(() => window.location.reload(), willBeScheduled ? 2000 : 900);
  };

  const handleFailed = (message: string) => {
    toast.error(message);
    setMockOpen(false);
    setBusy(false);
  };

  const handleDismiss = () => {
    setMockOpen(false);
    setBusy(false);
  };

  const startCheckout = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("create-plan-upgrade-order", {
      body: { target_tier: targetTier },
    });
    if (error || !data?.order_id) {
      const message = await edgeFunctionErrorMessage(error, "Couldn't start checkout. Please try again shortly.");
      toast.error(message);
      setBusy(false);
      return;
    }
    const o: Order = data;
    setOrder(o);

    if (o.mode === "mock") {
      setMockOpen(true);
      return;
    }

    try {
      await loadRazorpayCheckout();
    } catch {
      toast.error("Couldn't load the payment gateway. Please try again.");
      setBusy(false);
      return;
    }

    const rzp = new (window as any).Razorpay({
      key: o.key_id,
      amount: o.amount,
      currency: o.currency,
      order_id: o.order_id,
      name: "Doctylia",
      description: `Upgrade to ${toLabel}`,
      theme: { color: "#1e3a8a" },
      handler: (response: CheckoutResponse) => handleResult(o, response),
      modal: { ondismiss: handleDismiss },
    });
    rzp.on("payment.failed", (resp: { error?: { description?: string } }) => {
      handleFailed(resp?.error?.description || "Your payment could not be completed. Please try again.");
    });
    rzp.open();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {noActivePlan ? `Reactivate on ${toLabel}` : `${willBeScheduled ? "Schedule" : "Upgrade to"} ${toLabel}`}
            {isMock && <TestModeBadge />}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Pay ₹{price}/month to {noActivePlan ? "reactivate" : "switch"} to {toLabel} — {schedulingMessage}
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
          <Button onClick={startCheckout} disabled={busy} className="w-full">
            {busy ? "Processing…" : `Pay ₹${price} & ${willBeScheduled ? "Schedule" : "Upgrade"}`}
          </Button>
        </div>

        {order?.mode === "mock" && (
          <MockCheckoutModal
            open={mockOpen}
            paymentId={order.payment_id}
            amount={price}
            doctorName="Doctylia"
            onResult={(response) => handleResult(order, response)}
            onFailed={handleFailed}
            onDismiss={handleDismiss}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UpgradeCheckoutDialog;
