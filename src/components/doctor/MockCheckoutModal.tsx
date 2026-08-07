// Stands in for the real Razorpay Checkout popup when PAYMENT_MODE=mock
// (mock-payment-mode-testing-prompt.md, Part 2). "Simulate Successful
// Payment" and "Simulate Signature Mismatch" both call the
// mock-simulate-payment edge function to get a (valid or deliberately
// invalid) payment id + signature, then hand it to the SAME onResult
// callback the real Razorpay handler uses — so verify-razorpay-payment,
// appointment creation, commission split, etc. all run through the exact
// same code path either way. "Simulate Failed Payment" / "Payment Timeout"
// never touch the backend, exactly like a real failed/abandoned Checkout.
import { useState } from "react";
import { CheckCircle2, XCircle, FlaskConical } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import TestModeBadge from "@/components/shared/TestModeBadge";

type CheckoutResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };

type Props = {
  open: boolean;
  paymentId: string;
  amount: number; // rupees, for display only
  doctorName: string;
  serviceName?: string;
  dateLabel?: string;
  timeLabel?: string;
  onResult: (response: CheckoutResponse) => void;
  onFailed: (message: string) => void;
  onDismiss: () => void;
};

const EXTRA_SCENARIOS = [
  { value: "timeout", label: "Payment Timeout" },
  { value: "signature_mismatch", label: "Signature Mismatch" },
];

const MockCheckoutModal = ({
  open, paymentId, amount, doctorName, serviceName, dateLabel, timeLabel, onResult, onFailed, onDismiss,
}: Props) => {
  const [scenario, setScenario] = useState("");
  const [busy, setBusy] = useState(false);

  const simulate = async (result: "success" | "signature_mismatch") => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("mock-simulate-payment", {
      body: { payment_id: paymentId, result },
    });
    setBusy(false);
    if (error || !data?.razorpay_payment_id) {
      toast.error("Mock checkout couldn't generate a test payment. Please try again.");
      return;
    }
    onResult({
      razorpay_order_id: data.razorpay_order_id,
      razorpay_payment_id: data.razorpay_payment_id,
      razorpay_signature: data.razorpay_signature,
    });
  };

  const runExtraScenario = () => {
    if (scenario === "signature_mismatch") { simulate("signature_mismatch"); return; }
    if (scenario === "timeout") { onFailed("Your test payment timed out. Please try again."); return; }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onDismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <FlaskConical className="h-4 w-4 text-warning shrink-0" /> Mock Payment Gateway
            <TestModeBadge />
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-xl bg-secondary p-4 space-y-1.5 text-sm">
          <div className="flex justify-between gap-3"><span className="text-muted-foreground">Doctor Name</span><span className="font-medium text-foreground text-right">{doctorName}</span></div>
          {serviceName && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Service</span><span className="font-medium text-foreground text-right">{serviceName}</span></div>}
          {dateLabel && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Date</span><span className="font-medium text-foreground text-right">{dateLabel}</span></div>}
          {timeLabel && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Time</span><span className="font-medium text-foreground text-right">{timeLabel}</span></div>}
          <div className="flex justify-between gap-3 pt-1.5 mt-1 border-t border-border">
            <span className="text-muted-foreground">Consultation Fee</span><span className="font-medium text-foreground text-right">₹{amount}</span>
          </div>
          <div className="flex justify-between font-heading font-bold text-base">
            <span className="text-foreground">Total Amount</span><span className="text-royal">₹{amount}</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          No real Razorpay account is connected yet. Pick an outcome below to test the booking flow — nothing here moves real money.
        </p>

        <div className="grid grid-cols-1 gap-2">
          <Button className="bg-success hover:bg-success/90 text-white gap-1.5" disabled={busy} onClick={() => simulate("success")}>
            <CheckCircle2 className="h-4 w-4" /> {busy ? "Processing..." : "Payment Successful"}
          </Button>
          <Button
            variant="outline"
            className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
            disabled={busy}
            onClick={() => onFailed("Your test payment was simulated as failed.")}
          >
            <XCircle className="h-4 w-4" /> Payment Failed
          </Button>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Select value={scenario} onValueChange={setScenario}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="More test scenarios…" /></SelectTrigger>
            <SelectContent>
              {EXTRA_SCENARIOS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="secondary" disabled={!scenario || busy} onClick={runExtraScenario}>Run</Button>
        </div>

        <Button variant="ghost" size="sm" className="text-muted-foreground w-fit" onClick={onDismiss}>Cancel</Button>
      </DialogContent>
    </Dialog>
  );
};

export default MockCheckoutModal;
