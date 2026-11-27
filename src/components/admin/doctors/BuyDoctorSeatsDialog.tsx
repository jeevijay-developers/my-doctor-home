import { useEffect, useRef, useState } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePractitioners } from "@/hooks/usePractitioners";
import { usePaymentMode } from "@/hooks/usePaymentMode";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import { loadRazorpayCheckout } from "@/lib/razorpayCheckout";
import { formatIstDate } from "@/lib/istDate";
import { seatErrorMessage, seatRefundReason } from "@/lib/practitioners/seatErrors";
import { formatInr } from "@/lib/practitioners/revenue";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import MockCheckoutModal from "@/components/doctor/MockCheckoutModal";
import TestModeBadge from "@/components/shared/TestModeBadge";

type Order = { order_id: string; key_id: string; amount: number; currency: string; payment_id: string; mode: "mock" | "live" };
type CheckoutResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type Quote =
  | { ok: true; amount_paise: number; unit_price: number; days_left: number; period_end: string }
  | { ok: false; error: string };
// "done": seats applied. "unapplied": the payment went through but the seats were not applied.
// "unconfirmed": we could not verify the payment (it may still be applied by the webhook).
type Outcome = { kind: "done" } | { kind: "unapplied"; paymentRef: string; reason: string } | { kind: "unconfirmed" };

const QUOTE_DEBOUNCE_MS = 300;
const DEFAULT_MAX_QTY = 20;
const rupees = (paise: number) => formatInr(paise / 100);

const BuyDoctorSeatsDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
  const { refetch, access } = usePractitioners();
  const { isMock } = usePaymentMode();
  const held = (access?.extra_seats ?? 0) + (access?.purchased_seats ?? 0);
  const maxQty = Math.max(1, access?.seat_max ? access.seat_max - 1 - held : DEFAULT_MAX_QTY);

  const [qty, setQty] = useState(1);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [mockOpen, setMockOpen] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const submitting = useRef(false);
  const verifying = useRef(false);
  const quoteSeq = useRef(0);
  const hasQuote = useRef(false);

  // Live quote: the amount always comes from the server, never computed here.
  useEffect(() => {
    if (!open || outcome) { quoteSeq.current++; return; }
    const seq = ++quoteSeq.current;
    setQuoting(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("get_seat_order_quote", { _qty: qty });
      if (seq !== quoteSeq.current) return;
      const q = data as unknown as Quote | null;
      setQuote(error || !q ? { ok: false, error: "UNKNOWN" } : q);
      hasQuote.current = true;
      setQuoting(false);
    }, hasQuote.current ? QUOTE_DEBOUNCE_MS : 0);
    return () => clearTimeout(t);
  }, [qty, open, outcome]);

  const reset = () => {
    quoteSeq.current++; // a quote still in flight must not reappear after a reset
    setQty(1); setQuote(null); setOrder(null); setMockOpen(false); setOutcome(null); setBusy(false);
    submitting.current = false; verifying.current = false; hasQuote.current = false;
  };
  const handleOpenChange = (o: boolean) => {
    if (!o && (busy || verifying.current)) return; // never close mid-payment
    if (!o) reset();
    onOpenChange(o);
  };

  const finish = () => { setMockOpen(false); setBusy(false); submitting.current = false; };

  const handleResult = async (o: Order, response: CheckoutResponse) => {
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
    finish();
    setOrder(null);
    // Read the BODY: a payment taken but seats not applied answers HTTP 200 {ok:false, needs_refund}.
    if (data?.ok === false && data?.needs_refund) {
      setOutcome({ kind: "unapplied", paymentRef: data.payment_id || response.razorpay_payment_id || o.payment_id, reason: seatRefundReason(data.code) });
      await refetch();
      return;
    }
    if (!error && data?.ok === true && data?.kind === "seats") {
      setOutcome({ kind: "done" });
      toast.success("Doctor seats added");
      await refetch();
      return;
    }
    // Unverifiable (HTTP error, network failure, or an answer that is not about seats): money may
    // have been taken, and the webhook may still apply it, so look again.
    setOutcome({ kind: "unconfirmed" });
    await refetch();
  };

  const handleFailed = (message: string) => { toast.error(message); finish(); };
  const handleDismiss = () => { if (!verifying.current) finish(); };

  const startCheckout = async () => {
    if (submitting.current || !quote?.ok) return;
    submitting.current = true;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("create-doctor-seat-order", { body: { qty } });
    if (error || !data?.order_id) {
      const raw = await edgeFunctionErrorMessage(error, "Couldn't start checkout. Please try again shortly.");
      toast.error(seatErrorMessage(raw) ?? raw);
      finish();
      return;
    }
    const o: Order = data;
    setOrder(o);
    if (o.mode === "mock") { setMockOpen(true); return; }
    try {
      await loadRazorpayCheckout();
    } catch {
      toast.error("Couldn't load the payment gateway. Please try again.");
      finish();
      return;
    }
    const rzp = new (window as any).Razorpay({
      key: o.key_id, amount: o.amount, currency: o.currency, order_id: o.order_id,
      name: "Doctylia", description: `${qty} extra doctor seat${qty === 1 ? "" : "s"}`,
      theme: { color: "#1e3a8a" },
      handler: (response: CheckoutResponse) => handleResult(o, response),
      modal: { ondismiss: handleDismiss },
    });
    rzp.on("payment.failed", (resp: { error?: { description?: string } }) =>
      handleFailed(resp?.error?.description || "Your payment could not be completed. Please try again."));
    rzp.open();
  };

  const quoteError = quote && quote.ok === false ? (seatErrorMessage(quote.error) ?? "Couldn't get a price. Please try again.") : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            Add doctor seats {isMock && <TestModeBadge />}
          </DialogTitle>
          <DialogDescription>Each seat lets one more doctor take bookings at your clinic.</DialogDescription>
        </DialogHeader>

        {outcome?.kind === "done" && (
          <div className="space-y-3" role="status">
            <p className="font-medium text-foreground">Seats added</p>
            <p className="text-sm text-muted-foreground">Your new doctor seats are ready. You can add the doctors now.</p>
            <Button className="w-full" onClick={() => handleOpenChange(false)}>Done</Button>
          </div>
        )}

        {outcome?.kind === "unapplied" && (
          <div className="space-y-3" role="alert">
            <p className="font-medium text-foreground">Payment received, seats not added</p>
            <p className="text-sm text-muted-foreground">
              We received your payment but couldn't add the seats ({outcome.reason}). Reference{" "}
              <span className="font-mono break-all">{outcome.paymentRef}</span>. The clinic will refund or rebook — please don't pay again.
            </p>
            <Button className="w-full" variant="outline" onClick={() => handleOpenChange(false)}>Close</Button>
          </div>
        )}

        {outcome?.kind === "unconfirmed" && (
          <div className="space-y-3" role="alert">
            <p className="font-medium text-foreground">We couldn't confirm your payment yet</p>
            <p className="text-sm text-muted-foreground">
              If money was deducted it will be applied or refunded — check again in a few minutes.
            </p>
            <Button className="w-full" variant="outline" onClick={() => handleOpenChange(false)}>Close</Button>
          </div>
        )}

        {!outcome && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Extra doctor seats</span>
              <div className="flex items-center gap-2">
                <Button type="button" size="icon" variant="outline" className="h-8 w-8" aria-label="Fewer seats"
                  disabled={busy || qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))}>
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-8 text-center font-semibold tabular-nums" aria-live="polite">{qty}</span>
                <Button type="button" size="icon" variant="outline" className="h-8 w-8" aria-label="More seats"
                  disabled={busy || qty >= maxQty} onClick={() => setQty((q) => Math.min(maxQty, q + 1))}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="rounded-md border p-3 space-y-1 min-h-[4.5rem]">
              {quote?.ok ? (
                <>
                  <p className="text-2xl font-heading font-bold text-foreground">{rupees(quote.amount_paise)}</p>
                  <p className="text-xs text-muted-foreground">
                    Seats valid until {formatIstDate(quote.period_end)} (up to 30 days).
                  </p>
                </>
              ) : quoteError ? (
                <p role="alert" className="text-sm text-destructive">{quoteError}</p>
              ) : (
                <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Getting your price…</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Seats are non-refundable. Renew your plan with seats to keep them after the period ends.</p>

            <Button className="w-full" onClick={startCheckout} disabled={busy || quoting || !quote?.ok}>
              {busy ? "Processing…" : quote?.ok ? `Pay ${rupees(quote.amount_paise)}` : "Pay"}
            </Button>
          </div>
        )}

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

export default BuyDoctorSeatsDialog;
