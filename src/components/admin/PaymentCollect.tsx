import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DigitsInput } from "@/components/ui/digits-input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  COUNTER_PAYMENT_METHODS,
  REFERENCE_FIELDS,
  normalizePaymentReference,
  paymentReferenceError,
  paymentReferenceToStore,
} from "@/lib/paymentDetails";

type FieldsProps = {
  idPrefix: string;
  method: string;
  reference: string;
  onMethodChange: (method: string) => void;
  onReferenceChange: (reference: string) => void;
  error?: string | null;
  disabled?: boolean;
};

// How the patient paid, plus the UTR / approval code that lets the doctor verify UPI and
// card payments later. Used by the booking form and every "collect payment" dialog.
export const PaymentCollectFields = ({ idPrefix, method, reference, onMethodChange, onReferenceChange, error, disabled }: FieldsProps) => {
  const refField = method === "upi" || method === "card" ? REFERENCE_FIELDS[method] : null;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Payment method">
        {COUNTER_PAYMENT_METHODS.map((m) => (
          <Button
            key={m.value}
            type="button"
            size="sm"
            disabled={disabled}
            aria-pressed={method === m.value}
            variant={method === m.value ? "default" : "outline"}
            className={`h-9 ${method === m.value ? "bg-royal hover:bg-royal/90" : ""}`}
            onClick={() => onMethodChange(m.value)}
          >
            {m.label}
          </Button>
        ))}
      </div>
      {refField && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-payment-ref`}>
            {refField.label} <span className="text-destructive">*</span>
          </Label>
          {method === "upi" ? (
            <DigitsInput
              id={`${idPrefix}-payment-ref`}
              maxLength={12}
              value={reference}
              disabled={disabled}
              autoComplete="off"
              placeholder={refField.placeholder}
              onChange={(e) => onReferenceChange(e.target.value)}
              aria-invalid={!!error}
              className="h-10"
            />
          ) : (
            <Input
              id={`${idPrefix}-payment-ref`}
              maxLength={12}
              value={reference}
              disabled={disabled}
              autoComplete="off"
              placeholder={refField.placeholder}
              onChange={(e) => onReferenceChange(normalizePaymentReference(e.target.value))}
              aria-invalid={!!error}
              className="h-10"
            />
          )}
          {error && <p className="text-[11px] text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
};

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  busy?: boolean;
  onConfirm: (method: string, reference: string | null) => void | Promise<void>;
  secondary?: { label: string; onClick: () => void };
};

export const PaymentCollectDialog = ({ open, onOpenChange, title, description, busy, onConfirm, secondary }: DialogProps) => {
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    if (open) { setMethod("cash"); setReference(""); setShowError(false); }
  }, [open]);

  const error = paymentReferenceError(method, reference);
  const confirm = () => {
    if (error) { setShowError(true); return; }
    onConfirm(method, paymentReferenceToStore(method, reference));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <PaymentCollectFields
          idPrefix="collect"
          method={method}
          reference={reference}
          onMethodChange={(m) => { setMethod(m); setReference(""); setShowError(false); }}
          onReferenceChange={setReference}
          error={showError ? error : null}
          disabled={busy}
        />
        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button className="w-full bg-royal hover:bg-royal/90" disabled={busy} onClick={confirm}>
            Confirm payment
          </Button>
          {secondary && (
            <Button variant="ghost" size="sm" className="w-full" disabled={busy} onClick={secondary.onClick}>{secondary.label}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
