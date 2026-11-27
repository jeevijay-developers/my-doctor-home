import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";
import { usePractitioners } from "@/hooks/usePractitioners";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { usePlanAccess } from "@/hooks/usePlanAccess";
import { usePaymentMode } from "@/hooks/usePaymentMode";
import { toast } from "sonner";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import { loadRazorpayCheckout } from "@/lib/razorpayCheckout";
import { TIER_LABELS, TIER_PRICES, hasNoActivePlan, getTierFeatures, getDoctorTierPrice, DEFAULT_APPOINTMENT_CAP } from "@/lib/planFeatures";
import { usePlanPrices, planPricesToRecord } from "@/hooks/usePlanPrices";
import { applyCustomPlanToBullets } from "@/lib/customPlan";
import { useCustomPlan } from "@/hooks/useCustomPlan";
import MockCheckoutModal from "@/components/doctor/MockCheckoutModal";
import TestModeBadge from "@/components/shared/TestModeBadge";
import { formatDistanceToNow, parseISO } from "date-fns";

type Order = { order_id: string; key_id: string; amount: number; currency: string; payment_id: string; mode: "mock" | "live" };
type CheckoutResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };

const SEATS_GATE_MS = 8000;

const UpgradeCheckoutDialog = ({
  targetTier,
  trigger,
}: {
  targetTier: "pro" | "premium";
  trigger: React.ReactNode;
}) => {
  const { profile } = useProfile();
  const { appointmentsCap, standardCap } = usePlanAccess();
  const { isMock } = usePaymentMode();
  const { proPrice, premiumPrice, loading: pricesLoading } = usePlanPrices();
  const livePrices = planPricesToRecord({ proPrice, premiumPrice });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [mockOpen, setMockOpen] = useState(false);

  // Optional "Extra doctors" row on a Premium renewal: only for a clinic that already runs more
  // than one doctor or holds purchased seats, and only while a seat price is set. Everyone else
  // gets the dialog exactly as it was. The server computes the real amount.
  const { active: activeDoctors, access: doctorAccess, isMulti, loading: practLoading } = usePractitioners();
  const seatPrice = doctorAccess?.seat_price ?? null;
  const purchasedSeats = doctorAccess?.purchased_seats ?? 0;
  const showSeatRow = targetTier === "premium" && seatPrice != null && (activeDoctors.length >= 2 || purchasedSeats > 0);
  const maxExtraSeats = Math.max(0, (doctorAccess?.seat_max ?? 0) - 1);
  const [seatsChoice, setSeatsChoice] = useState<number | null>(null);
  const extraSeats = showSeatRow ? Math.min(seatsChoice ?? purchasedSeats, maxExtraSeats) : 0;

  // A multi-doctor clinic must not renew before we know its seats, or the renewal silently drops
  // them. Single-doctor clinics are never gated. A hung fetch only blocks Pay for a short while.
  const seatsUnknown = !!isMulti && (!!practLoading || !doctorAccess);
  const [gateTimedOut, setGateTimedOut] = useState(false);
  useEffect(() => {
    if (!seatsUnknown) { setGateTimedOut(false); return; }
    const t = setTimeout(() => setGateTimedOut(true), SEATS_GATE_MS);
    return () => clearTimeout(t);
  }, [seatsUnknown]);
  const seatsGate = seatsUnknown && !gateTimedOut;
  const seatsGateExpired = seatsUnknown && gateTimedOut;

  // Staff without profile access get a stub profile with no plan fields; never
  // guess "trial" for them (that made the dialog promise an instant upgrade).
  const fromStatus = profile?.plan_status ?? null;
  const noActivePlan = fromStatus !== null && hasNoActivePlan(fromStatus);
  // The Razorpay amount comes from the server; this only guards a Pay button
  // showing the default price for a moment before the real one has loaded.
  const verifying = useRef(false);
  const toLabel = TIER_LABELS[targetTier];
  const { customPlan, loading: customPlanLoading } = useCustomPlan();
  // The same card content the Settings page shows, so a custom price is never next to the standard limit.
  const features = applyCustomPlanToBullets(
    getTierFeatures(targetTier, standardCap || appointmentsCap || DEFAULT_APPOINTMENT_CAP),
    customPlan,
    targetTier,
  ).filter((b) => b.kind !== "removed").map((b) => b.text);
  const planPrice = getDoctorTierPrice(targetTier, profile, livePrices, customPlan);
  const price = planPrice + extraSeats * (seatPrice ?? 0);

  // Check if plan will be scheduled or activated immediately
  const planEnd = profile?.plan_end ? parseISO(profile.plan_end) : null;
  // Only a LIVE paid period schedules the new plan for later; an active plan
  // whose end already passed is applied immediately (server rule).
  const willBeScheduled = Boolean(fromStatus === "active" && planEnd && planEnd.getTime() > Date.now());
  const schedulingMessage = willBeScheduled && planEnd
    ? `Plan will activate in ${formatDistanceToNow(planEnd)} when your current plan expires.`
    : fromStatus === null
      ? "Your plan updates after payment."
      : "Your plan updates immediately after payment.";
  const checkoutReady = !pricesLoading && !customPlanLoading && !seatsGate;

  const handleResult = async (o: Order, response: CheckoutResponse) => {
    // Razorpay can deliver the success handler and the modal dismissal close
    // together; only one verification may run, and a dismiss during it must not
    // re-enable Pay (that allowed a second payment while the first was in flight).
    if (verifying.current) return;
    verifying.current = true;
    const { data, error } = await supabase.functions.invoke("verify-plan-upgrade-payment", {
      body: {
        payment_id: o.payment_id,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      },
    });
    verifying.current = false;
    if (error || !data?.ok) {
      const message = await edgeFunctionErrorMessage(error, "Payment verification failed. Please contact support with your payment ID.");
      toast.error(message);
      setMockOpen(false);
      setBusy(false);
      return;
    }
    
    if (data?.seats_clamped) {
      toast.warning("Some seats couldn't be added — the clinic will refund the difference.", { duration: 8000 });
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
    setTimeout(() => window.location.reload(), data?.seats_clamped ? 4000 : willBeScheduled ? 2000 : 900);
  };

  const handleFailed = (message: string) => {
    toast.error(message);
    setMockOpen(false);
    setBusy(false);
  };

  const handleDismiss = () => {
    if (verifying.current) return;
    setMockOpen(false);
    setBusy(false);
  };

  const startCheckout = async () => {
    if (busy || !checkoutReady) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("create-plan-upgrade-order", {
      body: extraSeats > 0 ? { target_tier: targetTier, seats: extraSeats } : { target_tier: targetTier },
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
          {showSeatRow && (
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Extra doctors</p>
                  <p className="text-xs text-muted-foreground">₹{seatPrice}/month each, on top of the plan</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" size="icon" variant="outline" className="h-8 w-8" aria-label="Fewer extra doctors"
                    disabled={busy || extraSeats <= 0} onClick={() => setSeatsChoice(Math.max(0, extraSeats - 1))}>
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-6 text-center font-semibold tabular-nums">{extraSeats}</span>
                  <Button type="button" size="icon" variant="outline" className="h-8 w-8" aria-label="More extra doctors"
                    disabled={busy || extraSeats >= maxExtraSeats} onClick={() => setSeatsChoice(Math.min(maxExtraSeats, extraSeats + 1))}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Total: ₹{price}/month (₹{planPrice} plan{extraSeats > 0 ? ` + ${extraSeats} × ₹${seatPrice}` : ""})</p>
            </div>
          )}
          {seatsGate && <p role="status" className="text-xs text-muted-foreground">Checking your doctor seats…</p>}
          {seatsGateExpired && (
            <p role="alert" className="text-xs text-warning">Your extra doctor seats won't be included in this renewal.</p>
          )}
          <Button onClick={startCheckout} disabled={busy || !checkoutReady} className="w-full">
            {busy ? "Processing…" : `Pay ₹${price} & ${willBeScheduled ? "Schedule" : "Upgrade"}`}
          </Button>
        </div>

        {order?.mode === "mock" && (
          <MockCheckoutModal
            open={mockOpen}
            paymentId={order.payment_id}
            amount={order.amount / 100}
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
